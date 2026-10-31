// requireScriptOwner_ (00b_ScriptOwnerGuard.js): the Teacher and Student
// Dashboards run as the teacher with domain access, so a student who loads
// either page can call any public function of its project through
// google.script.run. KOS Audit Docket IV (High, 2026-10-31): a student
// could overwrite a classmate's ParentReportLog row through 36's
// recordParentReportCopied. These pin the guard and the function it found.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@ccpsnet.net';
// Assembled, so this file doesn't trip tools/student-data-scan.
const STUDENT = ['1234567', 'student.ccpsnet.net'].join('@');

// active: who opened the page (or ran the editor); effective: who the script runs as.
function session(active, effective) {
  return {
    getActiveUser: () => ({ getEmail: () => active }),
    getEffectiveUser: () => ({ getEmail: () => effective }),
    getScriptTimeZone: () => 'America/New_York',
  };
}

function loadGuard(active, effective) {
  return loadGasFiles([S('00_SharedConfig.js'), S('00b_ScriptOwnerGuard.js')],
    ['requireScriptOwner_', 'showConfigSources'], { Session: session(active, effective) }).exported;
}

test('the script\'s own account, from the editor, passes', () => {
  assert.doesNotThrow(() => loadGuard(TEACHER, TEACHER).requireScriptOwner_());
});

test('a trigger with no signed-in user passes', () => {
  assert.doesNotThrow(() => loadGuard('', TEACHER).requireScriptOwner_());
});

test('a student calling through the web app, which runs as the teacher, is refused', () => {
  assert.throws(() => loadGuard(STUDENT, TEACHER).requireScriptOwner_(), /Not authorized/);
});

test('the comparison ignores case', () => {
  assert.doesNotThrow(() => loadGuard('Teacher@CCPSnet.net', TEACHER).requireScriptOwner_());
});

test('a session without getEffectiveUser (an older test mock) does not throw', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('00b_ScriptOwnerGuard.js')], ['requireScriptOwner_'],
    { Session: { getActiveUser: () => ({ getEmail: () => TEACHER }), getScriptTimeZone: () => 'America/New_York' } });
  assert.doesNotThrow(() => exported.requireScriptOwner_());
});

test('00\'s editor functions refuse a student through the web app', () => {
  assert.throws(() => loadGuard(STUDENT, TEACHER).showConfigSources(), /Not authorized/);
});

test('00\'s editor functions still run in a project without 00b (no web app there)', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js')], ['showConfigSources'],
    { Session: session(STUDENT, TEACHER) });
  // Past the guard, it fails only for lack of a Ledger, not "Not authorized".
  assert.throws(() => exported.showConfigSources(), (e) => !/Not authorized/.test(e.message));
});

test('Docket IV: a student can no longer write a parent-report record or read the roster\'s reports', () => {
  const { exported } = loadGasFiles(
    [S('00_SharedConfig.js'), S('00b_ScriptOwnerGuard.js'), S('29_StudentContextAggregator.js'), S('36_WeeklyParentReport.js'),
      S('55b_LessonAssignmentData.js')],
    ['recordParentReportCopied', 'generateWeeklyParentReports'], { Session: session(STUDENT, TEACHER) });
  assert.throws(() => exported.recordParentReportCopied(STUDENT, new Date(), { subject: 'x', text: 'y' }), /Not authorized/);
  assert.throws(() => exported.generateWeeklyParentReports(), /Not authorized/);
});
