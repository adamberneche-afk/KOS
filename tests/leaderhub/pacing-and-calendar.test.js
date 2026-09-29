'use strict';
// Regression tests for two of leader-hub/student-leader-hub.html's
// self-contained data pipelines:
//
//  - GG1/II1 (Settings -> Weekly Schedule): getPacingUnitsForCourse's
//    CAS-vs-custom-vs-unregistered course scoping, and getQuarterForDate's
//    real-date-range lookup + edge fallback.
//  - HH1 (Settings -> School Calendar -> "Import a county calendar
//    document"): the regex-based parser that turns pasted/uploaded
//    calendar text into quarter dates + no-school/early-release dates.
//
// Both are covered here because leader-hub/README.md documents Node
// harnesses (verify_gg1.js, verify_hh1.js, verify_ii1.js) that already
// checked this exact logic in the sessions that built it - none of which
// were ever committed. This file is a from-scratch rebuild of that
// coverage as a permanent, re-runnable asset.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { extractLines } = require('../harness/extract-lines');
const { runInSandbox } = require('../harness/vm-run');

// Point at the fragment files (tools/leaderhub-build/ split, external
// product review Finding 4) rather than the assembled monolith — a real
// robustness win, not just a rename: only an edit inside the specific
// ~1,500/~3,600-line fragment can shift these line numbers now, not an
// edit anywhere in the full ~22,000-line file. The two pipelines this
// file covers happen to land in different fragments.
const CALENDAR_HTML_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'src', '11-journal-cron-settings-and-sync.html');
const PACING_HTML_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'src', '12-integrations-pacing-subplan-brag.html');

function loadCalendarParser() {
  const source = extractLines(CALENDAR_HTML_PATH, 1276, 1566, [
    'function extractDateRangeBounds(',
    'function extractDatesFromText(',
    'function parseCountyCalendarText(',
  ]);
  return runInSandbox(source, {}, ['extractDateRangeBounds', 'extractDatesFromText', 'parseCountyCalendarText']);
}

function loadPacing(globals) {
  const source = extractLines(PACING_HTML_PATH, 2110, 2182, [
    'CAS_PACING_COURSES',
    'function getPacingUnitsForCourse(',
    'function getQuarterForDate(',
  ]);
  // This range's own `let CUSTOM_PACING_UNITS = LS.get('lh_custom_pacing_units', {})`
  // needs a real LS global to run at all - the real app's LS is a
  // localStorage wrapper (leader-hub/src/05-data-helpers-dashboard.html:7),
  // but all this extracted range needs from it is .get() returning a
  // default. A
  // caller that wants a specific CUSTOM_PACING_UNITS fixture passes its
  // own `LS` override instead of `CUSTOM_PACING_UNITS` directly, since
  // that `let` re-declaration inside the extracted source always wins
  // over a same-named sandbox global.
  const defaultLs = { get: (_key, def) => def };
  return runInSandbox(source, { LS: defaultLs, ...globals }, ['getPacingUnitsForCourse', 'getQuarterForDate']);
}

// ── HH1: county calendar parser ───────────────────────────────────────────

test('extractDateRangeBounds parses a cross-month range with an explicit year on each side', () => {
  const { extractDateRangeBounds } = loadCalendarParser();
  const r = extractDateRangeBounds('Quarter 2: October 26, 2026 - January 15, 2027', 2026);
  assert.deepEqual(r, { start: '2026-10-26', end: '2027-01-15' });
});

test('extractDateRangeBounds falls back to two standalone dates (using refYear for each) when the range spans two months with no year at all', () => {
  const { extractDateRangeBounds } = loadCalendarParser();
  const result = extractDateRangeBounds('Quarter 1: August 25 - October 23', 2026);
  assert.deepEqual(result, { start: '2026-08-25', end: '2026-10-23' });
});

test('extractDateRangeBounds falls back to two standalone dates when they\'re joined by "and" instead of a dash', () => {
  const { extractDateRangeBounds } = loadCalendarParser();
  const result = extractDateRangeBounds('Quarter 1: August 25, 2026 and October 23, 2026', 2026);
  assert.deepEqual(result, { start: '2026-08-25', end: '2026-10-23' });
});

test('extractDatesFromText expands a same-month day range into every included day', () => {
  const { extractDatesFromText } = loadCalendarParser();
  const dates = extractDatesFromText('Thanksgiving Break: November 25-27, 2026', 2026);
  assert.deepEqual(dates, ['2026-11-25', '2026-11-26', '2026-11-27']);
});

test('extractDatesFromText expands a cross-year range as one span, with no spurious extra dates from re-matching its own endpoints', () => {
  const { extractDatesFromText } = loadCalendarParser();
  const dates = extractDatesFromText('Winter Break: December 21, 2026 - January 2, 2027', 2026);
  assert.equal(dates.length, 13); // Dec 21-31 (11) + Jan 1-2 (2), inclusive
  assert.equal(dates[0], '2026-12-21');
  assert.equal(dates[dates.length - 1], '2027-01-02');
});

