'use strict';
// Regression tests for gas-lint's Checks H and I — the two machine-checkable
// rules from meta/FLOW_DOCTRINE.md.
//
// WHY THESE TWO AND NOT THE OTHER ELEVEN. Most of that doctrine is
// judgement: "a canary must say what it did not test" cannot be linted. These
// two can, and the difference is the point of the exercise — a practice that
// is only prose gets rediscovered, a practice that is a check gets enforced.
// Rule 7 ("derive from the writer, verify against the constant") lived in
// exactly one comment before Check H existed, and the drift it describes had
// already shipped twice: RQ05 one column out of sync with the array it
// describes, and the Central Ledger shift that made LEDGER.TEACHER_EMAIL
// return a person's name.
//
// Check I earned itself immediately: on its first run it found that cas-ccps
// Flow 2 had no liveness check, while all three other flow surfaces did.
//
// parseColumnMap is the pure unit. The checks themselves walk the whole repo,
// so testing them directly would fail whenever a map legitimately changed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseColumnMap,
  columnMapLabel,
  FLOW_ROLE_QUESTIONS,
  findTopLevelDecls,
} = require('../../tools/gas-lint/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const FLOW_MAP = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tools', 'gas-lint', 'flow-map.json'), 'utf8'));
const PROJECT_MAP = require('../../tools/gas-lint/project-map.json');

// ── parseColumnMap: the object form ──────────────────────────────────────────

test('reads an object column map', () => {
  const src = 'const TM08 = {\n  CONFIG_ID: 0,\n  UNIT_NAME: 1,\n  TIER: 2,\n};\n';
  assert.deepEqual(parseColumnMap(src, { object: 'TM08' }),
    { CONFIG_ID: 0, UNIT_NAME: 1, TIER: 2 });
});

test('reads an object map with non-contiguous indices', () => {
  // FI_TM_COLUMNS_ jumps 8 → 15 because it names 13 of TeacherMatrix's 20
  // columns. A parser assuming a dense run would mangle it.
  const src = 'var M = { A: 0, B: 8, C: 15, D: 18 };';
  assert.deepEqual(parseColumnMap(src, { object: 'M' }), { A: 0, B: 8, C: 15, D: 18 });
});

test('a commented-out index is not read as live', () => {
  // Same reason Check D strips comments: a map with an entry commented out
  // during a migration would otherwise be compared against the live one and
  // report a phantom conflict.
  const src = 'const M = {\n  A: 0,\n  // B: 1,\n  C: 2,\n};';
  assert.deepEqual(parseColumnMap(src, { object: 'M' }), { A: 0, C: 2 });
});

test('an inline comment beside an index does not break parsing', () => {
  const src = 'const M = {\n  A: 0,\n  B: 11,  // DRAFT | LIVE | ARCHIVED\n  C: 2,\n};';
  assert.deepEqual(parseColumnMap(src, { object: 'M' }), { A: 0, B: 11, C: 2 });
});

test('a nested object does not truncate the map at the first brace', () => {
  const src = 'const M = {\n  A: 0,\n  NESTED: { X: 1 },\n  B: 2,\n};';
  const out = parseColumnMap(src, { object: 'M' });
  assert.equal(out.A, 0);
  assert.equal(out.B, 2);
});

test('excluded keys are dropped', () => {
  // WQ25_COL_COUNT is a width, not a column, and comparing it against
  // another map's real column would be a false conflict.
  const src = 'const M = { QUEUE_ID: 0, STATUS: 8, COL_COUNT: 21 };';
  assert.deepEqual(parseColumnMap(src, { object: 'M', exclude: ['COL_COUNT'] }),
    { QUEUE_ID: 0, STATUS: 8 });
});

test('a missing declaration returns null rather than an empty map', () => {
  // The distinction matters: null means "could not check this", which the
  // check reports as a warning, while {} would silently compare as agreeing.
  assert.equal(parseColumnMap('const OTHER = { A: 0 };', { object: 'M' }), null);
});

// ── parseColumnMap: the prefix form ──────────────────────────────────────────

