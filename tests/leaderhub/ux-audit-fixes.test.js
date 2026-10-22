'use strict';
// leader-hub's share of the 2026-10-22 UX audit (meta/UX_AUDIT_2026-10-22.md,
// fix-first 12 and 15, order-of-work 15). Pins:
//   - the family/student/admin email templates read the season (DECA_SEASON)
//     instead of last season's typed-in ICDC Atlanta / March 13 facts;
//   - "Email Families" fills real addresses (Bcc from the slip roster or the
//     active members), never the words "DECA Families";
//   - blanks such as [DATE] are named before an email goes out;
//   - the reminder banners stack in #lh-banners, not position:fixed;top:0;
//   - the phone layout hides the 810px top nav;
//   - edit modals ask before discarding changes;
//   - Brag Board's Generate no longer reaches an undefined `url`;
//   - pulse rings show — / Overdue instead of a made-up 100%.
// Functions are cut out of src/ by their own names (not line numbers) and
// run in a vm sandbox.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const SRC = (f) => fs.readFileSync(path.join(LH, 'src', f), 'utf8');
const F07 = SRC('07-events-email-members-goals.html');
const between = (s, a, b) => {
  const i = s.indexOf(a);
  const j = s.indexOf(b, i + 1);
  assert.ok(i >= 0 && j > i, `cannot find ${a} … ${b}`);
  return s.slice(i, j);
};

function emailSandbox(extra) {
  const ctx = Object.assign({
    trips: [], students: [], slipRosters: {}, activeOrgId: 'deca',
    PROFILE: { email: 'me@school.org', adminEmail: '', courtesyName: 'Mr. X', name: 'X', title: 'Advisor', school: 'HS', phone: '', chapterName: 'HS DECA' },
    _localDateStr_: (d) => d.toISOString().slice(0, 10),
    toasts: [], confirms: [],
  }, extra || {});
  ctx._showToast = (m) => ctx.toasts.push(m);
  ctx._showConfirm = (m, ok) => ctx.confirms.push({ m, ok });
  ctx.getSlipRoster = (id) => ctx.slipRosters[id] || [];
  ctx.resolveSlipStudent = (s) => s;
  vm.createContext(ctx);
  vm.runInContext(between(F07, 'const DECA_SEASON_DEFAULT = {', 'let DECA_SEASON =') +
    '\nvar DECA_SEASON = DECA_SEASON_DEFAULT;\n' +
    between(F07, 'function _decaStageStatus(', 'function renderDECAPipeline(') +
    between(F07, 'function _emailLongDate(', '// ── Audience-specific template definitions') +
    between(F07, 'function _emailRecipients(', 'let _emailAutoFilled') +
    between(F07, 'function lhEmailBlanks(', 'function _emailFields('), ctx);
  return ctx;
}

test('the templates carry no hard-coded season: no Atlanta, April 25–29, March 13 or 25-26', () => {
  const block = between(F07, 'const EMAIL_TEMPLATES = {', '// ── Email Composer State & Logic');
  for (const stale of ['Atlanta', 'April 25', 'Apr 25', 'March 13', '25-26', '2025', "'${PROFILE.name}'"]) {
    assert.ok(!block.includes(stale), 'template still says ' + stale);
  }
  assert.match(block, /id:'par-icdc-info'[\s\S]*?_emailSeasonFacts\(\)/);
  assert.match(block, /id:'par-season-update'[\s\S]*?_emailSeasonFacts\(\)\.seasonLabel/);
});

