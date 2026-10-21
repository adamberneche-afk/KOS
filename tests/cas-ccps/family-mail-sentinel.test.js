'use strict';
// Tests for 60_FamilyMailSentinel.js (cas-ccps:family-sentinel).
//
// The rules that matter most are pinned by behaviour here:
//   - family mail is labeled KOS/Family (the KOS Claude Project's mail search
//     excludes that label) and other mail is left alone;
//   - what reaches Gemini is redacted, and what reaches the signal doc names
//     nobody: no student, no sender, no address, no message text;
//   - a safety message is flagged before Gemini runs and is never summarized;
//   - mail text is deleted from the sheet once the Flow has answered;
//   - the signal doc splits WAITING ON YOU (needs a reply, with fail-safe
//     overrides) from FOR YOUR EYES, and leaves out archived threads;
//   - Google's system senders are never family mail.
// Every name here is synthetic.
//
// Loaded with the project's full scope (project-map.json): 00_SharedConfig.js
// for getConfig_/LEDGER, 61 for the prompt, 62 for the deploy marker. Gmail is
// a fake advanced service passed in as an extra global.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const REPO = path.join(__dirname, '..', '..');
const SCRIPTS = path.join(REPO, 'cas-ccps', 'scripts');
const PATHS = [
  path.join(SCRIPTS, '00_SharedConfig.js'),
  path.join(SCRIPTS, '60_FamilyMailSentinel.js'),
  path.join(SCRIPTS, '61_FamilyMailPrompt.js'),
  path.join(SCRIPTS, '62_DeployVersionMarker_FamilySentinel.js'),
];
const EXPORTS = [
  'runFamilySentinel', 'installFamilySentinelTrigger', 'setupFamilySentinel',
  'scanFamilyMail', 'harvestFamilyMailReturns', 'writeFamilySignal',
  'runFamilySentinelPreflight', 'runFamilyMailCanary', 'checkFamilyMailFlowBinding',
  'checkFamilyMailFlowLiveness', 'installFamilyMailFixture', 'syncFamilyMailFlowBuildSpec',
  'sendFamilySafetyAlerts', 'sendFamilyAlertTest', 'makeFamilyAlertTopic', 'runFamilySafetyAlertFixture',
  'reclassifySystemSenderThreads', 'reclassifySystemSenderThreadsNow',
  'FAMILY_MAIL_TRIAGE_PROMPT', 'FMS_LOG', 'FMS_LOG_HEADERS',
];

const HOUR = 3600 * 1000;
const OPERATOR = 'teacher@ccpsnet.net';

// A fake advanced Gmail service: just the calls 60 makes.
function makeGmail(messages) {
  const labels = [];
  const threadLabels = {};
  let nextLabel = 1;
  return {
    Users: {
      Messages: {
        list() {
          return {
            messages: messages
              .filter((m) => !(m.labelIds || []).includes('SENT'))
              .map((m) => ({ id: m.id, threadId: m.threadId })),
          };
        },
        get(user, id) {
          const m = messages.find((x) => x.id === id);
          const headers = [{ name: 'From', value: m.from }, { name: 'Subject', value: m.subject || '' }]
            .concat(m.headers || []);
          return {
            id: m.id, threadId: m.threadId, internalDate: String(m.internalDate),
            payload: {
              mimeType: 'multipart/alternative', headers,
              parts: [{ mimeType: 'text/plain', body: { data: Buffer.from(m.body || '').toString('base64url') } }],
            },
          };
        },
      },
      Threads: {
        modify(req, user, threadId) {
          const set = (threadLabels[threadId] = threadLabels[threadId] || new Set());
          (req.addLabelIds || []).forEach((id) => set.add(id));
          (req.removeLabelIds || []).forEach((id) => set.delete(id));
          return {};
        },
        get(user, threadId) {
          return {
            messages: messages.filter((m) => m.threadId === threadId).map((m) => ({
              id: m.id, internalDate: String(m.internalDate), labelIds: m.labelIds || ['INBOX'],
            })),
          };
        },
      },
      Labels: {
        list() { return { labels: labels.slice() }; },
        create(l) { const x = { id: 'Label_' + nextLabel++, name: l.name }; labels.push(x); return x; },
      },
    },
    labelNames(threadId) {
      const ids = threadLabels[threadId] ? [...threadLabels[threadId]] : [];
      return ids.map((id) => labels.find((l) => l.id === id).name).sort();
    },
  };
}

const ROSTER = [
  { email: 'jrivers@student.ccpsnet.net', name: 'Rivers, Jordan', course: '8175', period: '3' },
  { email: 'mlopez@student.ccpsnet.net', name: 'Maya Lopez', course: '8177', period: '6' },
];

// Sets up the sentinel sheet and a Central Ledger with ROSTER.
function setUp(messages, opts) {
  opts = opts || {};
  const gmail = makeGmail(messages);
  const pushes = [];
  const urlFetch = {
    fetch(url, opts) {
      pushes.push({ url, body: opts.payload, headers: opts.headers });
      return { getResponseCode: () => (urlFetch.failWith || 200) };
    },
  };
  const { exported, sandbox } = loadGasFiles(PATHS, EXPORTS, { Gmail: gmail, UrlFetchApp: urlFetch });
  sandbox.Session.getEffectiveUser = () => ({ getEmail: () => OPERATOR });
  const props = sandbox.PropertiesService.getScriptProperties();

  const ledgerSs = sandbox.SpreadsheetApp.create('Central Ledger');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledgerSs.getId());
  const ledger = ledgerSs.insertSheet('Ledger');
  ledger.appendRow(new Array(16).fill('header'));
  (opts.roster || ROSTER).forEach((s) => {
    const row = new Array(16).fill('');
    row[1] = s.email; row[4] = s.name; row[8] = OPERATOR; row[10] = s.course; row[11] = s.period;
    ledger.appendRow(row);
  });

  const ss = sandbox.SpreadsheetApp.create('Family Mail Sentinel');
  props.setProperty('FAMILY_SENTINEL_SS_ID', ss.getId());
  if (opts.beforeSetup) opts.beforeSetup(ss);
  exported.setupFamilySentinel();
  if (opts.contacts) {
    const tab = ss.getSheetByName('FamilyContacts');
    opts.contacts.forEach((c) => tab.appendRow(c));
  }
  return { exported, sandbox, gmail, ss, props, pushes, urlFetch };
}

