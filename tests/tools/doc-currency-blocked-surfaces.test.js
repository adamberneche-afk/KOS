'use strict';
// Regression tests for doc-currency's Check 5 — a behavior doc presenting a
// blocked capability as live.
//
// WHY THIS CHECK EXISTS AT ALL. Every other check in this tool verifies that
// a documented thing EXISTS. Nothing verified that a documented path can RUN,
// and on this account many cannot: a custom Studio step is a Workspace Add-on
// and needs a standard, non-default Cloud project, which is disabled org-wide
// for ccpsnet.net. Every function named in those instructions existed. The
// instructions were still impossible to follow, and three documents carried
// them for weeks — kos-personal/STUDIO_INTEGRATION_SPEC.md telling a Flow
// builder to write the doc body from Studio, IMPACT_DASHBOARD.html's "Built,
// Not Deployed" badges, and three separate docs describing Flows 2-5 as
// waiting on a push.
//
// WHY IT IS DECLARATION-DRIVEN ON BOTH SIDES, which is the part worth not
// "simplifying" later:
//
//   - gcp-map.json owns the tokens, because nothing can infer that
//     "37_FlowInputBuilder" is the answer to "cas-ccps/studio-steps", and
//     they belong beside the status they describe.
//   - config.json owns the doc list, because run repo-wide the same check
//     reports 12 findings of which 8 are layout inventories ("kos-personal
//     has 2 clasp projects", a table of step files) that are true whatever
//     the surface's status. That ratio was measured before shipping. A muted
//     check is worse than an absent one.
//
// auditBlockedMentions is the pure unit. The check walks the repo, so testing
// it directly would fail whenever a doc legitimately changed — except for the
// two repo-level properties at the bottom, which are the point of the whole
// exercise and are asserted here so `npm test` catches a regression even when
// nobody runs the linter.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  auditBlockedMentions,
  blockedSurfaces,
  CONFIG,
} = require('../../tools/doc-currency/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const GCP_MAP = JSON.parse(read('tools/gas-lint/gcp-map.json'));

const SURFACE = {
  key: 'test-surface',
  mentions: ['cas-ccps/studio-steps', 'CommitStudentEvaluationStep'],
  fallback: ['37_FlowInputBuilder', 'harvestFlowInputResults'],
};

// ── The pure unit ────────────────────────────────────────────────────────────

test('a bare mention is reported, with the line and the token', () => {
  const doc = [
    '# How evaluation works',
    '',
    'Flow 2 hands the submission to `cas-ccps/studio-steps/`, which writes',
    'the result back to the Ledger.',
  ].join('\n');
  const { bare } = auditBlockedMentions(doc, SURFACE);
  assert.ok(bare, 'this is the failure mode the check exists for');
  assert.equal(bare.line, 3);
  assert.equal(bare.hit, 'cas-ccps/studio-steps');
});

test('acknowledging the block in the same paragraph is enough', () => {
  const doc = [
    '# How evaluation works',
    '',
    '`cas-ccps/studio-steps/` is blocked on this account — a custom step needs',
    'a standard Cloud project, and GCP is disabled org-wide.',
  ].join('\n');
  const audit = auditBlockedMentions(doc, SURFACE);
  assert.equal(audit.bare, null);
  assert.equal(audit.acknowledged.line, 3);
});

test('naming the fallback is enough on its own, with no status word', () => {
  // A doc that says "this moved to X" has told the reader everything they
  // need; demanding the word "blocked" as well would be pedantry.
  const doc = 'The work `cas-ccps/studio-steps/` did now happens in\n`37_FlowInputBuilder.js`.\n';
  assert.equal(auditBlockedMentions(doc, SURFACE).bare, null);
});

test('a banner speaks for the whole document', () => {
  // The convention the rest of this tool already follows, and the shape of
  // the real fix to STUDIO_INTEGRATION_SPEC.md: one banner at the top, the
  // body left alone.
  const doc = [
    '# Spec',
    '',
    '> ⚠ The custom-step path is blocked on this account; the write-back',
    '> moved into Apps Script.',
    '',
    ...Array(30).fill('filler'),
    'Step 6 — `CommitStudentEvaluationStep` writes the evaluation back.',
  ].join('\n');
  assert.equal(auditBlockedMentions(doc, SURFACE).bare, null,
    'a mention far below an explicit banner is covered by it');
});

test('a marker in a DIFFERENT paragraph does not launder a bare mention', () => {
  // This tool already shipped this bug once with a ±6-line window:
  // USER_GUIDE.md's "only creates what doesn't exist" sat three lines from an
  // unrelated paragraph and suppressed a real finding. Paragraph scope is the
  // fix, and it has to stay paragraph scope.
  const doc = [
    'The scheduled sweep is disabled by default.',
    '',
    'Build the Flow with `cas-ccps/studio-steps/`.',
  ].join('\n');
  const { bare } = auditBlockedMentions(doc, SURFACE);
  assert.ok(bare, '"disabled" belongs to the sweep, not to the surface');
  assert.equal(bare.line, 3);
});

test('a list item counts as part of its surrounding block', () => {
  // paragraphAround's markdown behavior, relied on here: a bullet that says
  // "blocked" and a bullet naming the surface are one block to a reader.
  const doc = [
    '- The custom steps are blocked on this account.',
    '- `cas-ccps/studio-steps/` is kept because enabling GCP would revive it.',
  ].join('\n');
  assert.equal(auditBlockedMentions(doc, SURFACE).bare, null);
});

test('the fallback is tracked document-wide, separately from each mention', () => {
  const ackOnly = auditBlockedMentions(
    '`cas-ccps/studio-steps/` cannot be published on this account.\n', SURFACE);
  assert.equal(ackOnly.bare, null);
  assert.equal(ackOnly.docNamesFallback, false,
    'knows the path is dead, still does not say what to do instead — the warning case');

  const withFallback = auditBlockedMentions(
    '`cas-ccps/studio-steps/` cannot be published.\n\nSee `37_FlowInputBuilder.js`.\n', SURFACE);
  assert.equal(withFallback.docNamesFallback, true);
});

test('a doc that never mentions the surface produces nothing', () => {
  const audit = auditBlockedMentions('# Unrelated\n\nNothing to see.\n', SURFACE);
  assert.deepEqual([audit.bare, audit.acknowledged], [null, null]);
});

test('the first bare mention is reported, not every one', () => {
  // One finding per doc per surface: the fix is usually one clause that
  // covers the document, and ten copies of it would train someone to skim.
  const doc = [
    'Use `cas-ccps/studio-steps/`.',
    '',
    'Also `CommitStudentEvaluationStep` writes the row.',
  ].join('\n');
  const { bare } = auditBlockedMentions(doc, SURFACE);
  assert.equal(bare.line, 1);
});

// ── The declarations ─────────────────────────────────────────────────────────

test('every live-blocked surface declares doc_tokens', () => {
  for (const [key, def] of Object.entries(GCP_MAP.surfaces)) {
    if (def.status !== 'live-blocked') continue;
    const t = def.doc_tokens;
    assert.ok(t && Array.isArray(t.mentions) && t.mentions.length,
      key + ' is live-blocked with no doc_tokens.mentions, so no doc is checked against it');
    assert.ok(Array.isArray(t.fallback) && t.fallback.length,
      key + ' declares no fallback — if there genuinely is none, say so in a mentions-only ' +
      'entry deliberately, but every blocked surface in this repo has a port');
  }
});

test('a declared fallback token names something that exists', () => {
  // A fallback pointer to a function that was renamed is worse than none: it
  // reads as an answer and leads nowhere. Checked against the whole repo,
  // deliberately not against one file, because these move between files.
  const sourceish = ['cas-ccps/scripts', 'kos-personal', 'leader-hub']
    .flatMap((dir) => {
      const walk = (d) => fs.readdirSync(path.join(REPO_ROOT, d), { withFileTypes: true })
        .flatMap((e) => e.isDirectory() ? walk(path.posix.join(d, e.name))
                                        : [path.posix.join(d, e.name)]);
      return walk(dir);
    })
    .filter((f) => /\.(gs|js|html)$/.test(f))
    .map((f) => read(f))
    .join('\n');

  for (const surface of blockedSurfaces()) {
    for (const token of surface.fallback) {
      assert.ok(sourceish.includes(token),
        `${surface.key} declares fallback "${token}", which appears in no source file`);
    }
  }
});

test('every doc in blockedSurfaceDocs exists', () => {
  for (const rel of CONFIG.blockedSurfaceDocs) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)),
      rel + ' is declared but missing — a stale list silently un-checks a document');
  }
});

