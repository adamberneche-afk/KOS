#!/usr/bin/env node
'use strict';
/**
 * tools/clasp-sync/sync.js
 * =========================
 * cas-ccps is not one Apps Script project — it's 7 (see
 * tools/gas-lint/project-map.json), several of which share files (e.g.
 * 00_SharedConfig.js is pasted into 5 of them, 19_ClonedSheetConfig.js
 * into 2). clasp's model is strictly one local folder <-> one script ID,
 * so there's no single directory that can `clasp push` cleanly for
 * cas-ccps the way kos-personal's flat folder can.
 *
 * This script closes that gap without ever hand-duplicating files in git:
 * it reads project-map.json (the same file gas-lint uses to know which
 * files share a GAS global scope) and, for each cas-ccps:* project,
 * materializes a throwaway push folder under cas-ccps/.clasp-build/<name>/
 * containing exactly that project's files, its appsscript.json (from
 * cas-ccps/clasp/manifests/), and its .clasp.json. The real scriptId
 * never lives in a tracked file (same convention as this repo's real IDs
 * living in Script Properties, not committed source): copy
 * cas-ccps/clasp/templates/<name>.clasp.json.template to
 * cas-ccps/clasp/local/<name>.clasp.json (gitignored) once you've run
 * `clasp login` + `clasp clone`/`create` for real, and fill in the real
 * ID there. Until that file exists, this script falls back to the
 * tracked placeholder template so there's always something to inspect.
 * See meta/CLASP_AND_APPS_SCRIPT.md for the full workflow.
 *
 * cas-ccps/scripts/*.js stays the single source of truth in git — nothing
 * under .clasp-build/ is ever meant to be hand-edited or committed (it's
 * gitignored). Re-run this script any time cas-ccps/scripts/ changes,
 * before pushing.
 *
 * USAGE
 *   node tools/clasp-sync/sync.js                  # rebuild all 7 projects
 *   node tools/clasp-sync/sync.js central-ledger    # rebuild just one
 *
 * Then, once a project's template has a real scriptId:
 *   cd cas-ccps/.clasp-build/central-ledger && clasp push
 *
 * Running this with no real scriptIds filled in yet is still useful — it
 * lets you inspect exactly what would be pushed to each of the 7 live
 * projects (file lists, manifest contents) without any Google credentials
 * at all.
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT    = path.resolve(__dirname, '..', '..');
const PROJECT_MAP  = require(path.join(REPO_ROOT, 'tools/gas-lint/project-map.json'));
const MANIFEST_DIR = path.join(REPO_ROOT, 'cas-ccps/clasp/manifests');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'cas-ccps/clasp/templates');
const LOCAL_DIR    = path.join(REPO_ROOT, 'cas-ccps/clasp/local'); // gitignored — real scriptIds
const BUILD_DIR    = path.join(REPO_ROOT, 'cas-ccps/.clasp-build');

const PREFIX = 'cas-ccps:';
const requestedName = process.argv[2]; // optional single-project filter

let built = 0;
let missingRealId = 0;

for (const [projectKey, def] of Object.entries(PROJECT_MAP)) {
  if (!projectKey.startsWith(PREFIX)) continue;
  const shortName = projectKey.slice(PREFIX.length);
  if (requestedName && requestedName !== shortName) continue;

  const outDir = path.join(BUILD_DIR, shortName);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Copy every source file this project's manifest claims, flattened to
  //    its basename — Apps Script projects are a flat namespace, so there's
  //    no subfolder structure to preserve here.
  const files = [...(def.files || []), ...(def.html || [])];
  let copied = 0;
  for (const relPath of files) {
    const src = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(src)) {
      console.warn(`  [${shortName}] WARNING: ${relPath} listed in project-map.json but missing on disk — skipped.`);
      continue;
    }
    fs.copyFileSync(src, path.join(outDir, path.basename(relPath)));
    copied++;
  }

  // 2. Copy the project's appsscript.json manifest.
  const manifestSrc = path.join(MANIFEST_DIR, `${shortName}.appsscript.json`);
  let hasManifest = false;
  if (!fs.existsSync(manifestSrc)) {
    console.warn(`  [${shortName}] WARNING: no manifest at ${path.relative(REPO_ROOT, manifestSrc)} — appsscript.json omitted.`);
  } else {
    fs.copyFileSync(manifestSrc, path.join(outDir, 'appsscript.json'));
    hasManifest = true;
  }

  // 3. Materialize .clasp.json — prefer the gitignored real config under
  //    clasp/local/ (the real scriptId, never committed); fall back to the
  //    tracked placeholder template so there's still something to inspect
  //    before the real ID exists. Either way, strip the explanatory
  //    _comment key clasp itself doesn't understand.
  const localSrc    = path.join(LOCAL_DIR, `${shortName}.clasp.json`);
  const templateSrc = path.join(TEMPLATE_DIR, `${shortName}.clasp.json.template`);
  const claspSrc     = fs.existsSync(localSrc) ? localSrc : templateSrc;
  let hasRealId = false;
  if (!fs.existsSync(claspSrc)) {
    console.warn(`  [${shortName}] WARNING: no .clasp.json config at ${path.relative(REPO_ROOT, localSrc)} or ${path.relative(REPO_ROOT, templateSrc)} — .clasp.json omitted.`);
  } else {
    const tmpl = JSON.parse(fs.readFileSync(claspSrc, 'utf8'));
    hasRealId = Boolean(tmpl.scriptId) && tmpl.scriptId !== 'REPLACE_WITH_REAL_SCRIPT_ID';
    delete tmpl._comment;
    fs.writeFileSync(path.join(outDir, '.clasp.json'), JSON.stringify(tmpl, null, 2) + '\n');
  }

  const fileCount = copied + (hasManifest ? 1 : 0);
  console.log(
    `[${shortName}] built ${fileCount} file(s) -> ${path.relative(REPO_ROOT, outDir)}` +
    (hasRealId ? '' : '  (no real scriptId yet — ready to inspect, not to push)')
  );
  built++;
  if (!hasRealId) missingRealId++;
}

if (built === 0) {
  console.error(
    requestedName
      ? `No cas-ccps project named "${requestedName}" found in project-map.json.`
      : 'No cas-ccps:* projects found in project-map.json.'
  );
  process.exit(1);
}

console.log(
  `\n${built} project folder(s) built under cas-ccps/.clasp-build/.` +
  (missingRealId > 0
    ? ` ${missingRealId} still need a real scriptId — copy the matching cas-ccps/clasp/templates/*.clasp.json.template to cas-ccps/clasp/local/*.clasp.json and fill it in before pushing.`
    : '')
);
