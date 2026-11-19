'use strict';
// Due dates (2026-11-19, the operator: "tighten up the due dates"). One rule
// in 00: a lesson is due on the school day before its course's next lesson
// starts (lessonDueDay_), read from the LessonSchedule tab by one reader
// (lessonScheduleRows_), used by the Student Dashboard's cards (13) and the
// weekly Canvas cartridge (79). Pins the reader, and what a card says.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:student-dashboard'].files.map((f) => path.join(ROOT, f));

function load() {
  const env = loadGasFiles(FILES, ['lessonScheduleRows_', 'lessonDueDay_', '_dashAddDueDates_'], {
    Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => '' }),
      getEffectiveUser: () => ({ getEmail: () => '' }) },
  });
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  env.sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  return Object.assign(env, { ss });
}
const plain = (o) => JSON.parse(JSON.stringify(o));

test('lessonScheduleRows_: dated rows by course, by start; a Date cell read as its day; HOLD kept; undated left out', () => {
  const { exported, ss } = load();
  assert.deepEqual(plain(exported.lessonScheduleRows_(ss, 'America/New_York')), {}, 'no tab: nothing');
  const tab = ss.insertSheet('LessonSchedule');
  tab.appendRow(['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes', 'release']);
  tab.appendRow(['8177', '8177-b', 'B', '2026-11-23', '', '', '']);
  tab.appendRow(['8177', '8177-a', 'A', new Date('2026-11-16T12:00:00-05:00'), '', '', 'HOLD']);
  tab.appendRow(['8175', '8175-L01', 'L01', '', '', '', '']);
  tab.appendRow(['8175', '8175-L02', 'L02', 'next week', '', '', '']);
  assert.deepEqual(plain(exported.lessonScheduleRows_(ss, 'America/New_York')), {
    '8177': [{ key: '8177-a', start: '2026-11-16', hold: true }, { key: '8177-b', start: '2026-11-23', hold: false }],
  });
});

test('a card\'s due date: due, due today, was due; none once done or turned in, or for a lesson not in the schedule', () => {
  const { exported } = load();
  const schedule = { '8177': [{ key: '8177-a', start: '2026-11-16' }, { key: '8177-b', start: '2026-11-19' },
    { key: '8177-c', start: '2026-11-23' }, { key: '8177-d', start: '2026-11-25' }] };
  const card = (lessonKey, over) => Object.assign({ lessonKey, statusClass: 'NEEDS_ACTION', statusPill: 'Revise' }, over || {});
  const cards = [card('8177-a'), card('8177-b'), card('8177-c'), card('8177-d'), card('8177-b', { statusClass: 'DONE', statusPill: 'Passed ✓' }),
    card('8177-b', { statusClass: 'IN_PROGRESS', statusPill: 'Turned in' }), card('8177-zzz'), card('')];
  const weekdays = (ymd) => { const d = new Date(ymd + 'T12:00:00Z').getUTCDay(); return d !== 0 && d !== 6; };
  exported._dashAddDueDates_(cards, schedule, new Date('2026-11-20T15:00:00-05:00'), weekdays);
  const said = plain(cards).map((a) => [a.dueOn, a.dueText]);
  assert.deepEqual(said, [
    ['2026-11-18', 'Was due Wed, Nov 18'],
    ['2026-11-20', 'Due today'],
    ['2026-11-24', 'Due Tue, Nov 24'],
    ['', ''],
    ['2026-11-20', ''],
    ['2026-11-20', ''],
    ['', ''],
    ['', ''],
  ]);
  assert.equal(exported.lessonDueDay_(schedule['8177'], { start: '2026-11-19' }, weekdays), '2026-11-20',
    'the Monday after: due the Friday before');
});
