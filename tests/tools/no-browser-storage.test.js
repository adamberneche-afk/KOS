'use strict';
// The operator, 2026-10-22: "I don't want anything stored in the browser."
// No page in cas-ccps or kos-personal uses localStorage, sessionStorage or
// IndexedDB; drafts and conveniences live in page memory. leader-hub keeps
// its data in localStorage by design and is not covered here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.git', '.clasp-build', 'archived']);

function files(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(js|gs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no cas-ccps or kos-personal page stores anything in the browser', () => {
  const hits = [];
  for (const dir of ['cas-ccps', 'kos-personal']) {
    for (const f of files(path.join(ROOT, dir), [])) {
      const src = fs.readFileSync(f, 'utf8');
      if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(src)) hits.push(path.relative(ROOT, f));
    }
  }
  assert.deepEqual(hits, []);
});