test('the doc list includes the three documents that actually carried the bug', () => {
  // Not a taste assertion: these are the files where a blocked path read as
  // live cost real time, so dropping one from the list should fail a test
  // rather than quietly reduce coverage.
  ['kos-personal/STUDIO_INTEGRATION_SPEC.md',
   'cas-ccps/docs/IMPACT_DASHBOARD.html',
   'README.md'].forEach((rel) => {
    assert.ok(CONFIG.blockedSurfaceDocs.includes(rel), rel + ' is no longer checked');
  });
});

// ── The repo holds the property ──────────────────────────────────────────────

test('no declared behavior doc presents a blocked surface as live', () => {
  const found = [];
  for (const rel of CONFIG.blockedSurfaceDocs) {
    if (!fs.existsSync(path.join(REPO_ROOT, rel))) continue;
    const raw = read(rel);
    const head = raw.split('\n').slice(0, CONFIG.bannerScanLines).join('\n');
    if (new RegExp(CONFIG.supersededMarkers.join('|'), 'i').test(head)) continue;
    for (const surface of blockedSurfaces()) {
      const { bare } = auditBlockedMentions(raw, surface);
      if (bare) found.push(`${rel}:${bare.line} names "${bare.hit}" with no status and no fallback`);
    }
  }
  assert.deepEqual(found, [], 'blocked surfaces presented as live:\n' + found.join('\n'));
});

test('every declared doc that acknowledges a block also names the fallback', () => {
  const found = [];
  for (const rel of CONFIG.blockedSurfaceDocs) {
    if (!fs.existsSync(path.join(REPO_ROOT, rel))) continue;
    const raw = read(rel);
    for (const surface of blockedSurfaces()) {
      const audit = auditBlockedMentions(raw, surface);
      if (audit.acknowledged && !audit.bare && !audit.docNamesFallback) {
        found.push(`${rel}:${audit.acknowledged.line} says "${audit.acknowledged.hit}" is ` +
          `blocked but never names ${surface.fallback.join('/')}`);
      }
    }
  }
  assert.deepEqual(found, [], 'blocked without a stated fallback:\n' + found.join('\n'));
});
