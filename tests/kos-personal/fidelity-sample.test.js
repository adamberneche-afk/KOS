'use strict';
// kos-personal/27_FidelitySample.gs: the randomized closeout-fidelity check.
// Apps Script draws a newly ingested session log with the configured
// probability, asks for that session's transcript, notices when it
// arrives, and reports in the primer what waits on whom, what's overdue,
// and the observed rate against the configured one. It never judges a log.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '27_FidelitySample.gs'].map((f) => path.join(KP, f));
const LOG = 'KOS SESSION LOG — 2026-11-03 — Morning start\nSource: Claude Project\n\n[🧠 RTP — EXCHANGE 1]\n…';

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

test('a draw under the rate samples the log and asks for its transcript; one over it only counts the log', () => {
  const t = setup();
  assert.equal(t.x.sampleSessionLogForFidelity_('LOG-aaaa1111', LOG, new Date(), 0.95).sampled, false);
  const r = t.x.sampleSessionLogForFidelity_('LOG-bbbb2222', LOG, new Date(), 0.05);
  assert.equal(r.sampled, true);
  assert.equal(r.transcriptName, 'TRANSCRIPT — LOG-bbbb2222');
  const [row] = t.rows();
  assert.deepEqual([row[0], row[1], row[2], row[4], row[5]],
    ['LOG-bbbb2222', 'Morning start', '2026-11-03', 'REQUESTED', 'TRANSCRIPT — LOG-bbbb2222']);
  assert.match(t.x.fidelityLine_(new Date()), /^Fidelity sample: 1 drawn \(50% of 2 logs; set to 10%\), 0 compared\. Waiting on you: paste the full chat into a Google Doc named "TRANSCRIPT — LOG-bbbb2222" in 03\.6_SESSION_TRANSCRIPTS\./);
});

test('the rate is a setting; a bad value falls back to 10%', () => {
  const t = setup({ FIDELITY_SAMPLE_RATE: '0.5' });
  assert.equal(t.x.sampleSessionLogForFidelity_('LOG-1', LOG, new Date(), 0.4).sampled, true);
  const u = setup({ FIDELITY_SAMPLE_RATE: 'lots' });
  assert.equal(u.x.sampleSessionLogForFidelity_('LOG-1', LOG, new Date(), 0.4).sampled, false);
});

test('a transcript that arrives moves the sample to Claude Code; a stale one is called overdue', () => {
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
  assert.match(line, /Waiting on Claude Code: 1 transcript\(s\) to compare\./);
  assert.match(line, /OVERDUE \(over 7 days\): 1\./);
});

test('a comparison Claude Code recorded counts as compared', () => {
  const t = setup();
  t.x.sampleSessionLogForFidelity_('LOG-eeee5555', LOG, new Date(), 0);
  t.ss.getSheetByName('FIDELITY_AUDIT').getRange(2, 5, 1, 1).setValue('COMPARED');
  assert.match(t.x.fidelityLine_(new Date()), /1 drawn \(100% of 1 logs; set to 10%\), 1 compared\.$/);
});
