'use strict';
// Regression tests for the SCR Review feature (Open Items #4) added to
// 07_TeacherDashboard.js: getScrReviewQueue(), teacherConfirmScrRating(),
// teacherOverrideScrRating(), and the shared _recordScrDecision_() they
// both call.
//
// WHY THIS FILE EXISTS AT ALL. 30_SCRSuggestionEngine.js's
// recordConfirmation_/recordOverride_/getSCRDashboardData_ were dead code
// in production — only tests/cas-ccps/scr-suggestion-engine.test.js ever
// called them, because that file is bound to cas-ccps:central-ledger, a
// DIFFERENT Apps Script project from this standalone teacher-dashboard web
// app (see tools/gas-lint/project-map.json), with no shared runtime. This
// tests the from-scratch reimplementation that actually lives in the
// dashboard project — same locked rules (freeze on decision, reject
// re-deciding, ratings 1 and 5 reserved for a teacher's own judgment), plus
// the real per-teacher roster filter Script 30's own version never had.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('07_TeacherDashboard.js')];
const EXPOSE = [
  'getScrReviewQueue', 'teacherConfirmScrRating', 'teacherOverrideScrRating',
  'DASHBOARD_SCRS',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

const TEACHER = 'teacher@example.com'; // matches the sandbox's default Session mock
const OTHER_TEACHER = 'other.teacher@example.com';

// Builds a Central Ledger fixture with Ledger, SCRSuggestions, SCRDecisionLog
// and CompetencyRegistry tabs. `ledgerRows` and `scrRows` are 0-based-index
// arrays matching LEDGER/DASHBOARD_SCRS's own column order.
function setUp(sandbox, opts) {
  const o = opts || {};
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', o.teacherEmail === undefined ? TEACHER : o.teacherEmail);

  const ledger = ss.insertSheet('Ledger');
  const ledgerHeader = new Array(23).fill('');
  ledger.appendRow(ledgerHeader);
  (o.ledgerRows || []).forEach((row) => ledger.appendRow(row));

  const scr = ss.insertSheet('SCRSuggestions');
  scr.appendRow([
    'student_email', 'competency_id', 'suggested_rating', 'met_count',
    'not_met_count', 'partial_count', 'status', 'last_computed_at',
    'confirmed_rating', 'confirmed_at', 'confirmed_by',
  ]);
  (o.scrRows || []).forEach((row) => scr.appendRow(row));

  const decisionLog = ss.insertSheet('SCRDecisionLog');
  decisionLog.appendRow([
    'decision_id', 'student_email', 'competency_id', 'suggested_rating',
    'final_rating', 'decision_type', 'decided_at', 'decided_by',
    'evidence_snapshot', 'archive_status',
  ]);

  const registry = ss.insertSheet('CompetencyRegistry');
  registry.appendRow(['competency_id', 'competency_text']);
  (o.registryRows || []).forEach((row) => registry.appendRow(row));

  return { ss, ledger, scr, decisionLog, registry };
}

// A minimal Ledger row for a student on TEACHER's roster.
function ledgerRow(email, name, teacherEmail) {
  const row = new Array(23).fill('');
  row[1] = email;           // GOOGLE_ID
  row[4] = name;            // STUDENT_NAME
  row[6] = 'Period 3';      // CLASS_NAME
  row[8] = teacherEmail === undefined ? TEACHER : teacherEmail; // TEACHER_EMAIL
  row[11] = '3';            // PERIOD
  return row;
}

function scrRow(email, compId, suggestedRating, status, extras) {
  const e = extras || {};
  return [
    email, compId, suggestedRating === null ? '' : suggestedRating,
    e.metCount || 0, e.notMetCount || 0, e.partialCount || 0,
    status, e.lastComputedAt || new Date(),
    e.confirmedRating || '', e.confirmedAt || '', e.confirmedBy || '',
  ];
}

// ── getScrReviewQueue ────────────────────────────────────────────────────

test('getScrReviewQueue: denies a caller who is not the configured teacher', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, { teacherEmail: OTHER_TEACHER });
  const result = exported.getScrReviewQueue();
  assert.equal(result.success, false);
  assert.match(result.error, /not authorized/i);
});

