import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, company_id, project_id, context_text } = body;

    // Gather context
    let company = null;
    let drafts = [];
    let logs = [];
    let notes = [];
    let contacts = [];

    if (company_id) {
      company = await base44.asServiceRole.entities.Company.get(company_id);
      [drafts, logs, notes, contacts] = await Promise.all([
        base44.asServiceRole.entities.OutreachDraft.filter({ company_id }, '-created_date', 20),
        base44.asServiceRole.entities.OutreachLog.filter({ company_id }, '-created_date', 20),
        base44.asServiceRole.entities.Note.filter({ company_id }, '-created_date', 10),
        base44.asServiceRole.entities.Contact.filter({ company_id }, '-created_date', 10),
      ]);
    }

    const companyContext = company ? `
Company: ${company.company_name}
Category: ${company.category || 'Unknown'}
Enrichment Status: ${company.enrichment_status}
Outreach Status: ${company.outreach_status}
Has Email: ${company.primary_email ? 'Yes (' + company.primary_email + ')' : 'No'}
Has LinkedIn: ${company.linkedin_url ? 'Yes' : 'No'}
Has Phone: ${company.primary_phone ? 'Yes' : 'No'}
Has Website: ${company.website ? 'Yes' : 'No'}
Total Drafts: ${drafts.length} (${drafts.filter(d => d.status === 'sent').length} sent)
Total Activity Logs: ${logs.length}
Notes: ${notes.map(n => n.note).join(' | ').substring(0, 300)}
Contacts: ${contacts.length} contact(s) found
Last Contacted: ${company.last_contacted_at || 'Never'}
` : '';

    const prompts = {
      summarize: `You are a B2B sales assistant. Summarize this company profile for an SDR in 2-3 short sentences.
${companyContext}
Be concise, factual, and highlight the most important outreach opportunity.`,

      suggest_next_action: `You are a B2B outreach strategist. Based on this company profile, suggest the single most impactful next action for an SDR.
${companyContext}
Respond with: Action name | Channel (email/linkedin/phone) | Brief reason (1 sentence)`,

      generate_followup: `You are an expert B2B sales writer. Write a short, natural follow-up message for this company.
${companyContext}
${context_text ? 'Previous outreach context: ' + context_text : ''}
Write a 2-3 sentence follow-up. Be warm, not pushy. Do not use placeholders.`,

      explain_history: `You are a CRM analyst. Explain the outreach history for this company in plain English.
${companyContext}
Recent logs: ${logs.slice(0, 5).map(l => l.action + ' via ' + l.channel + ' (' + l.status + ')').join(', ')}
Keep it to 2-3 sentences.`,

      recommend_channel: `You are a B2B sales strategist. Given this company's contact data availability, recommend the best outreach channel and why.
${companyContext}
Give a direct recommendation: Channel | Confidence (high/medium/low) | 1 sentence reason.`,

      identify_missing: `You are a data quality analyst. List what contact data is missing for this company that would improve outreach success.
${companyContext}
List missing items as bullet points. Be specific and actionable.`,

      score_company: `You are an AI lead scorer. Score this company on outreach potential from 0-100.
${companyContext}
Return a JSON object with:
{ "score": number (0-100), "priority": "hot|medium|low", "reasoning": "1 sentence", "recommended_channel": "email|linkedin|phone" }`,
    };

    if (!prompts[action]) return Response.json({ error: 'Unknown action' }, { status: 400 });

    let response_json_schema = undefined;
    if (action === 'score_company') {
      response_json_schema = {
        type: 'object',
        properties: {
          score: { type: 'number' },
          priority: { type: 'string' },
          reasoning: { type: 'string' },
          recommended_channel: { type: 'string' },
        },
      };
    }

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: prompts[action],
      response_json_schema,
    });

    // If scoring, save to company
    if (action === 'score_company' && company_id && result) {
      await base44.asServiceRole.entities.Company.update(company_id, {
        outreach_score: result.score,
        priority_level: result.priority,
      });
    }

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});