function rows(ss, tab) {
  const sh = ss.getSheetByName(tab);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function logByMessage(ss, LOG, id) {
  return rows(ss, 'FamilyMailLog').find((r) => String(r[LOG.MESSAGE_ID]) === id);
}

// Plays the Flow: answers every READY input row with answerFor(itemId, promptText).
function playFlow(ss, answerFor) {
  const ret = ss.getSheetByName('FamilyMailReturn');
  rows(ss, 'FamilyMailInput').forEach((r) => {
    const answer = answerFor(r[0], r[3]);
    if (answer !== undefined) ret.appendRow([new Date(), r[0], typeof answer === 'string' ? answer : JSON.stringify(answer)]);
  });
}

function signalText(sandbox, props) {
  const doc = sandbox.DocumentApp.openById(props.getProperty('FAMILY_SIGNAL_DOC_ID'));
  return doc.getBody().paragraphs.map((p) => p.getText()).join('\n');
}

const now = Date.now();
const MAIL = {
  student: {
    id: 'm1', threadId: 't1', internalDate: now - 20 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'Makeup test',
    body: 'Hi, I missed the quiz Tuesday. When can I make up the quiz? Email me at jordan.r@gmail.com',
  },
  parent: {
    id: 'm2', threadId: 't2', internalDate: now - 5 * HOUR,
    from: '"Pat Lopez" <pat.lopez@example.com>', subject: 'Maya grade',
    body: 'Hello, Maya Lopez is worried about her project grade. Could you explain the rubric score? Call 555-201-3344.',
  },
  colleague: {
    id: 'm3', threadId: 't3', internalDate: now - 2 * HOUR,
    from: 'Counselor <counselor@ccpsnet.net>', subject: 'Checking in',
    body: 'Can we talk about Jordan Rivers this week? Schedule a meeting when you can.',
  },
  newsletter: {
    id: 'm4', threadId: 't4', internalDate: now - 3 * HOUR,
    from: 'Booster Club <news@boosters.org>', subject: 'Weekly news',
    body: 'Congrats to Maya Lopez on the award!', headers: [{ name: 'List-Unsubscribe', value: '<mailto:x>' }],
  },
  stranger: {
    id: 'm5', threadId: 't5', internalDate: now - 1 * HOUR,
    from: 'Vendor <sales@vendor.com>', subject: 'Order', body: 'Your order has shipped.',
  },
  mine: {
    id: 'm6', threadId: 't6', internalDate: now - 1 * HOUR,
    from: 'Me <' + OPERATOR + '>', subject: 'Note to self', body: 'Jordan Rivers paperwork.',
  },
};

// ── Scan ────────────────────────────────────────────────────────────────────

test('scan labels and queues family mail, and leaves everything else alone', () => {
  const fx = setUp(Object.values(MAIL), { contacts: [['pat.lopez@example.com', 'mlopez@student.ccpsnet.net', '']] });
  const out = fx.exported.scanFamilyMail();
  assert.equal(out.queued, 3);

  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'm1')[LOG.SOURCE], 'student');
  assert.equal(logByMessage(fx.ss, LOG, 'm2')[LOG.SOURCE], 'parent');
  assert.equal(logByMessage(fx.ss, LOG, 'm3')[LOG.SOURCE], 'staff');
  assert.equal(logByMessage(fx.ss, LOG, 'm2')[LOG.COURSE], '8177');
  assert.equal(String(logByMessage(fx.ss, LOG, 'm2')[LOG.PERIOD]), '6');
  for (const id of ['m4', 'm5', 'm6']) assert.equal(logByMessage(fx.ss, LOG, id), undefined, id + ' must not be recorded');

  assert.deepEqual(fx.gmail.labelNames('t1'), ['KOS/Family']);
  assert.deepEqual(fx.gmail.labelNames('t4'), []);
  assert.deepEqual(fx.gmail.labelNames('t5'), []);

  // A second scan queues nothing new.
  assert.equal(fx.exported.scanFamilyMail().queued, 0);
  assert.equal(rows(fx.ss, 'FamilyMailInput').length, 3);
});

test('bodies come back as byte arrays or unpadded base64url; both decode, and one bad message does not stop the scan', () => {
  const fx = setUp([MAIL.student, MAIL.colleague]);
  const real = fx.gmail.Users.Messages.get;
  fx.gmail.Users.Messages.get = (u, id, o) => {
    const m = real(u, id, o);
    const part = m.payload.parts[0];
    if (id === 'm1') {
      // What Apps Script's advanced service actually returns: decoded bytes.
      part.body.data = Array.from(Buffer.from(MAIL.student.body, 'utf8'), (b) => (b > 127 ? b - 256 : b));
    } else {
      part.body.data = part.body.data.replace(/=+$/, ''); // the API's unpadded form
    }
    return m;
  };
  const out = fx.exported.scanFamilyMail();
  assert.equal(out.queued, 2);
  assert.equal(out.errors, 0);
  const prompts = rows(fx.ss, 'FamilyMailInput').map((r) => String(r[3]));
  assert.match(prompts[0], /make up the quiz/);
  assert.match(prompts[1], /Schedule a meeting/);

  // A message Gmail won't return is skipped, the rest still scanned, and the
  // scan mark is held back so it is tried again.
  const fx2 = setUp([MAIL.student, MAIL.colleague]);
  const real2 = fx2.gmail.Users.Messages.get;
  fx2.gmail.Users.Messages.get = (u, id, o) => { if (id === 'm1') throw new Error('Could not decode string.'); return real2(u, id, o); };
  const out2 = fx2.exported.scanFamilyMail();
  assert.equal(out2.errors, 1);
  assert.equal(out2.queued, 1);
  assert.equal(fx2.props.getProperty('FAMILY_SENTINEL_LAST_SCAN_AT'), null);
});

test('what Gemini is given is redacted: no names, addresses or phone numbers', () => {
  const fx = setUp([MAIL.student, MAIL.parent], { contacts: [['pat.lopez@example.com', 'mlopez@student.ccpsnet.net', '']] });
  fx.exported.scanFamilyMail();
  const prompts = rows(fx.ss, 'FamilyMailInput').map((r) => String(r[3]));
  assert.equal(prompts.length, 2);
  for (const p of prompts) {
    assert.ok(p.startsWith(fx.exported.FAMILY_MAIL_TRIAGE_PROMPT));
    const message = p.slice(fx.exported.FAMILY_MAIL_TRIAGE_PROMPT.length);
    assert.doesNotMatch(message, /jordan|rivers|maya|lopez|pat\b/i);
    assert.doesNotMatch(message, /@|555/);
  }
  assert.match(prompts.join('\n'), /\[STUDENT\]/);
  assert.match(prompts.join('\n'), /\[PHONE\]/);
});

test('an outside sender with a first name and a parent word is a candidate; Gemini can clear it', () => {
  const msg = {
    id: 'm7', threadId: 't7', internalDate: now - 4 * HOUR,
    from: 'Sam <sam@example.net>', subject: 'Question', body: 'My son Jordan says the project is due Friday. Is that right?',
  };
  const fx = setUp([msg]);
  assert.equal(fx.exported.scanFamilyMail().queued, 1);
  assert.deepEqual(fx.gmail.labelNames('t7'), ['KOS/Family']);
  playFlow(fx.ss, () => ({ is_family: false, category: 'other', urgency: 1, safety: false, ask: '', due: '' }));
  const out = fx.exported.harvestFamilyMailReturns();
  assert.equal(out.notFamily, 1);
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'm7')[LOG.STATUS], 'NOT_FAMILY');
  assert.deepEqual(fx.gmail.labelNames('t7'), [], 'a NOT_FAMILY verdict removes the label');
});

// ── Safety ──────────────────────────────────────────────────────────────────

