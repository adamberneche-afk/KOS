'use strict';
// kos-personal/rtp-core-router/RTP_CORE_ROUTER_V6_0.md is pasted whole into
// the RTP Gem's instructions. These checks hold it to the RTP notebook plan
// (notebook-plan/02_PRD.md §4, 04 Phase 3): small enough for any surface,
// every rule that must fire on every turn still present, and none of V5.8's
// Morning Cache machinery or unreadable fetches back.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROUTER = path.join(__dirname, '..', '..', 'kos-personal', 'rtp-core-router');
const v6 = fs.readFileSync(path.join(ROUTER, 'RTP_CORE_ROUTER_V6_0.md'), 'utf8');
const reference = fs.readFileSync(path.join(ROUTER, 'notebook-sources', 'TURN_LOOP_REFERENCE.md'), 'utf8');

// The notebook's own Instructions field caps at 10,000 characters (02_PRD §10,
// finding 5). Staying under it keeps that surface open alongside the Gem.
const MAX_CHARS = 10000;

test('V6.0 fits the 10,000-character instructions cap', () => {
  const chars = [...v6].length;
  assert.ok(chars <= MAX_CHARS, `V6.0 is ${chars} characters; the cap is ${MAX_CHARS}`);
});

test('V6.0 keeps every rule that must fire on every turn', () => {
  const required = {
    'Pre-Flight block': '[ RTP — PRE-FLIGHT]',
    'State Sync block': '[ RTP — STATE SYNC]',
    'stale primer flag (US-02)': '[PRIMER STALE — generated YYYY-MM-DD]',
    'partial brief (US-03)': 'PARTIAL',
    'unretrieved source flag (US-23)': '[UNCONFIRMED — {source}]',
    'unretrieved persona flag (US-06)': '[PERSONA DOC UNRETRIEVED — {NAME}]',
    'data quality qualifier (US-16)': 'Data Quality FLAGGED',
    'ALIGNMENT pause': '[🧭 ALIGNMENT — MANDATORY PAUSE]:',
    'HITL release gate': 'Verification for Release',
    'Math-Before-Muse': 'Math-Before-Muse',
    'Closeout': '@Closeout',
    'SMP loop': '00_SMP_PROPOSALS',
    'Genesis override': '@GenesisOverride',
    'kill switch pointer': 'KILL_SWITCH_PROTOCOL',
    'app not invoked': 'NOT INVOKED',
    'Calendar chip placeholder': '⟨@Google Calendar⟩',
    'mail chip placeholder': '⟨@Workspace⟩',
    'Tasks chip placeholder': '⟨@Google Tasks⟩',
    'explicit pause answer': 'explicit A, B or C',
    'primer found by its source line': 'Notebook source: KOS_LATEST_PRIMER.',
    'no student data': 'say you have no access to it, and stop',
  };
  for (const [what, text] of Object.entries(required)) {
    assert.ok(v6.includes(text), `V6.0 is missing the ${what}: ${text}`);
  }
  for (const t of ['A, Time Encroachment', 'B, Frequency Drift', 'C, Isolation Directive', 'D, Value-Consistency Drift']) {
    assert.ok(v6.includes(t), `ALIGNMENT threshold ${t} must be in the instructions`);
  }
  for (const p of ['ARCHITECT', 'AUDITOR', 'MUSE', 'DEVELOPER', 'CURATOR', 'ALIGNMENT']) {
    assert.ok(v6.includes('| ' + p + ' |'), `${p} must be in the cog registry`);
  }
});

test('V6.0 drops the Morning Cache machinery and the reads the Gem cannot make', () => {
  for (const gone of ['Morning Cache', 'Persona Activity Ledger', 'Live Fetch', 'Active Files in Context', 'Version notes']) {
    assert.ok(!v6.includes(gone), `V6.0 should not contain "${gone}"`);
  }
  assert.ok(!/BRAIN_TRUST_INDEX[^.\n]*(query|fetch)/i.test(v6),
    'V6.0 must not ask for a BRAIN_TRUST_INDEX query; the Gem cannot read the sheet');
  assert.match(v6, /A count you can't read is unknown, not zero/);
});

test('every procedure V6.0 points to is in the Turn Loop Reference', () => {
  for (const h of ['Genesis Protocol', 'Cold Boot', 'CURRENT_STATE ownership', 'RID scoring', 'WRITE_AUTHORITY', 'Two-Tiered State Audit']) {
    assert.ok(reference.includes('## Turn Loop Reference · ' + h), `TURN_LOOP_REFERENCE needs a "${h}" section`);
  }
  // Every heading names the source, so a retrieved passage stays attributable.
  reference.split('\n').filter((l) => /^## /.test(l))
    .forEach((l) => assert.match(l, /^## Turn Loop Reference · /));
});
