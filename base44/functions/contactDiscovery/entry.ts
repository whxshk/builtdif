import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, company_id } = body;

    if (!company_id) return Response.json({ error: 'company_id required' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(company_id);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    if (action === 'discover_contacts') {
      // Use LLM to simulate contact discovery based on available company data
      const prompt = `You are a B2B contact discovery assistant. Based on the following company information, suggest 2-3 likely decision-maker contacts that would be relevant for a B2B outreach campaign.

Company: ${company.company_name}
Category: ${company.category || 'Unknown'}
Website: ${company.website || 'Unknown'}
LinkedIn: ${company.linkedin_url || 'Unknown'}

For each contact, provide:
- full_name: realistic name for the region/industry
- role: likely decision-maker role (CEO, CTO, Head of IT, Procurement Manager, etc.)
- confidence_score: 0.0 to 1.0 based on how likely this role exists at this company type
- source: "ai_inference"

Return as a JSON array of contact objects.`;

      const contacts = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  full_name: { type: 'string' },
                  role: { type: 'string' },
                  confidence_score: { type: 'number' },
                  source: { type: 'string' },
                },
              },
            },
          },
        },
      });

      const created = [];
      for (const c of (contacts?.contacts || [])) {
        const contact = await base44.asServiceRole.entities.Contact.create({
          company_id,
          company_name: company.company_name,
          full_name: c.full_name,
          role: c.role,
          confidence_score: Math.round((c.confidence_score || 0.5) * 100),
          source: 'ai_inference',
          outreach_status: 'not_started',
        });
        created.push(contact);
      }

      // Log activity
      await base44.asServiceRole.entities.ActivityLog.create({
        action_type: 'contact_discovered',
        entity_type: 'Company',
        entity_id: company_id,
        entity_name: company.company_name,
        user_email: user.email,
        details: `Discovered ${created.length} contacts via AI inference`,
      });

      return Response.json({ success: true, contacts: created });
    }

    if (action === 'extract_intelligence') {
      if (!company.website) return Response.json({ error: 'No website available' }, { status: 400 });

      const prompt = `You are a B2B company intelligence analyst. Based on this company name and website URL, provide structured business intelligence.

Company: ${company.company_name}
Website: ${company.website}
Category: ${company.category || 'Unknown'}

Extract and infer:
- description: 1-2 sentence company description
- services: array of main services/products (max 5)
- industry: specific industry segment
- company_size: estimated (startup/small/medium/large/enterprise)
- key_technologies: array of technologies they likely use (max 5)
- outreach_angle: best angle for B2B outreach to this company type

Return as JSON.`;

      const intel = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            services: { type: 'array', items: { type: 'string' } },
            industry: { type: 'string' },
            company_size: { type: 'string' },
            key_technologies: { type: 'array', items: { type: 'string' } },
            outreach_angle: { type: 'string' },
          },
        },
      });

      // Save to company tags/notes
      if (intel) {
        await base44.asServiceRole.entities.Note.create({
          company_id,
          company_name: company.company_name,
          note: `AI Intelligence: ${intel.description || ''} | Services: ${(intel.services || []).join(', ')} | Outreach angle: ${intel.outreach_angle || ''}`,
          note_type: 'general',
        });
      }

      return Response.json({ success: true, intelligence: intel });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});