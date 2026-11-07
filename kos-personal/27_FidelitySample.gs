// ================================================================
// 27_FidelitySample.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// The randomized closeout-fidelity check (decided 2026-11-07).
//
// A session log is the RTP's own distillation of a chat, and the raw copy
// ingestion keeps (03.4_RAW_EXHAUST) is the same text, so a log can't be
// checked against itself. Two checks instead:
//   (a) every log: Claude Code checks the closeout against the log's own
//       exchanges (CLAUDE.md, "Closeout fidelity").
//   (b) a random sample, here: when a session log is ingested, Apps Script
//       draws it with probability FIDELITY_SAMPLE_RATE (default 0.10). The
//       draw happens after the RTP wrote the log, so the RTP can't know
//       which logs will be checked. A drawn log asks the operator for the
//       session's full chat, pasted into a Google Doc named
//       "TRANSCRIPT — <Session_UID>" in 03.6_SESSION_TRANSCRIPTS; Claude
//       Code compares the two and records the result here.
//
// Apps Script owns the draw and the audit: the FIDELITY_AUDIT tab, a line
// in the daily primer (what's waiting, on whom, and what's overdue), and
// the observed sample rate against the configured one. It never judges a
// log: that comparison needs a reader, and is Claude Code's.
//
// ENTRY POINTS (no trailing underscore — GAS hides those from the Run
// dropdown):
//   checkFidelitySamples()   — marks transcripts that arrived; logs counts
// ================================================================

const FS_TAB = 'FIDELITY_AUDIT';
const FS_HEADERS = ['Session_UID', 'Log_Title', 'Log_Date', 'Selected_At', 'Status', 'Transcript_Name',
  'Received_At', 'Compared_At', 'Result'];
const FS_COL = { UID: 0, TITLE: 1, DATE: 2, SELECTED: 3, STATUS: 4, NAME: 5, RECEIVED: 6, COMPARED: 7, RESULT: 8 };
const FS_RATE_PROP = 'FIDELITY_SAMPLE_RATE';
const FS_DEFAULT_RATE = 0.10;
const FS_SEEN_PROP = 'FIDELITY_LOGS_SEEN';
const FS_FOLDER_NAME = '03.6_SESSION_TRANSCRIPTS';
const FS_FOLDER_PROP = 'ID_03_6_SESSION_TRANSCRIPTS';
const FS_OVERDUE_DAYS = 7;
const FS_REQUESTED = 'REQUESTED';
const FS_RECEIVED = 'RECEIVED';
const FS_COMPARED = 'COMPARED';

function _fsRate_() {
  const raw = parseFloat(PropertiesService.getScriptProperties().getProperty(FS_RATE_PROP));
  return isNaN(raw) || raw < 0 || raw > 1 ? FS_DEFAULT_RATE : raw;
}

function _fsSheet_() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  let sheet = ss.getSheetByName(FS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(FS_TAB);
    sheet.appendRow(FS_HEADERS);
  }
  return sheet;
}

function _fsRows_(sheet) {
  return sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, FS_HEADERS.length).getValues() : [];
}

/** The folder the operator pastes transcripts into, beside 03.5_INBOUND_SESSIONS (never inside it). */
function _fsFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(FS_FOLDER_PROP);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* gone: make it again */ }
  }
  const inboundId = props.getProperty('ID_03_5_INBOUND_SESSIONS');
  if (!inboundId) throw new Error('ID_03_5_INBOUND_SESSIONS is not set. Run deployFullSystem().');
  const parents = DriveApp.getFolderById(inboundId).getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const folder = _getOrCreateFolder(FS_FOLDER_NAME, parent);
  props.setProperty(FS_FOLDER_PROP, folder.getId());
  return folder;
}

/** "KOS SESSION LOG — 2026-11-03 — Title" → { date, title }. */
function _fsHeader_(rawText) {
  const first = String(rawText || '').split('\n')[0].trim();
  const m = /^KOS SESSION LOG\s*[—-]\s*(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.*)$/.exec(first);
  return m ? { date: m[1], title: m[2].trim() } : { date: '', title: first.slice(0, 120) };
}