test('a safety message is flagged before Gemini runs and is never summarized', () => {
  const msg = {
    id: 'm8', threadId: 't8', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'help',
    body: 'I do not feel safe. Some days I want to hurt myself.',
  };
  const fx = setUp([msg]);
  const scan = fx.exported.scanFamilyMail();
  assert.equal(scan.safety, 1);
  assert.deepEqual(fx.gmail.labelNames('t8'), ['KOS/Family', 'KOS/Family/Now']);

  // Even if Gemini misses it, the tripwire's verdict stands.
  playFlow(fx.ss, () => ({ is_family: true, category: 'assignment_help', urgency: 2, safety: false, ask: 'The student wants help feeling safe.', due: '' }));
  fx.exported.harvestFamilyMailReturns();
  const LOG = fx.exported.FMS_LOG;
  const row = logByMessage(fx.ss, LOG, 'm8');
  assert.equal(row[LOG.SAFETY], true);
  assert.equal(row[LOG.ASK], '');

  fx.exported.writeFamilySignal();
  const text = signalText(fx.sandbox, fx.props);
  assert.match(text, /NEEDS YOU NOW: 1 message, not summarized\./);
  assert.doesNotMatch(text, /hurt|safe\b|8175/i);
});

test('a safety message pushes to the phone once, with no detail, before Gemini answers', () => {
  const safe1 = {
    id: 's1', threadId: 'ts1', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'help', body: 'I want to hurt myself.',
  };
  const safe2 = Object.assign({}, safe1, { id: 's2', threadId: 'ts2' });
  const fx = setUp([safe1, safe2]);
  assert.equal(fx.exported.sendFamilySafetyAlerts().reason, 'FAMILY_ALERT_NTFY_TOPIC not set');
  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');

  const run = fx.exported.runFamilySentinel();
  assert.equal(run.alertAfterScan.sent, 1, 'pushed after the scan, before any Gemini answer');
  assert.equal(run.alertAfterScan.threads, 2);
  assert.equal(fx.pushes.length, 1, 'one push for both threads');
  const p = fx.pushes[0];
  assert.equal(p.url, 'https://ntfy.sh/kos-abc123');
  assert.equal(p.body, '2 family messages need you now. Open Gmail, label KOS/Family/Now.');
  assert.equal(p.headers.Title, 'KOS');
  assert.equal(p.headers.Priority, 'urgent');
  assert.doesNotMatch(JSON.stringify(p), /jordan|rivers|8175|hurt/i);

  // Later runs send nothing more for the same threads.
  fx.exported.runFamilySentinel();
  assert.equal(fx.pushes.length, 1);
  const LOG = fx.exported.FMS_LOG;
  assert.ok(logByMessage(fx.ss, LOG, 's1')[LOG.ALERTED_AT]);
});

test('a failed push is retried on the next run', () => {
  const msg = {
    id: 's3', threadId: 'ts3', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'help', body: 'I want to hurt myself.',
  };
  const fx = setUp([msg]);
  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  fx.exported.scanFamilyMail();
  fx.urlFetch.failWith = 503;
  const failed = fx.exported.sendFamilySafetyAlerts();
  assert.equal(failed.sent, 0);
  assert.match(failed.error, /503/);
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 's3')[LOG.ALERTED_AT], '');
  fx.urlFetch.failWith = 0;
  assert.equal(fx.exported.sendFamilySafetyAlerts().sent, 1);
});

test('a safety flag from Gemini alone also pushes, and the singular reads right', () => {
  const fx = setUp([MAIL.student]);
  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  fx.exported.scanFamilyMail();
  assert.equal(fx.exported.sendFamilySafetyAlerts().sent, 0, 'nothing tripped yet');
  playFlow(fx.ss, () => ({ is_family: true, category: 'safety_wellbeing', urgency: 5, safety: true, ask: '', due: '' }));
  fx.exported.harvestFamilyMailReturns();
  assert.equal(fx.exported.sendFamilySafetyAlerts().sent, 1);
  assert.equal(fx.pushes[0].body, 'A family message needs you now. Open Gmail, label KOS/Family/Now.');
});

test('safety pushes stop at the daily cap, and an old message is not pushed', () => {
  const old = {
    id: 'o1', threadId: 'to1', internalDate: now - 30 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'x', body: 'I want to hurt myself.',
  };
  const fx = setUp([old]);
  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  fx.exported.scanFamilyMail();
  assert.equal(fx.exported.sendFamilySafetyAlerts().sent, 0, 'older than 24 hours');

  const fresh = setUp([Object.assign({}, old, { id: 'f1', threadId: 'tf1', internalDate: now - 1 * HOUR })]);
  fresh.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  const day = fresh.sandbox.Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd');
  fresh.props.setProperty('FAMILY_ALERT_COUNT_' + day, '10');
  fresh.exported.scanFamilyMail();
  const out = fresh.exported.sendFamilySafetyAlerts();
  assert.equal(out.sent, 0);
  assert.equal(out.reason, 'daily cap reached');
});

test('makeFamilyAlertTopic makes one private topic and keeps it; the test push uses it', () => {
  const fx = setUp([]);
  assert.throws(() => fx.exported.sendFamilyAlertTest(), /makeFamilyAlertTopic/);
  const made = fx.exported.makeFamilyAlertTopic();
  assert.equal(made.created, true);
  assert.match(made.topic, /^kos-[0-9a-f]{32}$/);
  assert.equal(fx.exported.makeFamilyAlertTopic().topic, made.topic, 'not replaced unless asked');
  assert.notEqual(fx.exported.makeFamilyAlertTopic(true).topic, made.topic);
  fx.exported.sendFamilyAlertTest();
  assert.equal(fx.pushes.length, 1);
  assert.equal(fx.pushes[0].headers.Priority, 'default');
});

test('the notification fixture pushes a TEST through the real alert path and cleans up', () => {
  const fx = setUp([]);
  const noTopic = fx.exported.runFamilySafetyAlertFixture();
  assert.equal(noTopic.ok, false, 'no topic yet');
  assert.equal(rows(fx.ss, 'FamilyMailLog').length, 0, 'fixture row removed even on failure');

  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  const out = fx.exported.runFamilySafetyAlertFixture();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(fx.pushes.length, 1);
  assert.equal(fx.pushes[0].headers.Title, 'KOS TEST');
  assert.equal(fx.pushes[0].headers.Priority, 'urgent');
  assert.equal(fx.pushes[0].body, 'Test: A family message needs you now. Open Gmail, label KOS/Family/Now.');
  assert.equal(rows(fx.ss, 'FamilyMailLog').length, 0);
  assert.equal(fx.exported.writeFamilySignal().open, 0, 'never in the signal doc');

  // A failing push fails the fixture.
  fx.urlFetch.failWith = 500;
  assert.equal(fx.exported.runFamilySafetyAlertFixture().ok, false);
});

test('a real safety message due alongside a fixture gets a real push', () => {
  const safe = {
    id: 's9', threadId: 'ts9', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'help', body: 'I want to hurt myself.',
  };
  const fx = setUp([safe]);
  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  fx.exported.scanFamilyMail();
  fx.exported.runFamilySafetyAlertFixture();
  assert.equal(fx.pushes[0].headers.Title, 'KOS');
  assert.equal(fx.pushes[0].body, '2 family messages need you now. Open Gmail, label KOS/Family/Now.');
});