test('getScrReviewQueue: returns only SUGGESTED/INSUFFICIENT_EVIDENCE rows for students on the caller\'s own roster', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [
      ledgerRow('student1@ccpsnet.net', 'Student One'),
      ledgerRow('student2@ccpsnet.net', 'Student Two'),
      ledgerRow('other-student@ccpsnet.net', 'Other Teacher\'s Student', OTHER_TEACHER),
    ],
    scrRows: [
      scrRow('student1@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED', { metCount: 1, notMetCount: 0, partialCount: 2 }),
      scrRow('student2@ccpsnet.net', 'CAS-M5-2', null, 'INSUFFICIENT_EVIDENCE'),
      scrRow('student1@ccpsnet.net', 'CAS-M5-3', 4, 'CONFIRMED', { confirmedRating: 4 }), // frozen — must be excluded
      // Belongs to a DIFFERENT teacher's student — must be excluded even
      // though it's SUGGESTED. This is the real per-teacher filter
      // getSCRDashboardData_() (30_SCRSuggestionEngine.js) never had.
      scrRow('other-student@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED'),
    ],
    registryRows: [
      ['CAS-M5-1', 'Demonstrates market research'],
      ['CAS-M5-2', 'Builds a pricing strategy'],
    ],
  });

  const result = exported.getScrReviewQueue();
  assert.equal(result.success, true);
  assert.equal(result.suggestions.length, 2);

  const byEmail = Object.fromEntries(result.suggestions.map((s) => [s.studentEmail + '|' + s.competencyId, s]));
  const item1 = byEmail['student1@ccpsnet.net|CAS-M5-1'];
  assert.ok(item1);
  assert.equal(item1.studentName, 'Student One');
  assert.equal(item1.competencyText, 'Demonstrates market research');
  assert.equal(item1.suggestedRating, 3);
  assert.equal(item1.status, 'SUGGESTED');

  const item2 = byEmail['student2@ccpsnet.net|CAS-M5-2'];
  assert.ok(item2);
  assert.equal(item2.suggestedRating, null);
  assert.equal(item2.status, 'INSUFFICIENT_EVIDENCE');
});

test('getScrReviewQueue: a missing SCRSuggestions tab returns an empty queue rather than throwing', () => {
  const { exported, sandbox } = load();
  // Built directly, not via setUp(), specifically to leave SCRSuggestions
  // out — FakeSpreadsheet has no deleteSheet(), so "missing" means "never
  // inserted" here.
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  ss.insertSheet('Ledger').appendRow(new Array(23).fill(''));

  const result = exported.getScrReviewQueue();
  assert.deepEqual(result, { success: true, suggestions: [] });
});

// ── teacherConfirmScrRating / teacherOverrideScrRating ──────────────────────

test('teacherConfirmScrRating: denies a caller who is not the configured teacher', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, { teacherEmail: OTHER_TEACHER });
  const result = exported.teacherConfirmScrRating('student1@ccpsnet.net', 'CAS-M5-1');
  assert.equal(result.success, false);
  assert.match(result.error, /not authorized/i);
});

test('teacherConfirmScrRating: rejects a student not on the caller\'s own roster', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [ledgerRow('other-student@ccpsnet.net', 'Not Mine', OTHER_TEACHER)],
    scrRows: [scrRow('other-student@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED')],
  });
  const result = exported.teacherConfirmScrRating('other-student@ccpsnet.net', 'CAS-M5-1');
  assert.equal(result.success, false);
  assert.match(result.error, /not on your roster/i);
});