/**
 * Called once per newly ingested session log (2_Ingestion_Sensors.gs, both
 * paths). Counts the log and draws it with the configured probability.
 * `draw` is for tests; production leaves it undefined (Math.random()).
 * @returns {{sampled:boolean, transcriptName?:string}}
 */
function sampleSessionLogForFidelity_(logUUID, rawText, now, draw) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(FS_SEEN_PROP, String((parseInt(props.getProperty(FS_SEEN_PROP), 10) || 0) + 1));
  const r = draw === undefined ? Math.random() : draw;
  if (r >= _fsRate_()) return { sampled: false };
  const h = _fsHeader_(rawText);
  const name = 'TRANSCRIPT — ' + logUUID;
  _fsSheet_().appendRow([logUUID, h.title, h.date, now || new Date(), FS_REQUESTED, name, '', '', '']);
  return { sampled: true, transcriptName: name };
}

/**
 * Marks REQUESTED rows whose transcript doc has arrived, and returns the
 * counts the primer and the weekly review report.
 */
function checkFidelitySamples_(now) {
  const t = (now || new Date()).getTime();
  const sheet = _fsSheet_();
  const rows = _fsRows_(sheet);
  const out = { sampled: rows.length, waitingOnOperator: [], waitingOnClaudeCode: 0, compared: 0,
    overdue: 0, seen: parseInt(PropertiesService.getScriptProperties().getProperty(FS_SEEN_PROP), 10) || 0,
    rate: _fsRate_() };
  let folder = null;
  rows.forEach(function (r, i) {
    const status = String(r[FS_COL.STATUS]).trim().toUpperCase();
    if (status === FS_REQUESTED) {
      if (!folder) folder = _fsFolder_();
      if (folder.getFilesByName(String(r[FS_COL.NAME])).hasNext()) {
        sheet.getRange(i + 2, FS_COL.STATUS + 1).setValue(FS_RECEIVED);
        sheet.getRange(i + 2, FS_COL.RECEIVED + 1).setValue(new Date(t));
        out.waitingOnClaudeCode++;
        return;
      }
      out.waitingOnOperator.push(String(r[FS_COL.NAME]));
      if (t - new Date(r[FS_COL.SELECTED]).getTime() > FS_OVERDUE_DAYS * 86400000) out.overdue++;
    } else if (status === FS_RECEIVED) {
      out.waitingOnClaudeCode++;
      if (t - new Date(r[FS_COL.RECEIVED]).getTime() > FS_OVERDUE_DAYS * 86400000) out.overdue++;
    } else if (status === FS_COMPARED) {
      out.compared++;
    }
  });
  return out;
}

/** The daily primer's line. Says what waits on whom; never omits an overdue sample. */
function fidelityLine_(now) {
  const c = checkFidelitySamples_(now);
  const observed = c.seen ? Math.round(100 * c.sampled / c.seen) + '% of ' + c.seen + ' logs' : 'no logs yet';
  let line = 'Fidelity sample: ' + c.sampled + ' drawn (' + observed + '; set to ' + Math.round(100 * c.rate) + '%), ' +
    c.compared + ' compared.';
  if (c.waitingOnOperator.length) {
    line += ' Waiting on you: paste the full chat into a Google Doc named "' + c.waitingOnOperator.join('", "') +
      '" in ' + FS_FOLDER_NAME + '.';
  }
  if (c.waitingOnClaudeCode) line += ' Waiting on Claude Code: ' + c.waitingOnClaudeCode + ' transcript(s) to compare.';
  if (c.overdue) line += ' OVERDUE (over ' + FS_OVERDUE_DAYS + ' days): ' + c.overdue + '.';
  return line;
}

/** Editor entry point: marks arrived transcripts and logs the primer line. */
function checkFidelitySamples() {
  const line = fidelityLine_(new Date());
  console.log('[Fidelity] ' + line);
  return line;
}

// ================================================================
// END 27_FidelitySample.gs
// ================================================================