test('the tripwire matches whole words only', () => {
  const msg = {
    id: 'm9', threadId: 't9', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'Project',
    body: 'I have begun the project and the shotgun start is fine.',
  };
  const fx = setUp([msg]);
  assert.equal(fx.exported.scanFamilyMail().safety, 0);
});

test('a reply in a thread that is already family mail is family mail, named or not', () => {
  const reply = {
    id: 'm1r', threadId: 't1', internalDate: now - 1 * HOUR,
    from: 'Someone <someone@example.org>', subject: 'Re: Makeup test', body: 'Following up on this. Thanks!',
  };
  const fx = setUp([MAIL.student]);
  fx.exported.scanFamilyMail();
  fx.gmail.Users.Messages.list = () => ({ messages: [{ id: 'm1', threadId: 't1' }, { id: 'm1r', threadId: 't1' }] });
  const getOrig = fx.gmail.Users.Messages.get;
  fx.gmail.Users.Messages.get = (u, id, o) => id === 'm1r'
    ? { id: 'm1r', threadId: 't1', internalDate: String(reply.internalDate), payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: reply.from }, { name: 'Subject', value: reply.subject }], body: { data: Buffer.from(reply.body).toString('base64url') } } }
    : getOrig(u, id, o);
  assert.equal(fx.exported.scanFamilyMail().queued, 1);
  const LOG = fx.exported.FMS_LOG;
  const a = logByMessage(fx.ss, LOG, 'm1');
  const b = logByMessage(fx.ss, LOG, 'm1r');
  assert.equal(b[LOG.SOURCE], 'student');
  assert.equal(b[LOG.COURSE], '8175');
  assert.equal(b[LOG.FAMILY_KEY], a[LOG.FAMILY_KEY]);
});

test('each scan asks Gmail only for mail since the last scan, less an hour', () => {
  const fx = setUp([]);
  const queries = [];
  fx.gmail.Users.Messages.list = (u, opts) => { queries.push(opts.q); return { messages: [] }; };
  const before = Date.now();
  fx.exported.scanFamilyMail();
  fx.exported.scanFamilyMail();
  const after1 = Number(/after:(\d+)/.exec(queries[0])[1]) * 1000;
  const after2 = Number(/after:(\d+)/.exec(queries[1])[1]) * 1000;
  assert.ok(Math.abs(after1 - (before - 48 * HOUR)) < 5000, 'first scan looks back 48 hours');
  assert.ok(Math.abs(after2 - (before - 1 * HOUR)) < 5000, 'later scans look back to the last scan less an hour');
  assert.match(queries[0], /-in:sent -in:chats -in:spam -in:trash/);
});

test('coursework words do not trip the safety check', () => {
  const msg = {
    id: 'm10', threadId: 't10', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'Five forces',
    body: 'Is the threat of new entrants high for a stadium? Also the threats in my SWOT.',
  };
  const fx = setUp([msg]);
  assert.equal(fx.exported.scanFamilyMail().safety, 0);
});

// ── Harvest ─────────────────────────────────────────────────────────────────

test('harvest applies a good answer and deletes the mail text', () => {
  const fx = setUp([MAIL.student]);
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, () => ({ is_family: true, category: 'absence_makeup', urgency: 3, safety: false, ask: 'The student asks when to make up the quiz.', due: 'Tuesday' }));
  const out = fx.exported.harvestFamilyMailReturns();
  assert.equal(out.classified, 1);
  const LOG = fx.exported.FMS_LOG;
  const row = logByMessage(fx.ss, LOG, 'm1');
  assert.equal(row[LOG.STATUS], 'CLASSIFIED');
  assert.equal(row[LOG.ASK], 'The student asks when to make up the quiz.');
  assert.equal(row[LOG.DUE], 'Tuesday');
  assert.equal(rows(fx.ss, 'FamilyMailInput').length, 0, 'mail text is deleted once answered');
  assert.equal(rows(fx.ss, 'FamilyMailReturn').length, 0);
});

test('an ask that names someone, or is not grounded, is withheld', () => {
  const second = Object.assign({}, MAIL.student, { id: 'm1b', threadId: 't1b' });
  const fx = setUp([MAIL.student, second]);
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, (itemId) => itemId === 'FMS-m1'
    ? { is_family: true, category: 'absence_makeup', urgency: 3, safety: false, ask: 'Jordan asks about the quiz.', due: '' }
    : { is_family: true, category: 'absence_makeup', urgency: 3, safety: false, ask: 'Wants tickets to the basketball tournament.', due: '' });
  fx.exported.harvestFamilyMailReturns();
  const LOG = fx.exported.FMS_LOG;
  const named = logByMessage(fx.ss, LOG, 'm1');
  assert.equal(named[LOG.ASK], '');
  assert.match(named[LOG.NOTE], /named someone/);
  const ungrounded = logByMessage(fx.ss, LOG, 'm1b');
  assert.equal(ungrounded[LOG.ASK], '');
  assert.match(ungrounded[LOG.NOTE], /not grounded/);
});

test('an ask naming someone off the roster, by title or a capitalized name, is withheld', () => {
  const ids = ['m1', 'm1d', 'm1e'];
  const msgs = ids.map((id, i) => Object.assign({}, MAIL.student, { id, threadId: 't' + id }));
  const fx = setUp(msgs);
  fx.exported.scanFamilyMail();
  const asks = {
    'FMS-m1': 'Mrs. Smith asks when to make up the quiz.',
    'FMS-m1d': 'The student and Tyler ask when to make up the quiz.',
    'FMS-m1e': 'The student asks to make up the quiz on Tuesday in Canvas.',
  };
  playFlow(fx.ss, (itemId) => ({ is_family: true, category: 'absence_makeup', urgency: 3, safety: false, ask: asks[itemId], due: '' }));
  fx.exported.harvestFamilyMailReturns();
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'm1')[LOG.ASK], '');
  assert.equal(logByMessage(fx.ss, LOG, 'm1d')[LOG.ASK], '');
  assert.equal(logByMessage(fx.ss, LOG, 'm1e')[LOG.ASK], asks['FMS-m1e'], 'days and known terms are fine');
});

test('a sensitive category keeps no ask, and an unusable answer is FAILED, not retried', () => {
  const second = Object.assign({}, MAIL.student, { id: 'm1c', threadId: 't1c' });
  const fx = setUp([MAIL.student, second]);
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, (itemId) => itemId === 'FMS-m1'
    ? { is_family: true, category: 'accommodation', urgency: 3, safety: false, ask: 'The student asks about the quiz.', due: '' }
    : 'Sure! Here is my analysis: it is about a quiz.');
  fx.exported.harvestFamilyMailReturns();
  const LOG = fx.exported.FMS_LOG;
  const sensitive = logByMessage(fx.ss, LOG, 'm1');
  assert.equal(sensitive[LOG.SENSITIVE], true);
  assert.equal(sensitive[LOG.ASK], '');
  const failed = logByMessage(fx.ss, LOG, 'm1c');
  assert.equal(failed[LOG.STATUS], 'FAILED');
  assert.equal(rows(fx.ss, 'FamilyMailInput').length, 0);
});

