import * as XLSX from 'xlsx';
import { parseSheet, buildRowObj, normalizeRowObj } from '@/lib/importParser.js';

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

const parseExcelWorkbook = (fileBase64) => {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: 'array' });

  let bestSheetName = wb.SheetNames[0];
  let bestParseResult = null;
  let bestRawRows = [];
  let bestScore = -1;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const result = parseSheet(rawRows);
    if (result.score > bestScore) {
      bestScore = result.score;
      bestSheetName = sheetName;
      bestParseResult = result;
      bestRawRows = rawRows;
    }
  }

  return { sheetName: bestSheetName, parseResult: bestParseResult, rawRows: bestRawRows, allSheets: wb.SheetNames };
};

const handleImportExcel = ({ file_base64, filename, preview_only, project_id, column_overrides = {} }) => {
  const { sheetName, parseResult, rawRows, allSheets } = parseExcelWorkbook(file_base64);
  const { companies: baseCompanies, skipped: baseSkipped, recognized, unrecognized, headerRowIndex, totalDataRows, colMap } = parseResult;

  // Apply any manual column overrides (user remapped an unrecognized header)
  let companies = baseCompanies;
  let skipped = baseSkipped;
  const effectiveColMap = { ...colMap };

  if (column_overrides && Object.keys(column_overrides).length > 0) {
    const headerRow = rawRows[headerRowIndex] ?? [];
    const usedFields = new Set(Object.values(colMap));
    for (let ci = 0; ci < headerRow.length; ci++) {
      const h = headerRow[ci];
      if (!h) continue;
      const rawStr = String(h).trim();
      const targetField = column_overrides[rawStr];
      if (targetField && targetField !== '_ignore' && !usedFields.has(targetField)) {
        effectiveColMap[ci] = targetField;
        usedFields.add(targetField);
      }
    }
    if (Object.keys(effectiveColMap).length > Object.keys(colMap).length) {
      const dataRows = rawRows
        .slice(headerRowIndex + 1)
        .filter(r => r.some(c => c !== null && c !== '' && c !== undefined));
      companies = [];
      skipped = [...baseSkipped];
      for (let i = 0; i < dataRows.length; i++) {
        const rowIndex = headerRowIndex + 2 + i;
        const rawObj = buildRowObj(dataRows[i], effectiveColMap);
        const mapped = normalizeRowObj(rawObj);
        if (!mapped.company_name) {
          if (!skipped.find(s => s.row === rowIndex)) {
            skipped.push({ row: rowIndex, reason: 'missing_company_name' });
          }
        } else {
          companies.push({ rowIndex, mapped });
        }
      }
    }
  }

  if (preview_only) {
    const headerRow = rawRows[headerRowIndex] ?? [];
    const previewHeaders = headerRow
      .map(h => (h != null && String(h).trim() !== '') ? String(h).trim() : null)
      .filter(Boolean);
    const dataRows = rawRows
      .slice(headerRowIndex + 1)
      .filter(r => r.some(c => c !== null && c !== '' && c !== undefined));
    const previewRows = dataRows.slice(0, 5).map(row => {
      const obj = {};
      headerRow.forEach((h, i) => {
        if (h != null && String(h).trim() !== '') obj[String(h).trim()] = row[i] ?? '';
      });
      return obj;
    });
    return Promise.resolve({
      data: {
        headers: previewHeaders,
        preview: previewRows,
        total_rows: totalDataRows,
        detected_sheet: sheetName,
        column_mapping: recognized.map(r => ({ raw: r.raw, field: r.field })),
        unrecognized_headers: unrecognized,
        recognized_count: recognized.length,
      },
    });
  }

  // ── Actual import ──────────────────────────────────────────────────────────
  const existing = getStore('Company');
  const existingByName = new Map(existing.map(c => [c.company_name?.toLowerCase(), c]));

  const skipCounts = { empty_row: 0, missing_company_name: 0, duplicate_in_file: 0, duplicate_existing: 0, save_failed: 0 };
  const skipDetails = [];

  for (const s of skipped) {
    skipCounts[s.reason] = (skipCounts[s.reason] || 0) + 1;
    skipDetails.push(s);
  }

  const summary = {
    total_rows: totalDataRows,
    imported_rows: 0, updated_rows: 0, duplicate_rows: 0,
    skipped_rows: skipped.length,
    error_rows: 0,
    email_ready: 0, linkedin_ready: 0, phone_ready: 0,
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
        body: '', status: 'draft',
      });
      draftKeys.add(key);
    }
  };

  const seenNames = new Set();

  for (const { rowIndex, mapped } of companies) {
    try {
      const nameKey = mapped.company_name.toLowerCase();

      if (seenNames.has(nameKey)) {
        skipCounts.duplicate_in_file++;
        skipDetails.push({ row: rowIndex, reason: 'duplicate_in_file' });
        summary.skipped_rows++;
        continue;
      }
      seenNames.add(nameKey);

      const existingCompany = existingByName.get(nameKey);
      let companyId, companyName, sourceCompany;

      if (existingCompany) {
        summary.duplicate_rows++;
        skipCounts.duplicate_existing++;
        companyId = existingCompany.id;
        companyName = existingCompany.company_name;
        sourceCompany = existingCompany;
      } else {
        const record = {
          id: generateId(), created_date: now(), updated_date: now(),
          outreach_status: 'not_started', notes_count: 0,
          ...mapped,
        };
        newCompanies.push(record);
        existingByName.set(nameKey, record);
        summary.imported_rows++;
        companyId = record.id;
        companyName = record.company_name;
        sourceCompany = record;
      }

      linkToProject(companyId, companyName);
      ensureDrafts(companyId, companyName, sourceCompany);

      if (sourceCompany.primary_email) summary.email_ready++; else summary.missing_email++;
      if (sourceCompany.linkedin_url) summary.linkedin_ready++; else summary.missing_linkedin++;
      if (sourceCompany.primary_phone) summary.phone_ready++; else summary.missing_phone++;
      if (['needs_enrichment', 'not_found'].includes(sourceCompany.enrichment_status)) summary.needs_enrichment++;
    } catch (err) {
      summary.error_rows++;
      summary.error_details.push({ row: rowIndex, error: err.message });
      skipCounts.save_failed++;
    }
  }

  setStore('Company', newCompanies);
  setStore('OutreachDraft', newDrafts);
  setStore('ProjectCompany', projectLinks);

  const saved = summary.imported_rows + summary.updated_rows;
  const status = saved > 0
    ? (summary.error_rows > 0 ? 'partial_success' : 'completed')
    : summary.error_rows > 0 ? 'failed'
    : summary.duplicate_rows > 0 ? 'no_new_records'
    : 'completed_no_records';

  const jobs = getStore('ImportJob');
  const job = {
    id: generateId(), created_date: now(), updated_date: now(),
    filename: filename || 'import.xlsx',
    status,
    started_at: now(), completed_at: now(),
    detected_sheet: sheetName,
    detected_header_row: headerRowIndex,
    skip_reasons: JSON.stringify(skipCounts),
    column_mapping: JSON.stringify(recognized.map(r => ({ raw: r.raw, field: r.field }))),
    ...summary,
  };
  if (summary.error_details.length === 0) delete job.error_details;
  else job.error_details = JSON.stringify(summary.error_details);
  jobs.push(job);
  setStore('ImportJob', jobs);

  const diagnostics = {
    detected_sheet: sheetName,
    detected_header_row: headerRowIndex,
    all_sheets: allSheets,
    column_mapping: recognized.map(r => ({ raw: r.raw, field: r.field })),
    unrecognized_headers: unrecognized,
    skip_reasons: skipCounts,
    first_3_rows: companies.slice(0, 3).map(c => c.mapped),
    first_10_skip_details: skipDetails.slice(0, 10),
    first_10_save_errors: [],
  };

  return Promise.resolve({ data: { summary, status, diagnostics } });
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
  let skipped_no_channel = 0;

  for (const cid of ids) {
    const company = companyMap[cid];
    if (!company) continue;

    const hasAnyChannel = company.primary_email || company.linkedin_url || company.primary_phone || company.whatsapp;
    if (!hasAnyChannel && channels.length > 1) { skipped_no_channel++; continue; }

    for (const ch of channels) {
      if (ch === 'email' && !company.primary_email) continue;
      if (ch === 'linkedin' && !company.linkedin_url) continue;
      if (ch === 'phone' && !company.primary_phone && !company.whatsapp) continue;

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
  return { data: { generated, skipped_no_channel, model: model || 'template' } };
};

// ─── Approve Draft ────────────────────────────────────────────────────────────

const handleApproveDraft = ({ draft_id, action, updated_body, updated_subject }) => {
  const drafts = getStore('OutreachDraft');
  const idx = drafts.findIndex(d => d.id === draft_id);
  if (idx !== -1) {
    if (action === 'approve') {
      drafts[idx] = { ...drafts[idx], status: 'approved', approved_at: now(), updated_date: now() };
    } else if (action === 'skip') {
      drafts[idx] = { ...drafts[idx], status: 'skipped', updated_date: now() };
    } else if (action === 'edit') {
      const updates = { updated_date: now() };
      if (updated_body !== undefined) updates.body = updated_body;
      if (updated_subject !== undefined) updates.subject = updated_subject;
      drafts[idx] = { ...drafts[idx], ...updates };
    }
    setStore('OutreachDraft', drafts);
  }
  return Promise.resolve({ data: { success: true } });
};

// ─── Send Email ───────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'outreach_app_settings';
const DEFAULT_SETTINGS = { test_mode: true, daily_email_limit: 50, sending_window_start: '09:00', sending_window_end: '17:00' };

const getSettings = () => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return DEFAULT_SETTINGS; }
};

