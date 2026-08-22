/**
 * LeaderHub EmailBridge — Apps Script (Google Apps Script)
 * Deploy as: Web App → Execute as Me → Anyone in domain (or Anyone with link)
 *
 * POST endpoints (JSON body with "action" field):
 *   action: "subPlan"       → Create Google Doc sub plan  → {ok, docUrl}
 *   action: "bragEmail"     → Create Gmail draft           → {ok}
 *   action: "markConsumed"  → Mark horizon items consumed  → {ok, consumed}
 *   action: "aiDraft"       → Queue an AI drafting job      → {ok, jobId}
 *   action: "checkAiJob"    → Poll a queued AI job          → {ok, status, result|error}
 *   action: "flowHealth"    → Lifetime per-type AI job stats → {ok, stats, types}
 *   action: "pushOrgSync"   → Publish an org snapshot       → {ok, updatedAt} | {ok:false, conflict:true, ...}
 *   action: "pullOrgSync"   → Fetch an org's synced state   → {ok, found, ...}
 *   action: "listOrgSyncs"  → List orgs shared on this bridge → {ok, orgs:[...]}
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
 *
 * Co-advisor Organization sharing (optional): see the "Organization Sync"
 * section below and leader-hub/README.md for the access model — because
 * this Web App runs "Execute as Me," whichever advisor deploys it owns the
 * backing Spreadsheet and a co-advisor never needs Google Drive sharing
 * permissions of their own; they just need this same /exec URL. Nothing
 * here is enabled until a teacher actually shares an organization from
 * Settings → Organizations, and it's a separate spreadsheet from the AI
 * Queue above — sharing one feature doesn't expose the other's data.
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
    if (action === 'flowHealth')   return jsonResponse_(getFlowHealth_());
    if (action === 'pushOrgSync')  return jsonResponse_(pushOrgSync_(body));
    if (action === 'pullOrgSync')  return jsonResponse_(pullOrgSync_(body));
    if (action === 'listOrgSyncs') return jsonResponse_(listOrgSyncs_(body));
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
  _bumpFlowStat_(type, 'submitted');
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
  //
  // Say/Do Ledger cross-portfolio Flow Health extension: this sweep is the
  // ONLY place a swept-but-never-claimed job is ever seen again — the row
  // is gone immediately after. Count it here (sweptUnclaimed), against
  // whatever status it happened to still be in, or that job type's whole
  // history is invisible to the AI Flow Health panel: a job stuck PENDING
  // forever because no Flow is built for its type would otherwise vanish
  // with zero trace, indistinguishable from a type nobody's ever used.
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[AIQ_COL.JOB_ID] === jobId) continue;
    const age = now - new Date(row[AIQ_COL.TIMESTAMP]).getTime();
    if (age > AI_QUEUE_MAX_AGE_MS) {
      if (String(row[AIQ_COL.STATUS] || 'PENDING') === 'PENDING') {
        _bumpFlowStat_(row[AIQ_COL.TYPE], 'sweptUnclaimed');
      }
      sheet.deleteRow(i + 1);
    }
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
  _bumpFlowStat_(found[AIQ_COL.TYPE], status === 'ERROR' ? 'errored' : 'completed');

  if (status === 'ERROR') return { ok: true, status: 'ERROR', error: found[AIQ_COL.ERROR] || 'Unknown error' };
  return { ok: true, status: 'COMPLETE', result: found[AIQ_COL.RESULT] || '' };
}

// ── AI Flow Health (Say/Do Ledger cross-portfolio Flow Health & Inventory
// extension) ──────────────────────────────────────────────────────────────
// AI_Queue rows are always eventually deleted (see the sweep/hand-back logic
// above) — there is no durable row history to compute health stats from at
// read time, unlike cas-ccps's STAGING_PIPELINE (which keeps terminal rows
// indefinitely) or kos-personal's Turnstile/Registrar retry counters (which
// live on the row itself). So this is a genuinely new, small persistent
// counter, incremented at write-time (queueAiJob_) and at the two points a
// row's outcome is learned before it disappears (checkAiJob_'s sweep and
// hand-back) — the only two moments this file ever knows a job's fate.
//
// AI_FLOW_TYPES: the real literal type strings created by student-leader-
// hub.html's own callGAS('aiDraft', {type:...}) call sites. FIN_ANALYSIS
// (finAnalysis()) is real, shipping traffic today but was never added to
// LEADERHUB_AI_FLOW_SETUP.md alongside its 5 documented siblings — listed
// here so it isn't invisible to this health panel the way it's invisible
// to that doc; the doc gap itself is a separate, smaller fix.
const AI_FLOW_TYPES = ['EMAIL_COMPOSE', 'ARCHIVE_INSIGHTS', 'WBL_INSIGHTS', 'LP_ASSIST', 'FIN_ANALYSIS', 'BRAG_EMAIL'];
const AI_FLOW_STATS_PROP = 'AI_FLOW_STATS';

function _getFlowStats_() {
  const raw = PropertiesService.getScriptProperties().getProperty(AI_FLOW_STATS_PROP);
  let stats = {};
  if (raw) { try { stats = JSON.parse(raw) || {}; } catch (e) { stats = {}; } }
  return stats;
}

function _saveFlowStats_(stats) {
  PropertiesService.getScriptProperties().setProperty(AI_FLOW_STATS_PROP, JSON.stringify(stats));
}

// field: 'submitted' | 'completed' | 'errored' | 'sweptUnclaimed'
function _bumpFlowStat_(type, field) {
  if (!type) return; // defensive — a malformed row should never throw here
  const stats = _getFlowStats_();
  if (!stats[type]) stats[type] = { submitted: 0, completed: 0, errored: 0, sweptUnclaimed: 0 };
  stats[type][field] = (stats[type][field] || 0) + 1;
  _saveFlowStats_(stats);
}

/**
 * Returns lifetime per-type AI job stats for the Settings → AI Flow Health
 * panel. Every entry in AI_FLOW_TYPES is always present in the response
 * (zeroed if never used) so the client can render one row per known type
 * without needing to know which types happen to have accumulated stats.
 */