test('reads a run of prefixed constants, keyed by suffix', () => {
  const src = [
    'const WQ25_QUEUE_ID          = 0;',
    'const WQ25_LESSON_ID         = 1;',
    'const WQ25_STATUS            = 8;',
  ].join('\n');
  assert.deepEqual(parseColumnMap(src, { prefix: 'WQ25_' }),
    { QUEUE_ID: 0, LESSON_ID: 1, STATUS: 8 });
});

test('the prefix form ignores same-prefix constants that are not indices', () => {
  const src = 'const P_A = 0;\nconst P_NAME = "WarmUpQueue";\nconst P_B = 1;';
  assert.deepEqual(parseColumnMap(src, { prefix: 'P_' }), { A: 0, B: 1 });
});

test('the prefix form ignores a commented-out constant', () => {
  const src = 'const P_A = 0;\n// const P_B = 1;\nconst P_C = 2;';
  assert.deepEqual(parseColumnMap(src, { prefix: 'P_' }), { A: 0, C: 2 });
});

test('the prefix form does not match a longer prefix by accident', () => {
  // WQ24_ and WQ25_ live in the same project. A loose match would merge them
  // and then report them as agreeing with themselves.
  const src = 'const WQ24_QUEUE_ID = 0;\nconst WQ25_QUEUE_ID = 0;\nconst WQ25_STATUS = 8;';
  assert.deepEqual(parseColumnMap(src, { prefix: 'WQ25_' }), { QUEUE_ID: 0, STATUS: 8 });
});

test('columnMapLabel names either shape readably', () => {
  assert.equal(columnMapLabel({ object: 'TM08' }), 'TM08');
  assert.equal(columnMapLabel({ prefix: 'WQ25_' }), 'WQ25_*');
});

// ── The declared groups, against the real repo ───────────────────────────────

test('every declared column map is findable in its file', () => {
  // A rename silently un-checks a group, which is the one failure mode of a
  // declaration-driven check. gas-lint warns; this fails.
  Object.entries(FLOW_MAP.columnMaps).forEach(([group, def]) => {
    def.maps.forEach((spec) => {
      const abs = path.join(REPO_ROOT, spec.file);
      assert.ok(fs.existsSync(abs), group + ': ' + spec.file + ' does not exist');
      const parsed = parseColumnMap(fs.readFileSync(abs, 'utf8'), spec);
      assert.ok(parsed, group + ': ' + columnMapLabel(spec) + ' not found in ' + spec.file);
      assert.ok(Object.keys(parsed).length > 0);
    });
  });
});

test('every declared duplicate map agrees, on the real code', () => {
  // The assertion Check H makes, made here too so a drift fails a test and
  // not only a lint run.
  Object.entries(FLOW_MAP.columnMaps).forEach(([group, def]) => {
    const parsed = def.maps.map((spec) => ({
      spec,
      map: parseColumnMap(fs.readFileSync(path.join(REPO_ROOT, spec.file), 'utf8'), spec),
    }));
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const a = parsed[i], b = parsed[j];
        Object.keys(a.map).forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(b.map, key)) return;
          assert.equal(a.map[key], b.map[key],
            group + ': ' + key + ' is ' + a.map[key] + ' in ' + columnMapLabel(a.spec) +
            ' but ' + b.map[key] + ' in ' + columnMapLabel(b.spec));
        });
      }
    }
  });
});

test('the RubricQueue pair is the one that would have caught the RQ05 drift', () => {
  // Pinned specifically. RQ05 shipped ending at STATUS: 8 against a 10-field
  // row whose Status is at 9, with no TeacherMatrixSsId entry at all.
  const group = FLOW_MAP.columnMaps['cas-ccps:RubricQueue'];
  assert.ok(group, 'the group must stay declared');
  assert.equal(group.maps.length, 2, 'two maps, or there is nothing to compare');
  const rq05 = parseColumnMap(
    fs.readFileSync(path.join(REPO_ROOT, 'cas-ccps/scripts/05_TeacherIntakePipeline.js'), 'utf8'),
    { object: 'RQ05' });
  assert.equal(rq05.TEACHER_MATRIX_SS_ID, 8, 'the entry that was missing entirely');
  assert.equal(rq05.STATUS, 9, 'and the index that was wrong');
});

