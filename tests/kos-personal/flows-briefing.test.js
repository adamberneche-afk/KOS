'use strict';
// kos-personal/claude-project/FLOWS_BRIEFING.md is hand-written: the RTP
// (the KOS Claude Project) can't read the repo, so this knowledge file tells
// it what each pipeline behind its signals is for (plan, "RTP harness notes",
// 2026-11-15). Hand-written because tools/gas-lint/flow-map.json declares
// only the Studio flows' surfaces, not ingestion, the briefing docs, the
// watchdog or the Ledger cycle.
//
// Pins that it stays true to the code by name: every repo file it cites
// exists, every function it names is declared in kos-personal or cas-ccps,
// and every entry cites at least one file. A rename or removal fails here,
// so the briefing is fixed in the same PR. It also pins that the Project
// instructions point the RTP to it, and that it carries no email address.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BRIEFING = path.join(ROOT, 'kos-personal', 'claude-project', 'FLOWS_BRIEFING.md');
const INSTRUCTIONS = path.join(ROOT, 'kos-personal', 'claude-project', 'PROJECT_INSTRUCTIONS.md');
const text = fs.readFileSync(BRIEFING, 'utf8');

function sourceFiles(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name === 'node_modules' || e.name === 'archive' || e.name === 'archived') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(gs|js)$/.test(e.name)) out.push(p);
  });
  return out;
}

const SOURCE = sourceFiles(path.join(ROOT, 'kos-personal'), [])
  .concat(sourceFiles(path.join(ROOT, 'cas-ccps', 'scripts'), []))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');
const DECLARED = new Set(Array.from(SOURCE.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g), (m) => m[1]));

function backticked() {
  return Array.from(text.matchAll(/`([^`\n]+)`/g), (m) => m[1]);
}

test('every repo file the briefing cites exists', () => {
  const files = backticked().filter((t) => /^(kos-personal|cas-ccps)\/[\w./-]+\.(gs|js)$/.test(t));
  assert.ok(files.length >= 20, 'expected the briefing to cite its files; found ' + files.length);
  const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, [], 'cited files that no longer exist: ' + missing.join(', '));
});

test('every function the briefing names is declared in kos-personal or cas-ccps', () => {
  const fns = backticked().map((t) => /^([A-Za-z_$][\w$]*)\(\)$/.exec(t)).filter(Boolean).map((m) => m[1]);
  assert.ok(fns.length >= 20, 'expected the briefing to name its functions; found ' + fns.length);
  const missing = Array.from(new Set(fns)).filter((fn) => !DECLARED.has(fn));
  assert.deepEqual(missing, [], 'named functions declared nowhere: ' + missing.join(', '));
});

test('every entry cites the code it describes', () => {
  // An entry starts with a bold name ending in a full stop ("**The Registrar.**").
  const entries = text.split(/\n(?=\*\*[^*\n]+\.\*\*)/).slice(1)
    .filter((e) => !e.startsWith('**How to use it.**'));
  assert.ok(entries.length >= 12, 'expected an entry per pipeline; found ' + entries.length);
  entries.forEach((e) => {
    const name = /^\*\*([^*]+)\*\*/.exec(e)[1];
    assert.match(e, /\*Code:\*\s+`(kos-personal|cas-ccps)\//, name + ' cites no file');
  });
});

test('the family signal entry states the archive rule as the code has it', () => {
  // 60's writeFamilySignal: an archived thread is in no list, whichever it
  // was in (plan L4; the RTP once called the opposite "confirmed").
  assert.match(text, /Archived = handled, in neither list/);
  assert.match(text, /FILED WITHOUT A REPLY/);
});

test('the Project instructions point the RTP to the briefing', () => {
  const instructions = fs.readFileSync(INSTRUCTIONS, 'utf8');
  const body = instructions.slice(instructions.indexOf('\n---\n'));
  const mentions = body.match(/FLOWS_BRIEFING/g) || [];
  assert.ok(mentions.length >= 2, 'expected FLOWS_BRIEFING in "What you can read" and the verification gate');
});

test('the briefing carries no email address', () => {
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/);
});
