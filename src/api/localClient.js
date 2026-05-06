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

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'outreach_app_settings';
const DEFAULT_SETTINGS = {
  test_mode: true,
  daily_email_limit: 50,
  max_emails_per_hour: 10,
  sending_window_start: '09:00',
  sending_window_end: '17:00',
  ollama_base_url: 'http://localhost:11434',
  ollama_model: '',
  smtp_from_name: 'RFxAI Outreach',
  smtp_from_email: '',
};

const getSettings = () => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return DEFAULT_SETTINGS; }
};

const getOllamaBase = () => {
  try { return getSettings().ollama_base_url || 'http://localhost:11434'; }
  catch { return 'http://localhost:11434'; }
};

const LOCAL_API_URL = () =>
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOCAL_API_URL) || 'http://localhost:3001';

// ─── Rate limiting ────────────────────────────────────────────────────────────

const SEND_LOG_KEY = 'outreach_send_log';

const getSendLog = () => {
  try { return JSON.parse(localStorage.getItem(SEND_LOG_KEY) || '[]'); }
  catch { return []; }
};

const recordSend = () => {
  const log = getSendLog();
  log.push(new Date().toISOString());
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  localStorage.setItem(SEND_LOG_KEY, JSON.stringify(log.filter(t => t > cutoff)));
};

const checkRateLimit = (settings) => {
  const log = getSendLog();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const lastHour = log.filter(t => t > hourAgo).length;
  const today = log.filter(t => t > dayStart).length;
  const maxHour = settings.max_emails_per_hour ?? 10;
  const maxDay = settings.daily_email_limit ?? 50;
  if (lastHour >= maxHour) return { ok: false, reason: `Hourly limit reached (${maxHour}/hour). Try again later.` };
  if (today >= maxDay) return { ok: false, reason: `Daily limit reached (${maxDay}/day). Try again tomorrow.` };
  return { ok: true };
};

const isInSendingWindow = (settings) => {
  const d = new Date();
  const current = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const start = settings.sending_window_start || '09:00';
  const end = settings.sending_window_end || '17:00';
  return current >= start && current <= end;
};

// ─── Ollama ───────────────────────────────────────────────────────────────────

export const getOllamaModels = async (baseUrl) => {
  const base = baseUrl || getOllamaBase();
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { models: [], error: `Ollama error: ${res.status}` };
    const data = await res.json();
    return { models: (data.models || []).map(m => m.name) };
  } catch (e) {
    return { models: [], error: `Ollama not reachable at ${base}` };
  }
};

export const getOllamaModel = async () => {
  const settings = getSettings();
  const base = settings.ollama_base_url || 'http://localhost:11434';

  let availableModels = [];
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    availableModels = (data.models || []).map(m => m.name);
  } catch { return null; }

  if (!availableModels.length) return null;

  // Use saved model preference if available
  if (settings.ollama_model && availableModels.includes(settings.ollama_model)) {
    return settings.ollama_model;
  }

  // Auto-pick best model
  const preferred = ['llama3', 'llama3.2', 'llama3:8b', 'llama2', 'mistral', 'qwen2.5', 'gemma2', 'phi3', 'deepseek'];
  for (const p of preferred) {
    const m = availableModels.find(name => name.startsWith(p));
    if (m) return m;
  }
  return availableModels[0];
};

const ollamaChat = async (model, prompt) => {
  const base = getOllamaBase();
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.7, num_predict: 400 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content || '';
};

// ─── Company Analysis ─────────────────────────────────────────────────────────

const inferPainPoints = (category) => {
  if (!category) return 'responds to procurement RFPs and needs to reduce manual effort and improve win rates';
  const cat = category.toLowerCase();
  const map = [
    [['construction', 'contractor', 'build', 'infrastructure'], 'submits many tenders and bids; manual proposal writing takes significant team time'],
    [['technology', 'software', 'it ', ' it', 'tech', 'digital', 'saas'], 'frequently responds to RFPs and RFIs; needs to differentiate quickly in competitive bids'],
    [['consulting', 'advisory', 'management', 'strategy'], 'proposal quality and speed are core to winning client engagements'],
    [['engineering', 'design', 'architecture'], 'regularly bids on complex projects; proposal quality directly impacts win rates'],
    [['healthcare', 'medical', 'pharma', 'hospital'], 'responds to procurement RFPs with strict compliance and documentation requirements'],
    [['manufacturing', 'industrial', 'factory', 'production'], 'bids on supply contracts; needs to balance bid effort with win probability'],
    [['finance', 'banking', 'insurance', 'investment'], 'responds to client acquisition RFPs; quality and compliance documentation are critical'],
    [['logistics', 'transport', 'supply chain', 'shipping'], 'regularly bids on contracts; cost-efficiency in bid preparation is a priority'],
    [['energy', 'oil', 'gas', 'utilities', 'power'], 'submits complex tenders; compliance, technical documentation, and quality are critical'],
    [['government', 'public sector', 'municipality'], 'RFx is the primary procurement mechanism; compliance and traceability are mandatory'],
    [['real estate', 'property', 'facilities'], 'responds to RFPs for facility management and construction contracts'],
  ];
  for (const [keys, pain] of map) {
    if (keys.some(k => cat.includes(k))) return pain;
  }
  return 'responds to procurement RFPs/RFx and needs to reduce manual effort and improve win rates';
};

