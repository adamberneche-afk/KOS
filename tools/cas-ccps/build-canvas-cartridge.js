#!/usr/bin/env node
'use strict';
/**
 * Writes one Canvas course cartridge (IMS Common Cartridge 1.3, .imscc) per
 * course into cas-ccps/curriculum/canvas-cartridges/. Import one into a
 * Canvas course with Settings → Import Course Content → Common Cartridge
 * 1.x Package.
 *
 * Each cartridge holds, in pacing-guide order, one module per unit the
 * course takes:
 *   - a "Stage N overview" page at the start of each stage (from the deck's
 *     opening section),
 *   - the unit's lesson page (from its lesson card), and
 *   - the unit's assignment (the prompt from build-unit-rubrics.js).
 *
 * Lesson pages are filtered to the course: the other course's objective,
 * task numbers, WBL role, "goes deeper on" list and competency rows are
 * left out, as is the blank SCR column.
 *
 * Assignments keep CAS as the place students work: each one tells the
 * student to write in their CAS document for the unit (made by the intake
 * form or the Canvas roster import, script 52), links their assignment
 * dashboard for feedback, and asks them to submit that document's link. No
 * Canvas rubric or outcome is included; CAS evaluates against the
 * competencies.
 *
 * The dashboard link is the Student Dashboard's one stable deployment URL,
 * from cas-ccps/data/deployment-urls.json (P0-06,
 * meta/PRD_CAS_RESEARCH_PIVOT.md). It is committed so --check stays
 * deterministic; it changes only if the web app is redeployed as a new
 * deployment, which every student doc already forbids.
 *
 * Sources: curriculum/PacingGuide_CAS_Context.json, curriculum/lesson-cards/
 * Stage<N>_Lesson_Cards.docx, data/CompetencyRubrics.json (through
 * build-unit-rubrics.js) and data/deployment-urls.json. The output is byte-for-byte reproducible.
 *
 *   node tools/cas-ccps/build-canvas-cartridge.js          write the cartridges
 *   node tools/cas-ccps/build-canvas-cartridge.js --check  exit 1 if either is out of date
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeZip } = require('./zip.js');
const { textOf, loadDecks, findCard } = require('./lesson-cards.js');
const rubrics = require('./build-unit-rubrics.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'cas-ccps', 'curriculum', 'canvas-cartridges');
const DEPLOYMENT_URLS = path.join(ROOT, 'cas-ccps', 'data', 'deployment-urls.json');
// A web app's /exec URL, with or without the domain (/a/macros/<domain>/) segment.
const WEB_APP_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/;

/** The Student Dashboard URL from data/deployment-urls.json; throws if it isn't a web app URL. */
function studentDashboardUrl(file = DEPLOYMENT_URLS) {
  const url = String(JSON.parse(fs.readFileSync(file, 'utf8')).studentDashboardUrl || '').trim();
  if (!WEB_APP_URL_RE.test(url)) {
    throw new Error(path.relative(ROOT, file) + ': studentDashboardUrl must be the Student Dashboard ' +
      'web app\'s /exec URL (its existing deployment), got ' + JSON.stringify(url));
  }
  return url;
}
const POINTS = 100;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ident = (...parts) => 'g' + crypto.createHash('md5').update(parts.join('|')).digest('hex');
const isHeading = (b) => b.type === 'p' && b.runs.some((r) => r.text.trim()) &&
  b.runs.every((r) => r.bold || !r.text.trim()) && textOf(b) === textOf(b).toUpperCase();

/** Drops the other course's parts of a lesson card. */
function filterForCourse(blocks, code) {
  const other = code === '8175' ? '8177' : '8175';
  const out = [];
  let skippingList = false;
  for (const b of blocks) {
    const t = b.type === 'p' ? textOf(b) : '';
    if (b.type === 'p' && skippingList) {
      if (b.list || !t) continue;
      skippingList = false;
    }
    if (b.type === 'p' && new RegExp('^' + other + ' (Marketing|Management)\\b').test(t)) {
      if (/goes deeper on:?$/.test(t)) skippingList = true;
      continue;
    }
    if (b.type === 'table') {
      const header = b.rows[0].map(textOf);
      const courseCol = header.indexOf('Course');
      const scrCol = header.indexOf('SCR');
      let rows = b.rows.filter((r) => {
        const first = textOf(r[0]);
        if (first.startsWith('Tasks — ' + other) || first.startsWith(other + ' role')) return false;
        return courseCol === -1 || textOf(r[courseCol] || []) !== other;
      });
      if (scrCol !== -1) rows = rows.map((r) => r.filter((c, i) => i !== scrCol));
      out.push(Object.assign({}, b, { rows, header: courseCol !== -1 }));
      continue;
    }
    out.push(b);
  }
  return out;
}

