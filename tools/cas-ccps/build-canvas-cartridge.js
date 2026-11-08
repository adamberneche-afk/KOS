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
 * student to write in their assignment doc for the unit (made by the intake
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
 * Turn-in codes (meta/TURN_IN_CODE_PLAN_2026-11.md, stage 4; D17). With
 * --turn-in, the selected lessons' assignments take a text entry instead of
 * a Website URL, and their description opens with the turn-in instruction:
 * the student pastes the turn-in code the assignment dashboard issues. The
 * selector is a comma-separated list of course codes (8177: every lesson the
 * course has) and lesson ConfigIDs as StudentAssignments records them
 * (CAS-8175-L05, CAS-8177-THE-HYPE-MACHINE; the CAS- prefix and case are
 * optional). The lesson data has no unit field, so there is no unit
 * selector, and a lesson in parts is named by its lesson, never a part:
 * Canvas keeps one assignment per lesson. Without --turn-in nothing changes:
 * the committed cartridges stay byte for byte as they were. A --turn-in
 * cartridge is written to canvas-cartridges/turn-in/ (git-ignored), never
 * over the committed ones. Points stay 100 (completion credit comes from the
 * teacher's upload file, stage 3); the cartridge sets no assignment group, so
 * the teacher moves a turn-in assignment into the formative group by hand.
 *
 * For an assignment already in a Canvas course, a re-import is not the way to
 * switch it (cas-ccps/README.md, "Canvas course cartridges"): --print lists
 * the selected assignments and the text to paste, for switching each one by
 * hand in Canvas.
 *
 *   node tools/cas-ccps/build-canvas-cartridge.js          write the cartridges
 *   node tools/cas-ccps/build-canvas-cartridge.js --check  exit 1 if either is out of date
 *   node tools/cas-ccps/build-canvas-cartridge.js --turn-in <selector>          write turn-in/<course>.imscc
 *   node tools/cas-ccps/build-canvas-cartridge.js --turn-in <selector> --print  print the hand-switch steps; write nothing
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeZip } = require('./zip.js');
const { textOf, loadDecks, findCard } = require('./lesson-cards.js');
const rubrics = require('./build-unit-rubrics.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'cas-ccps', 'curriculum', 'canvas-cartridges');
const TURN_IN_OUT_DIR = path.join(OUT_DIR, 'turn-in');
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

// The turn-in instruction (stage 4), word for word. In the cartridge the
// "assignment dashboard" words link the dashboard, as the Get feedback
// section does; --print gives it as plain text.
const TURN_IN_INSTRUCTION = 'To turn this in: open your assignment dashboard, answer the question about your feedback, ' +
  'then copy your turn-in code and paste it here.';
const turnInHowToSubmit = (inParts) => (inParts
  ? 'When you have finished every part and have your turn-in code, choose Start Assignment → Text Entry here, ' +
    'paste the code and submit. Paste only the code: your teacher can see every part in your assignment docs.'
  : 'When you have your turn-in code, choose Start Assignment → Text Entry here, paste the code and submit. ' +
    'Paste only the code: your teacher reads your work in your assignment doc.');

/**
 * The lesson keys (8175-L05, 8177-the-hype-machine) a --turn-in selector names.
 * Throws with a message for the operator on anything it can't place.
 */
function parseTurnIn(spec, lessons) {
  const tokens = String(spec == null ? '' : spec).split(/[\s,]+/).filter(Boolean);
  const usage = 'Name course codes (' + Object.keys(rubrics.COURSES).join(', ') + ') or lesson ConfigIDs ' +
    '(CAS-8175-L05, CAS-8177-THE-HYPE-MACHINE), comma-separated.';
  if (!tokens.length) throw new Error('--turn-in needs a selector. ' + usage);
  const byUpper = {};
  Object.keys(lessons.order).forEach((code) => lessons.order[code].forEach((k) => { byUpper[k.toUpperCase()] = k; }));
  const partOf = {};
  Object.keys(lessons.parts || {}).forEach((k) => (lessons.parts[k] || []).forEach((p) => { partOf[String(p.key).toUpperCase()] = k; }));
  const keys = new Set();
  tokens.forEach((t) => {
    const u = t.toUpperCase().replace(/^CAS-/, '');
    if (/^\d{4}$/.test(u)) {
      if (!rubrics.COURSES[u]) throw new Error('--turn-in: no course ' + t + '. ' + usage);
      (lessons.order[u] || []).forEach((k) => keys.add(k));
      return;
    }
    if (/^\d{4}:/.test(u)) {
      throw new Error('--turn-in: ' + t + ' names a unit, and the lesson data has no unit field. ' + usage);
    }
    if (byUpper[u]) { keys.add(byUpper[u]); return; }
    if (partOf[u]) {
      throw new Error('--turn-in: ' + t + ' is a part of CAS-' + partOf[u].toUpperCase() + '; Canvas has one ' +
        'assignment per lesson, so name the lesson.');
    }
    throw new Error('--turn-in: no lesson ' + t + ' (a lesson needs an approved prompt to be in a cartridge). ' + usage);
  });
  return keys;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// A lesson's *emphasis* as <em>, not literal asterisks (2026-10-22).
// An https:// address in a task (a lesson's video link, VIDEO_LINKS.json)
// becomes a link; a trailing "." or ")" isn't part of it.
const linkUrls = (h) => h.replace(/https:\/\/[^\s<()]+/g, (u) => {
  const url = u.replace(/[.,;:]+$/, '');
  return '<a href="' + url + '">' + url + '</a>' + u.slice(url.length);
});
const inline = (s) => linkUrls(esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>'));
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

// parts: a lesson in parts' [{ part, partTitle }] (PARTS.json, 2026-11-01;
// dead-ends audit #6), or none. Canvas keeps one assignment and one grade per
// lesson (meta/STUDENT_WORK_PLAN_2026-10.md, "Where the costs land"); the
// page lists the parts, says each has its own doc that opens in turn, and
// asks for the last part's link.
// opts.turnIn (stage 4): a text entry for the turn-in code, not a Website URL;
// the turn-in instruction opens the page and "How to submit" asks for the code.
function assignmentXml(id, title, promptText, unit, dashboardUrl, parts, opts) {
  const inParts = Array.isArray(parts) && parts.length > 1;
  const turnIn = !!(opts && opts.turnIn);
  let paras = promptText.split(/\n{2,}/);
  if (unit) {
    paras.shift(); // the unit title line; Canvas shows the assignment title
    paras.pop();   // "Write your response under “Your response” below." is for the doc itself
  } else {
    // A teacher's lesson: drop its title line and its Canvas "Submission:" part,
    // which the CAS instructions below replace.
    paras = paras.filter((para, i) => !/^(Title:|Assignment:)/.test(para.trim()) &&
      !(i === 0 && /^(Project|Discussion|Extra Credit):/.test(para.trim())));
    const sub = paras.findIndex((para) => /^Submission:\s*$/.test(para.trim()));
    if (sub !== -1) paras = paras.slice(0, sub);
  }
  const promptHtml = paras.map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => l.startsWith('- '))) return '<ul>\n' + lines.map((l) => '<li>' + inline(l.slice(2)) + '</li>').join('\n') + '\n</ul>';
    if (lines.length === 1 && /^[A-Z][^.!?]{0,60}:$/.test(lines[0].trim())) return '<h3>' + esc(lines[0].trim().replace(/:$/, '')) + '</h3>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  });
  const where = unit ? 'unit' : 'lesson';
  const partsHtml = inParts ? [
    '<h3>This lesson is in ' + parts.length + ' parts</h3>',
    '<ol>\n' + parts.map((p) => '<li>' + esc(p.partTitle) + '</li>').join('\n') + '\n</ol>',
    '<p>Each part has its own assignment doc. Part 1 opens with the lesson. Each later part opens on your ' +
      'assignment dashboard once the part before it is checked and shows what that part asks for, or when your ' +
      'teacher opens it.</p>',
  ] : [];
  const dashboard = dashboardUrl ? '<a href="' + esc(dashboardUrl) + '">assignment dashboard</a>' : 'assignment dashboard';
  const html = [
    // TURN_IN_INSTRUCTION, with its label bold and the dashboard linked.
    ...(turnIn ? ['<p><strong>To turn this in:</strong> open your ' + dashboard + ', answer the question about your ' +
      'feedback, then copy your turn-in code and paste it here.</p>'] : []),
    ...promptHtml,
    ...partsHtml,
    '<h3>Where to do this work</h3>',
    inParts
      ? '<p>Work in each part\'s assignment doc, not in Canvas. They are Google Docs shared with you in Google Drive ' +
        '(<strong>Shared with me</strong>); each name starts with this lesson\'s name and its part, and ends with your ' +
        'name. Write under each doc\'s <strong>Your response</strong> heading.</p>'
      : '<p>Work in your assignment doc for this ' + where + ', not in Canvas. It is a Google Doc shared with you in ' +
      'Google Drive (<strong>Shared with me</strong>), and its name starts with this ' + where + '\'s name and ends ' +
      'with your name. Write under its <strong>Your response</strong> heading.</p>',
    ...(dashboardUrl ? [
      '<h3>Get feedback</h3>',
      '<p>To have your work checked, open your <a href="' + esc(dashboardUrl) + '">assignment dashboard</a> and click ' +
        '<strong>Submit for Feedback</strong> on this assignment. Feedback arrives as a comment on your assignment doc. ' +
        'A passing check before you turn it in is a good idea, but it isn\'t required.</p>',
    ] : []),
    '<h3>How to submit</h3>',
    turnIn ? '<p>' + esc(turnInHowToSubmit(inParts)).replace('Start Assignment → Text Entry',
      '<strong>Start Assignment</strong> → <strong>Text Entry</strong>') + '</p>'
    : inParts
      ? '<p>When you have finished every part, copy the link to your Part ' + parts.length + ' document, then choose ' +
        '<strong>Start Assignment</strong> → <strong>Website URL</strong> here and paste it. Your teacher can see ' +
        'every part.</p>'
      : '<p>When you are finished, copy the link to that document, then choose <strong>Start Assignment</strong> → ' +
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
    // Canvas's Common Cartridge importer reads type="text" (or "html") as
    // online_text_entry and "url" as online_url.
    '  <submission_formats>\n    <format type="' + (turnIn ? 'text' : 'url') + '"/>\n  </submission_formats>\n' +
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
function buildLessonCourse(code, lessons, dashboardUrl, turnIn) {
  const courseTitle = code + ' ' + rubrics.COURSES[code];
  const files = [];
  const resources = [];
  const modules = [];
  (lessons.order[code] || []).forEach((key) => {
    const a = lessons.assignments[key];
    const asgId = ident(code, 'lesson-assignment', key);
    const asgHref = asgId + '/assignment.xml';
    const parts = (lessons.parts || {})[key];
    files.push([asgHref, turnIn && turnIn.has(key)
      ? assignmentXml(asgId, a.unitName, a.promptText, null, dashboardUrl, parts, { turnIn: true })
      : assignmentXml(asgId, a.unitName, a.promptText, null, dashboardUrl, parts)]);
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
// opts.turnIn: a --turn-in selector (parseTurnIn); none builds today's cartridges.
function build(opts) {
  const lessons = require('./build-lesson-assignments.js').build();
  const dashboardUrl = studentDashboardUrl();
  const turnIn = opts && opts.turnIn != null ? parseTurnIn(opts.turnIn, lessons) : null;
  return Object.keys(rubrics.COURSES).map((code) => buildLessonCourse(code, lessons, dashboardUrl, turnIn));
}

/** The selected assignments, in teaching order: [{ code, configId, title, parts }]. */
function turnInAssignments(spec, lessons) {
  const keys = parseTurnIn(spec, lessons);
  return Object.keys(rubrics.COURSES).flatMap((code) => (lessons.order[code] || []).filter((k) => keys.has(k))
    .map((k) => ({ code, configId: 'CAS-' + k.toUpperCase(), title: lessons.assignments[k].unitName,
      parts: ((lessons.parts || {})[k] || []).length > 1 ? lessons.parts[k].length : 0 })));
}

/** --print: the hand switch in Canvas for each selected assignment, and the text to paste. Plain text. */
function turnInSteps(spec, lessons) {
  const list = turnInAssignments(spec, lessons);
  const anyParts = list.some((a) => a.parts);
  return [
    'Turn-in code, the Canvas side: ' + list.length + ' assignment(s) to switch by hand (no re-import).',
    '',
    'Assignments (course, CAS ConfigID, Canvas assignment title):',
    ...list.map((a) => '  ' + a.code + '  ' + a.configId + '  ' + a.title + (a.parts ? '  [' + a.parts + ' parts]' : '')),
    '',
    'In Canvas, for each one: Assignments, open it, Edit.',
    '  1. Description: put the turn-in instruction (A) at the very top. Under "How to submit", replace the',
    '     Website URL paragraph with (B)' + (anyParts ? ' (or (C), for a lesson in parts)' : '') + '. Leave the rest as it is.',
    '  2. Submission Type: Online, with Text Entry checked and Website URL unchecked.',
    '  3. Assignment Group: the formative group. Points: leave them (completion comes from the upload file).',
    '  4. Anonymous grading stays off. Save.',
    '',
    '(A) ' + TURN_IN_INSTRUCTION,
    '(B) ' + turnInHowToSubmit(false),
    ...(anyParts ? ['(C) ' + turnInHowToSubmit(true)] : []),
    '',
  ].join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--turn-in');
  if (at !== -1) return mainTurnIn(argv[at + 1], argv.includes('--print'), argv.includes('--check'));
  const check = argv.includes('--check');
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

// --turn-in: the selected courses' cartridges into turn-in/ (git-ignored), or with --print the hand-switch steps.
function mainTurnIn(spec, print, check) {
  try {
    if (check) throw new Error('--check reads the committed cartridges; it does not take --turn-in.');
    if (spec == null || /^--/.test(spec)) throw new Error('--turn-in needs a selector, e.g. --turn-in CAS-8177-THE-HYPE-MACHINE');
    const lessons = require('./build-lesson-assignments.js').build();
    if (print) { process.stdout.write(turnInSteps(spec, lessons)); return; }
    const codes = new Set(turnInAssignments(spec, lessons).map((a) => a.code));
    fs.mkdirSync(TURN_IN_OUT_DIR, { recursive: true });
    build({ turnIn: spec }).filter((c) => codes.has(c.name.replace('.imscc', ''))).forEach((c) => {
      const p = path.join(TURN_IN_OUT_DIR, c.name);
      fs.writeFileSync(p, writeZip(c.entries));
      console.log('Wrote ' + path.relative(ROOT, p) + ' (turn-in: ' + spec + '; not committed).');
    });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
module.exports = { build, buildCourse, buildLessonCourse, filterForCourse, blocksHtml, studentDashboardUrl, assignmentXml,
  parseTurnIn, turnInAssignments, turnInSteps, TURN_IN_INSTRUCTION };
