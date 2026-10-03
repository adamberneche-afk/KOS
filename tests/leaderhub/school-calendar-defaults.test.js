'use strict';
// Consistency checks for leader-hub's built-in school calendar (the
// _DEFAULT consts in leader-hub/src/10-command-engine-ai-and-widgets.html and
// QUARTERS_DEFAULT in 12-integrations-pacing-subplan-brag.html), so a
// yearly roll-over can't leave the pieces disagreeing with each other.
//
// Pins: every date is a real YYYY-MM-DD weekday inside the school year;
// quarters run in order and the gap between two quarters holds only
// weekends and no-school days; no date is both a day off and an early
// release; and the CCPS calendar deadlines' quarter ends match the quarters.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { extractLines } = require('../harness/extract-lines');
const { runInSandbox } = require('../harness/vm-run');

const SRC = path.join(__dirname, '..', '..', 'leader-hub', 'src');
const F10 = path.join(SRC, '10-command-engine-ai-and-widgets.html');
const F12 = path.join(SRC, '12-integrations-pacing-subplan-brag.html');

function load() {
  const cal = extractLines(F10, 197, 225, [
    "const SCHOOL_CALENDAR_YEAR", 'const SCHEDULE_OVERRIDES_DEFAULT', 'const NO_SCHOOL_DEFAULT',
  ]);
  const deadlines = extractLines(F10, 1590, 1600, ['const CCPS_CALENDAR_DEADLINES_DEFAULT']);
  const quarters = extractLines(F12, 568, 573, ['const QUARTERS_DEFAULT']);
  return runInSandbox([cal, deadlines, quarters].join('\n'), {}, [
    'SCHOOL_CALENDAR_YEAR', 'SCHEDULE_OVERRIDES_DEFAULT', 'NO_SCHOOL_DEFAULT',
    'CCPS_CALENDAR_DEADLINES_DEFAULT', 'QUARTERS_DEFAULT',
  ]);
}

const day = (s) => new Date(s + 'T12:00:00Z');
const weekday = (s) => { const d = day(s).getUTCDay(); return d >= 1 && d <= 5; };
const iso = (d) => d.toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(day(s)) === s;

test('every built-in date is a valid weekday inside the school year', () => {
  const c = load();
  const first = c.QUARTERS_DEFAULT[1].start;
  const last = c.QUARTERS_DEFAULT[4].end;
  const all = [...c.NO_SCHOOL_DEFAULT, ...Object.keys(c.SCHEDULE_OVERRIDES_DEFAULT)];
  all.forEach((s) => {
    assert.ok(isDate(s), s + ' is not a real YYYY-MM-DD date');
    assert.ok(weekday(s), s + ' falls on a weekend');
    assert.ok(s >= first && s <= last, s + ' is outside ' + first + '..' + last);
  });
  assert.equal(c.SCHOOL_CALENDAR_YEAR, first.slice(0, 4) + '-' + last.slice(2, 4));
});

test('quarters run in order, and only days off fall between them', () => {
  const c = load();
  const off = new Set(c.NO_SCHOOL_DEFAULT);
  for (let q = 1; q <= 4; q++) {
    const r = c.QUARTERS_DEFAULT[q];
    assert.ok(isDate(r.start) && isDate(r.end) && r.start <= r.end, 'Q' + q);
    assert.ok(weekday(r.start) && !off.has(r.start), 'Q' + q + ' starts on a school day');
    assert.ok(weekday(r.end) && !off.has(r.end), 'Q' + q + ' ends on a school day');
    if (q === 1) continue;
    const d = day(c.QUARTERS_DEFAULT[q - 1].end);
    for (d.setUTCDate(d.getUTCDate() + 1); iso(d) < r.start; d.setUTCDate(d.getUTCDate() + 1)) {
      assert.ok(!weekday(iso(d)) || off.has(iso(d)), iso(d) + ' is a school day between Q' + (q - 1) + ' and Q' + q);
    }
  }
});

test('no date is both a day off and an early release, and every early release is EARLY3', () => {
  const c = load();
  const off = new Set(c.NO_SCHOOL_DEFAULT);
  Object.entries(c.SCHEDULE_OVERRIDES_DEFAULT).forEach(([s, type]) => {
    assert.ok(!off.has(s), s);
    assert.equal(type, 'EARLY3');
  });
  assert.equal(new Set(c.NO_SCHOOL_DEFAULT).size, c.NO_SCHOOL_DEFAULT.length, 'no repeated no-school date');
});

test('the CCPS calendar deadlines match the quarters and are all cal_* entries', () => {
  const c = load();
  const byId = Object.fromEntries(c.CCPS_CALENDAR_DEADLINES_DEFAULT.map((d) => [d.id, d]));
  c.CCPS_CALENDAR_DEADLINES_DEFAULT.forEach((d) => {
    assert.ok(d.id.startsWith('cal_'), d.id);
    assert.ok(isDate(d.date), d.id);
  });
  [1, 2, 3, 4].forEach((q) => assert.equal(byId['cal_q' + q + '_end'].date, c.QUARTERS_DEFAULT[q].end, 'Q' + q));
});