test('an input row unanswered for 48 hours is deleted and its message kept as UNCLASSIFIED', () => {
  const fx = setUp([MAIL.student]);
  fx.exported.scanFamilyMail();
  const input = fx.ss.getSheetByName('FamilyMailInput');
  input.getRange(2, 3).setValue(new fx.sandbox.Date(Date.now() - 49 * HOUR));
  const out = fx.exported.harvestFamilyMailReturns();
  assert.equal(out.expired, 1);
  assert.equal(rows(fx.ss, 'FamilyMailInput').length, 0);
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'm1')[LOG.STATUS], 'UNCLASSIFIED');
});

// ── The signal doc ──────────────────────────────────────────────────────────

test('the signal doc lists waiting threads by urgency, names nobody, and skips answered ones', () => {
  const reply = { id: 'r2', threadId: 't2', internalDate: now - 3 * HOUR, from: OPERATOR, labelIds: ['SENT'] };
  const fx = setUp([MAIL.student, MAIL.parent, MAIL.colleague, reply],
    { contacts: [['pat.lopez@example.com', 'mlopez@student.ccpsnet.net', '']] });
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, (itemId) => ({
    'FMS-m1': { is_family: true, category: 'absence_makeup', urgency: 3, safety: false, ask: 'The student asks when to make up the quiz.', due: 'Tuesday' },
    'FMS-m2': { is_family: true, category: 'grade_question', urgency: 4, safety: false, ask: 'The parent asks to explain the rubric score.', due: '' },
    'FMS-m3': { is_family: true, category: 'scheduling', urgency: 4, safety: false, ask: 'A colleague asks to schedule a meeting this week.', due: 'this week' },
  })[itemId]);
  fx.exported.harvestFamilyMailReturns();
  const result = fx.exported.writeFamilySignal();
  assert.equal(result.open, 2, 'the parent thread was answered');

  const text = signalText(fx.sandbox, fx.props);
  assert.match(text, /^KOS_FAMILY_SIGNAL\nGenerated at: /);
  const lines = text.split('\n');
  const first = lines.find((l) => l.startsWith('#1 '));
  const second = lines.find((l) => l.startsWith('#2 '));
  assert.match(first, /^#1 · 8175 P3 · from a colleague · meeting request · A colleague asks to schedule a meeting this week · waiting 2 h/);
  assert.match(second, /^#2 · 8175 P3 · from a student · absence or makeup · The student asks when to make up the quiz · waiting 20 h · 2nd contact this week · due Tuesday/);
  assert.match(text, /ANSWERED IN THE LAST 7 DAYS: 1, median reply 2 h\./);
  assert.doesNotMatch(text, /jordan|rivers|maya|lopez|pat\b|@|555|rubric/i);

  const doc = fx.sandbox.DocumentApp.openById(fx.props.getProperty('FAMILY_SIGNAL_DOC_ID'));
  const linked = doc.getBody().paragraphs.find((p) => p.getText().startsWith('#1 '));
  assert.deepEqual(linked.links.map((l) => l.text), ['open']);
  assert.match(linked.links[0].url, /^https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/t3$/);
});

test('a sensitive thread shows no course, period or ask', () => {
  const fx = setUp([MAIL.student]);
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, () => ({ is_family: true, category: 'health', urgency: 3, safety: false, ask: '', due: '' }));
  fx.exported.harvestFamilyMailReturns();
  fx.exported.writeFamilySignal();
  const line = signalText(fx.sandbox, fx.props).split('\n').find((l) => l.startsWith('#1 '));
  assert.equal(line, '#1 · sensitive · waiting 20 h · open');
});

// ── A run Studio dropped ────────────────────────────────────────────────────

// Backdates every FamilyMailInput row's Queued_At.
function ageInputs(fx, hours) {
  const sh = fx.ss.getSheetByName('FamilyMailInput');
  for (let r = 2; r <= sh.getLastRow(); r++) sh.getRange(r, 3).setValue(new fx.sandbox.Date(Date.now() - hours * HOUR));
}

test('a READY input unanswered for 30 minutes is written again, at most twice, and not sooner', () => {
  const fx = setUp([MAIL.student]);
  fx.exported.scanFamilyMail();
  assert.equal(fx.exported.runFamilySentinel().retried, 0, 'just queued: Studio may still answer');
  ageInputs(fx, 1);
  assert.equal(fx.exported.runFamilySentinel().retried, 1);
  let input = rows(fx.ss, 'FamilyMailInput');
  assert.deepEqual(input.map((r) => [r[0], r[1]]), [['FMS-m1', 'RETRIED'], ['FMS-m1', 'READY']]);
  assert.equal(input[1][3], input[0][3], 'the same prompt');
  assert.equal(fx.exported.checkFamilyMailFlowBinding().waitingInputs, 1, 'a RETRIED row is not waiting');
  assert.equal(fx.exported.runFamilySentinel().retried, 0, 'the copy is new');
  ageInputs(fx, 1);
  assert.equal(fx.exported.runFamilySentinel().retried, 1);
  ageInputs(fx, 1);
  assert.equal(fx.exported.runFamilySentinel().retried, 0, 'two retries, then it waits for the 48 hours');
  assert.equal(rows(fx.ss, 'FamilyMailInput').filter((r) => r[1] === 'READY').length, 1);
});

test('an answer to a retried message deletes every copy; one past 48 hours from its first queueing is UNCLASSIFIED', () => {
  const fx = setUp([MAIL.student]);
  fx.exported.scanFamilyMail();
  ageInputs(fx, 1);
  fx.exported.runFamilySentinel();
  const ret = fx.ss.getSheetByName('FamilyMailReturn');
  ret.appendRow([new Date(), 'FMS-m1', JSON.stringify(NO_REPLY)]);
  fx.exported.harvestFamilyMailReturns();
  assert.equal(rows(fx.ss, 'FamilyMailInput').length, 0, 'the original and its copy are both gone');
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'm1')[LOG.STATUS], 'CLASSIFIED');

  const late = setUp([MAIL.student]);
  late.exported.scanFamilyMail();
  ageInputs(late, 1);
  late.exported.runFamilySentinel();
  // The original was queued 49 hours ago; its copy only an hour ago.
  late.ss.getSheetByName('FamilyMailInput').getRange(2, 3).setValue(new late.sandbox.Date(Date.now() - 49 * HOUR));
  assert.equal(late.exported.harvestFamilyMailReturns().expired, 1);
  assert.equal(rows(late.ss, 'FamilyMailInput').length, 0, 'mail text is never kept past 48 hours');
  assert.equal(logByMessage(late.ss, LOG, 'm1')[LOG.STATUS], 'UNCLASSIFIED');
});

