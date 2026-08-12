/**
 * LeaderHub EmailBridge — Apps Script (Google Apps Script)
 * Deploy as: Web App → Execute as Me → Anyone in domain (or Anyone with link)
 *
 * POST endpoints (JSON body with "action" field):
 *   action: "subPlan"      → Create Google Doc sub plan  → {ok, docUrl}
 *   action: "bragEmail"    → Create Gmail draft           → {ok}
 *   action: "markConsumed" → Mark horizon items consumed  → {ok, consumed}
 *   action: "aiDraft"      → Queue an AI drafting job      → {ok, jobId}
 *   action: "checkAiJob"   → Poll a queued AI job          → {ok, status, result|error}
 *
 * GET endpoint (unchanged):
 *   Returns pending horizon items from Gmail label "LeaderHub"
 *
 * Setup:
 *   1. script.google.com → New Project → paste this file
 *   2. Deploy → New Deployment → Web App
 *      Execute as: Me | Access: Anyone in CCPS domain
 *   3. Copy /exec URL → LeaderHub Settings → Email Bridge URL
 *
 * AI drafting (optional): see LEADERHUB_AI_FLOW_SETUP.md for how "aiDraft"/
 * "checkAiJob" bifurcate into a GAS-side job queue (this file) plus a
 * separate Google Workspace Flow that does the actual Gemini call — no
 * developer API key involved anywhere, same pattern kos-personal/cas-ccps
 * use for their own Studio/Flow integrations. This file works exactly as
 * before with zero setup if you never touch that doc — aiDraft/checkAiJob
 * just sit in a PENDING queue forever with no Flow watching them, and the
 * client already falls back to its own local draft when that happens.
 */

const CONFIG = {
  horizonLabel:    'LeaderHub',   // Gmail label to scan for horizon items
  subPlanFolderId: '',            // Drive folder ID for sub plans ('' = root)
  defaultBragTo:   'adam_berneche@ccpsnet.net',
};

// ── Entry points ──────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    return jsonResponse_({ ok: true, items: scanHorizonLabel_() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents || '{}');
    const action = body.action || '';
    if (action === 'markConsumed') return jsonResponse_(markConsumed_(body.ids || []));
    if (action === 'subPlan')      return jsonResponse_(createSubPlanDoc_(body));
    if (action === 'bragEmail')    return jsonResponse_(createBragDraft_(body));
    if (action === 'aiDraft')      return jsonResponse_(queueAiJob_(body));
    if (action === 'checkAiJob')   return jsonResponse_(checkAiJob_(body));
    return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

// ── Sub plan → Google Doc ─────────────────────────────────────────────────────

function createSubPlanDoc_(body) {
  const { date, plan } = body;
  if (!plan) return { ok: false, error: 'No plan text provided' };

  const dateLabel = date
    ? Utilities.formatDate(new Date(date + 'T12:00:00'), Session.getScriptTimeZone(), 'MMMM d, yyyy')
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');

  const doc = DocumentApp.create('Sub Plan — ' + dateLabel);
  if (CONFIG.subPlanFolderId) {
    const file   = DriveApp.getFileById(doc.getId());
    const folder = DriveApp.getFolderById(CONFIG.subPlanFolderId);
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  const b = doc.getBody();
  b.clear();
  const title = b.appendParagraph('Sub Plan — ' + dateLabel);
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);

  plan.split('\n\n').forEach(section => {
    const trimmed = section.trim();
    if (!trimmed) return;
    if (/^[A-Z][A-Z &\-\/]{3,}$/.test(trimmed)) {
      b.appendParagraph(trimmed).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    } else {
      trimmed.split('\n').forEach(line => { if (line.trim()) b.appendParagraph(line.trim()); });
      b.appendParagraph('');
    }
  });

  doc.saveAndClose();
  return { ok: true, docUrl: 'https://docs.google.com/document/d/' + doc.getId() + '/edit' };
}

// ── Brag email → Gmail draft ──────────────────────────────────────────────────

function createBragDraft_(body) {
  const to      = body.to      || CONFIG.defaultBragTo;
  const subject = body.subject || 'Weekly Wins';
  const text    = body.body    || '(No content)';
  GmailApp.createDraft(to, subject, text);
  return { ok: true };
}

// ── AI job queue — bifurcated backend for AI drafting ─────────────────────────
// This file (GAS) only ever does deterministic work: create the job row,
// hand back a jobId, and later read whatever row a Flow wrote into.
// It never calls Gemini itself and never holds an API key. The actual
// generation happens in a separate Google Workspace Flow (built by hand in
// the Workspace UI, not code — see LEADERHUB_AI_FLOW_SETUP.md) that polls
// this sheet for PENDING rows, calls Gemini via its own "Generate content"
// connector step (using the Workspace account's built-in Gemini access,
// not a developer API key), and writes the result back. Same Bifurcation
// Boundary kos-personal/cas-ccps already use for their own Studio/Flow
// integrations — GAS orchestrates state, the Flow only ever generates text.

const AI_QUEUE_SHEET_PROP = 'AI_QUEUE_SHEET_ID';
const AI_QUEUE_SHEET_NAME = 'AI_Queue';
const AI_QUEUE_HEADERS    = ['Timestamp', 'JobId', 'Type', 'Payload', 'Status', 'Result', 'Error'];
// Column indices (0-based) matching the header row above.
const AIQ_COL = { TIMESTAMP: 0, JOB_ID: 1, TYPE: 2, PAYLOAD: 3, STATUS: 4, RESULT: 5, ERROR: 6 };
// Rows older than this are swept on every checkAiJob_ call, whether or not
// they were ever claimed — a Flow that's never been built (or is
// mid-setup) would otherwise let PENDING rows accumulate forever with
// nothing ever reading them back out.
const AI_QUEUE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

