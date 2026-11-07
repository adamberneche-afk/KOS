'use strict';
// kos-personal/27_FidelitySample.gs: the randomized closeout-fidelity check.
// Apps Script draws a newly ingested session log with the configured
// probability. The operator's paste is the whole chat with the log at its
// end, so a drawn log is compared against its own raw copy; only a log
// pasted without its chat asks for a transcript doc. The primer reports
// what waits on whom, what's overdue, and the observed rate against the
// configured one. Apps Script never judges a log.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '27_FidelitySample.gs'].map((f) => path.join(KP, f));
const LOG = 'KOS SESSION LOG — 2026-11-03 — Morning start\nSource: Claude Project\n\n[🧠 RTP — EXCHANGE 1]\n…\n\n[🧠 RTP — EXCHANGE 2]\n…';
// What the operator pastes: the chat (which may quote an earlier draft of
// the log), then the final log.
const CHAT = 'What is on today?\n' + 'The primer says… '.repeat(40) +
  '\nHere is a draft:\nKOS SESSION LOG — 2026-11-02 — An earlier draft\n…\nLog this\n\n';
const PASTE = CHAT + LOG;

function setup(props) {
  const env = loadGasFiles(FILES, ['sampleSessionLogForFidelity_', 'checkFidelitySamples', 'fidelityLine_', 'CFG']);
  const { exported: x, sandbox } = env;
  const p = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(x.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  p.setProperty('INDEX_ID', ss.getId());
  const kos = sandbox.DriveApp.getRootFolder().createFolder('03_STATE');
  sandbox.DriveApp._registerFolder(kos);
  const inbound = kos.createFolder('03.5_INBOUND_SESSIONS');
  sandbox.DriveApp._registerFolder(inbound);
  p.setProperty('ID_03_5_INBOUND_SESSIONS', inbound.getId());
  Object.entries(props || {}).forEach(([k, v]) => p.setProperty(k, v));
  const rows = () => { const s = ss.getSheetByName('FIDELITY_AUDIT'); return s ? s.getDataRange().getValues().slice(1) : []; };
  const transcriptsFolder = () => {
    const it = kos.getFoldersByName ? kos.getFoldersByName('03.6_SESSION_TRANSCRIPTS') : null;
    return it && it.hasNext() ? it.next() : null;
  };
  return { x, sandbox, ss, rows, kos, inbound, transcriptsFolder };
}

test('a drawn paste with its chat is ready to compare against its raw copy; nothing is asked of the operator', () => {
  const t = setup();
  assert.equal(t.x.sampleSessionLogForFidelity_('LOG-aaaa1111', PASTE, new Date(), 0.95).sampled, false);
  const r = t.x.sampleSessionLogForFidelity_('LOG-bbbb2222', PASTE, new Date(), 0.05);
  assert.deepEqual([r.sampled, r.transcriptName, r.needsTranscript], [true, '[RAW]_LOG-bbbb2222', false]);
  const [row] = t.rows();
  assert.deepEqual([row[0], row[1], row[2], row[4], row[5], row[10]],
    ['LOG-bbbb2222', 'Morning start', '2026-11-03', 'RECEIVED', '[RAW]_LOG-bbbb2222', 2],
    'the header and exchange count come from the final log, not the draft the chat quotes');
  assert.ok(row[9] >= 500, 'the chat before the log is measured');
  const line = t.x.fidelityLine_(new Date());
  assert.match(line, /^Fidelity sample: 1 drawn \(50% of 2 logs; set to 10%\), 0 compared\. Waiting on Claude Code: 1 log\(s\) to compare with the chat\.$/);
  assert.equal(t.transcriptsFolder(), null, 'no transcripts folder is made when nothing needs one');
});

test('a log pasted without its chat asks for the chat as a transcript doc', () => {
  const t = setup();
  const r = t.x.sampleSessionLogForFidelity_('LOG-ffff6666', LOG, new Date(), 0);
  assert.deepEqual([r.transcriptName, r.needsTranscript], ['TRANSCRIPT — LOG-ffff6666', true]);
  assert.deepEqual([t.rows()[0][4], t.rows()[0][9]], ['REQUESTED', 0]);
  assert.match(t.x.fidelityLine_(new Date()), /Waiting on you: that log was pasted without its chat; paste the whole chat into a Google Doc named "TRANSCRIPT — LOG-ffff6666" in 03\.6_SESSION_TRANSCRIPTS\./);
});

test('the rate is a setting; a bad value falls back to 10%', () => {
  const t = setup({ FIDELITY_SAMPLE_RATE: '0.5' });
  assert.equal(t.x.sampleSessionLogForFidelity_('LOG-1', PASTE, new Date(), 0.4).sampled, true);
  const u = setup({ FIDELITY_SAMPLE_RATE: 'lots' });
  assert.equal(u.x.sampleSessionLogForFidelity_('LOG-1', PASTE, new Date(), 0.4).sampled, false);
});

test('a fallback transcript that arrives moves the sample to Claude Code; a stale request is called overdue', () => {
  const t = setup();
  t.x.sampleSessionLogForFidelity_('LOG-cccc3333', LOG, new Date(), 0);
  t.x.sampleSessionLogForFidelity_('LOG-dddd4444', LOG, new Date(Date.now() - 9 * 86400000), 0);
  t.x.checkFidelitySamples(); // makes the transcripts folder, beside the inbound one
  const folder = t.transcriptsFolder();
  assert.ok(folder, 'created beside 03.5_INBOUND_SESSIONS, never inside it');
  const d = t.sandbox.DocumentApp.create('TRANSCRIPT — LOG-cccc3333');
  t.sandbox.DriveApp.getFileById(d.getId()).moveTo(folder);
  const line = t.x.fidelityLine_(new Date());
  assert.equal(t.rows()[0][4], 'RECEIVED');
  assert.match(line, /Waiting on you: .*"TRANSCRIPT — LOG-dddd4444"/);
  assert.match(line, /Waiting on Claude Code: 1 log\(s\) to compare with the chat\./);
  assert.match(line, /OVERDUE \(over 7 days\): 1\./);
});

test('a comparison Claude Code recorded counts as compared', () => {
  const t = setup();
  t.x.sampleSessionLogForFidelity_('LOG-eeee5555', PASTE, new Date(), 0);
  t.ss.getSheetByName('FIDELITY_AUDIT').getRange(2, 5, 1, 1).setValue('COMPARED');
  assert.match(t.x.fidelityLine_(new Date()), /1 drawn \(100% of 1 logs; set to 10%\), 1 compared\.$/);
});
