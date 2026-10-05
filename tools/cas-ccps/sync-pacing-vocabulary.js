#!/usr/bin/env node
'use strict';
/**
 * Sets each unit's key_vocabulary and vocabulary_with_definitions in the
 * pacing guide (curriculum/PacingGuide_CAS_Context.json and .csv) from the
 * VOCABULARY table of the unit's lesson card (curriculum/lesson-cards/).
 *
 * The two fields had been scraped from the cards' tables and picked up the
 * wrong rows: table labels ("What students do" in 19 units, "Distribution
 * chain node" and "Role context" in Stage 0, "Career plan component" in
 * S9-U1), SWOT table text in S8-U1, no first term in seven units (DECA,
 * Brand, Esports, ...), "Sports, entertainment & events industry" split in
 * two at its comma, and an older term list in S4-U1. key_vocabulary feeds the
 * warm-up prompts ({pacing_key_vocabulary}, 40_FlowPrompts.js). The
 * pacing guide .docx already lists the cards' terms and is not touched.
 *
 * Only those two fields (and metadata.total_vocab_terms in the JSON) change;
 * both files are rewritten in their existing formatting.
 *
 *   node tools/cas-ccps/sync-pacing-vocabulary.js          write both files
 *   node tools/cas-ccps/sync-pacing-vocabulary.js --check  exit 1 if either is out of date
 */

const fs = require('fs');
const path = require('path');
const { loadDecks, findCard, textOf } = require('./lesson-cards.js');

const DIR = path.join(__dirname, '..', '..', 'cas-ccps', 'curriculum');
const JSON_PATH = path.join(DIR, 'PacingGuide_CAS_Context.json');
const CSV_PATH = path.join(DIR, 'PacingGuide_CAS_Context.csv');

/** [{ term, definition }] from a card's VOCABULARY table. */
function cardTerms(card) {
  const i = card.blocks.findIndex((b) => b.type === 'p' && textOf(b) === 'VOCABULARY');
  const table = i === -1 ? null : card.blocks.slice(i + 1).find((b) => b.type === 'table');
  if (!table) throw new Error(card.title + ': no VOCABULARY table');
  return table.rows.map((r) => ({ term: textOf(r[0]), definition: textOf(r[1] || []) }))
    .filter((t) => t.term);
}

// RFC 4180, as the file is written: fields quoted only when they hold a
// comma, a quote or a line break; CRLF or LF line ends kept as found.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function writeCsv(rows, eol) {
  const cell = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return rows.map((r) => r.map(cell).join(',')).join(eol) + eol;
}

/** The CSV's vocabulary cells are Python json.dumps output: ", " and ": " separators, non-ASCII escaped. */
function pyJson(terms) {
  const str = (v) => JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return '[' + terms.map((t) => '{"term": ' + str(t.term) + ', "definition": ' + str(t.definition) + '}').join(', ') + ']';
}

function build() {
  const decks = loadDecks();
  const jsonRaw = fs.readFileSync(JSON_PATH, 'utf8');
  const csvRaw = fs.readFileSync(CSV_PATH, 'utf8');
  const eol = /\r\n/.test(csvRaw) ? '\r\n' : '\n';
  if (JSON.stringify(JSON.parse(jsonRaw), null, 2) !== jsonRaw) throw new Error('JSON is not in JSON.stringify(_, null, 2) form');
  const rows = parseCsv(csvRaw);
  if (writeCsv(rows, eol) !== csvRaw) throw new Error('CSV does not round-trip; refusing to rewrite it');
  const iVd0 = rows[0].indexOf('vocabulary_with_definitions');
  rows.slice(1).forEach((r) => {
    if (r[iVd0] && pyJson(JSON.parse(r[iVd0])) !== r[iVd0]) throw new Error('CSV vocabulary cell is not in json.dumps form: ' + r[0]);
  });

  const data = JSON.parse(jsonRaw);
  const byUnit = {};
  data.pacing_guide.forEach((u) => {
    const terms = cardTerms(findCard(decks, u));
    byUnit[u.lesson_unit_id] = terms;
    u.key_vocabulary = terms.map((t) => t.term).join(', ');
    u.vocabulary_with_definitions = terms;
  });
  if (data.metadata && 'total_vocab_terms' in data.metadata) {
    data.metadata.total_vocab_terms = Object.values(byUnit).reduce((n, t) => n + t.length, 0);
  }

  const header = rows[0];
  const iId = header.indexOf('lesson_unit_id');
  const iKv = header.indexOf('key_vocabulary');
  const iVd = header.indexOf('vocabulary_with_definitions');
  if (iId === -1 || iKv === -1 || iVd === -1) throw new Error('CSV is missing lesson_unit_id / key_vocabulary / vocabulary_with_definitions');
  rows.slice(1).forEach((r) => {
    const terms = byUnit[r[iId]];
    if (!terms) return;
    r[iKv] = terms.map((t) => t.term).join(', ');
    r[iVd] = pyJson(terms);
  });

  return { json: JSON.stringify(data, null, 2), csv: writeCsv(rows, eol), byUnit };
}

function main() {
  const check = process.argv.includes('--check');
  const out = build();
  const stale = [[JSON_PATH, out.json], [CSV_PATH, out.csv]].filter(([p, text]) => fs.readFileSync(p, 'utf8') !== text);
  if (check) {
    if (stale.length) {
      console.error('pacing guide vocabulary out of date: ' + stale.map(([p]) => path.basename(p)).join(', '));
      console.error('Run: node tools/cas-ccps/sync-pacing-vocabulary.js');
      process.exit(1);
    }
    console.log('pacing guide vocabulary matches the lesson cards.');
    return;
  }
  stale.forEach(([p, text]) => fs.writeFileSync(p, text));
  console.log('Updated ' + (stale.map(([p]) => path.basename(p)).join(', ') || 'nothing') + '.');
}

if (require.main === module) main();
module.exports = { build, parseCsv, writeCsv, cardTerms, pyJson };
