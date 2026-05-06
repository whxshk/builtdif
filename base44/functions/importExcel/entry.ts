import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as XLSX from 'npm:xlsx@0.18.5';

// ============================================================================
// OutreachOS — Robust Excel Import Pipeline v2
//
// Root-cause fixes vs v1:
//   1. COLUMN_MAP exact-string lookup replaced with fuzzy alias matching
//      (case-insensitive, BOM-safe, newline-safe, punctuation-tolerant)
//   2. Auto-detect best worksheet (scores all sheets)
//   3. Auto-detect header row (scans first 25 rows of the selected sheet)
//   4. Granular skip-reason tracking (not just a total)
//   5. Correct status semantics — no green "completed" when 0 rows imported
//   6. Full diagnostics payload returned for UI debug panel
// ============================================================================

const DEBUG = true; // guard verbose console.log output

// ---------------------------------------------------------------------------
// Header alias table
// Keys are the *normalised* form of Excel column headers (see normalizeHeaderKey).
// Values are the canonical Company entity field names.
// ---------------------------------------------------------------------------
const HEADER_ALIASES: Record<string, string> = {
  // company_name
  'company name':   'company_name',
  'company':        'company_name',
  'organization':   'company_name',
  'organisation':   'company_name',
  'business name':  'company_name',
  'account name':   'company_name',
  'client name':    'company_name',
  'entity name':    'company_name',
  'firm name':      'company_name',
  'firm':           'company_name',

  // cr_number
  'cr number':                    'cr_number',
  'cr no':                        'cr_number',
  'cr':                           'cr_number',
  'commercial registration':      'cr_number',
  'commercial registration number':'cr_number',
  'registration number':          'cr_number',
  'reg no':                       'cr_number',
  'reg number':                   'cr_number',
  'registration':                 'cr_number',

  // category
  'category':     'category',
  'industry':     'category',
  'sector':       'category',
  'business type':'category',
  'company type': 'category',

  // enrichment_status
  'status':           'enrichment_status',
  'pipeline status':  'enrichment_status',
  'enrichment status':'enrichment_status',
  'lead status':      'enrichment_status',
  'data status':      'enrichment_status',

  // primary_email
  'primary email': 'primary_email',
  'email':         'primary_email',
  'email address': 'primary_email',
  'main email':    'primary_email',
  'e mail':        'primary_email',

  // all_emails
  'all emails':        'all_emails',
  'emails':            'all_emails',
  'additional emails': 'all_emails',
  'other emails':      'all_emails',

  // primary_phone
  'primary phone':  'primary_phone',
  'phone':          'primary_phone',
  'phone number':   'primary_phone',
  'main phone':     'primary_phone',
  'telephone':      'primary_phone',
  'tel':            'primary_phone',
  'mobile':         'primary_phone',
  'mobile number':  'primary_phone',
  'contact number': 'primary_phone',

  // all_phones
  'all phones':        'all_phones',
  'phones':            'all_phones',
  'additional phones': 'all_phones',
  'other phones':      'all_phones',

  // website
  'website':         'website',
  'url':             'website',
  'domain':          'website',
  'website url':     'website',
  'company website': 'website',
  'web site':        'website',

  // linkedin_url
  'linkedin':          'linkedin_url',
  'linkedin url':      'linkedin_url',
  'company linkedin':  'linkedin_url',
  'linkedin profile':  'linkedin_url',
  'linkedin page':     'linkedin_url',

  // source
  'source':      'source',
  'lead source': 'source',
  'data source': 'source',
  'origin':      'source',

  // last_enriched
  'last enriched':       'last_enriched',
  'enriched at':         'last_enriched',
  'last enrichment date':'last_enriched',
  'enrichment date':     'last_enriched',
  'date enriched':       'last_enriched',
};

