'use strict';
// The helpers every prompt generator shares: escaping text into a template
// literal, and replacing a named `const NAME = `...`.trim();` in place.
// Pure Node, build-time only; never part of a deployed script.
//
// escapeForTemplateLiteral was first shared by the two flow-prompt generators
// (an external redundancy review found it byte-for-byte identical in both).
// Since 2026-11-21 (structure audit 3.9) this file also holds
// replaceTemplateConstant, which cas-ccps's and leader-hub's generators each
// had a copy of, and leader-hub's generator uses the shared escape too. What
// else differs between the generators stays theirs: cas-ccps replaces named
// constants inside a hand-written file, kos-personal regenerates a whole file.

// Escapes for safe insertion into a template literal: backtick, `${`, and a
// literal backslash. Load-bearing, not defensive: LeaderHub's prompts carry
// fenced ```json examples (tests/leaderhub/ai-prompts.test.js).
function escapeForTemplateLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

// `src` with `const NAME = `...`.trim();` replaced by `body`, escaped. Throws,
// naming `label` (the target file), when the constant isn't there.
function replaceTemplateConstant(src, name, body, label) {
  const re = new RegExp('const ' + name + ' = `[\\s\\S]*?`\\.trim\\(\\);');
  if (!re.test(src)) throw new Error(label + ': could not find "const ' + name + ' = ..." to replace');
  const replacement = 'const ' + name + ' = `\n' + escapeForTemplateLiteral(body) + '\n`.trim();';
  return src.replace(re, () => replacement);
}

module.exports = { escapeForTemplateLiteral, replaceTemplateConstant };
