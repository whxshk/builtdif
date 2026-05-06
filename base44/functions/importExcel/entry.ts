import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as XLSX from 'npm:xlsx@0.18.5';

// ============================================================================
// Bulk Excel Import Pipeline
// 1. Parse once
// 2. Normalize all rows (trim, null-empty, strings, URL/date safety)
// 3. Validate required columns
// 4. Single bulk lookup of existing companies
// 5. Split into: new / update / duplicate / skipped / error
// 6. bulkCreate for new
// 7. Chunked updates with retry + exponential backoff on 429
// Idempotent: same file twice = 0 new, all duplicates/no-op updates.
// ============================================================================

const COLUMN_MAP = {
  'Company Name': 'company_name',
  'CR Number': 'cr_number',
  'Category': 'category',
  'Status': 'enrichment_status',
  'Primary Email': 'primary_email',
  'All Emails': 'all_emails',
  'Primary Phone': 'primary_phone',
  'All Phones': 'all_phones',
  'Website': 'website',
  'LinkedIn': 'linkedin_url',
  'Source': 'source',
  'Last Enriched': 'last_enriched',
};

const REQUIRED_COLUMNS = ['Company Name'];

const UPDATE_CHUNK_SIZE = 25;
const CREATE_CHUNK_SIZE = 100;
const CHUNK_DELAY_MS = 200;
const MAX_RETRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- normalization ----------

function normalizeCell(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  const str = String(val).trim();
  return str === '' ? null : str;
}

function normalizeStatus(status) {
  if (!status) return 'needs_enrichment';
  const s = String(status).toLowerCase().trim();
  if (s === 'complete' || s === 'completed') return 'complete';
  if (s === 'partial') return 'partial';
  if (s === 'not_found' || s === 'not found') return 'not_found';
  return 'needs_enrichment';
}

function normalizeUrl(val) {
  if (!val) return null;
  let s = String(val).trim();
  if (!s) return null;
  // Add scheme if missing so storage is consistent
  if (!/^https?:\/\//i.test(s) && !s.startsWith('//')) s = 'https://' + s;
  return s.replace(/\/+$/, '').toLowerCase();
}

function normalizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val.toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeCR(val) {
  const s = normalizeCell(val);
  return s ? s.replace(/\s+/g, '') : null;
}

function normalizeRow(rawObj) {
  const mapped = {};
  for (const [excelCol, dbField] of Object.entries(COLUMN_MAP)) {
    mapped[dbField] = normalizeCell(rawObj[excelCol]);
  }
  mapped.cr_number = normalizeCR(rawObj['CR Number']);
  mapped.website = normalizeUrl(mapped.website);
  mapped.linkedin_url = normalizeUrl(mapped.linkedin_url);
  mapped.last_enriched = normalizeDate(mapped.last_enriched);
  mapped.enrichment_status = normalizeStatus(mapped.enrichment_status);
  return mapped;
}

// ---------- retry wrapper ----------

async function withRetry(fn, label = 'op') {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || err);
      const isRateLimit = msg.includes('429') || /rate limit/i.test(msg);
      attempt++;
      if (attempt > MAX_RETRIES || !isRateLimit) throw err;
      const backoff = Math.min(2000, 250 * Math.pow(2, attempt));
      console.log(`[${label}] retry ${attempt} after ${backoff}ms — ${msg}`);
      await sleep(backoff);
    }
  }
}