test('season facts come from the season pipeline', () => {
  const ctx = emailSandbox();
  const f = ctx._emailSeasonFacts(new Date('2026-10-22T12:00:00'));
  assert.equal(f.seasonLabel, '2026–27');
  assert.equal(f.icdcDates, 'April 17–20, 2027');
  assert.equal(f.icdcPlace, 'Anaheim, CA');
  assert.equal(f.icdcRegCloses, 'March 5, 2027');
  assert.equal(f.icdcPaymentDue, 'April 1, 2027');
  assert.deepEqual([...f.doneLines], ['• Camp DECA — September 25–27, 2026 (Williamsburg, VA)']);
  assert.ok(f.upcomingLines.some((l) => l.includes('ICDC Anaheim — April 17–20, 2027')));
  // Last season's ICDC trip is not used for this season's letter; this
  // season's is, with its own place and cost.
  const old = { name: 'DECA ICDC', date: '2026-04-25', retDate: '2026-04-29', dest1: 'Atlanta, GA', costStu: 1000 };
  assert.equal(ctx._emailIcdc(old, f).place, 'Anaheim, CA');
  const now = { name: 'DECA ICDC 2027', date: '2027-04-17', retDate: '2027-04-20', dest1: 'Anaheim Convention Center', costStu: 1200 };
  assert.deepEqual([ctx._emailIcdc(now, f).place, ctx._emailIcdc(now, f).cost], ['Anaheim Convention Center', '$1200']);
});