function runsHtml(p) {
  // Merge adjacent runs of the same weight, then wrap the bold ones.
  const merged = [];
  p.runs.forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && last.bold === r.bold) last.text += r.text; else merged.push({ text: r.text, bold: r.bold });
  });
  return merged.map((r) => {
    const h = esc(r.text).replace(/\n/g, '<br>').replace(/\t/g, ' ');
    return r.bold && r.text.trim() ? '<strong>' + h + '</strong>' : h;
  }).join('').trim();
}

/** HTML for a list of blocks. Section headings become <h3>, list paragraphs <ul>. */
function blocksHtml(blocks) {
  const out = [];
  let list = [];
  const flush = () => { if (list.length) { out.push('<ul>\n' + list.join('\n') + '\n</ul>'); list = []; } };
  blocks.forEach((b) => {
    if (b.type === 'p') {
      if (!textOf(b)) return;
      if (b.list) { list.push('<li>' + runsHtml(b) + '</li>'); return; }
      flush();
      out.push(isHeading(b) ? '<h3>' + esc(textOf(b)) + '</h3>' : '<p>' + runsHtml(b) + '</p>');
      return;
    }
    flush();
    if (!b.rows.length) return;
    if (b.rows.length === 1 && b.rows[0].length === 1) {
      out.push('<blockquote>\n' + blocksHtml(b.rows[0][0]) + '\n</blockquote>');
      return;
    }
    const rows = b.rows.map((r, ri) => '<tr>' + r.map((c, ci) => {
      const th = b.header ? ri === 0 : ci === 0 && r.length === 2;
      const inner = c.filter((x) => x.type === 'p' && textOf(x)).length <= 1 && c.every((x) => x.type === 'p')
        ? esc(textOf(c)).replace(/\n/g, '<br>') : blocksHtml(c);
      return (th ? '<th style="text-align:left">' : '<td>') + inner + (th ? '</th>' : '</td>');
    }).join('') + '</tr>');
    out.push('<table border="1" cellpadding="6" style="border-collapse:collapse">\n' + rows.join('\n') + '\n</table>');
  });
  flush();
  return out.join('\n');
}

function page(title, body) {
  return '<html>\n<head>\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n<title>' + esc(title) +
    '</title>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
}

const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function assignmentXml(id, title, promptText, unit, dashboardUrl) {
  let paras = promptText.split(/\n{2,}/);
  if (unit) {
    paras.shift(); // the unit title line; Canvas shows the assignment title
    paras.pop();   // "Write your response in the response zone below." is for the CAS doc itself
  } else {
    // A teacher's lesson: drop its title line and its Canvas "Submission:" part,
    // which the CAS instructions below replace.
    paras = paras.filter((para) => !/^(Title:|Assignment:)/.test(para.trim()));
    const sub = paras.findIndex((para) => /^Submission:\s*$/.test(para.trim()));
    if (sub !== -1) paras = paras.slice(0, sub);
  }
  const promptHtml = paras.map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => l.startsWith('- '))) return '<ul>\n' + lines.map((l) => '<li>' + esc(l.slice(2)) + '</li>').join('\n') + '\n</ul>';
    if (lines.length === 1 && /^[A-Z][^.!?]{0,60}:$/.test(lines[0].trim())) return '<h3>' + esc(lines[0].trim().replace(/:$/, '')) + '</h3>';
    return '<p>' + lines.map(esc).join('<br>') + '</p>';
  });
  const where = unit ? 'unit' : 'lesson';
  const html = [
    ...promptHtml,
    '<h3>Where to do this work</h3>',
    '<p>Work in your CAS document for this ' + where + ', not in Canvas. It is shared with you in Google Drive ' +
      '(<strong>Shared with me</strong>) and its name starts with this ' + where + '\'s name and ends with your name. ' +
      'Write your response in its response zone.</p>',
    ...(dashboardUrl ? [
      '<h3>Get feedback</h3>',
      '<p>To have your work checked, open your <a href="' + esc(dashboardUrl) + '">assignment dashboard</a> and click ' +
        '<strong>Submit for Feedback</strong> on this assignment. Feedback is added at the end of your CAS document. ' +
        'A passing check before you turn it in is a good idea, but it isn\'t required.</p>',
    ] : []),
    '<h3>How to submit</h3>',
    '<p>When you are finished, copy the link to that document, then choose <strong>Start Assignment</strong> → ' +
      '<strong>Website URL</strong> here and paste it.</p>',
    ...(unit ? ['<p><em>Pacing guide dates for this unit: ' + esc(fmtDate(unit.approx_start)) + ' to ' +
      esc(fmtDate(unit.approx_end)) + '.</em></p>'] : []),
  ].join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<assignment xmlns="http://www.imsglobal.org/xsd/imscc_extensions/assignment" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.imsglobal.org/xsd/imscc_extensions/assignment http://www.imsglobal.org/profile/cc/cc_extensions/cc_extresource_assignmentv1p0_v1p0.xsd" ' +
    'identifier="' + id + '">\n' +
    '  <title>' + esc(title) + '</title>\n' +
    '  <text texttype="text/html">' + esc(html) + '</text>\n' +
    '  <gradable points_possible="' + POINTS + '">true</gradable>\n' +
    '  <submission_formats>\n    <format type="url"/>\n  </submission_formats>\n' +
    '</assignment>\n';
}

