/**
 * importParser.test.js — Node.js test harness for the pure parser module.
 *
 * Run with:   node tests/importParser.test.js
 *
 * No external test framework required. Exit code 0 = all tests passed.
 */

import {
  normalizeHeaderKey,
  detectHeaderRow,
  parseSheet,
  normalizeCell,
  normalizeUrl,
  normalizePhone,
  normalizeCR,
  HEADER_ALIASES,
} from '../src/lib/importParser.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertEqual(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ---------------------------------------------------------------------------
section('normalizeHeaderKey');
// ---------------------------------------------------------------------------
assert(normalizeHeaderKey('Company Name') === 'company name', 'exact → company name');
assert(normalizeHeaderKey('COMPANY NAME') === 'company name', 'uppercase → company name');
assert(normalizeHeaderKey('company name') === 'company name', 'lowercase → company name');
assert(normalizeHeaderKey('Company\nName') === 'company name', 'newline → space');
assert(normalizeHeaderKey('Company\r\nName') === 'company name', 'CRLF → space');
assert(normalizeHeaderKey('  Company Name  ') === 'company name', 'leading/trailing spaces');
assert(normalizeHeaderKey('﻿Company Name') === 'company name', 'BOM stripped');
assert(normalizeHeaderKey('CR No.') === 'cr no', 'period stripped');
assert(normalizeHeaderKey('E-mail') === 'e mail', 'hyphen → space');
assert(normalizeHeaderKey('LinkedIn_URL') === 'linkedin url', 'underscore → space');
assert(normalizeHeaderKey('CR Number') === 'cr number', 'non-breaking space normalized');

// ---------------------------------------------------------------------------
section('HEADER_ALIASES coverage');
// ---------------------------------------------------------------------------
assert(HEADER_ALIASES['company name'] === 'company_name', 'company name');
assert(HEADER_ALIASES['cr number'] === 'cr_number', 'cr number');
assert(HEADER_ALIASES['cr no'] === 'cr_number', 'cr no');
assert(HEADER_ALIASES['email'] === 'primary_email', 'email');
assert(HEADER_ALIASES['phone'] === 'primary_phone', 'phone');
assert(HEADER_ALIASES['linkedin'] === 'linkedin_url', 'linkedin');
assert(HEADER_ALIASES['website'] === 'website', 'website');
assert(HEADER_ALIASES['status'] === 'enrichment_status', 'status');

// ---------------------------------------------------------------------------
section('detectHeaderRow — exact expected headers at row 0');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Company Name', 'CR Number', 'Email', 'Phone', 'Website'],
    ['Acme Corp',    'CR001',     'a@b.com', '12345', 'acme.com'],
    ['Beta Ltd',     'CR002',     'b@b.com', '67890', 'beta.com'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 0, 'header detected at row 0');
  assert(result.colMap[0] === 'company_name', 'col 0 → company_name');
  assert(result.colMap[1] === 'cr_number', 'col 1 → cr_number');
  assert(result.colMap[2] === 'primary_email', 'col 2 → primary_email');
  assert(result.score >= 10, 'score ≥ 10 (company_name present)');
}

// ---------------------------------------------------------------------------
section('detectHeaderRow — lowercase headers');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['company name', 'cr number', 'email', 'phone'],
    ['Acme',         'CR-001',     'a@b.com', '12345'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 0, 'lowercase headers detected at row 0');
  assert(result.colMap[0] === 'company_name', 'company_name mapped');
}

// ---------------------------------------------------------------------------
section('detectHeaderRow — headers with newlines/spaces');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Company\nName', 'CR\r\nNumber', 'E-mail'],
    ['Acme',          'CR-001',       'a@b.com'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 0, 'newline headers detected');
  assert(result.colMap[0] === 'company_name', 'company_name from "Company\\nName"');
  assert(result.colMap[1] === 'cr_number', 'cr_number from "CR\\r\\nNumber"');
  assert(result.colMap[2] === 'primary_email', 'primary_email from "E-mail"');
}

// ---------------------------------------------------------------------------
section('detectHeaderRow — header row NOT first row (title row first)');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['RFxAI Master Sheet Pipeline', null, null, null, null],
    ['Company Name', 'CR Number', 'Status', 'Primary Email', 'Website'],
    ['Acme Corp',    'CR001',     'complete','a@b.com',       'acme.com'],
    ['Beta Ltd',     'CR002',     'partial', 'b@b.com',       'beta.com'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 1, 'header detected at row 1 (after title)');
  assert(result.colMap[0] === 'company_name', 'company_name mapped at row 1');
}

// ---------------------------------------------------------------------------
section('parseSheet — basic import of 3 valid rows');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Company Name', 'CR Number', 'Primary Email', 'Website'],
    ['Acme Corp',    'CR001',     'a@acme.com',    'acme.com'],
    ['Beta Ltd',     'CR002',     'b@beta.com',    'beta.com'],
    ['Gamma Inc',    'CR003',     'g@gamma.com',   'gamma.com'],
  ];
  const { companies, skipped, parseErrors } = parseSheet(rows);
  assert(companies.length === 3, '3 companies parsed');
  assert(skipped.length === 0, '0 skipped');
  assert(parseErrors.length === 0, '0 parse errors');
  assertEqual(companies[0].mapped.company_name, 'Acme Corp', 'first company_name');
  assertEqual(companies[0].mapped.cr_number, 'CR001', 'cr_number');
  assertEqual(companies[0].mapped.primary_email, 'a@acme.com', 'primary_email');
  assert(companies[0].mapped.website.startsWith('https://'), 'website has https://');
}

