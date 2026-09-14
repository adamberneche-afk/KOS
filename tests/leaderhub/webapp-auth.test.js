'use strict';
// Regression tests for leader-hub/EmailBridge.gs's doPost() caller check —
// a security finding (surfaced by gas-lint's web-app-auth-check): doPost()
// had NO caller-identity check in its own body at all. Unlike
// kos-personal's equivalent, appsscript.json's webapp.access here is
// "DOMAIN" ("Anyone in your domain"), not "MYSELF" — so the manifest
// access level alone was never a sufficient gate, and every action was
// reachable, unauthenticated, by any signed-in ccpsnet.net account that
// found the URL.
//
// Fixed by gating owner-only actions behind the same _isAuthorizedOwner_()/
// getConfig_() check doGet() already uses (both defined in Code.gs — same
// GAS project/execution scope as EmailBridge.gs). Organization Sync's
// pushOrgSync/pullOrgSync are the deliberate exception: a co-advisor's own,
// wholly separate LeaderHub deployment calls THIS owner's /exec URL for
// exactly those two actions, so gating them to owner-only would break the
// feature outright. listOrgSyncs is NOT part of that exception — it
// enumerated every org on this bridge to any caller with no orgId needed —
// so it's gated like every other owner-only action.
//
// FOLLOW-UP FIX ("tighten the org exploit, at the very least make it domain
// locked"): push/pull used to rely entirely on appsscript.json's
// webapp.access ("DOMAIN") to keep them same-domain, with nothing in this
// file's own code enforcing it — a deployment later reconfigured to a
// looser access level would have silently widened them with no code
// change at all. _isSameDomainAsOwner_() is now a second, independent,
// in-code enforcement of that same boundary, derived from OWNER_EMAIL's
// own domain rather than a hardcoded one (a colleague forking this repo
// sets their own OWNER_EMAIL, possibly on a different domain entirely).
//
// doPost() itself is not called directly here — same reason
// tests/kos-personal/web-app-auth.test.js gives: this harness deliberately
// leaves ContentService unmocked (gas-sandbox.js's own header), so calling
// doPost() would throw by design. _isOwnerOnlyAction_()/_isDomainLockedAction_()
// (pure, no GAS globals) and _isAuthorizedOwner_()/_isSameDomainAsOwner_()/
// getConfig_() are each fully exercisable without it.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const FILES = [
  path.join(LH, 'Code.gs'),
  path.join(LH, 'EmailBridge.gs'),
];
const EXPOSE = [
  '_isOwnerOnlyAction_', 'LH_OWNER_ONLY_ACTIONS',
  '_isDomainLockedAction_', 'LH_DOMAIN_LOCKED_ACTIONS', '_isSameDomainAsOwner_',
  '_isAuthorizedOwner_', 'getConfig_',
];

function load(extraGlobals) {
  return loadGasFiles(FILES, EXPOSE, extraGlobals);
}

function sessionAs(email) {
  return { Session: { getActiveUser() { return { getEmail() { return email; } }; } } };
}

// ── _isOwnerOnlyAction_() — which actions the gate applies to ──────────

test('_isOwnerOnlyAction_: every non-Organization-Sync action is owner-only', () => {
  const { exported } = load();
  ['subPlan', 'bragEmail', 'markConsumed', 'aiDraft', 'checkAiJob', 'flowHealth', 'listOrgSyncs']
    .forEach((action) => assert.equal(exported._isOwnerOnlyAction_(action), true, action));
});

test('_isOwnerOnlyAction_: pushOrgSync and pullOrgSync are deliberately NOT owner-only', () => {
  const { exported } = load();
  // The whole point of Organization Sync: a co-advisor's own, separate
  // deployment calls these two on THIS owner's URL. Gating them here would
  // silently break that feature, not just tighten security.
  assert.equal(exported._isOwnerOnlyAction_('pushOrgSync'), false);
  assert.equal(exported._isOwnerOnlyAction_('pullOrgSync'), false);
});

test('_isOwnerOnlyAction_: an unknown action is not owner-only (doPost() rejects it downstream anyway)', () => {
  const { exported } = load();
  assert.equal(exported._isOwnerOnlyAction_('somethingMadeUp'), false);
});