function _getAiQueueSheet_() {
  const prop = PropertiesService.getScriptProperties();
  let id = prop.getProperty(AI_QUEUE_SHEET_PROP);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } // deleted/moved — rebuild below
  }
  if (!ss) {
    ss = SpreadsheetApp.create('LeaderHub AI Queue');
    prop.setProperty(AI_QUEUE_SHEET_PROP, ss.getId());
  }
  let sheet = ss.getSheetByName(AI_QUEUE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(AI_QUEUE_SHEET_NAME);
    sheet.appendRow(AI_QUEUE_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function queueAiJob_(body) {
  const type    = body.type    || '';
  const payload = body.payload || {};
  if (!type) return { ok: false, error: 'Missing job type' };

  const jobId = Utilities.getUuid();
  const sheet = _getAiQueueSheet_();
  sheet.appendRow([new Date(), jobId, type, JSON.stringify(payload), 'PENDING', '', '']);
  return { ok: true, jobId };
}

function checkAiJob_(body) {
  const jobId = body.jobId || '';
  if (!jobId) return { ok: false, error: 'Missing jobId' };

  const sheet = _getAiQueueSheet_();
  const data  = sheet.getDataRange().getValues();
  const now   = Date.now();
  // Sweep stale rows (any status — a never-claimed PENDING row is just as
  // much a leak as an orphaned COMPLETE one) from the bottom up so deleting
  // a row doesn't shift the index of rows still to be checked. Deliberately
  // skips the target jobId's own row here — deleting it (if applicable)
  // happens below, against a fresh read, to avoid computing its row number
  // from indices this loop may have already invalidated by deleting rows
  // that sat between it and the rows already swept.
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[AIQ_COL.JOB_ID] === jobId) continue;
    const age = now - new Date(row[AIQ_COL.TIMESTAMP]).getTime();
    if (age > AI_QUEUE_MAX_AGE_MS) sheet.deleteRow(i + 1);
  }

  // Fresh read — the sweep above may have shifted every row's real sheet
  // position, so a jobId's index has to be looked up again, not reused
  // from the pre-sweep `data` array.
  const data2     = sheet.getDataRange().getValues();
  const rowIndex2 = data2.findIndex(r => r[AIQ_COL.JOB_ID] === jobId); // 0-based within data2, -1 if absent
  if (rowIndex2 < 1) return { ok: true, status: 'NOT_FOUND' };
  const found = data2[rowIndex2];

  const status = found[AIQ_COL.STATUS] || 'PENDING';
  if (status === 'PENDING') return { ok: true, status: 'PENDING' };

  // COMPLETE or ERROR — hand it back once, then remove the row. The client
  // is the only reader; there's nothing left to keep this row around for.
  sheet.deleteRow(rowIndex2 + 1);

  if (status === 'ERROR') return { ok: true, status: 'ERROR', error: found[AIQ_COL.ERROR] || 'Unknown error' };
  return { ok: true, status: 'COMPLETE', result: found[AIQ_COL.RESULT] || '' };
}

// ── Horizon label scanner (GET) — unchanged ───────────────────────────────────

function scanHorizonLabel_() {
  const items    = [];
  const prop     = PropertiesService.getScriptProperties();
  const consumed = JSON.parse(prop.getProperty('consumed') || '[]');

  let label;
  try { label = GmailApp.getUserLabelByName(CONFIG.horizonLabel); } catch(e) { return items; }
  if (!label) return items;

  label.getThreads(0, 20).forEach(thread => {
    thread.getMessages().forEach(msg => {
      const id = msg.getId();
      if (consumed.includes(id)) return;
      const text = msg.getSubject() + ' ' + msg.getPlainBody().slice(0, 500);
      const hm   = text.match(/#horizon:(short|mid|long)/i);
      const dm   = text.match(/#deadline:(\d{4}-\d{2}-\d{2})/i);
      const rm   = text.match(/#role:(teach|store|deca|esports|trips|general)/i);
      items.push({
        id,
        text:         msg.getSubject() || msg.getPlainBody().slice(0, 80),
        horizon:      hm ? hm[1].toLowerCase() : 'mid',
        deadlineDate: dm ? dm[1]               : null,
        role:         rm ? rm[1].toLowerCase() : 'general',
        source:       'email',
      });
    });
  });
  return items;
}

// ── Mark consumed (POST) — unchanged ─────────────────────────────────────────

// PropertiesService caps each property VALUE at 9216 bytes. Gmail message
// IDs are ~16 hex chars; JSON-array-encoded with quotes/comma that's
// ~19 bytes/entry, so the old cap of 500 entries (~9.5KB) was already
// over the limit — prop.setProperty() would start throwing
// "Argument too large" once the list grew past ~450-480 entries,
// permanently breaking markConsumed_ from that point on (compounding the
// payload-shape bug fixed in student-leader-hub.html — items would
// reappear on every poll AND the fix for that would eventually fail
// too). 300 entries (~5.7KB) leaves real margin for ID-length variance.
const CONSUMED_ID_CAP = 300;

function markConsumed_(ids) {
  if (!ids.length) return { ok: true, consumed: 0 };
  const prop    = PropertiesService.getScriptProperties();
  const existing = JSON.parse(prop.getProperty('consumed') || '[]');
  prop.setProperty('consumed', JSON.stringify([...new Set([...existing, ...ids])].slice(-CONSUMED_ID_CAP)));
  return { ok: true, consumed: ids.length };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