const CHUNK_CREATE  = 100;
const CHUNK_UPDATE  = 25;
const CHUNK_DELAY   = 200;
const MAX_RETRIES   = 4;
const MAX_HDR_SCAN  = 25; // how many rows to scan when looking for headers

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// normalizeHeaderKey — makes any header variant map to the alias table key
// ---------------------------------------------------------------------------
function normalizeHeaderKey(raw: string): string {
  return raw
    .replace(/^﻿+/, '')                                        // strip leading BOM(s)
    .replace(/[      ]/g, ' ')       // Unicode spaces → ASCII space
    .replace(/[\r\n\t]+/g, ' ')                                     // line breaks → space
    .replace(/[._\-]+/g, ' ')                                       // common separators → space
    .replace(/[^\w\s]/g, '')                                        // strip remaining punctuation
    .replace(/\s+/g, ' ')                                           // collapse multiple spaces
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// detectHeaderRow — scan up to MAX_HDR_SCAN rows; return the one that matches
// the most recognized header aliases (company_name weighted ×10)
// ---------------------------------------------------------------------------
function detectHeaderRow(rows: any[][]) {
  let bestRowIdx   = 0;
  let bestScore    = -1;
  let bestColMap: Record<number, string>                              = {};
  let bestRaw: string[]                                              = [];
  let bestRecog: Array<{ raw: string; field: string; col: number }> = [];
  let bestUnrecog: string[]                                         = [];

  for (let r = 0; r < Math.min(MAX_HDR_SCAN, rows.length); r++) {
    const row = rows[r];
    const colMap: Record<number, string>                              = {};
    const recognized: Array<{ raw: string; field: string; col: number }> = [];
    const unrecognized: string[]                                      = [];
    const rawHeaders: string[]                                        = [];
    const usedFields = new Set<string>();
    let score = 0;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined || cell === '') continue;
      const rawStr = String(cell);
      rawHeaders.push(rawStr);
      const normed = normalizeHeaderKey(rawStr);
      const field  = HEADER_ALIASES[normed];
      if (field && !usedFields.has(field)) {
        colMap[c] = field;
        usedFields.add(field);
        recognized.push({ raw: rawStr, field, col: c });
        score += field === 'company_name' ? 10 : 1;
      } else {
        unrecognized.push(rawStr);
      }
    }

    if (score > bestScore) {
      bestScore    = score;
      bestRowIdx   = r;
      bestColMap   = colMap;
      bestRaw      = rawHeaders;
      bestRecog    = recognized;
      bestUnrecog  = unrecognized;
    }
  }

  return { headerRowIndex: bestRowIdx, colMap: bestColMap, rawHeaders: bestRaw, recognized: bestRecog, unrecognized: bestUnrecog, score: bestScore };
}

// ---------------------------------------------------------------------------
// detectBestSheet — score every worksheet; return the one whose best header row
// has the highest recognition score (company_name weighted)
// ---------------------------------------------------------------------------
function detectBestSheet(workbook: any) {
  let bestSheet:     string  = workbook.SheetNames[0];
  let bestRows:      any[][] = [];
  let bestResult:    ReturnType<typeof detectHeaderRow> = { headerRowIndex: 0, colMap: {}, rawHeaders: [], recognized: [], unrecognized: [], score: -1 };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rows.length < 1) continue;
    const result = detectHeaderRow(rows);
    if (result.score > bestResult.score) {
      bestSheet  = sheetName;
      bestRows   = rows;
      bestResult = result;
    }
  }

  return { sheetName: bestSheet, rows: bestRows, ...bestResult };
}

// ---------------------------------------------------------------------------
// Cell normalizers
// ---------------------------------------------------------------------------
function normalizeCell(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const s = String(val).replace(/^﻿+/, '').trim();
  return s === '' ? null : s;
}

function normalizeStatus(status: any): string {
  if (!status) return 'needs_enrichment';
  const s = String(status).toLowerCase().trim();
  if (s === 'complete' || s === 'completed') return 'complete';
  if (s === 'partial') return 'partial';
  if (s === 'not_found' || s === 'not found') return 'not_found';
  return 'needs_enrichment';
}

function normalizeUrl(val: any): string | null {
  const s = normalizeCell(val);
  if (!s) return null;
  let url = s;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) url = 'https://' + url;
  return url.replace(/\/+$/, '').toLowerCase();
}

function normalizeDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeCR(val: any): string | null {
  const s = normalizeCell(val);
  return s ? s.replace(/\s+/g, '') : null;
}

function normalizePhone(val: any): string | null {
  if (val === null || val === undefined) return null;
  // Phone numbers stored as Excel numbers lose leading zeros — unavoidable
  const s = typeof val === 'number' ? String(Math.round(val)) : String(val).trim();
  return s === '' ? null : s;
}