test('Email Families fills real addresses in Bcc, from the trip roster or the active members', () => {
  const ctx = emailSandbox({
    slipRosters: { 7: [{ parentEmail: 'a@x.org', email: 's1@x.org' }, { parentEmail: '', email: 's2@x.org' }, { parentEmail: 'a@x.org' }] },
    students: [{ memberStatus: 'active', parentEmail: 'p@x.org', email: 'm@x.org' }, { memberStatus: 'alumni', parentEmail: 'old@x.org' }],
  });
  const r = ctx._emailRecipients('parents', { id: 7, name: 'ICDC' });
  assert.equal(r.bcc, 'a@x.org');
  assert.equal(r.to, 'me@school.org');
  assert.match(r.note, /Bcc: 1 family from the ICDC permission-slip list\. 1 has no parent email on file\./);
  assert.equal(ctx._emailRecipients('parents', null).bcc, 'p@x.org');
  assert.equal(ctx._emailRecipients('students', null).bcc, 'm@x.org');
  assert.match(ctx._emailRecipients('parents', { id: 9, name: 'Empty' }).note, /No one is on/);
  // The words "DECA Families" / "DECA Members" are never put in a recipient field.
  assert.ok(!/email-to'\)\.value\s*=[^;\n]*'DECA (Families|Members|Alumni)'/.test(F07));
  assert.ok(!/toDefaults/.test(F07));
});

test('blanks are named before sending, and a non-address blocks it', () => {
  const ctx = emailSandbox();
  assert.deepEqual([...ctx.lhEmailBlanks('Due [DATE] in Room [#]; [DATE] again')], ['[DATE]', '[#]']);
  let sent = 0;
  ctx.lhCheckEmailBeforeSending({ to: 'DECA Families', subject: '', body: '' }, () => sent++);
  assert.equal(sent, 0);
  assert.match(ctx.toasts.pop(), /Not an email address: DECA, Families/);
  ctx.lhCheckEmailBeforeSending({ to: '', bcc: '', subject: '', body: 'x' }, () => sent++);
  assert.match(ctx.toasts.pop(), /at least one email address/);
  ctx.lhCheckEmailBeforeSending({ to: 'a@x.org', subject: 'Hi', body: 'Return it by [DATE]' }, () => sent++);
  assert.equal(sent, 0);
  assert.match(ctx.confirms[0].m, /1 blank to fill in:\n\[DATE\]/);
  ctx.confirms[0].ok();
  assert.equal(sent, 1);
  ctx.lhCheckEmailBeforeSending({ to: 'a@x.org', bcc: 'b@x.org; c@x.org', subject: 'Hi', body: 'All set' }, () => sent++);
  assert.equal(sent, 2);
  // Both send paths run the check.
  assert.match(F07, /function openInMailClient\(\) \{\n\s*const f = _emailFields\(\);\n\s*lhCheckEmailBeforeSending\(/);
  assert.match(SRC('12-integrations-pacing-subplan-brag.html'), /function openBragInMail\(\) \{\n\s*const f = _bragFields\(\);\n\s*lhCheckEmailBeforeSending\(/);
});

test('reminder banners stack under the header in normal flow', () => {
  const all = SRC('11-journal-cron-settings-and-sync.html') + SRC('12-integrations-pacing-subplan-brag.html');
  assert.ok(!/banner\.style\.cssText = 'position:fixed;top:0/.test(all), 'a banner is still fixed to the top');
  // Only lhShowBanner's own fallback (no #lh-banners in the page) prepends.
  assert.equal((all.match(/document\.body\.prepend\(banner\)/g) || []).length, 1);
  assert.match(all, /if \(!stack\) \{ document\.body\.prepend\(banner\); return; \}/);
  assert.equal((all.match(/lhShowBanner\(banner\);/g) || []).length, 8);
  assert.match(SRC('03-markup-nav-dashboard-trips.html'), /<\/header>\n<div id="lh-banners" role="region" aria-label="Reminders"><\/div>/);
  const css = SRC('01-styles.html');
  assert.match(css, /\.app\{ height:calc\(100vh - 64px - var\(--lh-banners-h, 0px\)\); \}/);
  assert.match(css, /@media\(max-width:1100px\)\{\n\s*header nav\{ display:none; \}/);
});

test('edit modals ask before discarding changes; saves close without asking', () => {
  const s06 = SRC('06-tasks-trips-and-modals-core.html');
  for (const n of ['newTrip', 'addStudent', 'addGoal', 'newEvent']) assert.match(s06, new RegExp(`\\n  ${n}:\\s+\\(\\) => \\{`), n);
  assert.match(s06, /'po-modal':\s+\(\) => dismissPOModal\(\),/);
  assert.match(s06, /'wbl-student-modal':\s+\(\) => dismissWBLStudentModal\(\),/);
  assert.match(s06, /_wzEditBaseline = null;\n\s*LS\.set\('lh_trip_draft', \{\}\);\n\n\s*closeModal\('newTrip', true\);/);
  assert.match(s06, /_unsavedWorkChecks\.push\(_lhOpenFormIsDirty\);/);
  for (const n of ['newEvent', 'addGoal', 'addStudent']) assert.ok(!F07.includes(`closeModal('${n}');`), n + ' save still closes through the guard');
  const m04 = SRC('04-markup-modals-and-feature-views.html');
  assert.match(m04, /id="po-modal"[^>]*onclick="if\(event\.target===this\)dismissPOModal\(\)"/);
  assert.match(m04, /id="wbl-student-modal"[^>]*onclick="if\(event\.target===this\)dismissWBLStudentModal\(\)"/);

  // The snapshot compare itself.
  const ctx = { document: null };
  const fields = [{ type: 'text', value: 'a' }, { type: 'checkbox', checked: false }];
  const el = { querySelectorAll: () => fields };
  ctx.document = { getElementById: () => el };
  vm.createContext(ctx);
  vm.runInContext(between(s06, 'const _lhFormSnaps = {};', 'function lhCloseFormIfClean('), ctx);
  ctx.lhMarkFormClean('f');
  assert.equal(ctx.lhFormIsDirty('f'), false);
  fields[1].checked = true;
  assert.equal(ctx.lhFormIsDirty('f'), true);
});

test('Brag Board: Generate only drafts; Send now is explicit and uses To', () => {
  const gen = between(SRC('10-command-engine-ai-and-widgets.html'), 'async function _generateBragEmailInner(', '// ── Removed: Gemini AI infrastructure')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/\bif \(url\)/.test(gen) && !/defaultTo/.test(gen) && !/callGAS\('bragEmail'/.test(gen));
  const s12 = SRC('12-integrations-pacing-subplan-brag.html');
  const send = between(s12, 'async function sendBragEmail(', '\nfunction saveBragToLog(');
  assert.match(send, /lhCheckEmailBeforeSending\(f,/);
  assert.match(send, /callGAS\('bragEmail', \{ to, subject/);
  assert.match(SRC('13-markup-modals-tail.html'), /id="brag-send-btn"[^>]*onclick="sendBragEmail\(\)"/);
});

test('pulse rings: an overdue DECA deadline and zero trips no longer read 100%', () => {
  const s10 = SRC('10-command-engine-ai-and-widgets.html');
  const data = between(s10, 'function getPulseData(){', 'const PULSE_MEANINGS');
  assert.match(data, /const tripsPct = _allTrips\.length \? [^\n]*: null;/);
  assert.match(data, /pct:decaDays===null\|\|decaDays<0\?null:/);
  assert.ok(!/\)\)\)\):50,/.test(data), 'no made-up 50% for "no DECA deadline"');
});