test('same-name sheets in different systems are declared as separate groups', () => {
  // cas-ccps and kos-personal both have a STAGING_PIPELINE, 6 vs 7 columns,
  // in different spreadsheets. A check that grouped by tab name would compare
  // them and report a false conflict every run — which is how a check gets
  // muted. The group keys carry the system prefix for exactly this reason.
  const keys = Object.keys(FLOW_MAP.columnMaps);
  keys.forEach((k) => {
    assert.match(k, /^[a-z-]+:/, 'group "' + k + '" should be system-prefixed');
  });
  const staging = keys.filter((k) => k.endsWith(':STAGING_PIPELINE'));
  staging.forEach((k) => {
    FLOW_MAP.columnMaps[k].maps.forEach((spec) => {
      assert.ok(spec.file.startsWith(k.split(':')[0]),
        k + ' declares a map from another system: ' + spec.file);
    });
  });
});

// ── Flow surfaces ────────────────────────────────────────────────────────────

test('every function a flow surface declares exists in its project', () => {
  Object.entries(FLOW_MAP.flowSurfaces).forEach(([surface, def]) => {
    const project = PROJECT_MAP[def.project];
    assert.ok(project, surface + ': unknown project ' + def.project);

    const declared = new Set();
    (project.files || []).forEach((relPath) => {
      if (relPath.endsWith('.html')) return;
      if (!fs.existsSync(path.join(REPO_ROOT, relPath))) return;
      findTopLevelDecls(relPath).forEach((d) => declared.add(d.name));
    });

    Object.keys(FLOW_ROLE_QUESTIONS).forEach((role) => {
      const fn = def[role];
      if (!fn) return;
      assert.ok(declared.has(fn),
        surface + ' declares ' + role + ' = ' + fn + '(), which does not exist in ' + def.project);
    });
  });
});

test('every flow surface answers all four questions, or says why not', () => {
  // Rule 9. A role that genuinely does not apply is declared away in _note —
  // leader-hub and kos-personal both legitimately lack a materialize step
  // because their payload is not assembled from a lookup chain.
  Object.entries(FLOW_MAP.flowSurfaces).forEach(([surface, def]) => {
    const note = String(def._note || '');
    Object.keys(FLOW_ROLE_QUESTIONS).forEach((role) => {
      assert.ok(def[role] || note.includes(role),
        surface + ' has no ' + role + ' and no _note explaining why — the question "' +
        FLOW_ROLE_QUESTIONS[role] + '" is unanswerable for it');
    });
  });
});

test('all four flow surfaces across the three systems are declared', () => {
  // The registry is only as good as its coverage: an undeclared flow is not
  // held to anything.
  ['cas-ccps:flow-2', 'cas-ccps:flows-3-4-5', 'leader-hub:ai-flows',
   'kos-personal:studio-flows'].forEach((surface) => {
    assert.ok(FLOW_MAP.flowSurfaces[surface], surface + ' is not declared');
  });
});

test('Flow 2 has a liveness check — the gap Check I found on its first run', () => {
  // Flows 3/4/5, leader-hub and kos-personal all had one; Flow 2, the first
  // flow redesigned around the wall, never got one. Pinned so it does not
  // quietly go away again.
  assert.equal(FLOW_MAP.flowSurfaces['cas-ccps:flow-2'].liveness, 'checkFlow2Liveness');
});

test('the doctrine document exists and the map points at it', () => {
  // A declaration whose reasoning has been deleted is just a config file.
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'meta', 'FLOW_DOCTRINE.md')));
  const doctrine = (FLOW_MAP._doctrine || []).join('\n');
  assert.match(doctrine, /FLOW_DOCTRINE\.md/);
  assert.match(doctrine, /RULE 7/);
  assert.match(doctrine, /RULE 9/);
});