// ---------- handler ----------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_base64, filename, preview_only, project_id } = body;
    const previewOnly = preview_only === true || preview_only === 'true';

    if (!file_base64) return Response.json({ error: 'No file uploaded' }, { status: 400 });

    // 1. Parse once
    const binaryStr = atob(file_base64);
    const uint8 = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) uint8[i] = binaryStr.charCodeAt(i);
    const workbook = XLSX.read(uint8, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rows.length < 2) return Response.json({ error: 'Excel file is empty or has no data rows' }, { status: 400 });

    const headers = rows[0].map((h) => (h ? String(h).trim() : ''));

    // 3. Validate required columns
    for (const col of REQUIRED_COLUMNS) {
      if (!headers.includes(col)) {
        return Response.json({ error: `Missing required column: "${col}"` }, { status: 400 });
      }
    }

    const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell !== null && cell !== ''));

    // Preview branch
    if (previewOnly) {
      const preview = dataRows.slice(0, 20).map((row) => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = normalizeCell(row[i]); });
        return obj;
      });
      return Response.json({ preview, total_rows: dataRows.length, headers });
    }

    // Create import job (pending → processing)
    const startedAt = new Date().toISOString();
    const importJob = await base44.asServiceRole.entities.ImportJob.create({
      filename: filename || 'import.xlsx',
      status: 'processing',
      started_at: startedAt,
      total_rows: dataRows.length,
    });

    // 2. Normalize all rows
    const normalized = []; // { rowIndex, mapped }
    const skippedRows = [];
    const errorRows = [];

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const rawObj = {};
        headers.forEach((h, idx) => { if (h) rawObj[h] = dataRows[i][idx]; });
        const mapped = normalizeRow(rawObj);
        if (!mapped.company_name) {
          skippedRows.push({ row: i + 2, reason: 'missing company_name' });
          continue;
        }
        normalized.push({ rowIndex: i + 2, mapped });
      } catch (err) {
        errorRows.push({ row: i + 2, error: err.message });
      }
    }

    // 4. Single bulk lookup of existing companies
    const existingCompanies = await base44.asServiceRole.entities.Company.list('-created_date', 100000);
    const byCR = new Map();
    const byName = new Map();
    const byWebsite = new Map();
    const byLinkedIn = new Map();
    for (const c of existingCompanies) {
      if (c.cr_number) byCR.set(c.cr_number.trim(), c);
      if (c.company_name) byName.set(c.company_name.toLowerCase().trim(), c);
      if (c.website) byWebsite.set(c.website.toLowerCase().trim(), c);
      if (c.linkedin_url) byLinkedIn.set(c.linkedin_url.toLowerCase().trim(), c);
    }

    // 5. Split rows
    const toCreate = [];                    // [mapped]
    const toUpdate = [];                    // [{ id, updates, rowIndex }]
    let duplicateCount = 0;

    // Stats counters
    let missingEmail = 0, missingPhone = 0, missingLinkedIn = 0;
    let emailReady = 0, linkedinReady = 0, phoneReady = 0, needsEnrichment = 0, websiteOnly = 0;

    for (const { rowIndex, mapped } of normalized) {
      const nameKey = mapped.company_name.toLowerCase().trim();
      const websiteKey = mapped.website ? mapped.website.toLowerCase().trim() : null;
      const linkedinKey = mapped.linkedin_url ? mapped.linkedin_url.toLowerCase().trim() : null;

      let existing = null;
      if (mapped.cr_number && byCR.has(mapped.cr_number)) existing = byCR.get(mapped.cr_number);
      else if (byName.has(nameKey)) existing = byName.get(nameKey);
      else if (websiteKey && byWebsite.has(websiteKey)) existing = byWebsite.get(websiteKey);
      else if (linkedinKey && byLinkedIn.has(linkedinKey)) existing = byLinkedIn.get(linkedinKey);

      if (existing && existing.id) {
        // Match against an already-persisted DB record → update missing/better fields (idempotent)
        const updates = {};
        for (const field of ['cr_number', 'category', 'primary_email', 'all_emails', 'primary_phone', 'all_phones', 'website', 'linkedin_url', 'source', 'last_enriched']) {
          if (mapped[field] && !existing[field]) updates[field] = mapped[field];
        }
        if (mapped.enrichment_status === 'complete' && existing.enrichment_status !== 'complete') {
          updates.enrichment_status = 'complete';
        }
        if (Object.keys(updates).length > 0) {
          toUpdate.push({ id: existing.id, updates, rowIndex });
        } else {
          duplicateCount++;
        }
      } else if (existing) {
        // Match against an in-file row already queued for create → just a duplicate within the same file
        duplicateCount++;
      } else {
        toCreate.push(mapped);
        // Add to lookup maps so subsequent duplicates within this file are detected
        if (mapped.cr_number) byCR.set(mapped.cr_number, mapped);
        byName.set(nameKey, mapped);
        if (websiteKey) byWebsite.set(websiteKey, mapped);
        if (linkedinKey) byLinkedIn.set(linkedinKey, mapped);
      }

      // Stats
      if (!mapped.primary_email) missingEmail++; else emailReady++;
      if (!mapped.primary_phone) missingPhone++; else phoneReady++;
      if (!mapped.linkedin_url) missingLinkedIn++; else linkedinReady++;
      if (!mapped.primary_email && !mapped.primary_phone && !mapped.linkedin_url) needsEnrichment++;
      if (mapped.website && !mapped.primary_email && !mapped.primary_phone && !mapped.linkedin_url) websiteOnly++;
    }

    // 6. bulkCreate in chunks (with retry)
    let importedCount = 0;
    for (let i = 0; i < toCreate.length; i += CREATE_CHUNK_SIZE) {
      const chunk = toCreate.slice(i, i + CREATE_CHUNK_SIZE);
      try {
        await withRetry(
          () => base44.asServiceRole.entities.Company.bulkCreate(chunk),
          `bulkCreate@${i}`
        );
        importedCount += chunk.length;
      } catch (err) {
        // Per-chunk failure → record each row, keep going
        for (const m of chunk) {
          errorRows.push({ row: 'create', company: m.company_name, error: err.message });
        }
      }
      if (i + CREATE_CHUNK_SIZE < toCreate.length) await sleep(CHUNK_DELAY_MS);
    }

    // 7. Chunked updates with retry/backoff (no bulk-update API)
    let updatedCount = 0;
    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
      for (const u of chunk) {
        try {
          await withRetry(
            () => base44.asServiceRole.entities.Company.update(u.id, u.updates),
            `update@row${u.rowIndex}`
          );
          updatedCount++;
        } catch (err) {
          errorRows.push({ row: u.rowIndex, error: err.message });
        }
      }
      if (i + UPDATE_CHUNK_SIZE < toUpdate.length) await sleep(CHUNK_DELAY_MS);
    }

    // Final job status
    const errorCount = errorRows.length;
    let finalStatus = 'completed';
    if (errorCount > 0 && (importedCount + updatedCount) > 0) finalStatus = 'partial_success';
    else if (errorCount > 0 && (importedCount + updatedCount) === 0) finalStatus = 'failed';

    const completedAt = new Date().toISOString();
    const summary = {
      total_rows: dataRows.length,
      imported_rows: importedCount,
      updated_rows: updatedCount,
      duplicate_rows: duplicateCount,
      skipped_rows: skippedRows.length,
      error_rows: errorCount,
      missing_email: missingEmail,
      missing_phone: missingPhone,
      missing_linkedin: missingLinkedIn,
      website_only: websiteOnly,
      email_ready: emailReady,
      linkedin_ready: linkedinReady,
      phone_ready: phoneReady,
      needs_enrichment: needsEnrichment,
    };

    await base44.asServiceRole.entities.ImportJob.update(importJob.id, {
      ...summary,
      status: finalStatus,
      completed_at: completedAt,
      error_details: errorCount > 0 ? JSON.stringify(errorRows.slice(0, 100)) : null,
    });

    // 8. Link companies into the target project (idempotent, bulk-create in chunks)
    let linkedToProject = 0;
    if (project_id) {
      try {
        // Re-fetch to capture newly created company IDs
        const allCompaniesAfter = await base44.asServiceRole.entities.Company.list('-created_date', 100000);
        const lookup = new Map();
        for (const c of allCompaniesAfter) {
          if (c.cr_number) lookup.set(`cr:${c.cr_number}`, c);
          if (c.company_name) lookup.set(`name:${c.company_name.toLowerCase().trim()}`, c);
        }

        // Resolve every normalized row to a company id
        const targetCompanyIds = new Set();
        for (const { mapped } of normalized) {
          let c = null;
          if (mapped.cr_number) c = lookup.get(`cr:${mapped.cr_number}`);
          if (!c && mapped.company_name) c = lookup.get(`name:${mapped.company_name.toLowerCase().trim()}`);
          if (c?.id) targetCompanyIds.add(c.id);
        }

        // Skip rows already linked
        const existingLinks = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id }, '-created_date', 100000);
        const linkedIds = new Set(existingLinks.map(pc => pc.company_id));

        const toLink = [];
        for (const cid of targetCompanyIds) {
          if (linkedIds.has(cid)) continue;
          const c = allCompaniesAfter.find(x => x.id === cid);
          toLink.push({
            project_id,
            company_id: cid,
            company_name: c?.company_name || '',
            outreach_stage: 'new',
          });
        }

        for (let i = 0; i < toLink.length; i += CREATE_CHUNK_SIZE) {
          const chunk = toLink.slice(i, i + CREATE_CHUNK_SIZE);
          await withRetry(
            () => base44.asServiceRole.entities.ProjectCompany.bulkCreate(chunk),
            `linkProject@${i}`
          );
          linkedToProject += chunk.length;
          if (i + CREATE_CHUNK_SIZE < toLink.length) await sleep(CHUNK_DELAY_MS);
        }

        // Update project total_companies counter
        const project = await base44.asServiceRole.entities.Project.get(project_id).catch(() => null);
        if (project) {
          await base44.asServiceRole.entities.Project.update(project_id, {
            total_companies: (project.total_companies || 0) + linkedToProject,
          });
        }
      } catch (err) {
        console.error('Project linking failed:', err);
      }
    }

    return Response.json({
      success: true,
      import_job_id: importJob.id,
      status: finalStatus,
      project_id: project_id || null,
      linked_to_project: linkedToProject,
      summary: { ...summary, error_details: errorRows.slice(0, 50) },
    });
  } catch (error) {
    console.error('importExcel fatal:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});