/** [[path, content], ...] for one course's cartridge. */
function buildCourse(code, decks, data, dashboardUrl) {
  const courseTitle = code + ' ' + rubrics.COURSES[code];
  const files = [];
  const resources = [];
  const modules = [];
  let lastStage = null;

  data.pacing.forEach((unit) => {
    const r = rubrics.unitRubric(unit, code, data.rubrics, decks);
    if (!r) return;
    const deck = decks[unit.stage];
    const card = findCard(decks, unit);

    const items = [];
    if (unit.stage !== lastStage) {
      lastStage = unit.stage;
      const banner = 'Stage ' + unit.stage + ' overview';
      const id = ident(code, 'stage', unit.stage);
      const href = 'wiki_content/stage-' + unit.stage + '-overview.html';
      files.push([href, page(banner, blocksHtml(deck.intro))]);
      resources.push({ id, type: 'webcontent', href });
      items.push({ id: ident(code, 'item', 'stage', unit.stage), ref: id, title: banner });
    }

    const pageTitle = unit.lesson_unit_id + ' ' + unit.lesson_unit_name + ': lesson';
    const pageId = ident(code, 'page', unit.lesson_unit_id);
    const pageHref = 'wiki_content/' + unit.lesson_unit_id.toLowerCase() + '-lesson.html';
    const summary = '<p><em>Stage ' + unit.stage + ' · ' + esc(card.badge) + ' · ' + esc(fmtDate(unit.approx_start)) +
      ' to ' + esc(fmtDate(unit.approx_end)) + '</em></p>';
    files.push([pageHref, page(pageTitle, summary + '\n' + blocksHtml(filterForCourse(card.blocks, code)))]);
    resources.push({ id: pageId, type: 'webcontent', href: pageHref });
    items.push({ id: ident(code, 'item', 'page', unit.lesson_unit_id), ref: pageId, title: pageTitle });

    const asgTitle = unit.lesson_unit_id + ' ' + unit.lesson_unit_name;
    const asgId = ident(code, 'assignment', unit.lesson_unit_id);
    const asgHref = asgId + '/assignment.xml';
    files.push([asgHref, assignmentXml(asgId, asgTitle, r.promptText, unit, dashboardUrl)]);
    resources.push({ id: asgId, type: 'assignment_xmlv1p0', href: asgHref });
    items.push({ id: ident(code, 'item', 'assignment', unit.lesson_unit_id), ref: asgId, title: asgTitle });

    modules.push({ id: ident(code, 'module', unit.lesson_unit_id),
      title: unit.lesson_unit_id + ' · ' + unit.lesson_unit_name + ' (' + fmtDate(unit.approx_start) + ' – ' + fmtDate(unit.approx_end) + ')',
      items });
  });

  return { name: code + '.imscc', entries: [['imsmanifest.xml', manifestXml(code, courseTitle, modules, resources)], ...files], modules };
}