// ── _isAuthorizedOwner_()/getConfig_() — the gate doPost() applies to those
//    actions. Already covered in depth for kos-personal's identical
//    pattern; this confirms it behaves the same way loaded alongside
//    EmailBridge.gs, not just in isolation. ──────────────────────────────

test('_isAuthorizedOwner_: fails closed when OWNER_EMAIL is not set, even for the deploying account', () => {
  const { exported } = load(sessionAs('adam@ccpsnet.net'));
  assert.equal(exported._isAuthorizedOwner_(exported.getConfig_()), false);
});

test('_isAuthorizedOwner_: true when the viewer matches OWNER_EMAIL', () => {
  const { exported, sandbox } = load(sessionAs('adam@ccpsnet.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'adam@ccpsnet.net');
  assert.equal(exported._isAuthorizedOwner_(exported.getConfig_()), true);
});

test('_isAuthorizedOwner_: false when the viewer is a different domain account', () => {
  const { exported, sandbox } = load(sessionAs('someone.else@ccpsnet.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'adam@ccpsnet.net');
  assert.equal(exported._isAuthorizedOwner_(exported.getConfig_()), false);
});

// ── _isDomainLockedAction_() / _isSameDomainAsOwner_() — the follow-up
//    hardening: push/pull no longer rely solely on appsscript.json's
//    webapp.access to stay same-domain. ──────────────────────────────────

test('_isDomainLockedAction_: exactly pushOrgSync and pullOrgSync', () => {
  const { exported } = load();
  assert.equal(exported._isDomainLockedAction_('pushOrgSync'), true);
  assert.equal(exported._isDomainLockedAction_('pullOrgSync'), true);
  // Every owner-only action must NOT also be domain-locked — the two gates
  // are mutually exclusive by construction (doPost() checks both
  // independently), and a mistake here would mean an owner-only action
  // silently accepted any same-domain caller instead of just the owner.
  exported.LH_OWNER_ONLY_ACTIONS.forEach((action) =>
    assert.equal(exported._isDomainLockedAction_(action), false, action));
});

test('_isSameDomainAsOwner_: true for a different account on the same domain as OWNER_EMAIL', () => {
  const { exported, sandbox } = load(sessionAs('coadvisor@ccpsnet.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'adam@ccpsnet.net');
  assert.equal(exported._isSameDomainAsOwner_(exported.getConfig_()), true);
});

test('_isSameDomainAsOwner_: true for the owner\'s own account too', () => {
  const { exported, sandbox } = load(sessionAs('adam@ccpsnet.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'adam@ccpsnet.net');
  assert.equal(exported._isSameDomainAsOwner_(exported.getConfig_()), true);
});

test('_isSameDomainAsOwner_: false for a caller on a different domain entirely', () => {
  const { exported, sandbox } = load(sessionAs('stranger@gmail.com'));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'adam@ccpsnet.net');
  assert.equal(exported._isSameDomainAsOwner_(exported.getConfig_()), false);
});

test('_isSameDomainAsOwner_: fails closed when OWNER_EMAIL is unset, even for a real domain caller', () => {
  const { exported } = load(sessionAs('coadvisor@ccpsnet.net'));
  assert.equal(exported._isSameDomainAsOwner_(exported.getConfig_()), false);
});

test('_isSameDomainAsOwner_: fails closed when the caller\'s email is empty (the getActiveUser() visibility gotcha)', () => {
  const { exported, sandbox } = load(sessionAs(''));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'adam@ccpsnet.net');
  assert.equal(exported._isSameDomainAsOwner_(exported.getConfig_()), false);
});

test('_isSameDomainAsOwner_: does not throw on a malformed OWNER_EMAIL with no "@"', () => {
  const { exported, sandbox } = load(sessionAs('coadvisor@ccpsnet.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'not-an-email');
  assert.doesNotThrow(() => exported._isSameDomainAsOwner_(exported.getConfig_()));
  assert.equal(exported._isSameDomainAsOwner_(exported.getConfig_()), false);
});
