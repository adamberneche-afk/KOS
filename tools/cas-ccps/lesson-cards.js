'use strict';
/**
 * Reads the cas-ccps lesson card decks (curriculum/lesson-cards/Stage<N>_
 * Lesson_Cards.docx) into a simple block model, for build-canvas-cartridge.js.
 *
 *   parseDocx(buffer) → blocks
 *     block = { type: 'p', style, list: bool, runs: [{ text, bold }] }
 *           | { type: 'table', rows: [[ cellBlocks ]] }
 *
 * Only what the decks use is kept: paragraphs, bold runs, list paragraphs,
 * line breaks and tables (nested ones too). Fonts, colours and shading are
 * dropped.
 *
 *   loadDecks() → { stage: { intro: blocks, cards: [{ title, badge, blocks }] } }
 *   findCard(decks, unit) → the card for a pacing-guide unit (matched by title)
 *   cardVocabulary(card) → the terms in the card's VOCABULARY table
 *   cardRow(card, label) → the second cell of the first two-column table row
 *     whose first cell is `label` ("Work product", "8175 role", "What students
 *     do"), or ''
 *   cardExtension(card, code) → the course's "goes deeper on" items under
 *     COURSE-SPECIFIC EXTENSION
 */

const fs = require('fs');
const path = require('path');
const { readZip } = require('./zip.js');

const CARDS_DIR = path.join(__dirname, '..', '..', 'cas-ccps', 'curriculum', 'lesson-cards');

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
}

/** Blocks of one document.xml. */
function parseDocumentXml(xml) {
  const body = xml.slice(xml.indexOf('<w:body'));
  const re = /<(\/?)(w:tbl|w:tr|w:tc|w:p|w:r|w:t|w:pStyle|w:numPr|w:b|w:br|w:tab|w:rPr|w:pPr)\b([^>]*?)(\/?)>|([^<]+)/g;
  const root = { blocks: [] };
  const stack = [root];            // containers: root, cell
  const tables = [];
  let para = null, run = null, inT = false, inRPr = false;
  let m;
  while ((m = re.exec(body))) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (inT && run) run.text += decode(text);
      continue;
    }
    const top = stack[stack.length - 1];
    if (!close) {
      switch (tag) {
        case 'w:tbl': { const t = { type: 'table', rows: [] }; (para ? root.blocks : top.blocks).push(t); tables.push(t); break; }
        case 'w:tr': tables[tables.length - 1].rows.push([]); break;
        case 'w:tc': { const cell = { blocks: [] }; const rows = tables[tables.length - 1].rows; rows[rows.length - 1].push(cell.blocks); stack.push(cell); break; }
        case 'w:p': if (!selfClose) { para = { type: 'p', style: '', list: false, runs: [] }; top.blocks.push(para); } else top.blocks.push({ type: 'p', style: '', list: false, runs: [] }); break;
        case 'w:pStyle': if (para) { para.style = (attrs.match(/w:val="([^"]*)"/) || [])[1] || ''; if (/List/i.test(para.style)) para.list = true; } break;
        case 'w:numPr': if (para) para.list = true; break;
        case 'w:r': if (para && !selfClose) { run = { text: '', bold: false }; para.runs.push(run); } break;
        case 'w:rPr': inRPr = !selfClose; break;
        case 'w:b': if (inRPr && run && !/w:val="(false|0)"/.test(attrs)) run.bold = true; break;
        case 'w:t': if (!selfClose) inT = true; break;
        case 'w:br': if (run) run.text += '\n'; break;
        case 'w:tab': if (run && !inRPr) run.text += '\t'; break;
        default: break;
      }
    } else {
      switch (tag) {
        case 'w:tbl': tables.pop(); break;
        case 'w:tc': stack.pop(); break;
        case 'w:p': para = null; break;
        case 'w:r': run = null; break;
        case 'w:rPr': inRPr = false; break;
        case 'w:t': inT = false; break;
        default: break;
      }
    }
  }
  return root.blocks;
}

