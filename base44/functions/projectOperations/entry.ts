import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (action === 'add_companies') {
      // Add companies to a project (bulk or single)
      const { project_id, company_ids, priority = 'medium' } = body;
      if (!project_id || !company_ids?.length) {
        return Response.json({ error: 'project_id and company_ids required' }, { status: 400 });
      }

      // Get existing entries to avoid duplicates
      const existing = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id });
      const existingIds = new Set(existing.map(e => e.company_id));

      const toAdd = company_ids.filter(id => !existingIds.has(id));
      const results = [];

      for (const company_id of toAdd) {
        const company = await base44.asServiceRole.entities.Company.get(company_id);
        if (!company) continue;
        const pc = await base44.asServiceRole.entities.ProjectCompany.create({
          project_id,
          company_id,
          company_name: company.company_name,
          outreach_stage: 'new',
          priority,
        });
        results.push(pc);
      }

      // Update project total_companies count
      const allPcs = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id });
      await base44.asServiceRole.entities.Project.update(project_id, { total_companies: allPcs.length });

      return Response.json({
        success: true,
        added: results.length,
        skipped_duplicates: company_ids.length - toAdd.length,
        total_in_project: allPcs.length,
      });
    }

    if (action === 'remove_company') {
      const { project_company_id, project_id } = body;
      await base44.asServiceRole.entities.ProjectCompany.delete(project_company_id);
      const remaining = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id });
      await base44.asServiceRole.entities.Project.update(project_id, { total_companies: remaining.length });
      return Response.json({ success: true });
    }

    if (action === 'update_stage') {
      const { project_company_id, stage } = body;
      const updated = await base44.asServiceRole.entities.ProjectCompany.update(project_company_id, { outreach_stage: stage });
      return Response.json({ success: true, record: updated });
    }

    if (action === 'bulk_update_stage') {
      const { project_company_ids, stage } = body;
      for (const id of project_company_ids) {
        await base44.asServiceRole.entities.ProjectCompany.update(id, { outreach_stage: stage });
      }
      return Response.json({ success: true, updated: project_company_ids.length });
    }

    if (action === 'get_project_stats') {
      const { project_id } = body;
      const pcs = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id });
      const companyIds = pcs.map(pc => pc.company_id);

      // Fetch companies
      const companies = [];
      for (const cid of companyIds) {
        const c = await base44.asServiceRole.entities.Company.get(cid);
        if (c) companies.push(c);
      }

      const stageCounts = {};
      for (const pc of pcs) {
        stageCounts[pc.outreach_stage] = (stageCounts[pc.outreach_stage] || 0) + 1;
      }

      const stats = {
        total: pcs.length,
        email_ready: companies.filter(c => c.primary_email).length,
        linkedin_ready: companies.filter(c => c.linkedin_url).length,
        phone_ready: companies.filter(c => c.primary_phone).length,
        needs_enrichment: companies.filter(c => !c.primary_email && !c.primary_phone && !c.linkedin_url).length,
        contacted: (stageCounts['contacted'] || 0) + (stageCounts['replied'] || 0) + (stageCounts['qualified'] || 0),
        replied: stageCounts['replied'] || 0,
        qualified: stageCounts['qualified'] || 0,
        not_interested: stageCounts['not_interested'] || 0,
        follow_up: stageCounts['follow_up'] || 0,
        stage_breakdown: stageCounts,
      };

      return Response.json({ success: true, stats });
    }

    if (action === 'bulk_generate_for_project') {
      const { project_id, channel, stage_filter } = body;

      let pcs = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id });
      if (stage_filter) {
        pcs = pcs.filter(pc => pc.outreach_stage === stage_filter);
      }
      const companyIds = pcs.map(pc => pc.company_id);

      if (!companyIds.length) return Response.json({ success: true, message: 'No companies to generate for', count: 0 });

      // Invoke generateOutreach in bulk
      const result = await base44.asServiceRole.functions.invoke('generateOutreach', {
        bulk_ids: companyIds,
        channel: channel || undefined,
      });

      // Update stage to 'generated' for all processed
      for (const pc of pcs) {
        await base44.asServiceRole.entities.ProjectCompany.update(pc.id, { outreach_stage: 'generated' });
      }

      return Response.json({ success: true, count: companyIds.length, result });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});