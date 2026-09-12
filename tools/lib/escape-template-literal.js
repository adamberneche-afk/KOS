'use strict';
// Shared by tools/cas-ccps/generate-flow-prompts.js and
// tools/kos-personal/generate-flow-prompts.js — both scripts had this exact
// function, independently written, byte-for-byte identical (an external
// redundancy review flagged it as the one piece of that duplication with no
// GAS-isolation excuse: both are pure Node, build-time only, never touch a
// deployed script's runtime). Extracted here rather than left duplicated;
// everything else about the two scripts' regeneration mechanisms stays
// genuinely different — cas-ccps's replaces named constants in place inside
// an existing file with real hand-written logic around them, kos-personal's
// regenerates a fully-generated file from scratch — so unifying past this
// one helper would mean building an abstraction flexible enough to cover
// both shapes, which is worse than the small duplication it would remove.
//
// Escapes for safe insertion into a template literal — backtick, `${`, and
// a literal backslash all need it.
function escapeForTemplateLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

module.exports = { escapeForTemplateLiteral };
