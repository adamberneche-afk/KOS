#!/usr/bin/env node
'use strict';
/**
 * tools/archive/file.js
 * =====================
 * Files things into archive/ by the archive's rules, in one step, so a
 * session can't apply them differently. Two modes.
 *
 * 1. FILE A DOC OR A FOLDER
 *
 *   node tools/archive/file.js <path> --summary "<one line>" [options]
 *
 *   --date <d>          when it was written (YYYY-MM-DD or YYYY-MM). Without
 *                       it: the date in the file's name, else the earliest
 *                       date near its top (a folder needs --date or --filed-on)
 *   --filed-on <d>      the date to file by when it has no written date
 *                       (when it was replaced or retired); with --filed-by
 *   --filed-by "<why>"  how it was filed, in words (required with --filed-on,
 *                       or with --quarter for a judgment call)
 *   --quarter <id>      only when the date can't decide it (a month that
 *                       spans two quarters, or no date at all)
 *   --kind <kind>       handoff, plan, audit, replaced; guessed from the name
 *   --superseded-by <p> the live path that replaced it
 *   --dry-run           print what would happen, change nothing
 *
 *   It moves <path> to archive/<quarter>/<path> with `git mv`, repoints the
 *   live links and path mentions (Markdown links recomputed, full paths in
 *   code, config and docs prefixed), adds the record to
 *   archive/catalog.jsonl and rebuilds the indexes. A folder gets one record
 *   that covers every file under it. It prints each file it changed, and
 *   warns on references it can't rewrite safely (a path built from quoted
 *   segments, like path.join('cas-ccps', 'archived')): fix those by hand.
 *
 * 2. ROLL THE HISTORY LOGS OVER (when a plan of record is replaced)
 *
 *   node tools/archive/file.js --rollover-logs --before <YYYY-MM-DD> [--dry-run]
 *
 *   For each live log (lib.LIVE_LOGS), every entry dated before <date> moves
 *   word for word to archive/<its quarter>/<log path>, in the log's own
 *   order; an undated entry goes by the nearest dated entry above it (at
 *   the top of an oldest-first log, the first dated one below). A
 *   quarter's part gets a header and a catalog record the first time. The
 *   live log's pointer to its archived parts is rewritten.
 *
 * Node built-ins and git only.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./lib');
const build = require('./build');

const TEXT_EXT = /\.(md|js|gs|mjs|cjs|json|jsonl|yml|yaml|html|txt|sh|py|template)$|(^|\/)\.[a-z]+ignore$|(^|\/)\.gitignore$/;
const TODAY = () => new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const o = { paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); return argv[++i]; };
    const map = { '--summary': 'summary', '--date': 'date', '--filed-on': 'filedOn', '--filed-by': 'filedBy',
      '--quarter': 'quarter', '--kind': 'kind', '--superseded-by': 'supersededBy', '--before': 'before' };
    if (map[a]) o[map[a]] = val();
    else if (a === '--dry-run') o.dry = true;
    else if (a === '--rollover-logs') o.rollover = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else o.paths.push(a.replace(/\\/g, '/'));
  }
  ['date', 'filedOn', 'before'].forEach((k) => {
    if (o[k] && !lib.DATE_RE.test(o[k])) throw new Error('--' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ' takes YYYY-MM-DD or YYYY-MM');
  });
  if (o.rollover) {
    if (!o.before || o.before.length !== 10) throw new Error('--rollover-logs needs --before YYYY-MM-DD');
  } else {
    if (o.paths.length !== 1) throw new Error('give one path to file (run it again for the next)');
    if (!o.summary) throw new Error('--summary is required: one line on what it is');
    if (o.kind && !['handoff', 'plan', 'audit', 'replaced'].includes(o.kind)) throw new Error('--kind is handoff, plan, audit or replaced');
    if (o.filedOn && !o.filedBy) throw new Error('--filed-on needs --filed-by: say why that date');
  }
  return o;
}

function git(args, root) {
  return execFileSync('git', args, { cwd: root || lib.REPO_ROOT, encoding: 'utf8' });
}

function guessKind(p) {
  if (/HANDOFF|CLOSEOUT/.test(p)) return 'handoff';
  if (/PLAN|SPRINT|PSD_|notebook-plan\//.test(p)) return 'plan';
  if (/AUDIT|REVIEW|WALKTHROUGH/.test(p)) return 'audit';
  return 'replaced';
}

// The record for a path, by the archive's rules, or an error saying what
// to add.
function plan(o, root, quarters) {
  const base = root || lib.REPO_ROOT;
  const rel = o.paths[0].replace(/\/$/, '');
  const abs = path.join(base, rel);
  if (!fs.existsSync(abs)) throw new Error(rel + ': no such file or folder');
  if (rel.startsWith(lib.ARCHIVE + '/')) throw new Error(rel + ' is already in the archive');
  const folder = fs.statSync(abs).isDirectory();
  let date = o.date || null;
  let filedBy = o.filedBy || null;
  if (!date && !o.filedOn && !folder) {
    const inName = /\d{4}-\d{2}-\d{2}/.exec(path.basename(rel));
    if (inName) { date = inName[0]; filedBy = filedBy || 'the date in its name'; }
    else if (TEXT_EXT.test(rel)) {
      const top = fs.readFileSync(abs, 'utf8').split('\n').slice(0, 15).join('\n').match(/20\d\d-[01]\d-[0-3]\d/g);
      if (top) { date = top.sort()[0]; filedBy = filedBy || 'the earliest date near its top'; }
    }
  }
  if (date && !filedBy) filedBy = 'its own date';
  const filedOn = o.filedOn || date;
  let quarter = o.quarter;
  if (!quarter) {
    const qs = lib.quartersFor(filedOn, quarters);
    if (qs.length !== 1) {
      throw new Error(rel + ': ' + (filedOn ? filedOn + ' falls in ' + (qs.join(' and ') || 'no quarter') : 'no date found') +
        '. Give --date (when written), or --filed-on with --filed-by, or --quarter with --filed-by.');
    }
    quarter = qs[0];
  } else if (!filedBy) throw new Error('--quarter needs --filed-by: say why that quarter');
  if (!quarters.some((q) => q.id === quarter)) throw new Error('unknown quarter ' + quarter);
  if (filedOn && !lib.quartersFor(filedOn, quarters).includes(quarter)) throw new Error(filedOn + ' is not in ' + quarter);
  const original = rel + (folder ? '/' : '');
  const rec = { id: quarter + '/' + original, original_path: original, quarter, kind: o.kind || guessKind(rel),
    system: rel.split('/')[0], date, filed_on: filedOn, filed_by: filedBy || '', archived: TODAY(), summary: o.summary };
  if (o.supersededBy) rec.superseded_by = o.supersededBy;
  if (!rec.filed_by) throw new Error(rel + ': say how it was filed with --filed-by');
  return { rel, folder, rec, target: path.posix.join(lib.ARCHIVE, rec.id).replace(/\/$/, '') };
}

// Rewrites every live reference to `from` (a file, or a folder and all
// under it) to point at `to`. Returns { changed: {file: lines}, warnings }.
function repoint(from, to, folder, root, dry) {
  const base = root || lib.REPO_ROOT;
  const files = git(['ls-files'], root).split('\n')
    .filter((f) => f && !f.startsWith(lib.ARCHIVE + '/') && TEXT_EXT.test(f) && fs.existsSync(path.join(base, f)));
  const inside = (r) => (folder ? r === from || r.startsWith(from + '/') : r === from);
  const moved = (r) => to + r.slice(from.length);
  const linkRe = /(\]\()([^)\s#]+)(#[^)\s]*)?(\))/g;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mention = new RegExp('(?<![\\w/.-])' + esc + (folder ? '(?=/|(?![\\w-]))' : '(?![\\w])'), 'g');
  const segs = from.split('/');
  const segRe = segs.length > 1 ? new RegExp(segs.map((s) => '[\'"]' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]').join('\\s*,\\s*')) : null;
  const changed = {};
  const warnings = [];
  files.forEach((f) => {
    const abs = path.join(base, f);
    const s = fs.readFileSync(abs, 'utf8');
    let t = s;
    if (f.endsWith('.md')) {
      t = t.replace(linkRe, (m, a, target, frag, b) => {
        if (/^[a-z]+:/i.test(target)) return m;
        const r = path.posix.normalize(path.posix.join(path.posix.dirname(f), target)).replace(/\/$/, '');
        if (!inside(r)) return m;
        const n = path.posix.relative(path.posix.dirname(f), moved(r)) + (target.endsWith('/') ? '/' : '');
        return a + n + (frag || '') + b;
      });
    }
    t = t.replace(mention, to);
    if (t !== s) {
      const a = s.split('\n');
      const b = t.split('\n');
      changed[f] = a.filter((l, i) => l !== b[i]).length;
      if (!dry) fs.writeFileSync(abs, t);
    }
    if (segRe && segRe.test(t)) warnings.push(f + ': builds the path from quoted segments; repoint it by hand');
  });
  return { changed, warnings };
}

function appendRecord(rec, root) {
  const p = path.join(root || lib.REPO_ROOT, lib.ARCHIVE, 'catalog.jsonl');
  fs.appendFileSync(p, JSON.stringify(rec) + '\n');
}

function fileOne(o, root) {
  const quarters = lib.loadQuarters(root);
  const { rel, folder, rec, target } = plan(o, root, quarters);
  if (lib.loadCatalog(root).some((r) => r.id === rec.id)) throw new Error(rec.id + ' is already in the catalog');
  console.log((o.dry ? '[dry run] ' : '') + 'file ' + rel + (folder ? '/' : '') + ' -> ' + target + (folder ? '/' : '') +
    '  (' + rec.quarter + ', ' + rec.kind + ', filed by ' + rec.filed_by + ')');
  if (!o.dry) {
    fs.mkdirSync(path.dirname(path.join(root || lib.REPO_ROOT, target)), { recursive: true });
    git(['mv', rel, target], root);
  }
  const { changed, warnings } = repoint(rel, target, folder, root, o.dry);
  Object.entries(changed).forEach(([f, n]) => console.log('  repointed ' + f + ' (' + n + ' line' + (n === 1 ? '' : 's') + ')'));
  warnings.forEach((w) => console.warn('  warning: ' + w));
  if (o.dry) { console.log('  would add: ' + JSON.stringify(rec)); return 0; }
  appendRecord(rec, root);
  return build.main([], root);
}

// --- the log rollover -------------------------------------------------------

const POINTER_START = '<!-- archive:pointer (tools/archive/file.js writes this) -->';
const POINTER_END = '<!-- /archive:pointer -->';

function partHeader(logPath, q, order) {
  return ['# `' + logPath + '`: ' + q.title + ' (archived)', '',
    'The entries of `' + logPath + '` from this school quarter, moved word for',
    'word out of the live log when a plan of record was replaced' +
      (order === 'newest-first' ? ', newest first as the log runs' : ', oldest first') + '; an',
    'undated entry stands where it stood. Links inside are relative to the',
    'live file\'s folder. The live log: [`' + logPath + '`](' +
      path.posix.relative(path.posix.dirname(path.posix.join(lib.ARCHIVE, q.id, logPath)), logPath) + ').', ''].join('\n');
}

function pointerBlock(logPath, catalog, quarters, before) {
  const parts = quarters.filter((q) => catalog.some((r) => r.id === q.id + '/' + logPath));
  const links = parts.map((q) => '[' + q.title + '](' + path.posix.relative(path.posix.dirname(logPath),
    path.posix.join(lib.ARCHIVE, q.id, logPath)) + ')').join(', ');
  return [POINTER_START,
    '**Entries before ' + before + '** are archived word for word by school quarter: ' + links + '.',
    'This file holds the current plan of record\'s era; `node tools/archive/search.js --entries`',
    'searches the archived ones entry by entry.', POINTER_END].join('\n');
}

// Replaces the pointer block, or the hand-written pointer paragraph that
// came before the markers, or inserts one after the log's intro.
function setPointer(text, block) {
  if (text.includes(POINTER_START)) {
    return text.replace(new RegExp(POINTER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' +
      POINTER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), block);
  }
  const old = /\n\*\*Entries before \d{4}-\d{2}-\d{2}\*\*[\s\S]*?\n(?=\n)/;
  if (old.test(text)) return text.replace(old, '\n' + block);
  return null;
}

function rollover(o, root) {
  const base = root || lib.REPO_ROOT;
  const quarters = lib.loadQuarters(root);
  let catalog = lib.loadCatalog(root);
  let moved = 0;
  lib.LIVE_LOGS.forEach((log) => {
    const abs = path.join(base, log.path);
    if (!fs.existsSync(abs)) return;
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    const entries = lib.parseEntries(text);
    // An undated entry goes by the nearest dated entry above it; at the top
    // of an oldest-first log (nothing dated above, so older than all), by
    // the first dated one below. At the top of a newest-first log it is
    // the newest and stays.
    const firstBelow = (k) => { for (let j = k + 1; j < entries.length; j++) if (entries[j].date) return entries[j].date; return null; };
    entries.forEach((e, k) => { e.eff = e.date || e.near || (log.order === 'oldest-first' ? firstBelow(k) : null); });
    const go = entries.filter((e) => e.eff && e.eff < o.before);
    if (!go.length) { console.log(log.path + ': nothing before ' + o.before); return; }
    const byQ = {};
    go.forEach((e) => {
      const qs = lib.quartersFor(e.eff, quarters);
      if (qs.length !== 1) throw new Error(log.path + ': entry "' + e.title + '" (' + e.eff + ') falls in no single quarter; add its quarter to archive/quarters.json');
      (byQ[qs[0]] = byQ[qs[0]] || []).push(e);
    });
    const keep = new Set(lines.map((_, i) => i));
    go.forEach((e) => { for (let i = e.line - 1; i < e.line - 1 + e.lines; i++) keep.delete(i); });
    Object.entries(byQ).forEach(([qid, es]) => {
      const q = quarters.find((x) => x.id === qid);
      const partRel = path.posix.join(lib.ARCHIVE, qid, log.path);
      const partAbs = path.join(base, partRel);
      const block = es.map((e) => lines.slice(e.line - 1, e.line - 1 + e.lines).join('\n').replace(/\s+$/, '')).join('\n\n');
      console.log((o.dry ? '[dry run] ' : '') + log.path + ': ' + es.length + ' entr' + (es.length === 1 ? 'y' : 'ies') + ' -> ' + partRel);
      moved += es.length;
      if (o.dry) return;
      fs.mkdirSync(path.dirname(partAbs), { recursive: true });
      if (fs.existsSync(partAbs)) {
        const cur = fs.readFileSync(partAbs, 'utf8').replace(/\s+$/, '');
        if (log.order === 'oldest-first') fs.writeFileSync(partAbs, cur + '\n\n' + block + '\n');
        else {
          const curEntries = lib.parseEntries(cur);
          const at = curEntries.length ? curEntries[0].line - 1 : cur.split('\n').length;
          const cl = cur.split('\n');
          fs.writeFileSync(partAbs, cl.slice(0, at).join('\n').replace(/\s+$/, '') + '\n\n' + block + '\n\n' + cl.slice(at).join('\n') + '\n');
        }
      } else {
        fs.writeFileSync(partAbs, partHeader(log.path, q, log.order) + '\n' + block + '\n');
        const rec = { id: qid + '/' + log.path, original_path: log.path, quarter: qid, kind: 'history', system: log.path.split('/')[0],
          date: null, filed_on: null, filed_by: 'a history log: each entry is indexed on its own (entries.jsonl)',
          archived: TODAY(), summary: log.path + ': the quarter\'s entries, moved out of the live log', continues_in: log.path };
        appendRecord(rec, root);
        catalog = lib.loadCatalog(root);
      }
    });
    if (o.dry) return;
    let live = lines.filter((_, i) => keep.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
    const withPointer = setPointer(live, pointerBlock(log.path, catalog, quarters, o.before));
    if (withPointer === null) {
      const first = lib.parseEntries(live)[0];
      const ll = live.split('\n');
      const at = first ? first.line - 1 : ll.length;
      live = ll.slice(0, at).join('\n').replace(/\s+$/, '') + '\n\n' + pointerBlock(log.path, catalog, quarters, o.before) + '\n\n' + ll.slice(at).join('\n');
    } else live = withPointer;
    fs.writeFileSync(abs, live.replace(/\s+$/, '') + '\n');
  });
  console.log((o.dry ? '[dry run] ' : '') + moved + ' entr' + (moved === 1 ? 'y' : 'ies') + ' moved.');
  if (o.dry || !moved) return 0;
  return build.main([], root);
}

function main(argv, root) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error('file: ' + e.message); return 2; }
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }
  try { return o.rollover ? rollover(o, root) : fileOne(o, root); } catch (e) { console.error('file: ' + e.message); return 1; }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, plan, repoint, rollover, setPointer, pointerBlock, partHeader, POINTER_START };
