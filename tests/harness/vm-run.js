'use strict';
// Runs a snippet of extracted source (see extract-lines.js) inside a fresh
// Node vm context, seeded with whatever globals the caller supplies (e.g. a
// fixture LP_QUARTERS object, a fake localStorage), and hands back a plain
// object exposing the requested top-level names.
//
// This is intentionally the smallest thing that works: no DOM, no
// localStorage polyfill unless a caller asks for one, no attempt to run
// the real page. Functions that reach for `document`/`window` at CALL time
// (not just reference it in source that's never executed) will throw when
// invoked here — that's expected; only pull in source that's genuinely
// self-contained (pure logic, or logic that takes its dependencies as
// injected globals) with this harness.

const vm = require('vm');

// A value returned by a function that ran inside the vm context belongs to
// that context's OWN realm - its object/array literals have a different
// [[Prototype]] identity than same-shaped literals created in the main
// realm. assert.deepStrictEqual (what assert/strict's deepEqual aliases
// to) treats that as inequality ("same structure but not reference-equal"),
// which would otherwise make every test that returns a plain object/array
// fail regardless of whether the logic under test is actually correct.
// structuredClone crosses the realm boundary and rebuilds the value using
// the CALLER's (main-realm) built-ins, so a correct result compares equal
// and an actually-wrong one still fails for the right reason.
function crossRealmSafe(value) {
  if (value === null || typeof value !== 'object') return value;
  return structuredClone(value);
}

function runInSandbox(source, globals = {}, exposeNames = []) {
  const sandbox = { console, ...globals };
  const context = vm.createContext(sandbox);
  const footer = `\n;globalThis.__exported = { ${exposeNames.join(', ')} };`;
  vm.runInContext(source + footer, context);

  const raw = context.__exported || {};
  const wrapped = {};
  for (const name of exposeNames) {
    const value = raw[name];
    wrapped[name] = typeof value === 'function'
      ? (...args) => crossRealmSafe(value(...args))
      : crossRealmSafe(value);
  }
  return wrapped;
}

module.exports = { runInSandbox, crossRealmSafe };
