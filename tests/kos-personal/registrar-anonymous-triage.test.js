'use strict';
// Decision #5 (2026-10-19): intervention_triage runs anonymous. The alert
// and the briefing carry a role and a link, and the free text loses what a
// pattern can catch (emails, ID-length numbers, percentages). Synthetic
// text only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '11_Registrar_CogRelay.gs']
  .map((f) => path.join(KP, f));

test('the triage keeps a role and scrubs emails, IDs and percentages', () => {
  const { exported } = loadGasFiles(FILES, ['_anonymousTriage_']);
  const t = exported._anonymousTriage_({
    human_intervention_required: true,
    target_entity: 'student Pat Example',
    friction_source: 'a period 3 student (1234567, pat@example.org) is at 42% in Sports Marketing',
    pedagogical_gap_identified: '',
  });
  assert.equal(t.target_entity, 'unspecified', 'a name in the role field is dropped whole');
  assert.equal(t.friction_source, 'a period 3 student ([id], [email]) is at [grade] in Sports Marketing');
  assert.equal(t.pedagogical_gap_identified, 'unspecified');
  assert.equal(exported._anonymousTriage_({ target_entity: ' parent ' }).target_entity, 'Parent');
  assert.equal(exported._anonymousTriage_(undefined).human_intervention_required, false);
});

test('the kill-switch alert carries the scrubbed triage and a link', () => {
  const { exported, sandbox } = loadGasFiles(FILES, ['_translateAndRouteRegistrarRow', 'CFG']);
  const alerts = [];
  sandbox._sendChatAlert = (msg) => alerts.push(msg);
  sandbox._getSystemAsset = () => { throw new Error('no folder in this test'); };
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  const ledger = ss.insertSheet('REGISTRAR_LEDGER');
  ledger.appendRow(['File_ID', 'File_Name', 'State', 'Cog1_JSON', 'Cog2_JSON', 'Translation',
    'Attempt', 'Error_Log', 'TS_Intake', 'TS_Final']);
  const cog1 = JSON.stringify({ doc_uid: 'f1', intervention_triage: { human_intervention_required: true,
    target_entity: 'Student', friction_source: 'reach pat@example.org', pedagogical_gap_identified: 'ID 99887766' } });
  const row = ['f1', 'unit draft', 'READY_FOR_TRANSLATION', cog1, JSON.stringify({}), '', 0, '', '', ''];
  ledger.appendRow(row);
  exported._translateAndRouteRegistrarRow(ledger, 2, row);
  assert.equal(alerts.length, 1);
  assert.doesNotMatch(alerts[0], /example\.org|99887766/);
  assert.match(alerts[0], /Target: Student\n/);
  assert.match(alerts[0], /https:\/\/drive\.google\.com\/open\?id=f1/);
});