test('teacherConfirmScrRating: confirms the suggested rating, freezes SCRSuggestions, and appends to SCRDecisionLog', () => {
  const { exported, sandbox } = load();
  const fixture = setUp(sandbox, {
    ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')],
    scrRows: [scrRow('student1@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED', { metCount: 3, notMetCount: 0, partialCount: 1 })],
  });

  const result = exported.teacherConfirmScrRating('student1@ccpsnet.net', 'CAS-M5-1');
  assert.deepEqual(result, { success: true, finalRating: 3, decisionType: 'CONFIRMED' });

  const suggestionRow = fixture.scr.getRange(2, 1, 1, 11).getValues()[0];
  assert.equal(suggestionRow[6], 'CONFIRMED');   // STATUS
  assert.equal(suggestionRow[8], 3);             // CONFIRMED_RATING
  assert.equal(suggestionRow[10], TEACHER);      // CONFIRMED_BY

  const decisionRow = fixture.decisionLog.getRange(2, 1, 1, 10).getValues()[0];
  assert.match(decisionRow[0], /^SCD-\d{8}-[0-9A-F]{4}$/);
  assert.equal(decisionRow[1], 'student1@ccpsnet.net');
  assert.equal(decisionRow[2], 'CAS-M5-1');
  assert.equal(decisionRow[3], 3);               // SUGGESTED_RATING
  assert.equal(decisionRow[4], 3);               // FINAL_RATING
  assert.equal(decisionRow[5], 'CONFIRMED');
  assert.equal(decisionRow[7], TEACHER);
  assert.equal(decisionRow[8], 'MET:3 NOT_MET:0 PARTIALLY_MET:1');
});

test('teacherConfirmScrRating: cannot confirm an INSUFFICIENT_EVIDENCE row — nothing to confirm', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')],
    scrRows: [scrRow('student1@ccpsnet.net', 'CAS-M5-1', null, 'INSUFFICIENT_EVIDENCE')],
  });
  const result = exported.teacherConfirmScrRating('student1@ccpsnet.net', 'CAS-M5-1');
  assert.equal(result.success, false);
  assert.match(result.error, /no suggestion to confirm/i);
});

test('teacherOverrideScrRating: accepts ratings 1 and 5, reserved for teacher judgment', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')],
    scrRows: [scrRow('student1@ccpsnet.net', 'CAS-M5-1', null, 'INSUFFICIENT_EVIDENCE')],
  });
  const result = exported.teacherOverrideScrRating('student1@ccpsnet.net', 'CAS-M5-1', 5);
  assert.deepEqual(result, { success: true, finalRating: 5, decisionType: 'OVERRIDDEN' });
});

test('teacherOverrideScrRating: rejects a rating outside 1-5', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')],
    scrRows: [scrRow('student1@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED')],
  });
  const result = exported.teacherOverrideScrRating('student1@ccpsnet.net', 'CAS-M5-1', 6);
  assert.equal(result.success, false);
  assert.match(result.error, /integer from 1 to 5/i);
});

test('teacherOverrideScrRating: rejects a non-integer rating', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')],
    scrRows: [scrRow('student1@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED')],
  });
  const result = exported.teacherOverrideScrRating('student1@ccpsnet.net', 'CAS-M5-1', 2.5);
  assert.equal(result.success, false);
  assert.match(result.error, /integer from 1 to 5/i);
});

test('a decision is frozen — deciding the same competency twice is rejected, matching Script 30\'s own rule', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, {
    ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')],
    scrRows: [scrRow('student1@ccpsnet.net', 'CAS-M5-1', 3, 'SUGGESTED')],
  });

  const first = exported.teacherConfirmScrRating('student1@ccpsnet.net', 'CAS-M5-1');
  assert.equal(first.success, true);

  const second = exported.teacherOverrideScrRating('student1@ccpsnet.net', 'CAS-M5-1', 5);
  assert.equal(second.success, false);
  assert.match(second.error, /already been decided \(CONFIRMED\)/);
});

test('no matching SCRSuggestions row for the given student/competency pair returns a clear error', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, { ledgerRows: [ledgerRow('student1@ccpsnet.net', 'Student One')] });
  const result = exported.teacherConfirmScrRating('student1@ccpsnet.net', 'CAS-M5-99');
  assert.equal(result.success, false);
  assert.match(result.error, /no suggestion row found/i);
});

// ── Schema compatibility with 30_SCRSuggestionEngine.js's SCRS ──────────────

test('DASHBOARD_SCRS column order is byte-identical to 30_SCRSuggestionEngine.js\'s SCRS', () => {
  const dashboard = loadGasFiles(FILES, ['DASHBOARD_SCRS']);
  const engine = loadGasFiles([S('00_SharedConfig.js'), S('30_SCRSuggestionEngine.js')], ['SCRS']);
  assert.deepEqual(dashboard.exported.DASHBOARD_SCRS, engine.exported.SCRS);
});