const analyzeCompany = (company) => {
  const channels = [];
  if (company.primary_email || company.contact_email) channels.push('email');
  if (company.linkedin_url) channels.push('linkedin');
  if (company.primary_phone || company.contact_phone || company.whatsapp) channels.push('phone');

  const contextParts = [];
  if (company.category) contextParts.push(`operates in the ${company.category} sector`);
  if (company.company_size) contextParts.push(`company size: ${company.company_size}`);
  if (company.country) contextParts.push(`based in ${company.country}`);

  return {
    company_name: company.company_name,
    category: company.category || null,
    website: company.website || null,
    source: company.source || null,
    contact_name: company.contact_person || null,
    contact_title: company.contact_title || null,
    inferred_business_context: contextParts.join(', ') || null,
    available_contact_channels: channels,
    pain_points: inferPainPoints(company.category),
    data_sources_used: ['excel_import'],
  };
};

// ─── Prompt builders ──────────────────────────────────────────────────────────

const buildRFxAIEmailPrompt = (company, analysis) => {
  const greeting = analysis.contact_name
    ? `Hi ${analysis.contact_name}${analysis.contact_title ? ` (${analysis.contact_title})` : ''},`
    : 'Hi,';

  const contextSnippet = analysis.inferred_business_context || `a business that may handle procurement and bidding`;

  return `You are writing a short personalized cold email on behalf of RFxAI Solutions.

TARGET COMPANY: ${company.company_name}
CONTEXT: ${contextSnippet}
PAIN POINT: ${analysis.pain_points}
CONTACT: ${analysis.contact_name || 'Unknown'}${analysis.contact_title ? ` — ${analysis.contact_title}` : ''}
${company.website ? `WEBSITE: ${company.website}` : ''}

ABOUT RFxAI SOLUTIONS — "Shaped to You. Built to Win."
RFxAI helps companies save time and win more RFP/RFx work:
- RFxResponse: Instantly drafts RFP responses in your voice, trained on your past wins
- RFxBrain: AI that gets smarter with every proposal, refining language and strategy
- RFx Go/No-Go: AI bid/no-bid decisions to stop wasting effort on the wrong opportunities
- RFxInsights: Live analytics showing what drives your wins
- RFxScore: Ranks opportunities by strategic fit and effort
- RFxEvaluate: AI-augmented proposal review that catches gaps and risks fast

TASK: Write a brief cold email introducing RFxAI to ${company.company_name}.

RULES:
- First line: "${greeting}"
- Under 150 words total
- Mention the company name naturally
- Reference their business context (${analysis.category || 'their industry'})
- Focus on 1-2 RFxAI benefits most relevant to them
- Soft, non-pushy CTA (e.g., "Would a 15-minute call be worth your time?")
- No [placeholder] text, no fake claims, no spam phrases
- Professional but warm and human tone

FORMAT (exactly two parts, separated by a blank line):
Subject: <subject line>

<email body>`;
};

const buildPrompt = (company, channel) => {
  const name = company.company_name;
  const cat = company.category ? ` in the ${company.category} industry` : '';
  if (channel === 'linkedin') {
    return `Write a LinkedIn connection request for "${name}"${cat}. Max 200 characters, friendly, professional, no placeholders, no [brackets].`;
  }
  return `Write a brief phone call opening script for reaching out to "${name}"${cat}. Include intro, reason for calling, ask for the right person. Under 80 words.`;
};

const templateBody = (company, channel) => {
  const name = company.company_name;
  const cat = company.category ? ` in the ${company.category} sector` : '';
  if (channel === 'email') {
    return `Hi,

I came across ${name}${cat} and wanted to reach out about how RFxAI Solutions can help your team save time and win more RFP/RFx opportunities.

RFxAI automates proposal drafting, helps with bid/no-bid decisions, and scores opportunities by strategic fit — so your team focuses on the bids most worth winning.

Would a quick 15-minute call be worth your time?

Best regards`;
  }
  if (channel === 'linkedin') {
    return `Hi! I noticed ${name} and thought RFxAI's proposal automation tools could save your team significant time on RFP responses. Would love to connect.`;
  }
  return `Hi, I'm calling to speak with the right person at ${name} about how RFxAI can help reduce time on RFP proposals and improve your win rate. Could you direct me to the appropriate contact?`;
};