// ---------------------------------------------------------------------------
// buildRowObj — use the detected colMap to extract fields from a data row
// ---------------------------------------------------------------------------
function buildRowObj(row: any[], colMap: Record<number, string>): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const [colStr, field] of Object.entries(colMap)) {
    obj[field] = row[Number(colStr)] ?? null;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// normalizeRowObj — normalize raw field values to Company entity values
// ---------------------------------------------------------------------------
function normalizeRowObj(obj: Record<string, any>): Record<string, any> {
  return {
    company_name:      normalizeCell(obj.company_name),
    cr_number:         normalizeCR(obj.cr_number),
    category:          normalizeCell(obj.category),
    enrichment_status: normalizeStatus(obj.enrichment_status),
    primary_email:     normalizeCell(obj.primary_email),
    all_emails:        normalizeCell(obj.all_emails),
    primary_phone:     normalizePhone(obj.primary_phone),
    all_phones:        normalizeCell(obj.all_phones),
    website:           normalizeUrl(obj.website),
    linkedin_url:      normalizeUrl(obj.linkedin_url),
    source:            normalizeCell(obj.source),
    last_enriched:     normalizeDate(obj.last_enriched),
  };
}

// ---------------------------------------------------------------------------
// stripNulls — remove null/undefined fields before sending to Base44 entity
// ---------------------------------------------------------------------------
function stripNulls(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff (rate-limit aware)
// ---------------------------------------------------------------------------
async function withRetry(fn: () => Promise<any>, label = 'op'): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as any)?.message || err);
      const isRateLimit = msg.includes('429') || /rate.?limit/i.test(msg);
      attempt++;
      if (attempt > MAX_RETRIES || !isRateLimit) throw err;
      const backoff = Math.min(2000, 250 * Math.pow(2, attempt));
      console.log(`[${label}] retry ${attempt} after ${backoff}ms — ${msg}`);
      await sleep(backoff);
    }
  }
}