function parseDocx(buffer) {
  const files = readZip(buffer);
  if (!files['word/document.xml']) throw new Error('not a .docx (no word/document.xml)');
  return parseDocumentXml(files['word/document.xml'].toString('utf8'));
}

/** Plain text of a block or a list of blocks. */
function textOf(b) {
  if (Array.isArray(b)) return b.map(textOf).filter(Boolean).join('\n');
  if (b.type === 'p') return b.runs.map((r) => r.text).join('').trim();
  return b.rows.map((r) => r.map(textOf).join(' | ')).join('\n');
}

const isStageBanner = (b) => b.type === 'table' && b.rows.length === 1 && b.rows[0].length === 1 &&
  /^STAGE \d+\s+·/.test(textOf(b));

/**
 * Each deck opens with two title banners and the stage's intro; then every
 * card starts with a "STAGE N · ..." banner followed by a title table whose
 * second cell holds the overlap badge ("Parallel / 8175 + 8177").
 */
function loadDecks(dir) {
  dir = dir || CARDS_DIR;
  const decks = {};
  fs.readdirSync(dir).filter((f) => /^Stage\d+_Lesson_Cards\.docx$/.test(f)).forEach((f) => {
    const stage = Number(f.match(/\d+/)[0]);
    const blocks = parseDocx(fs.readFileSync(path.join(dir, f)));
    const starts = blocks.map((b, i) => (isStageBanner(b) ? i : -1)).filter((i) => i !== -1);
    if (!starts.length) throw new Error(f + ': no "STAGE N ·" banner found');
    const intro = blocks.slice(0, starts[0]).filter((b, i) => i > 2 || b.type === 'p');
    const cards = starts.map((s, k) => {
      const body = blocks.slice(s + 1, k + 1 < starts.length ? starts[k + 1] : blocks.length);
      const head = body.find((b) => b.type === 'table');
      return { title: textOf(head.rows[0][0]), badge: textOf(head.rows[0][1]).split('\n')[0],
        blocks: body.slice(body.indexOf(head) + 1) };
    });
    decks[stage] = { intro, cards };
  });
  return decks;
}

const norm = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

function findCard(decks, unit) {
  const deck = decks[unit.stage];
  if (!deck) throw new Error('no lesson card deck for stage ' + unit.stage);
  const card = deck.cards.find((c) => norm(c.title) === norm(unit.lesson_unit_name));
  if (!card) throw new Error(unit.lesson_unit_id + ': no lesson card titled "' + unit.lesson_unit_name + '" in Stage ' + unit.stage);
  return card;
}

function cardVocabulary(card) {
  const i = card.blocks.findIndex((b) => b.type === 'p' && textOf(b) === 'VOCABULARY');
  const table = i === -1 ? null : card.blocks.slice(i + 1).find((b) => b.type === 'table');
  return table ? table.rows.map((r) => textOf(r[0])).filter(Boolean) : [];
}

function cardRow(card, label) {
  for (const b of card.blocks) {
    if (b.type !== 'table') continue;
    const row = b.rows.find((r) => r.length >= 2 && textOf(r[0]).trim() === label);
    if (row) return textOf(row[1]).trim();
  }
  return '';
}

function cardExtension(card, code) {
  const i = card.blocks.findIndex((b) => b.type === 'p' && textOf(b) === 'COURSE-SPECIFIC EXTENSION');
  if (i === -1) return [];
  const items = [];
  let course = '';
  for (const b of card.blocks.slice(i + 1)) {
    if (b.type !== 'p') break;
    const t = textOf(b).trim();
    if (t === 'VOCABULARY') break;
    const head = /^(817[57])\b.*goes deeper on:?$/.exec(t);
    if (head) { course = head[1]; continue; }
    if (t && b.list && course === code) items.push(t);
  }
  return items;
}

module.exports = { parseDocx, parseDocumentXml, textOf, loadDecks, findCard, cardVocabulary, cardRow, cardExtension };