/**
 * [[path, content], ...] for one course's cartridge from the teacher's own
 * lessons (build-lesson-assignments.js), in teaching order: one module per
 * lesson, holding its assignment. The lesson docs' teacher sections (bell
 * ringer, hook, grading tip) are not student pages, so there is no lesson
 * page; dates live in the LessonSchedule tab, so none are printed.
 */
function buildLessonCourse(code, lessons, dashboardUrl) {
  const courseTitle = code + ' ' + rubrics.COURSES[code];
  const files = [];
  const resources = [];
  const modules = [];
  (lessons.order[code] || []).forEach((key) => {
    const a = lessons.assignments[key];
    const asgId = ident(code, 'lesson-assignment', key);
    const asgHref = asgId + '/assignment.xml';
    files.push([asgHref, assignmentXml(asgId, a.unitName, a.promptText, null, dashboardUrl)]);
    resources.push({ id: asgId, type: 'assignment_xmlv1p0', href: asgHref });
    modules.push({ id: ident(code, 'lesson-module', key), title: a.unitName,
      items: [{ id: ident(code, 'lesson-item', key), ref: asgId, title: a.unitName }] });
  });
  return { name: code + '.imscc', entries: [['imsmanifest.xml', manifestXml(code, courseTitle, modules, resources)], ...files], modules };
}

function manifestXml(code, courseTitle, modules, resources) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<manifest identifier="' + ident(code, 'manifest') + '" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" ' +
      'xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/resource" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_imscp_v1p2_v1p0.xsd">',
    '  <metadata>',
    '    <schema>IMS Common Cartridge</schema>',
    '    <schemaversion>1.3.0</schemaversion>',
    '    <lomimscc:lom>',
    '      <lomimscc:general>',
    '        <lomimscc:title><lomimscc:string>' + esc(courseTitle) + '</lomimscc:string></lomimscc:title>',
    '      </lomimscc:general>',
    '    </lomimscc:lom>',
    '  </metadata>',
    '  <organizations>',
    '    <organization identifier="' + ident(code, 'org') + '" structure="rooted-hierarchy">',
    '      <item identifier="LearningModules">',
    ...modules.flatMap((m) => [
      '        <item identifier="' + m.id + '">',
      '          <title>' + esc(m.title) + '</title>',
      ...m.items.map((it) => '          <item identifier="' + it.id + '" identifierref="' + it.ref + '">\n' +
        '            <title>' + esc(it.title) + '</title>\n          </item>'),
      '        </item>',
    ]),
    '      </item>',
    '    </organization>',
    '  </organizations>',
    '  <resources>',
    ...resources.map((r) => r.type === 'webcontent'
      ? '    <resource identifier="' + r.id + '" type="webcontent" href="' + r.href + '">\n      <file href="' + r.href + '"/>\n    </resource>'
      : '    <resource identifier="' + r.id + '" type="' + r.type + '">\n      <file href="' + r.href + '"/>\n    </resource>'),
    '  </resources>',
    '</manifest>',
    '',
  ].join('\n');
}

// Since 2026-10-07 the courses run on the teacher's own lessons
// (cas-ccps/curriculum/lessons/), so the cartridges carry those. buildCourse
// (the pacing-guide units) is kept for reference and its tests.
function build() {
  const lessons = require('./build-lesson-assignments.js').build();
  const dashboardUrl = studentDashboardUrl();
  return Object.keys(rubrics.COURSES).map((code) => buildLessonCourse(code, lessons, dashboardUrl));
}

function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  if (!check) fs.mkdirSync(OUT_DIR, { recursive: true });
  build().forEach((c) => {
    const bytes = writeZip(c.entries);
    const p = path.join(OUT_DIR, c.name);
    if (fs.existsSync(p) && fs.readFileSync(p).equals(bytes)) return;
    if (check) stale.push(c.name); else fs.writeFileSync(p, bytes);
    if (!check) console.log('Wrote ' + path.relative(ROOT, p) + ': ' + c.modules.length + ' modules.');
  });
  if (check) {
    if (stale.length) {
      console.error('canvas cartridges out of date: ' + stale.join(', '));
      console.error('Run: node tools/cas-ccps/build-canvas-cartridge.js');
      process.exit(1);
    }
    console.log('canvas cartridges up to date.');
  }
}

if (require.main === module) main();
module.exports = { build, buildCourse, buildLessonCourse, filterForCourse, blocksHtml, studentDashboardUrl };
