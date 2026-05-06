/**
 * importParser.js — pure parser module (no Deno, no Base44, no XLSX)
 *
 * Takes pre-parsed rows (arrays of arrays, as returned by xlsx sheet_to_json
 * with header:1) and returns normalized company objects ready for persistence.
 *
 * Exported for unit-testing and for import by the Deno function.
 */

export const HEADER_ALIASES = {
  // company_name
  'company name':   'company_name',
  'company':        'company_name',
  'name':           'company_name',
  'organization':   'company_name',
  'organisation':   'company_name',
  'business name':  'company_name',
  'account name':   'company_name',
  'account':        'company_name',
  'client name':    'company_name',
  'client':         'company_name',
  'entity name':    'company_name',
  'firm name':      'company_name',
  'firm':           'company_name',
  'lead':           'company_name',
  'prospect':       'company_name',

  // cr_number
  'cr number':                     'cr_number',
  'cr no':                         'cr_number',
  'cr':                            'cr_number',
  'commercial registration':       'cr_number',
  'commercial registration number':'cr_number',
  'registration number':           'cr_number',
  'reg no':                        'cr_number',
  'reg number':                    'cr_number',
  'registration':                  'cr_number',

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
  'linkedin':              'linkedin_url',
  'linkedin url':          'linkedin_url',
  'company linkedin':      'linkedin_url',
  'company linkedin url':  'linkedin_url',
  'company linkedin page': 'linkedin_url',
  'linkedin company':      'linkedin_url',
  'linkedin company url':  'linkedin_url',
  'linkedin profile':      'linkedin_url',
  'linkedin page':         'linkedin_url',
  'linkedin link':         'linkedin_url',

  // source
  'source':      'source',
  'lead source': 'source',
  'data source': 'source',
  'origin':      'source',

  // last_enriched
  'last enriched':        'last_enriched',
  'enriched at':          'last_enriched',
  'last enrichment date': 'last_enriched',
  'enrichment date':      'last_enriched',
  'date enriched':        'last_enriched',

  // country
  'country':         'country',
  'company country': 'country',
  'location':        'country',
  'region':          'country',
  'geography':       'country',
  'geo':             'country',

  // company_size
  'company size':    'company_size',
  'size':            'company_size',
  'employees':       'company_size',
  'headcount':       'company_size',
  'no of employees': 'company_size',
  'num employees':   'company_size',
  'employee count':  'company_size',
  'staff size':      'company_size',

  // relation
  'relation':      'relation',
  'relationship':  'relation',
  'relation type': 'relation',
  'partner type':  'relation',
  'account type':  'relation',

  // icp_fit
  'icp fit':     'icp_fit',
  'icp':         'icp_fit',
  'fit':         'icp_fit',
  'icp score':   'icp_fit',
  'ideal customer profile': 'icp_fit',

  // contact_person
  'contact person':  'contact_person',
  'contact name':    'contact_person',
  'key contact':     'contact_person',
  'point of contact':'contact_person',
  'poc':             'contact_person',
  'primary contact': 'contact_person',
  'main contact':    'contact_person',
  'decision maker':  'contact_person',
  'person':          'contact_person',
  'first name':      'contact_person',

  // contact_title
  'contact title':   'contact_title',
  'job title':       'contact_title',
  'title':           'contact_title',
  'position':        'contact_title',
  'role':            'contact_title',
  'designation':     'contact_title',

  // contact_email
  'contact email':   'contact_email',
  'business email':  'contact_email',
  'company email':   'contact_email',

  // contact_phone
  'contact phone':   'contact_phone',
  'business phone':  'contact_phone',
  'company phone':   'contact_phone',
  'office phone':    'contact_phone',
  'direct phone':    'contact_phone',

  // whatsapp
  'whatsapp':        'whatsapp',
  'whatsapp number': 'whatsapp',
  'wa':              'whatsapp',
  'wa number':       'whatsapp',
  'mobile whatsapp': 'whatsapp',
  'whatsapp no':     'whatsapp',
};

/**
 * Normalize a raw Excel column header to a lookup key.
 * Handles: BOM, Unicode spaces, line breaks, separators, punctuation, case.
 */
export function normalizeHeaderKey(raw) {
  return String(raw)
    .replace(/^﻿+/, '')                   // strip BOM(s)
    .replace(/[      ]/g, ' ')  // Unicode spaces → ASCII
    .replace(/[\r\n\t]+/g, ' ')               // line breaks → space
    .replace(/[._\-]+/g, ' ')                 // common separators → space
    .replace(/[^\w\s]/g, '')                  // strip remaining punctuation
    .replace(/\s+/g, ' ')                     // collapse spaces
    .trim()
    .toLowerCase();
}

