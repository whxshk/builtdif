import * as XLSX from 'xlsx';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
const now = () => new Date().toISOString();

const getStore = (entityName) => {
  try {
    const raw = localStorage.getItem(`localdb:${entityName}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const setStore = (entityName, records) => {
  localStorage.setItem(`localdb:${entityName}`, JSON.stringify(records));
};

const applyFilters = (records, filters) => {
  if (!filters || Object.keys(filters).length === 0) return records;
  return records.filter(r =>
    Object.entries(filters).every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v)
  );
};

const applySort = (records, sortField) => {
  if (!sortField) return records;
  const desc = sortField.startsWith('-');
  const field = desc ? sortField.slice(1) : sortField;
  return [...records].sort((a, b) => {
    const av = a[field] ?? '', bv = b[field] ?? '';
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
};

const createEntityClient = (entityName) => ({
  list: (sortField = '-created_date', limit = 200) => {
    let records = applySort(getStore(entityName), sortField);
    return Promise.resolve(limit ? records.slice(0, limit) : records);
  },
  get: (id) => {
    const record = getStore(entityName).find(r => r.id === id);
    return record ? Promise.resolve(record)
      : Promise.reject(Object.assign(new Error(`${entityName} not found`), { status: 404 }));
  },
  create: (data) => {
    const records = getStore(entityName);
    const record = { id: generateId(), created_date: now(), updated_date: now(), ...data };
    records.push(record);
    setStore(entityName, records);
    return Promise.resolve(record);
  },
  update: (id, data) => {
    const records = getStore(entityName);
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return Promise.reject(new Error(`${entityName} not found`));
    records[idx] = { ...records[idx], ...data, updated_date: now() };
    setStore(entityName, records);
    return Promise.resolve(records[idx]);
  },
  delete: (id) => {
    setStore(entityName, getStore(entityName).filter(r => r.id !== id));
    return Promise.resolve();
  },
  filter: (filters = {}, sortField = '-created_date', limit = 1000) => {
    let records = applyFilters(getStore(entityName), filters);
    records = applySort(records, sortField);
    return Promise.resolve(limit ? records.slice(0, limit) : records);
  },
});

// ─── Ollama ──────────────────────────────────────────────────────────────────

const OLLAMA_BASE = 'http://localhost:11434';

export const getOllamaModel = async () => {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    if (!models.length) return null;
    const preferred = ['llama3', 'llama3.2', 'llama3:8b', 'llama2', 'mistral', 'qwen2.5', 'gemma2', 'phi3', 'deepseek'];
    for (const p of preferred) {
      const m = models.find(name => name.startsWith(p));
      if (m) return m;
    }
    return models[0];
  } catch { return null; }
};

const ollamaChat = async (model, prompt) => {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.7, num_predict: 300 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content || '';
};

const buildPrompt = (company, channel) => {
  const name = company.company_name;
  const cat = company.category ? ` in the ${company.category} industry` : '';
  const web = company.website ? ` (${company.website})` : '';

  if (channel === 'email') {
    return `Write a short cold email outreach for a company called "${name}"${cat}${web}.
Format:
Subject: <subject line>

<email body — 3-4 sentences max, professional, no placeholders like [Name], end with a clear CTA>`;
  }
  if (channel === 'linkedin') {
    return `Write a LinkedIn connection request for "${name}"${cat}. Max 200 characters, friendly, professional, no placeholders.`;
  }
  return `Write a brief phone call opening script for reaching out to "${name}"${cat}. Include intro, reason for calling, ask for the right person. Under 80 words.`;
};

const parseEmailContent = (content, companyName) => {
  const lines = content.split('\n');
  const subjectLine = lines.find(l => /^subject:/i.test(l.trim()));
  const subject = subjectLine
    ? subjectLine.replace(/^subject:\s*/i, '').trim()
    : `Introduction – ${companyName}`;
  const body = lines
    .filter(l => !(/^subject:/i.test(l.trim())))
    .join('\n').trim();
  return { subject, body };
};

const generateDraftContent = async (company, channel, model) => {
  if (!model) {
    return { body: templateBody(company, channel), subject: channel === 'email' ? `Introduction – ${company.company_name}` : undefined };
  }
  try {
    const content = await ollamaChat(model, buildPrompt(company, channel));
    if (channel === 'email') {
      const { subject, body } = parseEmailContent(content, company.company_name);
      return { subject, body };
    }
    return { body: content };
  } catch {
    return { body: templateBody(company, channel), subject: channel === 'email' ? `Introduction – ${company.company_name}` : undefined };
  }
};

const templateBody = (company, channel) => {
  const name = company.company_name;
  if (channel === 'email') return `Hi,\n\nI came across ${name} and was impressed by what you're building. I'd love to explore whether there's a mutual fit for collaboration.\n\nWould you be open to a quick 15-minute call this week?\n\nBest regards`;
  if (channel === 'linkedin') return `Hi! I noticed ${name} and thought there could be a great opportunity to connect and explore collaboration.`;
  return `Hi, I'm calling to reach out to the right person at ${name} regarding a potential business opportunity. Could you direct me to the appropriate contact?`;
};

// ─── Excel Import ─────────────────────────────────────────────────────────────

const COLUMN_MAP = {
  'company name':   'company_name',
  'company':        'company_name',
  'cr number':      'cr_number',
  'cr':             'cr_number',
  'category':       'category',
  'status':         'enrichment_status', // Excel "Status" = enrichment status (partial/not_found/complete)
  'primary email':  'primary_email',
  'email':          'primary_email',
  'all emails':     'all_emails',
  'primary phone':  'primary_phone',
  'phone':          'primary_phone',
  'all phones':     'all_phones',
  'website':        'website',
  'linkedin':       'linkedin_url',
  'linkedin url':   'linkedin_url',
  'source':         'source',
  'last enriched':  'last_enriched',
};

const mapRow = (headers, row) => {
  const company = {};
  headers.forEach(h => {
    const key = COLUMN_MAP[h.toLowerCase().trim()];
    if (key && row[h] !== undefined && row[h] !== null && String(row[h]).trim() !== '') {
      company[key] = String(row[h]).trim();
    }
  });
  return company;
};

const parseExcelBase64 = (fileBase64) => {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
};

const computeEnrichmentStatus = (company, excelStatus) => {
  // Trust the Excel value if it's a valid enum
  const valid = ['complete', 'partial', 'not_found', 'needs_enrichment'];
  if (excelStatus && valid.includes(excelStatus.toLowerCase())) return excelStatus.toLowerCase();
  // Otherwise compute
  if (company.primary_email && company.linkedin_url) return 'complete';
  if (company.primary_email || company.linkedin_url || company.primary_phone) return 'partial';
  if (company.website) return 'partial';
  return 'needs_enrichment';
};

const handleImportExcel = ({ file_base64, filename, preview_only, project_id }) => {
  const { headers, rows } = parseExcelBase64(file_base64);

  if (preview_only) {
    return Promise.resolve({ data: { headers, preview: rows.slice(0, 5), total_rows: rows.length } });
  }

  const existing = getStore('Company');
  const existingByName = new Map(existing.map(c => [c.company_name?.toLowerCase(), c]));

  const summary = {
    total_rows: rows.length, imported_rows: 0, updated_rows: 0, duplicate_rows: 0,
    skipped_rows: 0, error_rows: 0, email_ready: 0, linkedin_ready: 0, phone_ready: 0,
    needs_enrichment: 0, missing_email: 0, missing_phone: 0, missing_linkedin: 0,
    error_details: [],
  };

  const newCompanies = [...existing];
  const projectLinks = getStore('ProjectCompany');
  const projectLinkKeys = new Set(
    projectLinks.filter(pc => pc.project_id === project_id).map(pc => pc.company_id)
  );
  const newDrafts = getStore('OutreachDraft');
  const draftKeys = new Set(newDrafts.map(d => `${d.company_id}|${d.channel}`));

  const linkToProject = (companyId, companyName) => {
    if (!project_id || projectLinkKeys.has(companyId)) return;
    projectLinks.push({
      id: generateId(), created_date: now(), updated_date: now(),
      project_id, company_id: companyId, company_name: companyName,
      outreach_stage: 'new',
    });
    projectLinkKeys.add(companyId);
  };

  const ensureDrafts = (companyId, companyName, src) => {
    const channels = [];
    if (src.primary_email) channels.push('email');
    if (src.linkedin_url) channels.push('linkedin');
    if (src.primary_phone) channels.push('phone');
    for (const ch of channels) {
      const key = `${companyId}|${ch}`;
      if (draftKeys.has(key)) continue;
      newDrafts.push({
        id: generateId(), created_date: now(), updated_date: now(),
        company_id: companyId, company_name: companyName,
        channel: ch,
        draft_type: ch === 'email' ? 'first_outreach' : ch === 'linkedin' ? 'connection_request' : 'call_script',
        subject: ch === 'email' ? `Introduction – ${companyName}` : undefined,
        body: '',
        status: 'draft',
      });
      draftKeys.add(key);
    }
  };

  rows.forEach((row, i) => {
    try {
      const rawCompany = mapRow(headers, row);
      if (!rawCompany.company_name) { summary.skipped_rows++; return; }

      const nameKey = rawCompany.company_name.toLowerCase();
      const existingCompany = existingByName.get(nameKey);
      const enrichmentStatus = computeEnrichmentStatus(rawCompany, rawCompany.enrichment_status);

      let companyId, companyName, sourceCompany;

      if (existingCompany) {
        summary.duplicate_rows++;
        companyId = existingCompany.id;
        companyName = existingCompany.company_name;
        sourceCompany = existingCompany;
      } else {
        const record = {
          id: generateId(), created_date: now(), updated_date: now(),
          outreach_status: 'not_started', notes_count: 0,
          ...rawCompany,
          enrichment_status: enrichmentStatus,
        };
        newCompanies.push(record);
        existingByName.set(nameKey, record);
        summary.imported_rows++;
        companyId = record.id;
        companyName = record.company_name;
        sourceCompany = record;
      }

      // Always link to the project (if specified) — even for duplicates
      linkToProject(companyId, companyName);
      // Always ensure drafts exist for contactable channels
      ensureDrafts(companyId, companyName, sourceCompany);

      if (sourceCompany.primary_email) summary.email_ready++; else summary.missing_email++;
      if (sourceCompany.linkedin_url) summary.linkedin_ready++; else summary.missing_linkedin++;
      if (sourceCompany.primary_phone) summary.phone_ready++; else summary.missing_phone++;
      if (['needs_enrichment', 'not_found'].includes(enrichmentStatus)) summary.needs_enrichment++;
    } catch (err) {
      summary.error_rows++;
      summary.error_details.push({ row: i + 2, error: err.message });
    }
  });

  setStore('Company', newCompanies);
  setStore('OutreachDraft', newDrafts);
  setStore('ProjectCompany', projectLinks);

  const jobs = getStore('ImportJob');
  const job = {
    id: generateId(), created_date: now(), updated_date: now(),
    filename: filename || 'import.xlsx', status: 'completed',
    started_at: now(), completed_at: now(),
    ...summary,
  };
  // Only persist error_details when there are actual errors
  if (summary.error_details.length > 0) {
    job.error_details = JSON.stringify(summary.error_details);
  } else {
    delete job.error_details;
  }
  jobs.push(job);
  setStore('ImportJob', jobs);

  return Promise.resolve({ data: { summary } });
};

// ─── Project Operations ───────────────────────────────────────────────────────

const handleProjectOperations = ({ action, project_id, company_ids, project_company_id }) => {
  if (action === 'add_companies') {
    const existing = getStore('ProjectCompany');
    const alreadyIn = new Set(existing.filter(pc => pc.project_id === project_id).map(pc => pc.company_id));
    const companyMap = Object.fromEntries(getStore('Company').map(c => [c.id, c]));
    let added = 0, skipped_duplicates = 0;
    const updated = [...existing];
    for (const cid of (company_ids || [])) {
      if (alreadyIn.has(cid)) { skipped_duplicates++; continue; }
      const company = companyMap[cid];
      updated.push({
        id: generateId(), created_date: now(), updated_date: now(),
        project_id, company_id: cid, company_name: company?.company_name || '',
        outreach_stage: 'new',
      });
      added++;
    }
    setStore('ProjectCompany', updated);
    return Promise.resolve({ data: { added, skipped_duplicates } });
  }
  if (action === 'remove_company') {
    setStore('ProjectCompany', getStore('ProjectCompany').filter(pc => pc.id !== project_company_id));
    return Promise.resolve({ data: { removed: true } });
  }
  return Promise.resolve({ data: {} });
};

// ─── Generate Outreach ────────────────────────────────────────────────────────

const handleGenerateOutreach = async ({ bulk_ids, company_ids, company_id, channel, draft_id }) => {
  const model = await getOllamaModel();
  const drafts = getStore('OutreachDraft');

  // Single draft (re)generation
  if (draft_id) {
    const idx = drafts.findIndex(d => d.id === draft_id);
    if (idx === -1) return { data: {} };
    const company = getStore('Company').find(c => c.id === drafts[idx].company_id);
    if (!company) return { data: {} };
    const { body, subject } = await generateDraftContent(company, drafts[idx].channel, model);
    drafts[idx] = { ...drafts[idx], body, ...(subject ? { subject } : {}), updated_date: now() };
    setStore('OutreachDraft', drafts);
    return { data: { generated: 1, model: model || 'template' } };
  }

  const ids = bulk_ids || company_ids || (company_id ? [company_id] : []);
  const companyMap = Object.fromEntries(getStore('Company').map(c => [c.id, c]));
  const channels = channel ? [channel] : ['email', 'linkedin', 'phone'];
  let generated = 0;

  for (const cid of ids) {
    const company = companyMap[cid];
    if (!company) continue;

    for (const ch of channels) {
      if (ch === 'email' && !company.primary_email) continue;
      if (ch === 'linkedin' && !company.linkedin_url) continue;
      if (ch === 'phone' && !company.primary_phone) continue;

      const { body, subject } = await generateDraftContent(company, ch, model);
      const existingIdx = drafts.findIndex(d => d.company_id === cid && d.channel === ch);

      if (existingIdx >= 0) {
        drafts[existingIdx] = { ...drafts[existingIdx], body, ...(subject ? { subject } : {}), updated_date: now() };
      } else {
        drafts.push({
          id: generateId(), created_date: now(), updated_date: now(),
          company_id: cid, company_name: company.company_name,
          channel: ch,
          draft_type: ch === 'email' ? 'first_outreach' : ch === 'linkedin' ? 'connection_request' : 'call_script',
          subject, body, status: 'draft',
        });
      }
      generated++;
    }
  }

  setStore('OutreachDraft', drafts);
  return { data: { generated, model: model || 'template' } };
};

// ─── Approve Draft ────────────────────────────────────────────────────────────

const handleApproveDraft = ({ draft_id, action }) => {
  const drafts = getStore('OutreachDraft');
  const idx = drafts.findIndex(d => d.id === draft_id);
  if (idx !== -1) {
    const status = action === 'approve' ? 'approved' : 'skipped';
    drafts[idx] = { ...drafts[idx], status, ...(action === 'approve' ? { approved_at: now() } : {}), updated_date: now() };
    setStore('OutreachDraft', drafts);
  }
  return Promise.resolve({ data: { success: true } });
};

// ─── Send Email ───────────────────────────────────────────────────────────────

const handleSendEmail = ({ draft_id }) => {
  const drafts = getStore('OutreachDraft');
  const idx = drafts.findIndex(d => d.id === draft_id);
  if (idx !== -1) {
    drafts[idx] = { ...drafts[idx], status: 'sent', sent_at: now(), updated_date: now() };
    setStore('OutreachDraft', drafts);
  }
  return Promise.resolve({ data: { success: true, mode: 'local' } });
};

// ─── Compliance Engine ────────────────────────────────────────────────────────

const handleComplianceEngine = ({ action, draft_ids }) => {
  if (action === 'schedule_bulk') {
    return Promise.resolve({ data: { success: true, results: { scheduled: draft_ids?.length || 0, compliance_blocked: 0 } } });
  }
  return Promise.resolve({ data: {} });
};

// ─── Migrations ───────────────────────────────────────────────────────────────

const migrateProjectCompanies = () => {
  const pcs = getStore('ProjectCompany');
  if (!pcs.some(pc => !pc.company_name)) return;
  const companyMap = Object.fromEntries(getStore('Company').map(c => [c.id, c]));
  setStore('ProjectCompany', pcs.map(pc =>
    pc.company_name ? pc : { ...pc, company_name: companyMap[pc.company_id]?.company_name || '' }
  ));
};

const migrateImportJobs = () => {
  const jobs = getStore('ImportJob');
  let changed = false;
  const cleaned = jobs.map(j => {
    // Strip empty error_details that were saved as stringified empty arrays
    if (j.error_details === '[]' || j.error_details === '' || (Array.isArray(j.error_details) && j.error_details.length === 0)) {
      const { error_details, ...rest } = j;
      changed = true;
      return rest;
    }
    return j;
  });
  if (changed) setStore('ImportJob', cleaned);
};

migrateProjectCompanies();
migrateImportJobs();

// ─── Client ───────────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'local-user-1', email: 'local@example.com', full_name: 'Local User', role: 'admin' };

const HANDLERS = {
  importExcel:        handleImportExcel,
  projectOperations:  handleProjectOperations,
  generateOutreach:   (args) => Promise.resolve().then(() => handleGenerateOutreach(args)),
  approveDraft:       handleApproveDraft,
  sendEmail:          handleSendEmail,
  complianceEngine:   handleComplianceEngine,
};

export const createLocalClient = () => ({
  entities: new Proxy({}, { get: (_, name) => createEntityClient(name) }),
  auth: { me: () => Promise.resolve(MOCK_USER), logout: () => {}, redirectToLogin: () => {} },
  functions: {
    invoke: (name, args) => {
      const h = HANDLERS[name];
      if (h) return h(args);
      console.log(`[LocalClient] unhandled: ${name}`, args);
      return Promise.resolve({ data: {} });
    },
  },
});
