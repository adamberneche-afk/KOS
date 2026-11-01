'use strict';
// Packaging step 1, "No hardcoded school" (meta/PLAN_2026-11.md): the school's
// courses, student-account pattern, mail domains and calendar come from
// configuration (00's schoolProfile_), with today's school as the default.
// The defaults are pinned here, so an install that sets nothing behaves
// exactly as before, and each value is shown to take an override.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const NAMES = ['schoolProfile_', 'schoolCourseCodes_', 'schoolCourseOf_', 'warmUpCourseCode_', 'studentIdRegex_',
  'studentIdDescription_', 'isSchoolDay_', 'bellScheduleFor_', 'classMinutesFor_', 'bellBlockOf_',
  'bellClassMinutes_', 'bellScheduleLabel_', 'bellRegularSchedules_', '_studentIdPattern_', '_studentEmailDomain_',
  'courseCodeFromName_', '_cybCourseCode_', 'partHeldSchoolDays_', 'SCHOOL_DEFAULTS'];

// A fresh sandbox, with these Script Properties set before anything reads them.
function load(props) {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('29_StudentContextAggregator.js'),
    S('24_WarmUpBridge.js'), S('51_CourseYearBuilder.js'), S('55b_LessonAssignmentData.js'), S('68_LessonParts.js')], NAMES);
  const sp = sandbox.PropertiesService.getScriptProperties();
  // Every install has a Ledger ID; without one, config can't resolve and
  // the defaults apply.
  const all = Object.assign({ CENTRAL_LEDGER_SS_ID: 'ledger-test' }, props || {});
  Object.keys(all).forEach((k) => sp.setProperty(k, all[k]));
  return exported;
}

test('the defaults are today\'s school', () => {
  const x = load();
  const p = x.schoolProfile_();
  assert.deepEqual(p.courses.map((c) => [c.code, c.word]), [['8175', 'marketing'], ['8177', 'management']]);
  assert.deepEqual(x.schoolCourseCodes_(), ['8175', '8177']);
  assert.equal(p.studentEmailDomain, 'ccpsnet.net');
  assert.equal(p.studentMailDomain, 'student.ccpsnet.net');
  assert.equal(p.staffMailDomain, 'ccpsnet.net');
  assert.deepEqual(p.earlyReleaseDays, ['2026-10-30', '2026-11-13', '2027-01-22', '2027-02-05',
    '2027-04-23', '2027-06-03', '2027-06-04']);
  assert.deepEqual(p.daysOff, []);
  assert.equal(x.studentIdDescription_(), '7 digits');
});

test('course names: the same rule as before, in 00, 24 and 51 alike', () => {
  const x = load();
  const cases = [['8175 Marketing', '8175'], ['Sports Marketing', '8175'], ['MARKETING', '8175'],
    ['8177 Entrepreneurship', '8177'], ['Business Management', '8177'], ['Marketing Management', '8175'],
    ['Accounting', ''], ['', ''], [null, '']];
  cases.forEach(([name, code]) => {
    assert.equal(x.schoolCourseOf_(name), code, String(name));
    assert.equal(x.warmUpCourseCode_(name), code, String(name));
    assert.equal(x.courseCodeFromName_(name), code, String(name));
    assert.equal(x._cybCourseCode_(name), code, String(name));
  });
});

test('SCHOOL_COURSES sets the courses; a bad value falls back to the default', () => {
  const x = load({ SCHOOL_COURSES: '6115=accounting, 6320=design' });
  assert.deepEqual(x.schoolCourseCodes_(), ['6115', '6320']);
  assert.equal(x.schoolCourseOf_('Accounting I'), '6115');
  assert.equal(x.schoolCourseOf_('6320 Graphic Design'), '6320');
  assert.equal(x.schoolCourseOf_('8175 Marketing'), '');
  assert.deepEqual(load({ SCHOOL_COURSES: ' , =x' }).schoolCourseCodes_(), ['8175', '8177']);
  assert.deepEqual(load({ SCHOOL_COURSES: '9000' }).schoolCourseCodes_(), ['9000'], 'the word is optional');
});

test('student accounts: seven digits at the domain by default; both are configurable', () => {
  const x = load();
  assert.ok(x._studentIdPattern_().test('1234567@ccpsnet.net'));
  assert.ok(!x._studentIdPattern_().test('123456@ccpsnet.net'));
  assert.ok(!x._studentIdPattern_().test('1234567@student.ccpsnet.net'));
  assert.ok(!x._studentIdPattern_().test('teacher@ccpsnet.net'));
  assert.ok(x.studentIdRegex_().test('1234567'));
  assert.ok(!x.studentIdRegex_().test('1234567@ccpsnet.net'));

  const y = load({ STUDENT_ID_PATTERN: 's\\d{6}', STUDENT_EMAIL_DOMAIN: 'example.k12.va.us' });
  assert.ok(y._studentIdPattern_().test('s123456@example.k12.va.us'));
  assert.ok(!y._studentIdPattern_().test('1234567@ccpsnet.net'));
  assert.equal(y._studentEmailDomain_(), 'example.k12.va.us');
  assert.equal(y.studentIdDescription_(), "the school's student ID");

  assert.equal(load({ STUDENT_ID_PATTERN: '(' }).schoolProfile_().studentIdPattern, '\\d{7}', 'a bad pattern falls back');
});