// ===========================================================================
// Main handler
// ===========================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_base64, filename, preview_only, project_id } = body;
    const previewOnly = preview_only === true || preview_only === 'true';

    if (!file_base64) return Response.json({ error: 'No file uploaded' }, { status: 400 });

    // ── 1. Parse workbook ──────────────────────────────────────────────────
    const binaryStr = atob(file_base64);
    const uint8 = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) uint8[i] = binaryStr.charCodeAt(i);
    const workbook = XLSX.read(uint8, { type: 'array', cellDates: true });

    if (!workbook.SheetNames.length) {
      return Response.json({ error: 'Workbook has no sheets' }, { status: 400 });
    }

    // ── 2. Detect best sheet + header row ──────────────────────────────────
    const { sheetName, rows, headerRowIndex, colMap, recognized, unrecognized, score } =
      detectBestSheet(workbook);

    if (DEBUG) {
      console.log('[import] sheets:', workbook.SheetNames);
      console.log('[import] selected sheet:', sheetName, '| header row:', headerRowIndex, '| score:', score);
      console.log('[import] column mapping:', recognized.map(r => `${JSON.stringify(r.raw)}→${r.field}`).join(', '));
      if (unrecognized.length) console.log('[import] unrecognized cols:', unrecognized.slice(0, 10));
    }

    // ── 3. Require at least company_name mapping ───────────────────────────
    const hasCompanyName = Object.values(colMap).includes('company_name');
    if (!hasCompanyName || score < 1) {
      const firstRowSample = (rows[0] || []).map((c: any) => (c ? String(c) : '')).filter(Boolean).slice(0, 8);
      return Response.json({
        error: 'No recognizable company columns found. Check the worksheet and column headers.',
        hint: 'Expected a "Company Name" column (or similar). First row of selected sheet: ' + firstRowSample.join(', '),
        detected_sheet: sheetName,
        detected_header_row: headerRowIndex,
        all_sheets: workbook.SheetNames,
        recognized_headers: recognized.map(r => r.raw),
        unrecognized_headers: unrecognized.slice(0, 10),
      }, { status: 400 });
    }

    // ── 4. Extract data rows (after header row, skip blank rows) ───────────
    const dataRows = rows
      .slice(headerRowIndex + 1)
      .filter((row) => row.some((cell) => cell !== null && cell !== '' && cell !== undefined));

    // ── Preview branch ─────────────────────────────────────────────────────
    if (previewOnly) {
      const previewObjs = dataRows.slice(0, 20).map((row) => {
        const display: Record<string, any> = {};
        for (const r of recognized) {
          display[r.raw] = normalizeCell(row[r.col]);
        }
        return display;
      });
      return Response.json({
        preview:            previewObjs,
        total_rows:         dataRows.length,
        headers:            recognized.map(r => r.raw),
        detected_sheet:     sheetName,
        detected_header_row: headerRowIndex,
        column_mapping:     recognized.map(r => ({ raw: r.raw, field: r.field })),
        unrecognized_headers: unrecognized.slice(0, 20),
      });
    }

    // ── 5. Create import job (processing) ──────────────────────────────────
    const importJob = await base44.asServiceRole.entities.ImportJob.create({
      filename:    filename || 'import.xlsx',
      status:      'processing',
      started_at:  new Date().toISOString(),
      total_rows:  dataRows.length,
    });

    // ── 6. Normalize all rows; track skip reasons ──────────────────────────
    const skipReasons = {
      empty_row:            0,
      missing_company_name: 0,
      duplicate_in_file:    0,
      duplicate_existing:   0,
      save_failed:          0,
    };
    const skippedDetails:  Array<{ row: number; reason: string }> = [];
    const parseErrors:     Array<{ row: number; error: string }>   = [];
    const saveErrors:      Array<{ row: number | string; company?: string; error: string }> = [];
    const normalized:      Array<{ rowIndex: number; mapped: Record<string, any> }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const rowIndex = headerRowIndex + 2 + i; // 1-based Excel row number
      try {
        const rawObj = buildRowObj(dataRows[i], colMap);
        const mapped = normalizeRowObj(rawObj);

        if (!mapped.company_name) {
          skipReasons.missing_company_name++;
          skippedDetails.push({ row: rowIndex, reason: 'missing_company_name' });
          continue;
        }
        normalized.push({ rowIndex, mapped });
      } catch (err) {
        parseErrors.push({ row: rowIndex, error: (err as Error).message });
      }
    }

    if (DEBUG) {
      console.log('[import] data rows:', dataRows.length, '| normalized:', normalized.length);
      console.log('[import] skipped missing_company_name:', skipReasons.missing_company_name);
      if (normalized.length > 0) console.log('[import] first normalized row:', JSON.stringify(normalized[0].mapped));
    }

    // ── 7. Bulk lookup of existing companies ───────────────────────────────
    const existingCompanies = await base44.asServiceRole.entities.Company.list('-created_date', 100000);
    const byCR      = new Map<string, any>();
    const byName    = new Map<string, any>();
    const byWebsite = new Map<string, any>();

    for (const c of existingCompanies) {
      if (c.cr_number)    byCR.set(c.cr_number.trim().toLowerCase(), c);
      if (c.company_name) byName.set(c.company_name.toLowerCase().trim(), c);
      if (c.website)      byWebsite.set(c.website.toLowerCase().trim(), c);
    }

    // ── 8. Categorise rows: create / update / duplicate ───────────────────
    const toCreate: Array<Record<string, any>>                                       = [];
    const toUpdate: Array<{ id: string; updates: Record<string, any>; rowIndex: number }> = [];
    let duplicateCount = 0;

    let missingEmail = 0, missingPhone = 0, missingLinkedIn = 0;
    let emailReady   = 0, linkedinReady = 0, phoneReady = 0, needsEnrichment = 0;

    for (const { rowIndex, mapped } of normalized) {
      const nameKey    = mapped.company_name.toLowerCase().trim();
      const websiteKey = mapped.website     ? mapped.website.toLowerCase().trim()     : null;
      const crKey      = mapped.cr_number   ? mapped.cr_number.toLowerCase().trim()   : null;

      let existing: any = null;
      if (crKey      && byCR.has(crKey))           existing = byCR.get(crKey);
      else if (byName.has(nameKey))                 existing = byName.get(nameKey);
      else if (websiteKey && byWebsite.has(websiteKey)) existing = byWebsite.get(websiteKey);

      if (existing && existing.id) {
        // Matched a DB record — patch missing fields
        const updates: Record<string, any> = {};
        for (const f of ['cr_number','category','primary_email','all_emails','primary_phone','all_phones','website','linkedin_url','source','last_enriched']) {
          if (mapped[f] && !existing[f]) updates[f] = mapped[f];
        }
        if (mapped.enrichment_status === 'complete' && existing.enrichment_status !== 'complete') {
          updates.enrichment_status = 'complete';
        }
        if (Object.keys(updates).length > 0) {
          toUpdate.push({ id: existing.id, updates, rowIndex });
        } else {
          duplicateCount++;
          skipReasons.duplicate_existing++;
          skippedDetails.push({ row: rowIndex, reason: 'duplicate_existing' });
        }
      } else if (existing) {
        // In-file duplicate (plain mapped object, no .id)
        duplicateCount++;
        skipReasons.duplicate_in_file++;
        skippedDetails.push({ row: rowIndex, reason: 'duplicate_in_file' });
      } else {
        const toInsert = stripNulls(mapped);
        toCreate.push(toInsert);
        // Register in lookup maps so later rows in this file detect them as dupes
        if (crKey)      byCR.set(crKey, toInsert);
        byName.set(nameKey, toInsert);
        if (websiteKey) byWebsite.set(websiteKey, toInsert);
      }

      // Enrichment stats (over all valid rows)
      if (!mapped.primary_email)  { missingEmail++;   } else { emailReady++;   }
      if (!mapped.primary_phone)  { missingPhone++;   } else { phoneReady++;   }
      if (!mapped.linkedin_url)   { missingLinkedIn++; } else { linkedinReady++; }
      if (!mapped.primary_email && !mapped.primary_phone && !mapped.linkedin_url) needsEnrichment++;
    }

    if (DEBUG) {
      console.log('[import] toCreate:', toCreate.length, '| toUpdate:', toUpdate.length, '| dupes:', duplicateCount);
    }

    // ── 9. Bulk create ─────────────────────────────────────────────────────
    let importedCount = 0;
    for (let i = 0; i < toCreate.length; i += CHUNK_CREATE) {
      const chunk = toCreate.slice(i, i + CHUNK_CREATE);
      try {
        await withRetry(
          () => base44.asServiceRole.entities.Company.bulkCreate(chunk),
          `bulkCreate@${i}`
        );
        importedCount += chunk.length;
      } catch (err) {
        for (const m of chunk) {
          saveErrors.push({ row: 'bulk-create', company: m.company_name, error: (err as Error).message });
          skipReasons.save_failed++;
        }
      }
      if (i + CHUNK_CREATE < toCreate.length) await sleep(CHUNK_DELAY);
    }

    // ── 10. Chunked updates ────────────────────────────────────────────────
    let updatedCount = 0;
    for (let i = 0; i < toUpdate.length; i += CHUNK_UPDATE) {
      const chunk = toUpdate.slice(i, i + CHUNK_UPDATE);
      for (const u of chunk) {
        try {
          await withRetry(
            () => base44.asServiceRole.entities.Company.update(u.id, u.updates),
            `update@row${u.rowIndex}`
          );
          updatedCount++;
        } catch (err) {
          saveErrors.push({ row: u.rowIndex, error: (err as Error).message });
          skipReasons.save_failed++;
        }
      }
      if (i + CHUNK_UPDATE < toUpdate.length) await sleep(CHUNK_DELAY);
    }

    // ── 11. Compute final status ───────────────────────────────────────────
    const totalSaved   = importedCount + updatedCount;
    const totalSkipped = Object.values(skipReasons).reduce((a, b) => a + b, 0);
    const errorCount   = parseErrors.length + saveErrors.length;

    let finalStatus: string;
    if (totalSaved > 0 && errorCount === 0 && totalSkipped === 0) {
      finalStatus = 'completed';
    } else if (totalSaved > 0) {
      finalStatus = 'partial_success';
    } else if (errorCount > 0) {
      finalStatus = 'failed';
    } else {
      // Parsed OK but 0 saved — most likely cause: header/column mismatch or
      // every row missing company_name
      finalStatus = 'completed_no_records';
    }

    if (DEBUG) {
      console.log('[import] imported:', importedCount, '| updated:', updatedCount, '| status:', finalStatus);
      console.log('[import] skip reasons:', JSON.stringify(skipReasons));
    }

    // ── 12. Build summary ──────────────────────────────────────────────────
    const allErrors = [
      ...parseErrors.map(e => ({ row: e.row, error: `parse: ${e.error}` })),
      ...saveErrors.map(e => ({ row: e.row, error: `save: ${e.error}` })),
    ];

    const summary = {
      total_rows:          dataRows.length,
      imported_rows:       importedCount,
      updated_rows:        updatedCount,
      duplicate_rows:      duplicateCount,
      skipped_rows:        totalSkipped,
      error_rows:          errorCount,
      missing_email:       missingEmail,
      missing_phone:       missingPhone,
      missing_linkedin:    missingLinkedIn,
      email_ready:         emailReady,
      linkedin_ready:      linkedinReady,
      phone_ready:         phoneReady,
      needs_enrichment:    needsEnrichment,
      detected_sheet:      sheetName,
      detected_header_row: headerRowIndex,
    };

    // ── 13. Update import job record ───────────────────────────────────────
    await base44.asServiceRole.entities.ImportJob.update(importJob.id, {
      ...summary,
      status:         finalStatus,
      completed_at:   new Date().toISOString(),
      error_details:  allErrors.length ? JSON.stringify(allErrors.slice(0, 100)) : null,
      skip_reasons:   JSON.stringify(skipReasons),
      column_mapping: JSON.stringify(recognized.map(r => ({ raw: r.raw, field: r.field }))),
    });

    // ── 14. Link companies to project (if applicable) ──────────────────────
    let linkedToProject = 0;
    if (project_id && totalSaved > 0) {
      try {
        const allCompaniesAfter = await base44.asServiceRole.entities.Company.list('-created_date', 100000);
        const lookup = new Map<string, any>();
        for (const c of allCompaniesAfter) {
          if (c.cr_number)    lookup.set(`cr:${c.cr_number.toLowerCase()}`, c);
          if (c.company_name) lookup.set(`name:${c.company_name.toLowerCase().trim()}`, c);
        }

        const targetIds = new Set<string>();
        for (const { mapped } of normalized) {
          let c: any = null;
          if (mapped.cr_number) c = lookup.get(`cr:${mapped.cr_number.toLowerCase()}`);
          if (!c && mapped.company_name) c = lookup.get(`name:${mapped.company_name.toLowerCase().trim()}`);
          if (c?.id) targetIds.add(c.id);
        }

        const existingLinks = await base44.asServiceRole.entities.ProjectCompany.filter({ project_id }, '-created_date', 100000);
        const linkedIds = new Set(existingLinks.map((pc: any) => pc.company_id));

        const toLink: any[] = [];
        for (const cid of targetIds) {
          if (linkedIds.has(cid)) continue;
          const c = allCompaniesAfter.find((x: any) => x.id === cid);
          toLink.push({ project_id, company_id: cid, company_name: c?.company_name || '', outreach_stage: 'new' });
        }

        for (let i = 0; i < toLink.length; i += CHUNK_CREATE) {
          const chunk = toLink.slice(i, i + CHUNK_CREATE);
          await withRetry(() => base44.asServiceRole.entities.ProjectCompany.bulkCreate(chunk), `linkProject@${i}`);
          linkedToProject += chunk.length;
          if (i + CHUNK_CREATE < toLink.length) await sleep(CHUNK_DELAY);
        }

        const project = await base44.asServiceRole.entities.Project.get(project_id).catch(() => null);
        if (project) {
          await base44.asServiceRole.entities.Project.update(project_id, {
            total_companies: (project.total_companies || 0) + linkedToProject,
          });
        }
      } catch (err) {
        console.error('[import] project linking failed:', err);
      }
    }

    // ── 15. Build diagnostics payload for UI debug panel ──────────────────
    const diagnostics = {
      detected_sheet:       sheetName,
      detected_header_row:  headerRowIndex,
      all_sheets:           workbook.SheetNames,
      column_mapping:       recognized.map(r => ({ raw: r.raw, field: r.field, col: r.col })),
      unrecognized_headers: unrecognized,
      first_3_rows:         normalized.slice(0, 3).map(n => n.mapped),
      skip_reasons:         skipReasons,
      first_10_skip_details: skippedDetails.slice(0, 10),
      first_10_save_errors:  saveErrors.slice(0, 10),
    };

    return Response.json({
      success:           true,
      import_job_id:     importJob.id,
      status:            finalStatus,
      project_id:        project_id || null,
      linked_to_project: linkedToProject,
      summary:           { ...summary, error_details: allErrors.slice(0, 50) },
      diagnostics,
    });

  } catch (error) {
    console.error('[importExcel] fatal:', error);
    return Response.json({ error: (error as Error).message || 'Unknown error' }, { status: 500 });
  }
});