function getFlowHealth_() {
  const stats = _getFlowStats_();
  const out = {};
  AI_FLOW_TYPES.forEach(type => {
    out[type] = stats[type] || { submitted: 0, completed: 0, errored: 0, sweptUnclaimed: 0 };
  });
  return { ok: true, stats: out, types: AI_FLOW_TYPES };
}

// ── Organization Sync (co-advisor sharing) ────────────────────────────────────
// A second, independent Spreadsheet (never the AI Queue one above) acts as the
// shared datastore for organizations a teacher chooses to share with a
// co-advisor. Because this Web App runs "Execute as Me," whichever teacher
// deploys it owns this Spreadsheet — a co-advisor never needs Drive sharing
// permissions of their own; they just point their own LeaderHub Settings →
// Organizations at this same /exec URL.
//
// Layout:
//   "_org_meta" tab — one row per shared org: [OrgId, OrgName, ConfigJSON,
//     UpdatedAt, UpdatedBy]. Used for discovery (listOrgSyncs_) and as the
//     compare-and-swap conflict-detection source (UpdatedAt).
//   "roster_<orgId>" / "results_<orgId>" tabs — real spreadsheet rows, not a
//     JSON blob in one cell. Two reasons: (1) a 60-100+ member roster as one
//     JSON cell risks Sheets' ~50,000-character cell limit; (2) a co-advisor
//     can open the Sheet directly and read/edit rows by hand as a bonus.
//     The client sends its own header row alongside the data rows on every
//     push, so this file never needs to know student/result field shapes —
//     schema changes on the client side never require touching this file.
//
// Conflict model: optimistic concurrency (compare-and-swap) on UpdatedAt.
// pushOrgSync_ takes an `expectedUpdatedAt` — the pusher's last-known remote
// UpdatedAt for this org. If that doesn't match the meta row's actual current
// UpdatedAt (someone else pushed in between), the push is rejected with
// {conflict:true} and nothing is written; the client then offers the user a
// choice to pull first or push anyway (re-push with expectedUpdatedAt
// dropped/updated). This is last-full-snapshot-wins-with-a-warning, not
// field-level merging — sufficient for the low-concurrency 2-advisor case
// this is built for, not a substitute for real-time collaboration.
//
// FIXED (Say/Do Ledger leader-hub #1): a missing expectedUpdatedAt against an
// org that already has a remote meta row is now ALSO treated as a conflict,
// not skipped. A browser that has never synced this org at all — a built-in
// org (DECA) that was never explicitly "enabled" for sync locally, or a
// brand-new device — sends no expectedUpdatedAt; this used to sail straight
// past the compare-and-swap and silently overwrite whatever a co-advisor had
// already published. This browser genuinely doesn't know what's already
// there, so it can't be allowed to blindly overwrite it either.

