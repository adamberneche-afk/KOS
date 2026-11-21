'use strict';
// Copies the one deploy-version report (shared/deploy-report/deploy-version-report.js)
// into every system that sends it, between its BEGIN and END lines, with
// DEPLOY_PROJECT_SCOPES filled in from each project's manifest
// (tools/gas-lint/project-map.json's "manifest"). Structure audit 3.8,
// 2026-11-21: the three hand copies had drifted (only cas-ccps checked its
// permissions). This README's recipe, for code instead of data.
//
//   node tools/flow-harness-sync/sync-deploy-report.js           write the copies
//   node tools/flow-harness-sync/sync-deploy-report.js --check   exit 1 if one differs

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CANONICAL = 'shared/deploy-report/deploy-version-report.js';
const TARGETS = [
  'cas-ccps/scripts/00_SharedConfig.js',
  'kos-personal/17_DeployVersionReport.gs',
  'leader-hub/DeployVersionReport.gs',
];
const BEGIN = '// ===== BEGIN deploy-version report: generated from ' + CANONICAL +
  ' by tools/flow-harness-sync/sync-deploy-report.js. Edit there, then run it. =====';
const END = '// ===== END deploy-version report =====';
const SCOPE_PREFIX = 'https://www.googleapis.com/auth/';

function projectScopes() {
  const map = require('../lib/repo.js').projectMap();
  const out = {};
  for (const [name, entry] of Object.entries(map)) {
    if (name.startsWith('_') || !entry.manifest) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, entry.manifest), 'utf8'));
    out[name] = (manifest.oauthScopes || []).map((s) => s.replace(SCOPE_PREFIX, ''));
  }
  return out;
}

function renderBlock() {
  const src = fs.readFileSync(path.join(ROOT, CANONICAL), 'utf8');
  const marker = 'const DEPLOY_PROJECT_SCOPES = {}; // SYNC:SCOPES';
  if (!src.includes(marker)) throw new Error(CANONICAL + ' has lost its "' + marker + '" line');
  const scopes = projectScopes();
  const lines = Object.keys(scopes).map((k) => '  ' + JSON.stringify(k).replace(/"/g, "'") + ': [' +
    scopes[k].map((s) => "'" + s + "'").join(', ') + '],');
  const body = src.replace(marker, 'const DEPLOY_PROJECT_SCOPES = {\n' + lines.join('\n') + '\n};');
  return BEGIN + '\n' + body.trimEnd() + '\n' + END;
}

// { file: newText } for every target whose block differs; throws when a target
// has no BEGIN/END pair (the one-time manual step: put the two lines in first).
function computeUpdates() {
  const block = renderBlock();
  const updates = {};
  for (const rel of TARGETS) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const a = text.indexOf(BEGIN), b = text.indexOf(END);
    if (a < 0 || b < a || text.indexOf(BEGIN, a + 1) >= 0) throw new Error(rel + ': needs exactly one BEGIN/END deploy-version report pair');
    const next = text.slice(0, a) + block + text.slice(b + END.length);
    if (next !== text) updates[rel] = next;
  }
  return updates;
}

function main(argv) {
  const updates = computeUpdates();
  const stale = Object.keys(updates);
  if (argv.includes('--check')) {
    if (stale.length) {
      console.error('Deploy-version report copies differ from ' + CANONICAL + ': ' + stale.join(', ') +
        '\nRun node tools/flow-harness-sync/sync-deploy-report.js');
      return 1;
    }
    console.log('Deploy-version report: ' + TARGETS.length + ' copies match ' + CANONICAL + '.');
    return 0;
  }
  stale.forEach((rel) => fs.writeFileSync(path.join(ROOT, rel), updates[rel]));
  console.log(stale.length ? 'Updated ' + stale.join(', ') : 'All ' + TARGETS.length + ' copies already match.');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { computeUpdates, renderBlock, projectScopes, TARGETS, BEGIN, END };