test('parseCountyCalendarText finds all 4 quarters from realistic section text', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const doc = [
    'Quarter 1: August 25 - October 23, 2026',
    'Quarter 2: October 26, 2026 - January 15, 2027',
    'Quarter 3: January 19 - March 26, 2027',
    'Quarter 4: March 29 - June 10, 2027',
  ].join('\n');
  const result = parseCountyCalendarText(doc, 2026);
  assert.deepEqual(Object.keys(result.quarters).sort(), ['1', '2', '3', '4']);
  assert.equal(result.quarters[1].start, '2026-08-25');
  assert.equal(result.quarters[4].end, '2027-06-10');
});

test('parseCountyCalendarText picks up a named holiday with no section header at all', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const result = parseCountyCalendarText('Labor Day - September 7, 2026', 2026);
  assert.deepEqual(result.noSchool, ['2026-09-07']);
});

test('parseCountyCalendarText carries the most recently seen year forward onto a later, undated holiday line', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const doc = [
    'Winter Break: December 21, 2026 - January 2, 2027',
    'MLK Day - January 18',
  ].join('\n');
  const result = parseCountyCalendarText(doc, 2026);
  assert.ok(
    result.noSchool.includes('2027-01-18'),
    `expected 2027-01-18 (year carried forward from the line above), got: ${result.noSchool.join(', ')}`
  );
});

test('parseCountyCalendarText warns rather than throwing on a document with no recognizable quarters', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const result = parseCountyCalendarText('This is not a calendar at all.', 2026);
  assert.deepEqual(result.quarters, {});
  assert.ok(result.warnings.some((w) => w.includes('No quarter date ranges recognized')));
});

// ── GG1/II1: pacing unit scoping + quarter resolution ─────────────────────

test('getPacingUnitsForCourse routes a CAS course (8175/8177) to the shared CAS_PACING_UNITS list', () => {
  const CAS_PACING_UNITS = [{ id: 'u1' }, { id: 'u2' }];
  const { getPacingUnitsForCourse } = loadPacing({ CAS_PACING_UNITS });
  assert.deepEqual(getPacingUnitsForCourse('8177'), CAS_PACING_UNITS);
  assert.deepEqual(getPacingUnitsForCourse('8175'), CAS_PACING_UNITS);
});

test('getPacingUnitsForCourse routes any other course to its own imported list', () => {
  // CUSTOM_PACING_UNITS can't be overridden by passing it as a plain global
  // - the extracted range's own `let CUSTOM_PACING_UNITS = LS.get(...)`
  // always wins. Override LS itself instead, matching what
  // persistCustomPacingUnits()/LS.set('lh_custom_pacing_units', ...) would
  // have actually stored.
  const fixture = { '6115': [{ id: 'custom-1' }] };
  const { getPacingUnitsForCourse } = loadPacing({ CAS_PACING_UNITS: [], LS: { get: () => fixture } });
  assert.deepEqual(getPacingUnitsForCourse('6115'), [{ id: 'custom-1' }]);
});

test('getPacingUnitsForCourse returns an empty array (never CAS data) for a course nothing has ever been imported for', () => {
  const { getPacingUnitsForCourse } = loadPacing({ CAS_PACING_UNITS: [{ id: 'cas-1' }] });
  assert.deepEqual(getPacingUnitsForCourse('brand-new-course'), []);
});

test('getQuarterForDate finds the quarter whose real configured range contains the date', () => {
  const LP_QUARTERS = {
    1: { start: '2026-08-25', end: '2026-10-23' },
    2: { start: '2026-10-26', end: '2027-01-15' },
    3: { start: '2027-01-19', end: '2027-03-26' },
    4: { start: '2027-03-29', end: '2027-06-10' },
  };
  const { getQuarterForDate } = loadPacing({ LP_QUARTERS });
  assert.equal(getQuarterForDate('2026-09-15'), 1);
  assert.equal(getQuarterForDate('2027-02-01'), 3);
});

test('getQuarterForDate falls back to the nearest edge quarter for a date outside every configured range', () => {
  const LP_QUARTERS = {
    1: { start: '2026-08-25', end: '2026-10-23' },
    2: { start: '2026-10-26', end: '2027-01-15' },
    3: { start: '2027-01-19', end: '2027-03-26' },
    4: { start: '2027-03-29', end: '2027-06-10' },
  };
  const { getQuarterForDate } = loadPacing({ LP_QUARTERS });
  assert.equal(getQuarterForDate('2026-07-01'), 1, 'before the school year starts -> nearest edge is Q1');
  assert.equal(getQuarterForDate('2027-07-01'), 4, 'after the school year ends -> nearest edge is Q4');
});

