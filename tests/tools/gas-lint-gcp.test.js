'use strict';
// Regression tests for gas-lint's Check G — the guard that says no code path
// in this repo may depend on a Google Cloud project without an entry in
// tools/gas-lint/gcp-map.json.
//
// WHY THIS CHECK EXISTS, because it explains what these tests are actually
// pinning: GCP availability is a Workspace-admin decision nobody in this
// repo controls, and on the ccpsnet.net account it is switched off. That was
// discovered AFTER cas-ccps/studio-steps/ had been written, unit-tested and
// pushed — 2,113 lines that can never run, because a Workspace Add-on
// exposing custom Studio steps needs a standard Cloud project. The dependency
// never announced itself: the push succeeded, no OAuth prompt appeared, and
// the steps simply never showed up in Studio's picker.
//
// So the load-bearing behaviour here is the LIVE vs LATENT distinction. An
// endpoint in live code sits inside a string literal; one left behind in a
// commented-out reference implementation does not. gas-lint's shared stripper
// blanks both by default, which makes them indistinguishable — hence the
// keepStrings option, and hence the first block of tests below. Get that
// wrong in the permissive direction and a real dependency slips through as a
// warning; get it wrong in the strict direction and 25_WarmUpWriter.js's
// deliberately-preserved commented block fails the build forever.
//
// The check itself isn't called directly — it walks every file in
// project-map.json, so a test against it would fail whenever any of the three
// systems legitimately changed. findGcpSurfaces() is the pure unit, and it's
// where the classification logic lives.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  findGcpSurfaces,
  GCP_PATTERNS,
  GCP_STATUSES,
  stripCommentsAndStrings,
} = require('../../tools/gas-lint/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const GCP_MAP = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tools', 'gas-lint', 'gcp-map.json'), 'utf8'));

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ── the stripper option Check G is built on ──────────────────────────────────

test('keepStrings preserves string contents while still blanking comments', () => {
  const src = [
    'const live = "' + ENDPOINT + '";',
    '// const dead = "' + ENDPOINT + '";',
    '/* const alsoDead = "' + ENDPOINT + '"; */',
  ].join('\n');
  const kept = stripCommentsAndStrings(src, { keepStrings: true });
  assert.equal(kept.split('generativelanguage').length - 1, 1,
    'exactly the one live occurrence should survive');
  assert.ok(kept.indexOf('const live = "' + ENDPOINT + '"') !== -1);
});

test('keepStrings preserves offsets and line count, so match indexes still line up', () => {
  // Check G decides live-vs-latent by comparing the stripped output at the
  // SAME offset as the raw match. That only works if stripping never changes
  // length — including across escapes and multi-line block comments.
  const src = 'var a = "x\\"y";\n/* two\n   lines */\nvar b = \'z\';\n';
  [{}, { keepStrings: true }].forEach((opts) => {
    const out = stripCommentsAndStrings(src, opts);
    assert.equal(out.length, src.length, 'length preserved for ' + JSON.stringify(opts));
    assert.equal(out.split('\n').length, src.split('\n').length);
  });
});

test('the default (no opts) behaviour is unchanged — other checks depend on it', () => {
  const src = 'const u = "' + ENDPOINT + '";';
  assert.equal(stripCommentsAndStrings(src).indexOf('generativelanguage'), -1);
});

// ── findGcpSurfaces: classification ──────────────────────────────────────────

test('an endpoint in live code is LIVE', () => {
  const hits = findGcpSurfaces('x/y.gs', 'function f() {\n  UrlFetchApp.fetch("' + ENDPOINT + '");\n}');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pattern, 'gemini-api-endpoint');
  assert.equal(hits[0].status, 'live');
  assert.equal(hits[0].line, 2);
});

test('an endpoint in a // comment is LATENT', () => {
  const hits = findGcpSurfaces('x/y.gs', '// UrlFetchApp.fetch("' + ENDPOINT + '");\n');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].status, 'latent');
});

test('an endpoint in a /* */ block is LATENT', () => {
  // This is 25_WarmUpWriter.js's shape: a whole reference implementation kept
  // on purpose so Check E can still see the script.external_request
  // requirement it would need. It must stay a warning, never an error.
  const hits = findGcpSurfaces('x/y.gs', 'function f() {\n/*\n  var u = "' + ENDPOINT + '";\n*/\n}');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].status, 'latent');
  assert.equal(hits[0].line, 3);
});

test('one live occurrence outweighs any number of commented ones', () => {
  const src = [
    '// old: "' + ENDPOINT + '"',
    '// older: "' + ENDPOINT + '"',
    'var u = "' + ENDPOINT + '";',
    '// newer idea: "' + ENDPOINT + '"',
  ].join('\n');
  const hits = findGcpSurfaces('x/y.gs', src);
  assert.equal(hits.length, 1, 'collapsed to one finding per (file, pattern)');
  assert.equal(hits[0].status, 'live');
  assert.equal(hits[0].line, 3, 'and reports the live line, not the first line');
});

test('a file with no GCP surface yields nothing', () => {
  // 37_FlowInputBuilder.js is the real example: it exists specifically to
  // move a whole lookup chain into Apps Script so the Flow needs no
  // capability beyond keyless Gemini.
  assert.deepEqual(findGcpSurfaces('x/y.gs', 'function f() { return SpreadsheetApp.getActive(); }'), []);
});

test('Vertex is detected as its own pattern', () => {
  const hits = findGcpSurfaces('x/y.gs', 'var u = "https://us-central1-aiplatform.googleapis.com/v1/x";');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pattern, 'vertex-endpoint');
  assert.equal(hits[0].status, 'live');
});