const handleSendEmail = ({ draft_id, test_mode: explicitTestMode }) => {
  const { test_mode } = getSettings();
  const isTest = explicitTestMode !== undefined ? explicitTestMode : test_mode;
  const drafts = getStore('OutreachDraft');
  const idx = drafts.findIndex(d => d.id === draft_id);
  if (idx !== -1) {
    drafts[idx] = { ...drafts[idx], status: 'sent', sent_at: now(), updated_date: now(), simulated: isTest };
    setStore('OutreachDraft', drafts);
  }
  return Promise.resolve({ data: { success: true, mode: isTest ? 'test' : 'live', test_mode: isTest } });
};

// ─── Log Outreach ─────────────────────────────────────────────────────────────

const handleLogOutreach = ({ company_id, channel, action, status, draft_id, notes }) => {
  const logs = getStore('OutreachLog');
  logs.push({
    id: generateId(), created_date: now(), updated_date: now(),
    company_id, channel, action: action || 'logged', status: status || 'logged',
    ...(draft_id ? { draft_id } : {}),
    ...(notes ? { notes } : {}),
  });
  setStore('OutreachLog', logs);
  return Promise.resolve({ data: { success: true } });
};

// ─── App Settings ─────────────────────────────────────────────────────────────

const handleAppSettings = ({ action, settings: incoming }) => {
  if (action === 'get') {
    return Promise.resolve({ data: { settings: getSettings() } });
  }
  if (action === 'update') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(incoming));
    return Promise.resolve({ data: { success: true } });
  }
  return Promise.resolve({ data: {} });
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
  logOutreach:        handleLogOutreach,
  appSettings:        handleAppSettings,
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