test('the bell schedule: Clover Hill\'s 2026-27 by default, unchanged', () => {
  const x = load();
  const none = {};
  assert.equal(x.bellScheduleFor_('2026-09-02', none), 'A');
  assert.equal(x.bellScheduleFor_('2026-11-02', none), 'A'); // Monday
  assert.equal(x.bellScheduleFor_('2026-11-04', none), 'B'); // Wednesday
  assert.equal(x.bellScheduleFor_('2026-11-06', none), 'B'); // Friday, before Nov 23
  assert.equal(x.bellScheduleFor_('2026-11-27', none), 'A'); // Friday, after
  assert.equal(x.bellScheduleFor_('2026-12-02', none), 'B'); // Wednesday, after
  assert.equal(x.bellScheduleFor_('2026-11-13', none), 'EARLY_RELEASE');
  assert.equal(x.bellScheduleFor_('2026-11-05', { '2026-11-05': 'DELAY' }), 'DELAY');
  assert.equal(x.classMinutesFor_('2026-11-04', '2', none), 90);
  assert.equal(x.bellBlockOf_('4'), 4);
  assert.equal(x.bellBlockOf_('5'), 0);
  assert.deepEqual(x.bellRegularSchedules_(), ['A', 'B']);
  assert.equal(x.bellScheduleLabel_('EARLY_RELEASE'), '3-hour early release');
});

test('BELL_SCHEDULE and EARLY_RELEASE_DAYS override it, part by part', () => {
  const bell = JSON.stringify({
    classMinutes: { REG: [45, 45, 45, 45, 45, 45, 45], SHORT: [30, 30, 30, 30, 30, 30, 30], EARLY_RELEASE: [20, 20, 20, 20, 20, 20, 20] },
    labels: { REG: 'Regular day' },
    rotation: [{ until: '', byDay: ['REG', 'REG', 'REG', 'SHORT', 'REG', 'REG', 'REG'] }],
  });
  const x = load({ BELL_SCHEDULE: bell, EARLY_RELEASE_DAYS: '2026-11-06' });
  assert.equal(x.bellScheduleFor_('2026-11-04', {}), 'SHORT');
  assert.equal(x.bellScheduleFor_('2026-11-02', {}), 'REG');
  assert.equal(x.bellScheduleFor_('2026-11-06', {}), 'EARLY_RELEASE');
  assert.equal(x.bellScheduleFor_('2026-11-13', {}), 'REG', 'the default early-release dates are replaced');
  assert.equal(x.bellBlockOf_('7'), 7, 'seven blocks');
  assert.equal(x.classMinutesFor_('2026-11-04', '6', {}), 30);
  assert.equal(x.bellScheduleLabel_('REG'), 'Regular day');
  assert.equal(x.bellScheduleLabel_('SHORT'), 'SHORT', 'no label shows the name');
  assert.deepEqual(x.bellRegularSchedules_(), ['REG', 'SHORT']);

  const bad = load({ BELL_SCHEDULE: '{not json' });
  assert.equal(bad.bellScheduleFor_('2026-11-04', {}), 'B', 'bad JSON keeps the default');
  const badRot = load({ BELL_SCHEDULE: JSON.stringify({ rotation: [{ until: '', byDay: ['X'] }] }) });
  assert.equal(badRot.bellScheduleFor_('2026-11-04', {}), 'B', 'a bad rotation keeps the default');
});

test('school days: weekdays, less SCHOOL_DAYS_OFF; a held part skips them', () => {
  const x = load();
  assert.ok(x.isSchoolDay_('2026-11-03'));
  assert.ok(!x.isSchoolDay_('2026-11-07')); // Saturday
  // Failed on Fri Oct 30; Mon Nov 2 and Tue Nov 3 have fully passed by Wed Nov 4.
  const failed = new Date(2026, 9, 30, 10).getTime();
  const wed = new Date(2026, 10, 4, 9);
  assert.equal(x.partHeldSchoolDays_(failed, wed), 2);

  const y = load({ SCHOOL_DAYS_OFF: '2026-11-03, 2026-11-11' });
  assert.ok(!y.isSchoolDay_('2026-11-03'));
  assert.equal(y.partHeldSchoolDays_(failed, wed), 1, 'Election Day is not counted');
});