const parseEmailContent = (content, companyName) => {
  const lines = content.split('\n');
  const subjectLine = lines.find(l => /^subject:\s*/i.test(l.trim()));
  const subject = subjectLine
    ? subjectLine.replace(/^subject:\s*/i, '').trim()
    : `Save Time on RFP Responses – ${companyName}`;
  const body = lines.filter(l => !/^subject:\s*/i.test(l.trim())).join('\n').trim();
  return { subject, body };
};

const generateDraftContent = async (company, channel, model) => {
  if (channel === 'email') {
    const analysis = analyzeCompany(company);
    const baseFields = {
      analysis_summary: JSON.stringify(analysis),
      data_sources_used: JSON.stringify(analysis.data_sources_used),
      generated_at: now(),
      recipient_email: company.primary_email || company.contact_email || null,
    };

    if (!model) {
      return {
        subject: `Save Time on RFP Responses – ${company.company_name}`,
        body: templateBody(company, channel),
        ai_model_used: null,
        ...baseFields,
      };
    }
    try {
      const content = await ollamaChat(model, buildRFxAIEmailPrompt(company, analysis));
      const { subject, body } = parseEmailContent(content, company.company_name);
      return { subject, body, ai_model_used: model, ...baseFields };
    } catch (e) {
      console.warn('[generateDraftContent] Ollama error:', e.message, '— using template');
      return {
        subject: `Save Time on RFP Responses – ${company.company_name}`,
        body: templateBody(company, channel),
        ai_model_used: null,
        ...baseFields,
      };
    }
  }

  // LinkedIn / phone
  if (!model) return { body: templateBody(company, channel) };
  try {
    const content = await ollamaChat(model, buildPrompt(company, channel));
    return { body: content, ai_model_used: model, generated_at: now() };
  } catch {
    return { body: templateBody(company, channel) };
  }
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

  const ensureDraft = (companyId, companyName, src) => {
    // V1: only create email draft if email exists
    if (!src.primary_email && !src.contact_email) return;
    const key = `${companyId}|email`;
    if (draftKeys.has(key)) return;
    const recipientEmail = src.primary_email || src.contact_email;
    newDrafts.push({
      id: generateId(), created_date: now(), updated_date: now(),
      company_id: companyId, company_name: companyName,
      channel: 'email',
      draft_type: 'first_outreach',
      subject: `Save Time on RFP Responses – ${companyName}`,
      body: '',
      status: 'draft',
      recipient_email: recipientEmail,
      campaign_id: project_id || null,
    });
    draftKeys.add(key);
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
        // Update email if newly available
        const hasNewEmail = (mapped.primary_email || mapped.contact_email) &&
          !existingCompany.primary_email && !existingCompany.contact_email;
        if (hasNewEmail) {
          const idx = newCompanies.findIndex(c => c.id === existingCompany.id);
          if (idx >= 0) {
            newCompanies[idx] = { ...newCompanies[idx], ...mapped, updated_date: now() };
            summary.updated_rows++;
          }
        } else {
          summary.duplicate_rows++;
          skipCounts.duplicate_existing++;
        }
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
      ensureDraft(companyId, companyName, sourceCompany);

      if (sourceCompany.primary_email || sourceCompany.contact_email) summary.email_ready++;
      else summary.missing_email++;
      if (sourceCompany.linkedin_url) summary.linkedin_ready++;
      else summary.missing_linkedin++;
      if (sourceCompany.primary_phone) summary.phone_ready++;
      else summary.missing_phone++;
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
    const content = await generateDraftContent(company, drafts[idx].channel, model);
    drafts[idx] = { ...drafts[idx], ...content, updated_date: now() };
    setStore('OutreachDraft', drafts);
    return { data: { generated: 1, model: model || 'template' } };
  }

  const ids = bulk_ids || company_ids || (company_id ? [company_id] : []);
  const companyMap = Object.fromEntries(getStore('Company').map(c => [c.id, c]));
  const targetChannels = channel ? [channel] : ['email'];

  let generated = 0;
  let skipped_no_email = 0;
  let skipped_no_channel = 0;

  for (const cid of ids) {
    const company = companyMap[cid];
    if (!company) continue;

    for (const ch of targetChannels) {
      if (ch === 'email') {
        const email = company.primary_email || company.contact_email;
        if (!email) {
          if (targetChannels.length === 1) skipped_no_email++;
          continue;
        }
      }
      if (ch === 'linkedin' && !company.linkedin_url) continue;
      if (ch === 'phone' && !company.primary_phone && !company.whatsapp) continue;

      const content = await generateDraftContent(company, ch, model);
      const existingIdx = drafts.findIndex(d => d.company_id === cid && d.channel === ch);

      if (existingIdx >= 0) {
        drafts[existingIdx] = { ...drafts[existingIdx], ...content, updated_date: now() };
      } else {
        drafts.push({
          id: generateId(), created_date: now(), updated_date: now(),
          company_id: cid, company_name: company.company_name,
          channel: ch,
          campaign_id: null,
          draft_type: 'first_outreach',
          status: 'draft',
          ...content,
        });
      }
      generated++;
    }
  }

  setStore('OutreachDraft', drafts);
  return { data: { generated, skipped_no_email, skipped_no_channel, model: model || 'template' } };
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
      const updates = { last_edited_at: now(), updated_date: now() };
      if (updated_body !== undefined) updates.body = updated_body;
      if (updated_subject !== undefined) updates.subject = updated_subject;
      drafts[idx] = { ...drafts[idx], ...updates };
    }
    setStore('OutreachDraft', drafts);
  }
  return Promise.resolve({ data: { success: true } });
};