test('the fixture row is never retried, and at most five rows are written again per run', () => {
  const many = Array.from({ length: 7 }, (_, i) => Object.assign({}, MAIL.student, { id: 'r' + i, threadId: 'tr' + i }));
  const fx = setUp(many);
  fx.exported.scanFamilyMail();
  fx.exported.installFamilyMailFixture();
  ageInputs(fx, 1);
  assert.equal(fx.exported.runFamilySentinel().retried, 5);
  const fixture = rows(fx.ss, 'FamilyMailInput').filter((r) => String(r[0]).startsWith('FMS-FIXTURE-'));
  assert.deepEqual(fixture.map((r) => r[1]), ['READY']);

  const alone = setUp([]);
  alone.exported.installFamilyMailFixture();
  ageInputs(alone, 1);
  assert.equal(alone.exported.runFamilySentinel().retried, 0, 'the fixture alone is not retried');
});

// ── Fixture, checks and the trigger ─────────────────────────────────────────

test('the fixture is answered through the harvest and proves liveness, and never reaches the signal doc', () => {
  const fx = setUp([]);
  assert.equal(fx.exported.checkFamilyMailFlowLiveness().answered, false);
  const installed = fx.exported.installFamilyMailFixture();
  assert.equal(installed.installed, true);
  assert.equal(fx.exported.installFamilyMailFixture().installed, false, 'idempotent per day');
  const ready = rows(fx.ss, 'FamilyMailInput');
  assert.equal(ready.length, 1);
  assert.equal(ready[0][1], 'READY');
  assert.doesNotMatch(String(ready[0][3]).slice(fx.exported.FAMILY_MAIL_TRIAGE_PROMPT.length), /jordan|rivers/i);

  playFlow(fx.ss, () => ({ is_family: true, category: 'absence_makeup', urgency: 3, safety: false, ask: 'The parent asks when the makeup test can be taken.', due: 'Thursday' }));
  assert.equal(fx.exported.checkFamilyMailFlowBinding().ok, true);
  assert.equal(fx.exported.harvestFamilyMailReturns().fixtures, 1);
  const live = fx.exported.checkFamilyMailFlowLiveness();
  assert.equal(live.answered, true);
  assert.equal(live.fixtures, 1);
  assert.equal(live.real, 0);
  assert.equal(fx.exported.writeFamilySignal().open, 0);
});

test('binding flags an answer that matches no Item_ID', () => {
  const fx = setUp([]);
  fx.ss.getSheetByName('FamilyMailReturn').appendRow([new Date(), 'Primary_JSON went here', '{"category":"other"}']);
  const out = fx.exported.checkFamilyMailFlowBinding();
  assert.equal(out.ok, false);
  assert.equal(out.unmatched, 1);
  assert.ok(out.binding.some((l) => /FamilyMailInput/.test(l)));
});

test('the canary passes with the Flow stubbed, and leaves nothing behind', () => {
  const fx = setUp([]);
  const out = fx.exported.runFamilyMailCanary();
  assert.equal(out.ok, true, out.problems.join('; '));
  assert.equal(rows(fx.ss, 'FamilyMailInput').length, 0);
  assert.equal(rows(fx.ss, 'FamilyMailLog').length, 0);
});

test('preflight passes once set up and the trigger is installed', () => {
  const fx = setUp([]);
  assert.equal(fx.exported.runFamilySentinelPreflight().ok, false, 'no trigger yet');
  fx.exported.installFamilySentinelTrigger();
  assert.equal(fx.exported.installFamilySentinelTrigger().installed, false);
  const noText = fx.exported.runFamilySentinelPreflight();
  assert.equal(noText.ok, false, 'no ntfy topic yet');
  assert.match(noText.checks.find((c) => c.name === 'safety pushes').detail, /FAMILY_ALERT_NTFY_TOPIC not set/);
  fx.props.setProperty('FAMILY_ALERT_NTFY_TOPIC', 'kos-abc123');
  const out = fx.exported.runFamilySentinelPreflight();
  assert.equal(out.ok, true, JSON.stringify(out.checks.filter((c) => !c.ok)));
});

test('the 15-minute trigger scans, harvests and writes the signal, and honours the off switch', () => {
  const fx = setUp([MAIL.student]);
  const first = fx.exported.runFamilySentinel();
  assert.equal(first.scan.queued, 1);
  assert.equal(first.signal.open, 1);
  assert.match(signalText(fx.sandbox, fx.props), /#1 · 8175 P3 · from a student · not yet classified · waiting 20 h · open/);

  fx.props.setProperty('FAMILY_SENTINEL_ENABLED', 'false');
  assert.equal(fx.exported.runFamilySentinel().skipped, true);
});

// ── The prompt's one source (FLOW_DOCTRINE rule 16) ─────────────────────────

test('61_FamilyMailPrompt.js is generated from FAMILY_MAIL_TRIAGE_PROMPT.md', () => {
  const gen = require('../../tools/cas-ccps/generate-family-mail-prompt.js');
  const expected = gen.render(gen.extractPrompt(fs.readFileSync(gen.SOURCE_PATH, 'utf8')));
  assert.equal(fs.readFileSync(gen.TARGET_PATH, 'utf8'), expected,
    'Edit cas-ccps/docs/FAMILY_MAIL_TRIAGE_PROMPT.md and run node tools/cas-ccps/generate-family-mail-prompt.js');
  assert.match(gen.extractPrompt(fs.readFileSync(gen.SOURCE_PATH, 'utf8')), /MESSAGE TO TRIAGE:$/);
});

// ── Two tiers: WAITING ON YOU and FOR YOUR EYES ─────────────────────────────

// The WAITING ON YOU block (with NEEDS YOU NOW) and the FOR YOUR EYES block.
function tiers(text) {
  const at = text.indexOf('FOR YOUR EYES:');
  const end = text.indexOf('ANSWERED IN THE LAST');
  return { waiting: text.slice(0, at), eyes: text.slice(at, end) };
}

const NO_REPLY = { is_family: true, category: 'praise_thanks', urgency: 1, safety: false,
  ask: 'The student thanks the class for the quiz review.', due: '', needs_reply: false };

// One student message, answered with `answer`, then the signal doc.
function oneMessage(answer, extra) {
  const fx = setUp([MAIL.student].concat(extra || []));
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, () => answer);
  fx.exported.harvestFamilyMailReturns();
  const result = fx.exported.writeFamilySignal();
  return Object.assign(fx, { result, text: signalText(fx.sandbox, fx.props) });
}

test('needs_reply false puts a thread under FOR YOUR EYES: course, category, ask and wait, never urgent', () => {
  const fx = oneMessage(NO_REPLY);
  assert.deepEqual([fx.result.waiting, fx.result.eyes], [0, 1]);
  const t = tiers(fx.text);
  assert.match(t.waiting, /WAITING ON YOU: none\./);
  assert.match(t.eyes, /^FOR YOUR EYES: 1, oldest 20 h\.\n#1 · 8175 P3 · thanks · The student thanks the class for the quiz review · waiting 20 h · open\n/);
  assert.doesNotMatch(t.eyes, /urgent|from a student|contact/);
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'm1')[LOG.NEEDS_REPLY], false);
});

test('a missing needs_reply counts as needing a reply', () => {
  const answer = Object.assign({}, NO_REPLY);
  delete answer.needs_reply;
  const fx = oneMessage(answer);
  assert.deepEqual([fx.result.waiting, fx.result.eyes], [1, 0]);
  assert.match(tiers(fx.text).eyes, /FOR YOUR EYES: none\./);
});

