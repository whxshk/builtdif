import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { company_id, channel, draft_type, bulk_ids } = body;

    // Bulk mode
    if (bulk_ids && Array.isArray(bulk_ids)) {
      const results = [];
      for (const cid of bulk_ids) {
        const company = await base44.asServiceRole.entities.Company.get(cid);
        if (!company) { results.push({ company_id: cid, error: 'Not found' }); continue; }
        const drafts = await generateDraftsForCompany(base44, company, channel);
        results.push({ company_id: cid, company_name: company.company_name, drafts });
      }
      return Response.json({ success: true, results });
    }

    // Single company mode
    const company = await base44.asServiceRole.entities.Company.get(company_id);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    if (draft_type) {
      // Generate single specific draft
      const draft = await generateSingleDraft(base44, company, channel, draft_type);
      return Response.json({ success: true, draft });
    }

    // Generate all drafts for specified channel
    const drafts = await generateDraftsForCompany(base44, company, channel);
    return Response.json({ success: true, drafts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function generateDraftsForCompany(base44, company, channel) {
  const allDraftTypes = {
    email: ['first_outreach', 'follow_up'],
    linkedin: ['connection_request', 'linkedin_message', 'follow_up'],
    phone: ['call_script', 'voicemail', 'call_notes'],
  };
  const types = channel ? (allDraftTypes[channel] || []) : Object.values(allDraftTypes).flat();
  const channels = channel ? [channel] : ['email', 'linkedin', 'phone'];

  const drafts = [];
  for (const ch of channels) {
    for (const dt of allDraftTypes[ch] || []) {
      const draft = await generateSingleDraft(base44, company, ch, dt);
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

async function generateSingleDraft(base44, company, channel, draft_type) {
  const companyContext = `
Company Name: ${company.company_name || 'N/A'}
Category: ${company.category || 'N/A'}
Website: ${company.website || 'N/A'}
LinkedIn: ${company.linkedin_url || 'N/A'}
Source: ${company.source || 'N/A'}
Primary Email: ${company.primary_email || 'N/A'}
Primary Phone: ${company.primary_phone || 'N/A'}
`.trim();

  const prompts = {
    email: {
      first_outreach: `You are a B2B sales expert. Write a professional, short, direct first outreach email for this company. Keep it under 150 words. No fluff. Be specific to their industry.
      
Company details:
${companyContext}

Return JSON with "subject" and "body" fields. The body should be plain text, ready to send. Sign off as "The OutreachOS Team".`,
      follow_up: `Write a short professional follow-up email (under 100 words) for a company we previously contacted but got no response. Reference the prior email naturally.

Company details:
${companyContext}

Return JSON with "subject" and "body" fields.`,
    },
    linkedin: {
      connection_request: `Write a LinkedIn connection request note (max 300 characters). Professional, personal, specific to their industry. No generic lines.

Company details:
${companyContext}

Return JSON with "body" field only (no subject needed). Just the connection note text.`,
      linkedin_message: `Write a LinkedIn first message after connecting (max 200 words). Professional B2B tone. Introduce briefly, state value prop clearly.

Company details:
${companyContext}

Return JSON with "body" field only.`,
      follow_up: `Write a LinkedIn follow-up message (max 100 words) for someone who didn't reply to the first message.

Company details:
${companyContext}

Return JSON with "body" field only.`,
    },
    phone: {
      call_script: `Write a professional phone call opening script for a B2B cold call. Include: introduction, reason for call, value prop in 2 sentences, and an open question. Keep it natural.

Company details:
${companyContext}

Return JSON with "body" field (the script text) and "subject" (call objective, 1 sentence).`,
      voicemail: `Write a professional voicemail script (max 30 seconds when read). Clear, concise, includes callback number placeholder.

Company details:
${companyContext}

Return JSON with "body" field only.`,
      call_notes: `Create a call notes template for documenting a sales call with this company. Include sections: Contact Info, Decision Maker Reached?, Key Points Discussed, Objections, Next Steps, Follow-up Date.

Company details:
${companyContext}

Return JSON with "body" field only (formatted template text).`,
    },
  };

  const prompt = prompts[channel]?.[draft_type];
  if (!prompt) return null;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
      },
    },
  });

  // Check if draft already exists
  const existing = await base44.asServiceRole.entities.OutreachDraft.filter({
    company_id: company.id,
    channel,
    draft_type,
    status: 'draft',
  });

  let draft;
  if (existing && existing.length > 0) {
    draft = await base44.asServiceRole.entities.OutreachDraft.update(existing[0].id, {
      subject: result.subject || null,
      body: result.body || '',
      status: 'draft',
    });
  } else {
    draft = await base44.asServiceRole.entities.OutreachDraft.create({
      company_id: company.id,
      company_name: company.company_name,
      channel,
      draft_type,
      subject: result.subject || null,
      body: result.body || '',
      status: 'draft',
    });
  }

  return draft;
}