const ORG_SYNC_SHEET_PROP = 'ORG_SYNC_SHEET_ID';
const ORG_META_SHEET_NAME = '_org_meta';
const ORG_META_HEADERS    = ['OrgId', 'OrgName', 'ConfigJSON', 'UpdatedAt', 'UpdatedBy'];
const OM_COL = { ORG_ID: 0, ORG_NAME: 1, CONFIG: 2, UPDATED_AT: 3, UPDATED_BY: 4 };

function _getOrgSyncSpreadsheet_() {
  const prop = PropertiesService.getScriptProperties();
  let id = prop.getProperty(ORG_SYNC_SHEET_PROP);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } // deleted/moved — rebuild below
  }
  if (!ss) {
    ss = SpreadsheetApp.create('LeaderHub Org Sync');
    prop.setProperty(ORG_SYNC_SHEET_PROP, ss.getId());
  }
  return ss;
}

function _getOrgMetaSheet_() {
  const ss = _getOrgSyncSpreadsheet_();
  let sheet = ss.getSheetByName(ORG_META_SHEET_NAME);
  if (!sheet) {
    // First tab ever created in a brand-new Spreadsheet is the default
    // "Sheet1" — repurpose it rather than leaving a stray empty tab around.
    const existing = ss.getSheets();
    sheet = (existing.length === 1 && existing[0].getLastRow() === 0) ? existing[0] : ss.insertSheet(ORG_META_SHEET_NAME);
    sheet.setName(ORG_META_SHEET_NAME);
    sheet.appendRow(ORG_META_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _findOrgMetaRow_(sheet, orgId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][OM_COL.ORG_ID] === orgId) return { rowIndex1: i + 1, row: data[i] };
  }
  return null;
}

// Gets (creating if needed) a per-org data tab, and rewrites it wholesale
// with the header + rows the client supplied. `rows` is a 2D array; `headers`
// is a 1D array. Either may be empty (an org with no results yet, say).
function _writeOrgDataTab_(ss, tabName, headers, rows) {
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  sheet.clear();
  if (headers && headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  if (rows && rows.length) {
    // Pad/trim every row to the header width so setValues doesn't throw on a
    // ragged 2D array — the client is trusted to send matching widths, but a
    // defensive normalize costs nothing and avoids an opaque GAS error.
    const width = headers && headers.length ? headers.length : (rows[0] || []).length;
    const normalized = rows.map(r => {
      const row = r.slice(0, width);
      while (row.length < width) row.push('');
      return row;
    });
    sheet.getRange(2, 1, normalized.length, width).setValues(normalized);
  }
}

function _readOrgDataTab_(ss, tabName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 1) return { headers: [], rows: [] };
  const data = sheet.getDataRange().getValues();
  return { headers: data[0] || [], rows: data.slice(1) };
}

