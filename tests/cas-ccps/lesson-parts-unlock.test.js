'use strict';
// 68's unlocks (meta/STUDENT_WORK_PLAN_2026-10.md, Phase 3): a student's next
// part opens when their latest check of the part before found its primary
// MET, or when their teacher unlocks it; PartUnlocks records each.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const KEY = '8177-market-research-survey-design';
const PART = (n) => 'CAS-' + KEY.toUpperCase() + '-P' + n;
const TEACHER = 'teacher@ccpsnet.net';

function setup() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('00b_ScriptOwnerGuard.js'), S('55b_LessonAssignmentData.js'), S('64_LedgerCycle.js'), S('68_LessonParts.js')],
    ['unlockReadyParts', 'previewPartUnlocks', 'unlockNextPart_', 'partOfConfigId_', 'lessonPartsOf_', 'getConfig_']);
  const { sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['student_config_id', 'student_email', 'assignment_config_id']);
  const ev = ss.insertSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id', 'evaluated_at', 'student_file_id', 'archive_status']);
  const shared = [];
  sandbox.DriveApp.getFileById = (id) => ({ addEditor: (who) => shared.push([id, who]) });
  const add = (sid, who, n, status) => {
    const r = new Array(27).fill('');
    r[1] = who; r[2] = sid; r[3] = 'file-' + sid; r[8] = TEACHER; r[12] = status;
    ledger.appendRow(r);
    sa.appendRow([sid, who, PART(n)]);
  };
  return Object.assign(env, { ss, ledger, ev, shared, add });
}
const statuses = (ledger) => ledger.getDataRange().getValues().slice(1).map((r) => r[12]);

test('parts are found by ConfigID, in order, each knowing the next', () => {
  const { exported } = setup();
  const p2 = exported.partOfConfigId_(PART(2));
  assert.equal(p2.lessonKey, KEY);
  assert.equal(p2.n, 2);
  assert.equal(p2.next.configId, PART(3));
  assert.equal(exported.partOfConfigId_(PART(5)).next, null);
  assert.equal(exported.partOfConfigId_('CAS-8175-L06'), null);
  assert.equal(exported.lessonPartsOf_('8175-L06'), null);
});

test('Part 2 unlocks when Part 1\'s latest check found its primary (8177-81) met; not before, and only Part 2', () => {
  const { exported, ledger, ev, shared, add, ss } = setup();
  add('VDOE-A1', '1234567@ccpsnet.net', 1, 'ACTIVE');
  add('VDOE-A2', '1234567@ccpsnet.net', 2, 'SCHEDULED');
  add('VDOE-A3', '1234567@ccpsnet.net', 3, 'SCHEDULED');
  add('VDOE-B2', '2345678@ccpsnet.net', 2, 'SCHEDULED');
  ev.appendRow(['e1', 's', '8177-81', 'm', 'PARTIALLY_MET', 'C', '2026-10-27T15:00:00Z', 'file-VDOE-A1', '']);
  assert.equal(exported.unlockReadyParts().unlocked, 0, 'not met yet');
  ev.appendRow(['e2', 's', '8177-81', 'm', 'MET', 'C', '2026-10-27T16:00:00Z', 'file-VDOE-A1', '']);
  assert.equal(exported.previewPartUnlocks().wouldUnlock, 1);
  assert.deepEqual(statuses(ledger), ['ACTIVE', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED'], 'preview changes nothing');
  assert.equal(exported.unlockReadyParts().unlocked, 1);
  assert.deepEqual(shared, [['file-VDOE-A2', '1234567@ccpsnet.net']]);
  assert.deepEqual(statuses(ledger), ['ACTIVE', 'ACTIVE', 'SCHEDULED', 'SCHEDULED']);
  const log = ss.getSheetByName('PartUnlocks').getDataRange().getValues();
  assert.deepEqual(log[0], ['UnlockedAt', 'StudentConfigID', 'PartConfigID', 'By']);
  assert.deepEqual(log[1].slice(1), ['VDOE-A2', PART(2), 'PRIMARY_MET']);
  assert.equal(exported.unlockReadyParts().unlocked, 0, 'once');
});

test('a later check that is no longer met does not unlock; an archived row does not count', () => {
  const { exported, ev, add } = setup();
  add('VDOE-A1', '1234567@ccpsnet.net', 1, 'ACTIVE');
  add('VDOE-A2', '1234567@ccpsnet.net', 2, 'SCHEDULED');
  ev.appendRow(['e1', 's', '8177-81', 'm', 'MET', 'C', '2026-10-27T15:00:00Z', 'file-VDOE-A1', 'ARCHIVED']);
  assert.equal(exported.unlockReadyParts().unlocked, 0);
  ev.appendRow(['e2', 's', '8177-81', 'm', 'MET', 'C', '2026-10-27T15:00:00Z', 'file-VDOE-A1', '']);
  ev.appendRow(['e3', 's', '8177-81', 'm', 'NOT_MET', 'C', '2026-10-27T17:00:00Z', 'file-VDOE-A1', '']);
  assert.equal(exported.unlockReadyParts().unlocked, 0, 'the latest check is the one that counts');
});

test('the teacher unlocks a student\'s earliest locked part; another teacher\'s student and a whole lesson are refused', () => {
  const { exported, ledger, add, ss, sandbox } = setup();
  add('VDOE-A1', '1234567@ccpsnet.net', 1, 'ACTIVE');
  add('VDOE-A2', '1234567@ccpsnet.net', 2, 'SCHEDULED');
  add('VDOE-A3', '1234567@ccpsnet.net', 3, 'SCHEDULED');
  const cfg = exported.getConfig_();
  const res = exported.unlockNextPart_(cfg, 'VDOE-A1', TEACHER);
  assert.deepEqual(JSON.parse(JSON.stringify(res)), { success: true, unlocked: 'Part 2' });
  assert.deepEqual(statuses(ledger), ['ACTIVE', 'ACTIVE', 'SCHEDULED']);
  assert.equal(ss.getSheetByName('PartUnlocks').getDataRange().getValues()[1][3], 'TEACHER');
  assert.equal(exported.unlockNextPart_(cfg, 'VDOE-A2', TEACHER).unlocked, 'Part 3');
  assert.match(exported.unlockNextPart_(cfg, 'VDOE-A1', TEACHER).error, /already open/);
  assert.match(exported.unlockNextPart_(cfg, 'VDOE-A1', 'other@ccpsnet.net').error, /Not your student/);
  ss.getSheetByName('StudentAssignments').appendRow(['VDOE-W', 'x', 'CAS-8175-L06']);
  assert.match(exported.unlockNextPart_(cfg, 'VDOE-W', TEACHER).error, /isn't part of a lesson in parts/);
});
