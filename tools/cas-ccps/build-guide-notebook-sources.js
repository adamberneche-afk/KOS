#!/usr/bin/env node
'use strict';
/**
 * Writes cas-ccps/docs/notebooklm-sources/*.md, the Markdown copies of the
 * four user guides that are uploaded to the "user guide" notebook, from the
 * guides' own HTML one folder up.
 *
 * Until 2026-10-23 these were hand conversions, and they went stale when the
 * guides were rewritten (#254): the README said they would. A notebook
 * grounds better on plain Markdown than on these self-styled pages, so the
 * copy stays, but it is generated: headings, paragraphs, numbered steps,
 * callouts (as quotes), tables, glossaries and FAQ answers are kept, and the
 * page chrome (styles, scripts, the sidebar, buttons, step numbers drawn as
 * badges) is dropped. Each copy opens with "Notebook source: {NAME}." so a
 * search for the source name finds it (rtp-core-router/notebook-plan/
 * 05_TEST_LOG.md: retrieval matches text, not titles).
 *
 *   node tools/cas-ccps/build-guide-notebook-sources.js          write the copies
 *   node tools/cas-ccps/build-guide-notebook-sources.js --check  exit 1 if any is out of date
 */

const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', '..', 'cas-ccps', 'docs');
const OUT_DIR = path.join(DOCS, 'notebooklm-sources');
const GUIDES = ['12_TeacherQuickStartGuide', 'TEACHER_REFERENCE_GUIDE', 'STUDENT_QUICK_START', 'USER_EXPERIENCE_REFERENCE'];

// ── A small HTML parser: enough for these hand-written, well-formed pages ──

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rarr: '→', larr: '←',
  hellip: '…', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', bull: '•', copy: '©' };

function decode(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : (ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m));
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) attrs[m[1].toLowerCase()] = decode(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || '');
  return attrs;
}

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/\s*([a-z0-9]+)\s*>|<([a-z0-9]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  let last = 0, m;
  const text = (t) => { if (t) stack[stack.length - 1].children.push({ text: decode(t) }); };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const node = { tag, attrs: parseAttrs(m[3] || ''), children: [] };
      stack[stack.length - 1].children.push(node);
      if (RAW.has(tag)) {
        const end = html.toLowerCase().indexOf('</' + tag, last);
        last = re.lastIndex = end === -1 ? html.length : html.indexOf('>', end) + 1;
      } else if (!VOID.has(tag) && !/\/\s*$/.test(m[3] || '')) {
        stack.push(node);
      }
    }
  }
  text(html.slice(last));
  return root;
}

// ── Markdown ──────────────────────────────────────────────────────────────

const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'details', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'html', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul']);
const SKIP_TAGS = new Set(['head', 'script', 'style', 'svg', 'nav', 'button', 'noscript', 'template', 'input', 'select',
  'textarea', 'img']);
// Page chrome by class: the sidebar and its links, the FAQ's arrow, numbers
// drawn as badges (a step's number is written by the list instead).
const SKIP_CLASSES = ['sidebar', 'faq-arrow', 'section-num', 'step-n', 'topic-anchor', 'sb-link', 'nav-link', 'page-footer',
  'kicker', 'hero-kicker', 'section-eyebrow', 'hero-pills', 'cover-tag'];
// A label and its description, drawn side by side: one list line each.
const PAIR_CLASSES = ['zone', 'status-item', 'status-row'];

const cls = (n) => ' ' + (n.attrs && n.attrs.class || '') + ' ';
const hasClass = (n, c) => cls(n).indexOf(' ' + c + ' ') !== -1;
const skipped = (n) => n.tag && (SKIP_TAGS.has(n.tag) || (n.attrs['aria-hidden'] === 'true' && n.tag !== 'div') ||
  SKIP_CLASSES.some((c) => hasClass(n, c)));
const isBlock = (n) => n.tag && BLOCK.has(n.tag);
const tidy = (s) => s.replace(/[ \t\r\n]+/g, ' ').trim();

