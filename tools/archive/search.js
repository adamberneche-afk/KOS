#!/usr/bin/env node
'use strict';
/**
 * tools/archive/search.js
 * =======================
 * Finds things in archive/ without reading all of it: it filters the
 * catalog (archive/catalog.jsonl) and the log entries (archive/entries.jsonl)
 * first, then searches the text of only what matched. A history log is
 * searched entry by entry, so a hit names the entry, its date and anchor.
 *
 * USAGE
 *   node tools/archive/search.js [filters] [pattern]
 *
 *   pattern            a case-insensitive regular expression; without one,
 *                      the matching records are listed
 *   --quarter <id>     2025-26, summer-2026, 2026-27-Q1 ... (repeatable)
 *   --kind <kind>      handoff, plan, audit, replaced, history (repeatable)
 *   --system <name>    meta, cas-ccps, kos-personal, leader-hub, drive-curation
 *   --from <date>      on or after (YYYY-MM-DD or YYYY-MM); an undated log
 *   --to <date>          entry is dated by the nearest dated entry above it
 *   --pr <N>           cites #N
 *   --files            documents only, no log entries
 *   --entries          log entries only
 *   --max <n>          matching lines shown per record (default 3)
 *   --json             one JSON object per hit
 *
 * Exit 0 with hits, 1 with none, 2 on a usage error. Node built-ins only.
 */

const lib = require('./lib');

function parseArgs(argv) {
  const o = { quarter: [], kind: [], system: [], max: 3, pattern: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); return argv[++i]; };
    if (a === '--quarter') o.quarter.push(val());
    else if (a === '--kind') o.kind.push(val());
    else if (a === '--system') o.system.push(val());
    else if (a === '--from') o.from = val();
    else if (a === '--to') o.to = val();
    else if (a === '--pr') o.pr = Number(String(val()).replace('#', ''));
    else if (a === '--max') o.max = Number(val());
    else if (a === '--files') o.files = true;
    else if (a === '--entries') o.entries = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else if (o.pattern === null) o.pattern = a;
    else throw new Error('one pattern only; quote it if it has spaces');
  }
  ['from', 'to'].forEach((k) => { if (o[k] && !lib.DATE_RE.test(o[k])) throw new Error('--' + k + ' takes YYYY-MM-DD or YYYY-MM'); });
  if (o.kind.some((k) => !lib.KINDS.includes(k))) throw new Error('--kind is one of ' + lib.KINDS.join(', '));
  return o;
}

// A date range test that treats a month as its whole span.
function inRange(date, o) {
  if (!o.from && !o.to) return true;
  if (!date) return false;
  const lo = date.length === 7 ? date + '-01' : date;
  const hi = date.length === 7 ? date + '-31' : date;
  if (o.from && hi < (o.from.length === 7 ? o.from + '-01' : o.from)) return false;
  if (o.to && lo > (o.to.length === 7 ? o.to + '-31' : o.to)) return false;
  return true;
}

function search(o, root) {
  const catalog = lib.loadCatalog(root);
  const entries = lib.readJsonl('archive/entries.jsonl', root);
  const re = o.pattern ? new RegExp(o.pattern, 'i') : null;
  const prRe = o.pr ? new RegExp('(?<![\\w&#])#' + o.pr + '\\b') : null;
  const pass = (r) => (!o.quarter.length || o.quarter.includes(r.quarter)) &&
    (!o.system.length || o.system.includes(r.system));
  const hits = [];
  const grep = (text, firstLine) => {
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length && out.length < o.max; i++) {
      if ((!re || re.test(lines[i])) && (!prRe || prRe.test(lines[i]))) out.push({ line: firstLine + i, text: lines[i].trim().slice(0, 200) });
    }
    return out;
  };

  if (!o.entries) {
    catalog.filter((r) => r.kind !== 'history' && pass(r) && (!o.kind.length || o.kind.includes(r.kind)) &&
      inRange(r.date || r.filed_on, o)).forEach((r) => {
      if (!re && !prRe) { hits.push({ id: r.id, date: r.date || r.filed_on, summary: r.summary, lines: [] }); return; }
      const text = lib.read(lib.filePath(r), root);
      const lines = grep(text, 1);
      const inMeta = re && re.test(r.summary + ' ' + r.original_path) && !prRe;
      if (lines.length || inMeta) hits.push({ id: r.id, date: r.date || r.filed_on, summary: r.summary, lines });
    });
  }
  if (!o.files && (!o.kind.length || o.kind.includes('history'))) {
    const texts = {};
    entries.filter((e) => pass(e) && inRange(e.date || e.near, o) && (!o.pr || e.prs.includes(o.pr))).forEach((e) => {
      const summary = e.title;
      if (!re && !prRe) { hits.push({ id: e.id, date: e.date || (e.near ? '~' + e.near : null), summary, lines: [] }); return; }
      if (!texts[e.file]) texts[e.file] = lib.read('archive/' + e.file, root).split('\n');
      const body = texts[e.file].slice(e.line - 1, e.line - 1 + e.lines).join('\n');
      const lines = grep(body, e.line);
      if (lines.length) hits.push({ id: e.id, date: e.date || (e.near ? '~' + e.near : null), summary, lines });
    });
  }
  return hits;
}

function main(argv, root) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error('search: ' + e.message); return 2; }
  if (o.help) { console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }
  const hits = search(o, root);
  hits.forEach((h) => {
    if (o.json) { console.log(JSON.stringify(h)); return; }
    console.log('archive/' + h.id + '  ' + (h.date || 'undated') + '  ' + h.summary);
    h.lines.forEach((l) => console.log('    ' + l.line + ': ' + l.text));
  });
  if (!o.json) console.error(hits.length + ' hit(s).');
  return hits.length ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, search, parseArgs, inRange };