// ---------------------------------------------------------------------------
section('parseSheet — rows missing company name are skipped');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Company Name', 'Email'],
    ['Acme Corp',    'a@acme.com'],
    [null,           'b@beta.com'],  // missing company name
    ['',             'c@gamma.com'], // empty company name
    ['Delta LLC',    'd@delta.com'],
  ];
  const { companies, skipped } = parseSheet(rows);
  assert(companies.length === 2, '2 valid companies');
  assert(skipped.length === 2, '2 skipped (missing company_name)');
  assert(skipped.every(s => s.reason === 'missing_company_name'), 'reason = missing_company_name');
}

// ---------------------------------------------------------------------------
section('parseSheet — 274 mock rows should produce imported > 0');
// ---------------------------------------------------------------------------
{
  const headers = ['Company Name', 'CR Number', 'Primary Email', 'Website'];
  const data = Array.from({ length: 274 }, (_, i) => [
    `Company ${i + 1}`,
    `CR${String(i + 1).padStart(4, '0')}`,
    `contact${i + 1}@example.com`,
    `company${i + 1}.com`,
  ]);
  const rows = [headers, ...data];
  const { companies, skipped } = parseSheet(rows);
  assert(companies.length === 274, '274 companies parsed');
  assert(skipped.length === 0, '0 skipped from 274 valid rows');
  assert(companies.length > 0, 'imported > 0');
}

// ---------------------------------------------------------------------------
section('parseSheet — empty rows filtered correctly');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Company Name', 'Email'],
    ['Acme Corp',    'a@acme.com'],
    [null, null, null],           // all null — empty row, should be filtered
    ['', '', ''],                 // all empty — filtered
    ['Beta Ltd',     'b@beta.com'],
  ];
  const { companies, skipped } = parseSheet(rows);
  assert(companies.length === 2, 'empty rows not counted in skipped or companies');
}

// ---------------------------------------------------------------------------
section('parseSheet — header row not at row 0');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Pipeline Report - Q1 2024', null, null],
    ['Company Name', 'CR Number', 'Email'],
    ['Acme Corp',    'CR001',     'a@acme.com'],
    ['Beta Ltd',     'CR002',     'b@beta.com'],
  ];
  const result = parseSheet(rows);
  assert(result.headerRowIndex === 1, 'header auto-detected at row 1');
  assert(result.companies.length === 2, '2 companies from rows after auto-detected header');
}

// ---------------------------------------------------------------------------
section('parseSheet — wrong first worksheet but valid second sheet (detectBestSheet)');
// ---------------------------------------------------------------------------
// Note: detectBestSheet is in the Deno function. This tests the per-sheet logic
// via parseSheet which is what detectBestSheet calls internally per sheet.
{
  // Simulate Sheet1 (overview) — no recognizable headers
  const overviewRows = [
    ['Overview', null],
    ['Generated:', '2024-01-01'],
  ];
  // Simulate Sheet2 (data) — valid headers
  const dataRows = [
    ['Company Name', 'CR Number', 'Primary Email'],
    ['Acme Corp',    'CR001',     'a@acme.com'],
  ];
  const r1 = parseSheet(overviewRows);
  const r2 = parseSheet(dataRows);
  assert(r1.score < r2.score, 'data sheet scores higher than overview sheet');
  assert(r2.companies.length === 1, 'data sheet has 1 company');
}

// ---------------------------------------------------------------------------
section('parseSheet — synonym column names');
// ---------------------------------------------------------------------------
{
  const rows = [
    ['Organization', 'Registration Number', 'Telephone', 'LinkedIn URL'],
    ['Acme Corp',    'CR001',               '+97312345', 'https://linkedin.com/co/acme'],
  ];
  const { companies } = parseSheet(rows);
  assert(companies.length === 1, 'synonym headers recognized');
  assertEqual(companies[0].mapped.company_name, 'Acme Corp', 'Organization → company_name');
  assertEqual(companies[0].mapped.cr_number, 'CR001', 'Registration Number → cr_number');
  assertEqual(companies[0].mapped.primary_phone, '+97312345', 'Telephone → primary_phone');
  assert(companies[0].mapped.linkedin_url?.includes('linkedin.com'), 'LinkedIn URL → linkedin_url');
}

// ---------------------------------------------------------------------------
section('normalizeUrl');
// ---------------------------------------------------------------------------
assert(normalizeUrl('acme.com') === 'https://acme.com', 'adds https://');
assert(normalizeUrl('https://acme.com/') === 'https://acme.com', 'strips trailing slash');
assert(normalizeUrl('HTTP://Acme.COM') === 'http://acme.com', 'lowercases');
assert(normalizeUrl(null) === null, 'null → null');
assert(normalizeUrl('') === null, 'empty → null');

// ---------------------------------------------------------------------------
section('normalizePhone');
// ---------------------------------------------------------------------------
assert(normalizePhone(97312345678) === '97312345678', 'numeric phone → string');
assert(normalizePhone('+973 1234 5678') === '+973 1234 5678', 'string phone unchanged');
assert(normalizePhone(null) === null, 'null → null');

// ---------------------------------------------------------------------------
section('normalizeCR');
// ---------------------------------------------------------------------------
assert(normalizeCR('CR 001') === 'CR001', 'whitespace stripped from CR');
assert(normalizeCR('  CR 001  ') === 'CR001', 'leading/trailing + internal spaces');
assert(normalizeCR(null) === null, 'null → null');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