function pushOrgSync_(body) {
  const orgId = body.orgId || '';
  if (!orgId) return { ok: false, error: 'Missing orgId' };

  const ss        = _getOrgSyncSpreadsheet_();
  const metaSheet = _getOrgMetaSheet_();
  const existing  = _findOrgMetaRow_(metaSheet, orgId);

  // Compare-and-swap: if the pusher's last-known remote UpdatedAt doesn't
  // match what's actually there right now, someone else pushed in between —
  // reject without writing anything so nothing is silently overwritten.
  if (existing) {
    const remoteUpdatedAt = existing.row[OM_COL.UPDATED_AT];
    if (!body.expectedUpdatedAt) {
      // See the "FIXED" note above this function — no expectedUpdatedAt at
      // all against an org that already has remote data is treated the same
      // as a real mismatch, not skipped.
      return {
        ok: false,
        conflict: true,
        remoteUpdatedAt: remoteUpdatedAt instanceof Date ? remoteUpdatedAt.toISOString() : remoteUpdatedAt,
        remoteUpdatedBy: existing.row[OM_COL.UPDATED_BY] || '',
      };
    }
    const remoteMs   = new Date(remoteUpdatedAt).getTime();
    const expectedMs = new Date(body.expectedUpdatedAt).getTime();
    if (remoteMs !== expectedMs) {
      return {
        ok: false,
        conflict: true,
        remoteUpdatedAt: remoteUpdatedAt instanceof Date ? remoteUpdatedAt.toISOString() : remoteUpdatedAt,
        remoteUpdatedBy: existing.row[OM_COL.UPDATED_BY] || '',
      };
    }
  }

  const now = new Date();
  _writeOrgDataTab_(ss, 'roster_' + orgId, body.rosterHeaders || [], body.rosterRows || []);
  _writeOrgDataTab_(ss, 'results_' + orgId, body.resultHeaders || [], body.resultRows || []);

  const configJson = JSON.stringify(body.config || {});
  const updatedBy  = body.updatedBy || Session.getActiveUser().getEmail() || '';
  const newRow     = [orgId, body.orgName || orgId, configJson, now, updatedBy];
  if (existing) {
    metaSheet.getRange(existing.rowIndex1, 1, 1, ORG_META_HEADERS.length).setValues([newRow]);
  } else {
    metaSheet.appendRow(newRow);
  }

  return { ok: true, updatedAt: now.toISOString() };
}

function pullOrgSync_(body) {
  const orgId = body.orgId || '';
  if (!orgId) return { ok: false, error: 'Missing orgId' };

  const ss        = _getOrgSyncSpreadsheet_();
  const metaSheet = _getOrgMetaSheet_();
  const existing  = _findOrgMetaRow_(metaSheet, orgId);
  if (!existing) return { ok: true, found: false };

  const roster  = _readOrgDataTab_(ss, 'roster_' + orgId);
  const results = _readOrgDataTab_(ss, 'results_' + orgId);
  const updatedAtRaw = existing.row[OM_COL.UPDATED_AT];

  let config = {};
  try { config = JSON.parse(existing.row[OM_COL.CONFIG] || '{}'); } catch (e) { config = {}; }

  return {
    ok: true,
    found: true,
    orgId,
    orgName:        existing.row[OM_COL.ORG_NAME] || orgId,
    config,
    updatedAt:      updatedAtRaw instanceof Date ? updatedAtRaw.toISOString() : updatedAtRaw,
    updatedBy:      existing.row[OM_COL.UPDATED_BY] || '',
    rosterHeaders:  roster.headers,
    rosterRows:     roster.rows,
    resultHeaders:  results.headers,
    resultRows:     results.rows,
  };
}

function listOrgSyncs_(body) {
  const metaSheet = _getOrgMetaSheet_();
  const data = metaSheet.getDataRange().getValues();
  const orgs = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[OM_COL.ORG_ID]) continue;
    const updatedAtRaw = row[OM_COL.UPDATED_AT];
    orgs.push({
      orgId:     row[OM_COL.ORG_ID],
      orgName:   row[OM_COL.ORG_NAME] || row[OM_COL.ORG_ID],
      updatedAt: updatedAtRaw instanceof Date ? updatedAtRaw.toISOString() : updatedAtRaw,
      updatedBy: row[OM_COL.UPDATED_BY] || '',
    });
  }
  return { ok: true, orgs };
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