// ─── Send Email ───────────────────────────────────────────────────────────────

const handleSendEmail = async ({ draft_id, test_mode: explicitTestMode }) => {
  const settings = getSettings();
  const isTest = explicitTestMode !== undefined ? explicitTestMode : settings.test_mode;

  const drafts = getStore('OutreachDraft');
  const idx = drafts.findIndex(d => d.id === draft_id);
  if (idx === -1) return Promise.resolve({ data: { success: false, error: 'Draft not found' } });

  const draft = drafts[idx];

  if (isTest) {
    drafts[idx] = { ...draft, status: 'sent', sent_at: now(), updated_date: now(), simulated: true };
    setStore('OutreachDraft', drafts);
    handleLogOutreach({ company_id: draft.company_id, channel: 'email', action: 'simulated', status: 'simulated', draft_id });
    return Promise.resolve({ data: { success: true, mode: 'test', test_mode: true } });
  }

  // Live send — check rate limits
  const rateCheck = checkRateLimit(settings);
  if (!rateCheck.ok) {
    return Promise.resolve({ data: { success: false, error: rateCheck.reason, rate_limited: true } });
  }

  // Check sending window
  if (!isInSendingWindow(settings)) {
    return Promise.resolve({
      data: {
        success: false,
        error: `Outside sending window (${settings.sending_window_start}–${settings.sending_window_end}). Enable test mode or adjust the window in Settings.`,
        window_blocked: true,
      },
    });
  }

  // Find recipient email
  const company = getStore('Company').find(c => c.id === draft.company_id);
  const recipientEmail = draft.recipient_email || company?.primary_email || company?.contact_email;
  if (!recipientEmail) {
    return Promise.resolve({ data: { success: false, error: 'No recipient email found. Edit the company to add an email address.' } });
  }

  // Call backend service
  try {
    const res = await fetch(`${LOCAL_API_URL()}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipientEmail,
        subject: draft.subject || `Outreach – ${draft.company_name}`,
        body: draft.body,
        from_name: settings.smtp_from_name,
        from_email: settings.smtp_from_email || undefined,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await res.json();

    if (data.ok) {
      recordSend();
      drafts[idx] = {
        ...draft, status: 'sent', sent_at: now(), updated_date: now(),
        simulated: false, recipient_email: recipientEmail,
        send_attempts: (draft.send_attempts || 0) + 1,
      };
      setStore('OutreachDraft', drafts);
      handleLogOutreach({ company_id: draft.company_id, channel: 'email', action: 'sent', status: 'sent', draft_id });
      return Promise.resolve({ data: { success: true, mode: 'live', test_mode: false } });
    } else {
      drafts[idx] = {
        ...draft, status: 'failed', updated_date: now(), last_error: data.error,
        send_attempts: (draft.send_attempts || 0) + 1,
      };
      setStore('OutreachDraft', drafts);
      handleLogOutreach({ company_id: draft.company_id, channel: 'email', action: 'failed', status: 'failed', draft_id, notes: data.error });
      return Promise.resolve({ data: { success: false, error: data.error, mode: 'live' } });
    }
  } catch (err) {
    const errorMsg = err.name === 'TimeoutError'
      ? 'Request timed out. The backend service may be overloaded.'
      : 'Backend service not reachable. Start the backend with: cd backend && npm start';
    drafts[idx] = { ...draft, status: 'failed', updated_date: now(), last_error: errorMsg };
    setStore('OutreachDraft', drafts);
    return Promise.resolve({ data: { success: false, error: errorMsg, mode: 'live' } });
  }
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
    const current = getSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...incoming }));
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
  sendEmail:          (args) => Promise.resolve().then(() => handleSendEmail(args)),
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
