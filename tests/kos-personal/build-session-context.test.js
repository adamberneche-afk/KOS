'use strict';
// Regression test for buildSessionContext()'s new "CORE FACTS" section
// (9_UI_Diagnostics.gs, KOS/CAS roadmap synthesis 2.3 — "value-consistency
// drift"). This is the actual delivery mechanism for the feature: the live
// ALIGNMENT persona (a Gemini Gem system prompt, not GAS code) has no feed
// of pinned Core facts otherwise — it only ever sees this chat's own
// context window (PERSONA_ALIGNMENT_V5_1.md §2.2 Threshold D's own note).
// buildSessionContext() assembles that window's starting content; this
// test verifies the new section actually lands in it, the same injection
// point Frequency Drift's own inputs (VECTOR_MATRIX, RELATIONAL TARGETS)
// already use.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'kos-personal', '1_Config_And_Deploy.gs');
const UTILS_PATH  = path.join(__dirname, '..', '..', 'kos-personal', '5_Error_And_Utilities.gs');
const ROUTER_PATH = path.join(__dirname, '..', '..', 'kos-personal', '4_Vector_Router.gs');
const DIAG_PATH   = path.join(__dirname, '..', '..', 'kos-personal', '9_UI_Diagnostics.gs');

function load() {
  return loadGasFiles(
    [CONFIG_PATH, UTILS_PATH, ROUTER_PATH, DIAG_PATH],
    ['buildSessionContext', 'pinThemeToCore']
  );
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('INDEX_ID', ss.getId());
  // Pass _coldEngineGate's TIER_2 check — buildSessionContext() is gated
  // the same as every other armed-only operator tool.
  props.setProperty('IDENTITY_KEY', 'fake-identity-key');
  props.setProperty('CORE_THESIS_VERIFIED', 'true');
  return ss;
}

// buildSessionContext() has no return value (menu-item style: creates a
// doc, shows a UI alert) — reach into the sandbox's DocumentApp registry
// for the doc it just created, the same "reach into the sandbox directly"
// pattern loadGasFiles()'s own header comment endorses.
function latestDocText(sandbox) {
  const docs = [...sandbox.DocumentApp._docs.values()];
  return docs[docs.length - 1].getBody().getText();
}

test('buildSessionContext: includes a CORE FACTS section listing every manually-pinned fact', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);

  exported.pinThemeToCore('NO_WEEKEND_CALLS', "Operator will not take client calls on weekends.");
  exported.pinThemeToCore('DATA_STAYS_LOCAL', "Student data never leaves the operator's own Drive.");

  exported.buildSessionContext();

  const text = latestDocText(sandbox);
  assert.match(text, /## CORE FACTS \(Operator-Pinned — Do Not Contradict\)/);
  assert.match(text, /\[NO_WEEKEND_CALLS\] Operator will not take client calls on weekends\./);
  assert.match(text, /\[DATA_STAYS_LOCAL\] Student data never leaves the operator's own Drive\./);
});

test('buildSessionContext: omits the CORE FACTS section entirely when nothing is pinned', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);

  exported.buildSessionContext();

  const text = latestDocText(sandbox);
  assert.doesNotMatch(text, /CORE FACTS/);
});