test('override: a safety flag forces a reply (NEEDS YOU NOW), whatever Gemini says', () => {
  // The tripwire flags it; Gemini calls it a harmless thank-you.
  const tripped = Object.assign({}, MAIL.student, { body: 'Thanks for class. Some kids keep bullying me at lunch.' });
  const fx = setUp([tripped]);
  fx.exported.scanFamilyMail();
  playFlow(fx.ss, () => NO_REPLY);
  fx.exported.harvestFamilyMailReturns();
  const out = fx.exported.writeFamilySignal();
  assert.deepEqual([out.waiting, out.eyes], [1, 0]);
  assert.match(tiers(signalText(fx.sandbox, fx.props)).waiting, /NEEDS YOU NOW: 1 message[\s\S]*WAITING ON YOU: 1,/);
});

test('override: a sensitive category forces a reply', () => {
  const fx = oneMessage(Object.assign({}, NO_REPLY, { category: 'health', ask: '' }));
  assert.equal(fx.result.waiting, 1);
  assert.match(tiers(fx.text).waiting, /#1 · sensitive · waiting 20 h · open/);
});

test('override: urgency 4 or more forces a reply', () => {
  const fx = oneMessage(Object.assign({}, NO_REPLY, { urgency: 4 }));
  assert.equal(fx.result.waiting, 1);
  assert.match(tiers(fx.text).waiting, /#1 · .* · urgent · open/);
});

test('override: a due date forces a reply', () => {
  const fx = oneMessage(Object.assign({}, NO_REPLY, { due: 'Friday' }));
  assert.equal(fx.result.waiting, 1);
  assert.match(tiers(fx.text).waiting, /due Friday/);
});

test('override: a family\'s 2nd contact this week forces a reply', () => {
  const again = Object.assign({}, MAIL.student, { id: 'm1x', threadId: 't1x', internalDate: now - 4 * HOUR,
    subject: 'Thanks again', body: 'Thanks for the quiz review today, it helped.' });
  const fx = oneMessage(NO_REPLY, [again]);
  assert.deepEqual([fx.result.waiting, fx.result.eyes], [2, 0]);
  assert.match(tiers(fx.text).waiting, /2nd contact this week/);
});

test('override: no classification (Flow down, or a bad answer) forces a reply', () => {
  const down = setUp([MAIL.student]);
  down.exported.scanFamilyMail();
  assert.equal(down.exported.writeFamilySignal().waiting, 1, 'still queued: the Flow has not answered');

  const bad = oneMessage('Sure! It is a thank-you note.');
  assert.deepEqual([bad.result.waiting, bad.result.eyes], [1, 0]);
  assert.match(tiers(bad.text).waiting, /couldn't classify/);
  // Even a stray FALSE in Needs_Reply can't hide an unclassified message.
  const LOG = bad.exported.FMS_LOG;
  bad.ss.getSheetByName('FamilyMailLog').getRange(2, LOG.NEEDS_REPLY + 1).setValue(false);
  assert.equal(bad.exported.writeFamilySignal().waiting, 1);
});

test('a needs-reply message in a FOR YOUR EYES thread moves it to WAITING ON YOU', () => {
  const fx = oneMessage(NO_REPLY);
  assert.equal(fx.result.eyes, 1);
  const follow = { id: 'm1n', threadId: 't1', internalDate: now - 1 * HOUR,
    from: 'Jordan Rivers <jrivers@student.ccpsnet.net>', subject: 'Re: Makeup test',
    body: 'Also, can I still turn in the quiz corrections?' };
  fx.gmail.Users.Messages.list = () => ({ messages: [{ id: 'm1n', threadId: 't1' }] });
  const getOrig = fx.gmail.Users.Messages.get;
  fx.gmail.Users.Messages.get = (u, id, o) => id === 'm1n'
    ? { id: 'm1n', threadId: 't1', internalDate: String(follow.internalDate), payload: { mimeType: 'text/plain',
      headers: [{ name: 'From', value: follow.from }, { name: 'Subject', value: follow.subject }],
      body: { data: Buffer.from(follow.body).toString('base64url') } } }
    : getOrig(u, id, o);
  assert.equal(fx.exported.scanFamilyMail().queued, 1);
  playFlow(fx.ss, () => ({ is_family: true, category: 'assignment_help', urgency: 2, safety: false,
    ask: 'The student asks to turn in quiz corrections.', due: '', needs_reply: true }));
  fx.exported.harvestFamilyMailReturns();
  // Isolate the needs-reply rule from the 2nd-contact rule.
  const LOG = fx.exported.FMS_LOG;
  const log = fx.ss.getSheetByName('FamilyMailLog');
  const all = rows(fx.ss, 'FamilyMailLog');
  log.getRange(all.findIndex((r) => r[LOG.MESSAGE_ID] === 'm1n') + 2, LOG.FAMILY_KEY + 1).setValue('another-key');
  const out = fx.exported.writeFamilySignal();
  assert.deepEqual([out.waiting, out.eyes], [1, 0]);
  assert.match(tiers(signalText(fx.sandbox, fx.props)).waiting, /#1 · 8175 P3 · from a student · assignment help/);
});

test('an archived thread (no message in INBOX) is in neither list', () => {
  // Both filed out of INBOX: one would be FOR YOUR EYES, the other WAITING.
  const archived = Object.assign({}, MAIL.student, { labelIds: ['Label_1'] });
  const waitingToo = setUp([Object.assign({}, MAIL.parent, { labelIds: [] }), archived],
    { contacts: [['pat.lopez@example.com', 'mlopez@student.ccpsnet.net', '']] });
  waitingToo.exported.scanFamilyMail();
  playFlow(waitingToo.ss, (itemId) => itemId === 'FMS-m1' ? NO_REPLY
    : { is_family: true, category: 'grade_question', urgency: 4, safety: false, ask: 'The parent asks to explain the rubric score.', due: '' });
  waitingToo.exported.harvestFamilyMailReturns();
  const out = waitingToo.exported.writeFamilySignal();
  assert.deepEqual([out.open, out.waiting, out.eyes], [0, 0, 0]);
  const text = signalText(waitingToo.sandbox, waitingToo.props);
  assert.match(text, /WAITING ON YOU: none\.\n\nFOR YOUR EYES: none\./);
  assert.equal(oneMessage(NO_REPLY).result.eyes, 1, 'the same message left in INBOX is listed');
});

test('an existing 17-column FamilyMailLog gets the Needs_Reply header', () => {
  const fx = setUp([], { beforeSetup: (ss) => {
    ss.insertSheet('FamilyMailLog').appendRow(
      ['Message_ID', 'Thread_ID', 'Received_At', 'Source', 'Family_Key', 'Course', 'Period', 'Status', 'Category',
        'Urgency', 'Safety', 'Sensitive', 'Ask', 'Due', 'Classified_At', 'Note', 'Alerted_At']);
  } });
  const sh = fx.ss.getSheetByName('FamilyMailLog');
  assert.deepEqual(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], fx.exported.FMS_LOG_HEADERS);
});

// ── System senders ──────────────────────────────────────────────────────────

const SYSTEM = {
  docs: {
    id: 'g1', threadId: 'tg1', internalDate: now - 2 * HOUR,
    from: 'Jordan Rivers (Google Docs) <comments-noreply@docs.google.com>', subject: 'Jordan Rivers commented',
    body: 'Jordan Rivers replied to a comment on Marketing Plan.',
  },
  drive: {
    id: 'g2', threadId: 'tg2', internalDate: now - 2 * HOUR,
    from: 'Maya Lopez (via Google Drive) <drive-shares-dm-noreply@google.com>', subject: 'Document shared with you',
    body: 'Maya Lopez shared a document with you.',
  },
  classroom: {
    id: 'g3', threadId: 'tg3', internalDate: now - 2 * HOUR,
    from: 'Google Classroom <no-reply@classroom.google.com>', subject: 'New private comment',
    body: 'Jordan Rivers added a private comment.',
  },
};

test('Google system senders are never family mail, even naming a student or in a family thread', () => {
  const inThread = Object.assign({}, SYSTEM.docs, { id: 'g4', threadId: 't1' });
  const fx = setUp([MAIL.student, SYSTEM.docs, SYSTEM.drive, SYSTEM.classroom, inThread]);
  const out = fx.exported.scanFamilyMail();
  assert.equal(out.queued, 1, 'only the student\'s own message');
  ['tg1', 'tg2', 'tg3'].forEach((t) => assert.deepEqual(fx.gmail.labelNames(t), []));
  const LOG = fx.exported.FMS_LOG;
  ['g1', 'g2', 'g3', 'g4'].forEach((id) => assert.equal(logByMessage(fx.ss, LOG, id), undefined));
});

// A log written before system senders were excluded: rows for them, by hand.
function legacySetup() {
  const safetyDoc = Object.assign({}, SYSTEM.drive, { id: 'g5', threadId: 'tg5' });
  const mixedDoc = Object.assign({}, SYSTEM.classroom, { id: 'g6', threadId: 't1' });
  const fx = setUp([MAIL.student, SYSTEM.docs, safetyDoc, mixedDoc]);
  fx.exported.scanFamilyMail();
  const LOG = fx.exported.FMS_LOG;
  const labels = fx.gmail.Users.Labels.list().labels;
  const family = labels.find((l) => l.name === 'KOS/Family').id;
  const log = fx.ss.getSheetByName('FamilyMailLog');
  [[SYSTEM.docs, false], [safetyDoc, true], [mixedDoc, false]].forEach(([m, safety]) => {
    const row = new Array(fx.exported.FMS_LOG_HEADERS.length).fill('');
    row[LOG.MESSAGE_ID] = m.id; row[LOG.THREAD_ID] = m.threadId; row[LOG.RECEIVED_AT] = new Date(m.internalDate);
    row[LOG.SOURCE] = 'external'; row[LOG.FAMILY_KEY] = 'k-' + m.id; row[LOG.STATUS] = 'CLASSIFIED';
    row[LOG.CATEGORY] = 'other'; row[LOG.URGENCY] = 2; row[LOG.SAFETY] = safety; row[LOG.SENSITIVE] = safety;
    log.appendRow(row);
    fx.gmail.Users.Threads.modify({ addLabelIds: [family] }, 'me', m.threadId);
  });
  return fx;
}

test('the backfill dry run counts system-sender threads and changes nothing', () => {
  const fx = legacySetup();
  const before = JSON.stringify(rows(fx.ss, 'FamilyMailLog'));
  const logs = [];
  fx.sandbox.Logger.log = (m) => logs.push(String(m));
  const out = fx.exported.reclassifySystemSenderThreads();
  assert.equal(out.dryRun, true);
  assert.deepEqual([out.reclassified, out.threads, out.labelsRemoved, out.keptSafety, out.keptLabelMixed],
    [2, 2, 1, 1, 1]);
  assert.equal(JSON.stringify(rows(fx.ss, 'FamilyMailLog')), before);
  assert.deepEqual(fx.gmail.labelNames('tg1'), ['KOS/Family']);
  assert.ok(logs.length && logs.every((l) => !/@|jordan|rivers|maya|lopez/i.test(l)), 'counts only');
});

test('the backfill marks system-sender rows NOT_FAMILY and unlabels their threads, keeping safety and mixed threads', () => {
  const fx = legacySetup();
  const out = fx.exported.reclassifySystemSenderThreadsNow();
  assert.equal(out.dryRun, false);
  const LOG = fx.exported.FMS_LOG;
  assert.equal(logByMessage(fx.ss, LOG, 'g1')[LOG.STATUS], 'NOT_FAMILY');
  assert.deepEqual(fx.gmail.labelNames('tg1'), [], 'label removed');
  assert.equal(logByMessage(fx.ss, LOG, 'g5')[LOG.STATUS], 'CLASSIFIED', 'a safety flag is left for a person');
  assert.deepEqual(fx.gmail.labelNames('tg5'), ['KOS/Family']);
  assert.equal(logByMessage(fx.ss, LOG, 'g6')[LOG.STATUS], 'NOT_FAMILY');
  assert.deepEqual(fx.gmail.labelNames('t1'), ['KOS/Family'], 'the family message keeps its thread labeled');
  assert.equal(logByMessage(fx.ss, LOG, 'm1')[LOG.STATUS], 'QUEUED', 'real family mail untouched');
  assert.equal(fx.exported.reclassifySystemSenderThreadsNow().reclassified, 0, 'a second run finds nothing');
});

// ── Compound surnames ───────────────────────────────────────────────────────

test('full names with hyphenated and multi-word surnames match, in either order, and are redacted', () => {
  // Roster emails are only lookup keys here, so not student-domain addresses.
  const roster = [
    { email: 'avery.sj@example.test', name: 'Smith-Jones, Avery', course: '8175', period: '2' },
    { email: 'ana.dlc@example.test', name: 'De La Cruz, Ana', course: '8177', period: '4' },
    { email: 'riley.vd@example.test', name: 'Riley Van Dorn', course: '8175', period: '1' },
  ];
  const mail = [
    ['c1', 'Can we talk about Avery Smith-Jones this week?'],
    ['c2', 'Checking on Smith Jones, Avery and the project.'],
    ['c3', 'Ana De La Cruz was out today.'],
    ['c4', 'De La Cruz, Ana needs the makeup quiz.'],
    ['c5', 'Riley Van Dorn asked about the field trip.'],
  ].map(([id, body]) => ({ id, threadId: 't' + id, internalDate: now - 2 * HOUR,
    from: 'Counselor <counselor@ccpsnet.net>', subject: 'Checking in', body }));
  const fx = setUp(mail, { roster });
  assert.equal(fx.exported.scanFamilyMail().queued, 5);
  const LOG = fx.exported.FMS_LOG;
  assert.deepEqual(['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => logByMessage(fx.ss, LOG, id)[LOG.PERIOD]),
    ['2', '2', '4', '4', '1']);
  rows(fx.ss, 'FamilyMailInput').forEach((r) => {
    const sent = String(r[3]).slice(fx.exported.FAMILY_MAIL_TRIAGE_PROMPT.length);
    assert.doesNotMatch(sent, /avery|smith|jones|cruz|riley|dorn/i);
  });
});