test('a file carrying two different patterns reports both', () => {
  const hits = findGcpSurfaces('x/y.gs',
    'var a = "' + ENDPOINT + '";\nvar b = "https://aiplatform.googleapis.com/v1";');
  assert.deepEqual(hits.map((h) => h.pattern), ['gemini-api-endpoint', 'vertex-endpoint']);
});

// ── findGcpSurfaces: the manifest pattern ────────────────────────────────────

test('workflowElements in a .json manifest is LIVE', () => {
  const hits = findGcpSurfaces('p/appsscript.json',
    '{\n  "addOns": {\n    "common": {},\n    "workflowElements": []\n  }\n}');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pattern, 'studio-custom-step');
  assert.equal(hits[0].status, 'live');
});

test('workflowElements discussed in .gs prose is NOT a finding', () => {
  // Several headers in this repo explain the wall at length. Prose about a
  // dependency is not a dependency, and a linter that can't tell the
  // difference gets muted — which is the failure mode that matters most for
  // a check whose whole value is that its errors mean something.
  const src = '/**\n * The 8 custom steps declare "workflowElements" in their manifest,\n' +
              ' * which is why they need a standard Cloud project and never appeared.\n */\n' +
              'function f() {}\n';
  assert.deepEqual(findGcpSurfaces('x/y.gs', src), []);
});

test('a comment inside a .json file cannot hide a manifest finding', () => {
  // JSON has no comment syntax, so anything comment-shaped in a manifest is
  // either part of a string value or invalid JSON. Either way the key is real.
  const hits = findGcpSurfaces('p/appsscript.json',
    '{\n  "_note": "// we removed workflowElements",\n  "workflowElements": []\n}');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].status, 'live');
});

test('the .json scoping is by extension, case-insensitively', () => {
  assert.equal(findGcpSurfaces('p/A.JSON', '{"workflowElements":[]}').length, 1);
  assert.equal(findGcpSurfaces('p/a.gs', '{"workflowElements":[]}').length, 0);
});

// ── gcp-map.json's own integrity ─────────────────────────────────────────────

test('every declared surface uses a known status and a known pattern', () => {
  const patternNames = GCP_PATTERNS.map((p) => p.name);
  Object.entries(GCP_MAP.surfaces).forEach(([relPath, def]) => {
    assert.ok(GCP_STATUSES.includes(def.status),
      relPath + ' has status "' + def.status + '", not one of ' + GCP_STATUSES.join(', '));
    assert.ok(patternNames.includes(def.pattern),
      relPath + ' declares pattern "' + def.pattern + '", which Check G does not scan for');
  });
});

test('every declared surface says what happens without GCP', () => {
  // A declaration is not approval — it records the dependency, whether it
  // works today, and the fallback. An entry missing if_unavailable is a
  // dependency nobody has thought through, which is the thing this map is
  // for.
  Object.entries(GCP_MAP.surfaces).forEach(([relPath, def]) => {
    ['why', 'if_unavailable', 'revisit'].forEach((field) => {
      assert.ok(typeof def[field] === 'string' && def[field].length > 40,
        relPath + ' needs a substantive "' + field + '"');
    });
  });
});

test('the known-blocked cas-ccps surfaces are still declared blocked', () => {
  // Pinned deliberately. If someone flips either of these to live-ok, that
  // should be because a district admin enabled GCP on the account — a real
  // event worth a deliberate test change, not a quiet edit.
  assert.equal(GCP_MAP.surfaces['cas-ccps/clasp/manifests/studio-steps.appsscript.json'].status,
    'live-blocked');
  assert.equal(GCP_MAP.surfaces['cas-ccps/scripts/15c_Flow2DirectEvaluationService.js'].status,
    'live-blocked');
});

test('kos-personal\'s custom steps are blocked too — same account, confirmed', () => {
  // This entry has been wrong twice, in the same direction both times, so it
  // is pinned. It first read GCP as "very likely fine" from a deployment
  // doc's mention of a GCP project (a consent screen lives in the DEFAULT
  // project, so that was never evidence), and then kept a residual "different
  // account, so the org policy does not reach it" — which the operator has
  // since confirmed is also wrong: kos-personal is on the SAME ccpsnet.net
  // account and its flow is not live. Anything moving this off live-blocked
  // should be a deliberate change with new evidence, not an inference.
  assert.equal(GCP_MAP.surfaces['kos-personal/studio-steps/appsscript.json'].status,
    'live-blocked');
});

test('a declared surface marked scanned:false is not a GAS file', () => {
  // The only legitimate use of the opt-out: kos-personal/inference-service/
  // is a standalone Node service, not a file in any Apps Script project. If
  // a .gs file ever gets this flag it is exempting itself from the check.
  Object.entries(GCP_MAP.surfaces)
    .filter(([, def]) => def.scanned === false)
    .forEach(([relPath]) => {
      assert.ok(!/\.(gs|js|json|html)$/.test(relPath),
        relPath + ' is a scannable file and must not opt out of Check G');
    });
});

test('the doctrine block is present and names the rule', () => {
  // gcp-map.json is read by people more often than by the linter; the
  // doctrine is the part that explains why an entry exists at all.
  const doctrine = (GCP_MAP._doctrine || []).join('\n');
  assert.ok(doctrine.length > 500, 'the map should carry its own explanation');
  assert.ok(/Check G/.test(doctrine), 'the doctrine should name the check that enforces it');
});