/**
 * Detect the best header row in a sheet's rows array (first MAX_SCAN rows).
 * Returns { headerRowIndex, colMap, recognized, unrecognized, score }
 */
export function detectHeaderRow(rows, maxScan = 25) {
  let best = { headerRowIndex: 0, colMap: {}, recognized: [], unrecognized: [], rawHeaders: [], score: -1 };

  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const row = rows[r];
    const colMap = {};
    const recognized = [];
    const unrecognized = [];
    const rawHeaders = [];
    const usedFields = new Set();
    let score = 0;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined || cell === '') continue;
      const rawStr = String(cell);
      rawHeaders.push(rawStr);
      const normed = normalizeHeaderKey(rawStr);
      const field = HEADER_ALIASES[normed];
      if (field && !usedFields.has(field)) {
        colMap[c] = field;
        usedFields.add(field);
        recognized.push({ raw: rawStr, field, col: c });
        score += field === 'company_name' ? 10 : 1;
      } else {
        unrecognized.push(rawStr);
      }
    }

    if (score > best.score) {
      best = { headerRowIndex: r, colMap, recognized, unrecognized, rawHeaders, score };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Cell normalizers
// ---------------------------------------------------------------------------
export function normalizeCell(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const s = String(val).replace(/^﻿+/, '').trim();
  return s === '' ? null : s;
}

export function normalizeStatus(status) {
  if (!status) return 'needs_enrichment';
  const s = String(status).toLowerCase().trim();
  if (s === 'complete' || s === 'completed') return 'complete';
  if (s === 'partial') return 'partial';
  if (s === 'not_found' || s === 'not found') return 'not_found';
  return 'needs_enrichment';
}

export function normalizeUrl(val) {
  const s = normalizeCell(val);
  if (!s) return null;
  let url = s;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) url = 'https://' + url;
  return url.replace(/\/+$/, '').toLowerCase();
}

export function normalizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeCR(val) {
  const s = normalizeCell(val);
  return s ? s.replace(/\s+/g, '') : null;
}

export function normalizePhone(val) {
  if (val === null || val === undefined) return null;
  const s = typeof val === 'number' ? String(Math.round(val)) : String(val).trim();
  return s === '' ? null : s;
}

/**
 * Build a field-keyed raw object from a data row using the colMap.
 */
export function buildRowObj(row, colMap) {
  const obj = {};
  for (const [colStr, field] of Object.entries(colMap)) {
    obj[field] = row[Number(colStr)] ?? null;
  }
  return obj;
}

/**
 * Normalize a raw field-keyed object to a Company entity object.
 */
export function normalizeRowObj(obj) {
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
    country:           normalizeCell(obj.country),
    company_size:      normalizeCell(obj.company_size),
    relation:          normalizeCell(obj.relation),
    icp_fit:           normalizeCell(obj.icp_fit),
    contact_person:    normalizeCell(obj.contact_person),
    contact_title:     normalizeCell(obj.contact_title),
    contact_email:     normalizeCell(obj.contact_email),
    contact_phone:     normalizePhone(obj.contact_phone),
    whatsapp:          normalizePhone(obj.whatsapp),
  };
}

/**
 * High-level: parse an entire sheet's rows array into normalized company objects.
 *
 * @param {any[][]} rows   — as returned by XLSX sheet_to_json({ header: 1, defval: null })
 * @returns {{ companies, skipped, parseErrors, colMap, recognized, unrecognized, headerRowIndex, score }}
 */
export function parseSheet(rows) {
  const { headerRowIndex, colMap, recognized, unrecognized, score } = detectHeaderRow(rows);

  const hasCompanyName = Object.values(colMap).includes('company_name');

  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter(row => row.some(c => c !== null && c !== '' && c !== undefined));

  const companies = [];
  const skipped = [];
  const parseErrors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowIndex = headerRowIndex + 2 + i;
    try {
      const rawObj = buildRowObj(dataRows[i], colMap);
      const mapped = normalizeRowObj(rawObj);
      if (!mapped.company_name) {
        skipped.push({ row: rowIndex, reason: 'missing_company_name' });
      } else {
        companies.push({ rowIndex, mapped });
      }
    } catch (err) {
      parseErrors.push({ row: rowIndex, error: err.message });
    }
  }

  return { companies, skipped, parseErrors, colMap, recognized, unrecognized, headerRowIndex, score, hasCompanyName, totalDataRows: dataRows.length };
}