function inline(n) {
  if (n.text !== undefined) return n.text.replace(/[ \t\r\n]+/g, ' ');
  if (skipped(n)) return '';
  if (n.tag === 'br') return '\n';
  const inner = n.children.map(inline).join('');
  const t = inner.trim();
  if (!t) return inner.replace(/\S/g, '');
  const lead = /^\s/.test(inner) ? ' ' : '', trail = /\s$/.test(inner) ? ' ' : '';
  switch (n.tag) {
    case 'strong': case 'b': return lead + '**' + t + '**' + trail;
    case 'em': case 'i': return lead + '*' + t + '*' + trail;
    case 'code': case 'kbd': return lead + '`' + t.replace(/`/g, "'") + '`' + trail;
    default: return inner;
  }
}

const inlineText = (n) => n.children.map(inline).join('').split('\n').map(tidy).filter(Boolean).join('  \n');

// Blocks for a node's children: runs of inline content become paragraphs.
function blocks(n) {
  const out = [];
  let run = [];
  const flush = () => {
    const t = run.map(inline).join('').split('\n').map(tidy).filter(Boolean).join('  \n');
    if (t) out.push(t);
    run = [];
  };
  n.children.forEach((c) => {
    if (c.tag && skipped(c)) return;
    if (c.tag && isBlock(c)) { flush(); block(c).forEach((b) => out.push(b)); } else run.push(c);
  });
  flush();
  return out;
}

const elems = (n, tag) => n.children.filter((c) => c.tag === tag && !skipped(c));
const quote = (lines) => lines.join('\n\n').split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');

function list(n, ordered) {
  return elems(n, 'li').map((li, i) => {
    const body = blocks(li).join('\n\n').split('\n');
    const mark = ordered ? (i + 1) + '. ' : '- ';
    return mark + body[0] + (body.length > 1 ? '\n' + body.slice(1).map((l) => (l ? '   ' + l : '')).join('\n') : '');
  }).join('\n');
}

function table(n) {
  const rows = [];
  const walk = (x) => x.children.forEach((c) => {
    if (!c.tag || skipped(c)) return;
    if (c.tag === 'tr') rows.push(c.children.filter((d) => d.tag === 'td' || d.tag === 'th')
      .map((d) => blocks(d).join(' ').replace(/\|/g, '\\|').replace(/  \n/g, ' ')));
    else walk(c);
  });
  walk(n);
  if (!rows.length) return [];
  const width = Math.max.apply(null, rows.map((r) => r.length));
  const pad = (r) => r.concat(new Array(width - r.length).fill(''));
  return [[pad(rows[0]), new Array(width).fill('---')].concat(rows.slice(1).map(pad))
    .map((r) => '| ' + r.join(' | ') + ' |').join('\n')];
}

function block(n) {
  const h = /^h([1-6])$/.exec(n.tag);
  if (h) { const t = inlineText(n); return t ? ['#'.repeat(Number(h[1])) + ' ' + t.replace(/ {2}\n/g, ' ')] : []; }
  switch (n.tag) {
    case 'p': { const t = inlineText(n); return t ? [t] : []; }
    case 'hr': return ['---'];
    case 'pre': {
      const t = n.children.map(function raw(c) { return c.text !== undefined ? c.text : c.children.map(raw).join(''); }).join('');
      return ['```\n' + t.replace(/^\n+|\s+$/g, '') + '\n```'];
    }
    case 'ul': return [list(n, false)];
    case 'ol': return [list(n, true)];
    case 'table': return table(n);
    case 'blockquote': return [quote(blocks(n))];
    case 'dl': {
      const items = [];
      let term = null;
      // dt/dd pairs may sit in a wrapping <div>, which HTML allows.
      (function walk(x) {
        x.children.forEach((c) => {
          if (!c.tag || skipped(c)) return;
          if (c.tag === 'dt') term = inlineText(c);
          else if (c.tag === 'dd') { items.push('- **' + (term || '') + '**: ' + blocks(c).join(' ')); term = null; }
          else walk(c);
        });
      })(n);
      return items.length ? [items.join('\n')] : [];
    }
    case 'details': {
      const summary = n.children.find((c) => c.tag === 'summary');
      const rest = { tag: 'div', attrs: {}, children: n.children.filter((c) => c !== summary) };
      return (summary ? ['### ' + inlineText(summary)] : []).concat(blocks(rest));
    }
  }
  if (PAIR_CLASSES.some((c) => hasClass(n, c))) {
    const parts = blocks(n);
    if (parts.length >= 2) {
      // A zone's tag ("You write here") comes last in the markup.
      const tag = hasClass(n, 'zone') && parts.length > 2 ? ' (' + parts[parts.length - 1] + ')' : '';
      const desc = hasClass(n, 'zone') && parts.length > 2 ? parts.slice(1, -1) : parts.slice(1);
      return ['- **' + parts[0].replace(/\*\*/g, '') + '**' + tag + ': ' + desc.join(' ')];
    }
  }
  if (hasClass(n, 'eval-sample')) return [quote(blocks(n))];
  if (n.tag === 'div' && /-(label|header)( |$)/.test(cls(n).trim()) && !n.children.some((c) => isBlock(c))) {
    const t = inlineText(n);
    return t ? ['**' + t.replace(/\*\*/g, '') + '**'] : [];
  }
  if (hasClass(n, 'callout') || hasClass(n, 'note')) return [quote(blocks(n).length > 1 && /^\S{1,3}$/.test(blocks(n)[0])
    ? [blocks(n)[0] + ' ' + blocks(n).slice(1).join('\n\n')] : blocks(n))];
  if (hasClass(n, 'steps')) {
    const steps = n.children.filter((c) => c.tag && hasClass(c, 'step'));
    if (steps.length) {
      return [steps.map((s, i) => {
        const parts = blocks(s);
        return (i + 1) + '. ' + parts[0] + (parts.length > 1 ? ': ' + parts.slice(1).join(' ') : '');
      }).join('\n')];
    }
  }
  return blocks(n);
}

function convert(html, name, file) {
  const root = parse(html);
  const body = (function find(n) {
    if (n.tag === 'body') return n;
    for (const c of n.children || []) { const f = c.tag && find(c); if (f) return f; }
    return null;
  })(root) || root;
  let out = blocks(body).join('\n\n');
  if (!/^# /m.test(out)) {
    const title = (function find(n) {
      if (n.tag === 'title') return inlineText(n);
      for (const c of n.children || []) { const f = c.tag && find(c); if (f) return f; }
      return '';
    })(root);
    out = '# ' + title + '\n\n' + out;
  }
  const head = '<!-- Generated from ../' + file + ' by tools/cas-ccps/build-guide-notebook-sources.js. ' +
    'Edit the HTML guide, then re-run it. -->\n\n';
  // The source line goes right under the first heading.
  const h1 = out.search(/^# /m);
  const eol = out.indexOf('\n', h1);
  out = eol === -1 ? out + '\n\nNotebook source: ' + name + '.'
    : out.slice(0, eol) + '\n\nNotebook source: ' + name + '.' + out.slice(eol);
  return head + out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function build() {
  return GUIDES.map((g) => {
    const file = g + '.html';
    return { file: g + '.md', text: convert(fs.readFileSync(path.join(DOCS, file), 'utf8'), g, file) };
  });
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  let stale = 0;
  build().forEach((e) => {
    const dest = path.join(OUT_DIR, e.file);
    const now = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (now === e.text) return;
    if (check) { stale++; console.log('out of date: cas-ccps/docs/notebooklm-sources/' + e.file); } else {
      fs.writeFileSync(dest, e.text);
      console.log('wrote cas-ccps/docs/notebooklm-sources/' + e.file);
    }
  });
  if (check && stale) { console.log('run: node tools/cas-ccps/build-guide-notebook-sources.js'); process.exit(1); }
  if (check) console.log('guide notebook sources up to date.');
}

module.exports = { build, convert, parse, GUIDES };
