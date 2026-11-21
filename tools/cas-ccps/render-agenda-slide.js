#!/usr/bin/env node
'use strict';
// Draws the daily agenda slide (67's agendaSlideSpec_) as a picture, without
// Google: the same layout data the Apps Script draws on the slide, as HTML
// in points, then a PNG through the pre-installed Playwright Chromium.
//
//   node tools/cas-ccps/render-agenda-slide.js <yyyy-mm-dd> <lesson key>=<periods> [<lesson key>=<periods> ...] [out.png]
//     e.g. 2026-11-19 8177-product-pitch-financial-analysis=4 /tmp/agenda.png
//          2026-11-23 8175-L11=1,3-Odd 8177-product-pitch-financial-analysis=4   (both courses on one slide)
//   --html     write the HTML only (no browser)
//   --announce "text"   an announcement (repeatable)
//
// It prints any text box whose text overflows it. Lesson data comes from
// 55b; the itinerary is the lesson's plan fitted to each period's minutes on
// that day's schedule (what the slide shows when no lesson doc exists).
// Curriculum only: no student data.

const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../../tests/harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const FILES = require('../lib/repo.js').projectMap()['cas-ccps:central-ledger'].files.map((f) => path.join(ROOT, f));

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A spec as one HTML page, in points, as Slides lays it out: Arial, a text
// box's 7.2 pt padding, 1.2 line height.
function specHtml(spec) {
  const els = spec.elements.map((e, i) => {
    const box = `left:${e.x}pt;top:${e.y}pt;width:${e.w}pt;height:${e.h}pt`;
    if (e.kind === 'rect') return `<div class="r" style="${box};background:${e.fill}"></div>`;
    // The line's height follows its largest run, as in Slides (not the page's default font size).
    const paras = e.paras.map((p) => `<p style="font-size:${Math.max(...p.map((r) => r.size))}pt">` + p.map((r) =>
      `<span style="font-size:${r.size}pt;color:${r.color || '#202124'};font-weight:${r.bold ? 700 : 400};font-style:${r.italic ? 'italic' : 'normal'}">${esc(r.t)}</span>`
    ).join('') + '</p>').join('');
    return `<div class="t" data-i="${i}" style="${box};text-align:${e.align === 'right' ? 'right' : e.align === 'center' ? 'center' : 'left'};` +
      `justify-content:${e.valign === 'middle' ? 'center' : 'flex-start'}">${paras}</div>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#888}
.slide{position:relative;width:${spec.width}pt;height:${spec.height}pt;background:${spec.background};overflow:hidden;font-family:Arial,Helvetica,sans-serif}
.r{position:absolute}
.t{position:absolute;box-sizing:border-box;padding:7.2pt;display:flex;flex-direction:column}
.t p{margin:0;line-height:1.2;white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body><div class="slide">
${els}
</div></body></html>`;
}

// The slide's data for a day: each course's lesson, as 67 builds it from the
// plan; one course alone, or several on one slide. lessons: [{ key, periods }].
function sampleDay(x, ymd, lessons, announcements) {
  const one = lessons.map((l) => sampleData(x, l.key, ymd, l.periods, announcements));
  if (one.length === 1) return one[0];
  const schedule = x.bellScheduleFor_(ymd, {});
  return {
    dateLabel: one[0].dateLabel, scheduleLabel: one[0].scheduleLabel,
    bell: x._agBellLines_(schedule, [].concat(...lessons.map((l) => l.periods.map((p) => ({ period: p, label: l.key.split('-')[0] + ' P' + p }))))),
    announcements, due: one.map((d) => d.due[1]).concat(['Due tonight, 11:59 p.m.: L05 The Previous Lesson']).reverse(),
    courses: one.map((d, i) => Object.assign({ code: lessons[i].key.split('-')[0] }, d)),
  };
}

// The slide's data for a lesson on a day, as 67 builds it from the plan.
function sampleData(x, key, ymd, periods, announcements) {
  const a = x.LESSON_ASSIGNMENTS[key];
  if (!a) throw new Error('No lesson ' + key);
  const schedule = x.bellScheduleFor_(ymd, {});
  const blocks = (a.plan && a.plan.days && a.plan.days[0] && a.plan.days[0].blocks) || [];
  const label = x._agLessonLabel_(a);
  const p = ymd.split('-').map(Number);
  const dateLabel = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  return {
    lessonNo: label.no, unitName: label.name, courseName: a.courseName,
    dateLabel, scheduleLabel: x.bellScheduleLabel_(schedule), day: { n: 2, of: 3 }, lastDay: false,
    rows: blocks.map((b) => ({ mode: b.mode, title: b.title })),
    periods: periods.map((pd) => ({ period: pd,
      minutes: x.itineraryFor_(blocks, x.classMinutesFor_(ymd, pd, {})).map((b) => b.minutes) })),
    bell: x._agBellLines_(schedule, periods),
    announcements,
    due: ['Due tonight, 11:59 p.m.: L05 The Previous Lesson', label.no + ' ' + label.name + ' is due Fri, Nov 21, 11:59 p.m.'],
    goals: x._agGoals_(a),
  };
}

function loadSpec() {
  return loadGasFiles(FILES, ['agendaSlideSpec_', '_agBellLines_', '_agLessonLabel_', '_agGoals_', 'itineraryFor_',
    'classMinutesFor_', 'bellScheduleFor_', 'bellScheduleLabel_', 'LESSON_ASSIGNMENTS']).exported;
}

async function render(html, out) {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  try {
    const page = await b.newPage({ deviceScaleFactor: 2, viewport: { width: 980, height: 560 } });
    await page.setContent(html, { waitUntil: 'load' });
    // What Slides shows: a top-anchored box's text from its top padding down
    // to its bottom edge; a middle-anchored one's centred on the box. Text
    // past the box's edge is what the class would see spill.
    const overflow = await page.$$eval('.t', (els) => els.map((e) => {
      const content = Array.from(e.children).reduce((h, p) => h + p.getBoundingClientRect().height, 0);
      const pad = parseFloat(getComputedStyle(e).paddingTop);
      const middle = e.style.justifyContent === 'center';
      const over = Math.round(content + (middle ? 0 : pad) - e.clientHeight);
      return { i: e.dataset.i, text: e.innerText.replace(/\s+/g, ' ').slice(0, 60), over };
    }).filter((o) => o.over > 1));
    await (await page.$('.slide')).screenshot({ path: out });
    return overflow;
  } finally {
    await b.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const announce = [];
  const pos = [];
  let htmlOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--html') htmlOnly = true;
    else if (args[i] === '--announce') announce.push(args[++i]);
    else pos.push(args[i]);
  }
  const ymd = pos[0];
  const lessons = pos.slice(1).filter((a) => a.includes('=')).map((a) => ({ key: a.split('=')[0], periods: a.split('=')[1].split(',') }));
  const outArg = pos.slice(1).find((a) => !a.includes('='));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') || !lessons.length) {
    console.error('usage: render-agenda-slide.js <yyyy-mm-dd> <lesson key>=<periods, e.g. 1,3-Odd> [more lessons] [out.png] [--html] [--announce "text"]');
    process.exit(2);
  }
  const x = loadSpec();
  const spec = x.agendaSlideSpec_(sampleDay(x, ymd, lessons, announce));
  const html = specHtml(spec);
  const out = outArg || path.join(process.cwd(), 'agenda-' + ymd + (htmlOnly ? '.html' : '.png'));
  if (htmlOnly) {
    fs.writeFileSync(out, html);
    console.log('wrote ' + out);
  } else {
    render(html, out).then((overflow) => {
      console.log('wrote ' + out);
      overflow.forEach((o) => console.log('OVERFLOW (box ' + o.i + ', ' + o.over + ' px): ' + o.text));
      if (overflow.length) process.exitCode = 1;
    }).catch((e) => { console.error(e.message); process.exit(1); });
  }
}

module.exports = { specHtml, sampleData, sampleDay, loadSpec };