test('getQuarterForDate defaults to 1 rather than throwing when no quarters are configured at all', () => {
  const { getQuarterForDate } = loadPacing({ LP_QUARTERS: {} });
  assert.equal(getQuarterForDate('2026-09-15'), 1);
});

// ── The two live misreads (seen 2026-09-28: 0 no-school, 22 early release,
//    no quarters from the district calendar) ─────────────────────────────

const REAL_SHAPED_CALENDAR = [
  'Chesterfield County Public Schools 2026-2027 Calendar',
  'August 24, 2026 First Day for Students',
  'Early Release Days',
  'October 2 - Early Release for Students',
  'November 25 - Two-Hour Early Dismissal',
  'Holidays and Schools Closed',
  'September 7 - Labor Day (Schools Closed)',
  'October 12 - Student Holiday / Teacher Workday',
  'November 26-27 - Thanksgiving Break',
  'December 21, 2026 - January 1, 2027 - Winter Break',
  'January 18, 2027 - Martin Luther King Jr. Day',
  'Marking Periods',
  'End of First Quarter - October 30, 2026',
  'End of Second Quarter - January 15, 2027',
  'End of Third Quarter - March 26, 2027',
  'End of Fourth Quarter - June 11, 2027',
].join('\n');

test('an early-release heading does not capture the holidays listed after it', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const r = parseCountyCalendarText(REAL_SHAPED_CALENDAR, 2026);
  assert.deepEqual(r.earlyRelease, ['2026-10-02', '2026-11-25']);
  for (const d of ['2026-09-07', '2026-10-12', '2026-11-26', '2026-11-27', '2026-12-21', '2027-01-01', '2027-01-18']) {
    assert.ok(r.noSchool.includes(d), d + ' should be no-school, got ' + r.noSchool.join(','));
    assert.ok(!r.earlyRelease.includes(d), d + ' must not be early release');
  }
});

test('a dated line mentioning early release is early release for that line only', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const r = parseCountyCalendarText([
    'Early Release - September 30, 2026',
    'Veterans Day - November 11, 2026',
  ].join('\n'), 2026);
  assert.deepEqual(r.earlyRelease, ['2026-09-30']);
  assert.deepEqual(r.noSchool, ['2026-11-11']);
});

test('quarters given only as "End of Nth Quarter" dates are filled from the first day of school', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const r = parseCountyCalendarText(REAL_SHAPED_CALENDAR, 2026);
  assert.deepEqual(r.quarters[1], { start: '2026-08-24', end: '2026-10-30' });
  // Oct 30 2026 is a Friday, so Q2 starts the next school day, Monday.
  assert.deepEqual(r.quarters[2], { start: '2026-11-02', end: '2027-01-15' });
  assert.equal(r.quarters[3].end, '2027-03-26');
  assert.deepEqual(r.quarters[4], { start: '2027-03-29', end: '2027-06-11' });
});

test('Q1, "Marking Period 2" and "First Quarter" ranges are all recognized', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const r = parseCountyCalendarText([
    'Q1: August 24 - October 30, 2026',
    'Marking Period 2: November 2, 2026 - January 15, 2027',
    'Third Quarter: January 19 - March 26, 2027',
    'MP4 March 29 - June 11, 2027',
  ].join('\n'), 2026);
  assert.deepEqual(Object.keys(r.quarters).sort(), ['1', '2', '3', '4']);
  assert.deepEqual(r.quarters[2], { start: '2026-11-02', end: '2027-01-15' });
  assert.equal(r.quarters[4].start, '2027-03-29');
});

test('with no holiday heading at all, holidays after an early-release heading are still no-school', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const r = parseCountyCalendarText([
    'Early Release Days',
    'October 2, 2026',
    'November 25, 2026 - Two-Hour Early Dismissal',
    'October 12, 2026 - Student Holiday',
    'November 26-27, 2026 - Thanksgiving',
    'September 7, 2026 - Labor Day',
  ].join('\n'), 2026);
  assert.deepEqual(r.earlyRelease, ['2026-10-02', '2026-11-25']);
  assert.deepEqual(r.noSchool, ['2026-09-07', '2026-10-12', '2026-11-26', '2026-11-27']);
});

test('the first day of school and report-card days are never filed as days off', () => {
  const { parseCountyCalendarText } = loadCalendarParser();
  const r = parseCountyCalendarText([
    'Holidays',
    'August 24, 2026 - First Day for Students',
    'November 6, 2026 - Report Cards Issued',
    'November 11, 2026 - Veterans Day',
  ].join('\n'), 2026);
  assert.deepEqual(r.noSchool, ['2026-11-11']);
});
