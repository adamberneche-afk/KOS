// ================================================================
// 27_FidelitySample.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// The randomized closeout-fidelity check (decided 2026-11-07).
//
// A session log is the RTP's own distillation of a chat, so it can't be
// checked against itself. Two checks instead:
//   (a) every log: Claude Code checks the closeout against the log's own
//       exchanges (CLAUDE.md, "Closeout fidelity").
//   (b) a random sample, here: when a session log is ingested, Apps Script
//       draws it with probability FIDELITY_SAMPLE_RATE (default 0.10). The
//       draw happens after the RTP wrote the log, so the RTP can't know
//       which logs will be checked.
//
// The transcript is the raw copy. The operator pastes the whole chat, with
// the RTP's log at its end, and ingestion keeps that paste untouched as
// [RAW]_<Session_UID> in 03.4_RAW_EXHAUST. So a drawn log is ready to
// compare at once: nothing more is asked of the operator. Apps Script
// records how much chat came before the log and how many exchanges the log
// claims, so a short paste is visible before anyone reads it; Claude Code
// lists the exchanges with no chat behind them as part of the comparison.
// Only when the paste held the log alone (no chat before its header) does
// the row fall back to asking for the chat as a Google Doc named
// "TRANSCRIPT — <Session_UID>" in 03.6_SESSION_TRANSCRIPTS.
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
  'Received_At', 'Compared_At', 'Result', 'Chat_Chars', 'Log_Exchanges'];
const FS_COL = { UID: 0, TITLE: 1, DATE: 2, SELECTED: 3, STATUS: 4, NAME: 5, RECEIVED: 6, COMPARED: 7, RESULT: 8,
  CHAT: 9, EXCHANGES: 10 };
const FS_RATE_PROP = 'FIDELITY_SAMPLE_RATE';
const FS_DEFAULT_RATE = 0.10;
const FS_SEEN_PROP = 'FIDELITY_LOGS_SEEN';
const FS_FOLDER_NAME = '03.6_SESSION_TRANSCRIPTS';
const FS_FOLDER_PROP = 'ID_03_6_SESSION_TRANSCRIPTS';
const FS_OVERDUE_DAYS = 7;
/** Less chat than this before the log's header counts as the log pasted alone. */
const FS_MIN_CHAT_CHARS = 500;
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

/**
 * Splits a raw paste into the chat and the RTP's log. The log is the last
 * "KOS SESSION LOG — <date> — <title>" line to the end: a chat can quote an
 * earlier draft of the log, and the final one is what was ingested.
 * @returns {{chat:string, date:string, title:string, exchanges:number}}
 */
function _fsSplit_(rawText) {
  const text = String(rawText || '');
  const re = /^[ \t]*KOS SESSION LOG\s*[—-]\s*(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.*)$/gm;
  let m, last = null;
  while ((m = re.exec(text)) !== null) last = m;
  if (!last) {
    return { chat: '', date: '', title: text.trim().split('\n')[0].slice(0, 120), exchanges: 0 };
  }
  const log = text.slice(last.index);
  return { chat: text.slice(0, last.index).trim(), date: last[1], title: last[2].trim(),
    exchanges: (log.match(/RTP\s*[—-]\s*EXCHANGE\s+\d+/g) || []).length };
}

/**
 * Called once per newly ingested session log (2_Ingestion_Sensors.gs, both
 * paths). Counts the log and draws it with the configured probability.
 * A drawn log whose paste carried the chat is ready to compare against its
 * raw copy; one pasted alone asks for the chat as a TRANSCRIPT doc.
 * `draw` is for tests; production leaves it undefined (Math.random()).
 * @returns {{sampled:boolean, transcriptName?:string, needsTranscript?:boolean}}
 */
function sampleSessionLogForFidelity_(logUUID, rawText, now, draw) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(FS_SEEN_PROP, String((parseInt(props.getProperty(FS_SEEN_PROP), 10) || 0) + 1));
  const r = draw === undefined ? Math.random() : draw;
  if (r >= _fsRate_()) return { sampled: false };
  const p = _fsSplit_(rawText);
  const at = now || new Date();
  const hasChat = p.chat.length >= FS_MIN_CHAT_CHARS;
  const name = hasChat ? '[RAW]_' + logUUID : 'TRANSCRIPT — ' + logUUID;
  _fsSheet_().appendRow([logUUID, p.title, p.date, at, hasChat ? FS_RECEIVED : FS_REQUESTED, name,
    hasChat ? at : '', '', '', p.chat.length, p.exchanges]);
  return { sampled: true, transcriptName: name, needsTranscript: !hasChat };
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
    line += ' Waiting on you: that log was pasted without its chat; paste the whole chat into a Google Doc named "' +
      c.waitingOnOperator.join('", "') + '" in ' + FS_FOLDER_NAME + '.';
  }
  if (c.waitingOnClaudeCode) line += ' Waiting on Claude Code: ' + c.waitingOnClaudeCode + ' log(s) to compare with the chat.';
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
