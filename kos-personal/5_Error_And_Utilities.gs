// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 5 of 8: Error Reporting & Shared Utilities
// ================================================================
//
// Replaces: PART 16 (Shared Utilities), PART 15 (Calibration &
//           Diagnostics), PART 13 (generateIdentityKey,
//           runHardeningAudit), and PART 17 (Admin) from
//           KOS_MASTER_v3_1.gs.
//
// ── CANONICAL OWNERSHIP NOTICE ───────────────────────────────
// This file is the single source of truth for all shared utility
// functions. Remove the following duplicates to prevent GAS
// compile errors (duplicate function declarations):
//
//   FROM 1_Config_And_Deploy.gs — REMOVE:
//     _getOrCreateSheet()
//
//   FROM KOS_PHASE0_PATCHES.gs — DELETE the entire file once
//     all five patch functions are superseded by v8.0 files.
//
// ── KEY CHANGES FROM v5.4 ────────────────────────────────────
// _reportError()         No longer sends email on every error.
//                        Writes to ERROR_LOG sheet + console only.
//                        sendDailyErrorReport() is the sole email
//                        path. The ui param is kept for any
//                        remaining HITL callers that pass it.
//
// sendDailyErrorReport() New. Reads unread ERROR_LOG rows, emails
//                        a grouped digest to the admin, and marks
//                        rows as REPORTED. Also callable from the
//                        web app Diagnostics tab on demand.
//
// _getOrCreateSheet()    Updated schemas throughout: STAGING 7 cols,
//                        MATRIX_LEDGER adds GAS_DEVELOPMENT +
//                        RELATIONAL, EXTERNAL_TELEMETRY new,
//                        ERROR_LOG adds Reported_At (col 5).
//
// _getOrCreateDoc()      BUG-03 pattern: saveAndClose → moveTo →
//                        openById(captured dId). No name-search.
//
// archiveStagingPipeline() Headless: no ui.alert. Returns archived
//                        count so the web app can display it.
//
// resetProperties()      Preserves KOS_PROMOTED_VECTORS (v8.0 key)
//                        in addition to existing preserved keys.
// ================================================================


// ================================================================
// ERROR REPORTING
// ================================================================

/**
 * Logs an error to the ERROR_LOG sheet and console.error.
 * Does NOT send email — that is sendDailyErrorReport()'s job.
 *
 * Graceful under any condition: if INDEX_ID is not yet set (e.g.
 * very early in deploy) the sheet write is skipped silently and
 * only the console entry is made.
 *
 * @param {string}  context  Function or operation name for grouping.
 * @param {Error}   error    The caught Error object.
 * @param {Ui|null} ui       Legacy: pass UI ref for HITL callers,
 *                           null for all headless/trigger callers.
 */
function _reportError(context, error, ui) {
  const ts      = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const message = error ? (error.message || String(error)) : 'Unknown error';
  const stack   = (error?.stack || '').substring(0, 800);

  console.error('[ERROR] ' + context + ': ' + message);

  // Write to ERROR_LOG sheet — non-blocking
  try {
    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (indexId) {
      const ss  = SpreadsheetApp.openById(indexId);
      let   log = ss.getSheetByName(CFG.ERROR_LOG_SHEET);
      if (!log) {
        log = ss.insertSheet(CFG.ERROR_LOG_SHEET);
        log.appendRow(['Timestamp','Context','Message','Stack','Reported_At']);
        log.getRange('1:1').setFontWeight('bold').setBackground('#fde8e8');
        log.setFrozenRows(1);
      }
      log.appendRow([ts, context, message, stack, '']);
    }
  } catch (sheetErr) {
    console.error('[_reportError] Could not write to ERROR_LOG: ' + sheetErr.message);
  }

  // Optional UI alert for HITL callers
  if (ui) {
    try {
      ui.alert(
        '❌ ' + context,
        message + '\n\nError saved to ERROR_LOG sheet.',
        ui.ButtonSet.OK
      );
    } catch (_) {}
  }
}


/**
 * Reads all unreported rows from ERROR_LOG, sends a grouped
 * digest email to the admin, and marks rows as REPORTED.
 *
 * Two call sites:
 *   1. Time-driven daily trigger at 08:00 (setupAllTriggers)
 *   2. Web app "Send Error Report Now" button in Diagnostics tab
 *      → google.script.run.withSuccessHandler(fn).sendDailyErrorReport()
 *
 * Admin email resolution order:
 *   1. PropertiesService key KOS_ADMIN_EMAIL
 *   2. Session.getEffectiveUser().getEmail()
 *      (works in installable triggers; getActiveUser() does not)
 *
 * @returns {Object} { sent, count?, to?, reason? }
 */
function sendDailyErrorReport() {
  try {
    const ss       = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const logSheet = ss.getSheetByName(CFG.ERROR_LOG_SHEET);

    if (!logSheet || logSheet.getLastRow() <= 1) {
      console.log('[DailyReport] ERROR_LOG empty — nothing to report.');
      return { sent: false, reason: 'No errors in log.' };
    }

    // Support both 4-col (Phase 0 legacy) and 5-col (v8.0) schemas
    const numCols = Math.max(logSheet.getLastColumn(), 5);
    const data    = logSheet
      .getRange(2, 1, logSheet.getLastRow() - 1, numCols)
      .getValues();

    // Unreported = col 5 (index 4) blank or absent
    const unreported = data
      .map((row, i) => ({ row, sheetRow: i + 2 }))
      .filter(({ row }) => !row[4] || String(row[4]).trim() === '');

    if (unreported.length === 0) {
      console.log('[DailyReport] All errors already reported.');
      return { sent: false, reason: 'All errors already reported.' };
    }

    // Resolve admin email
    const props = PropertiesService.getScriptProperties();
    let   adminEmail = props.getProperty('KOS_ADMIN_EMAIL') || '';
    if (!adminEmail) {
      try { adminEmail = Session.getEffectiveUser().getEmail(); } catch (_) {}
    }
    if (!adminEmail) {
      console.error('[DailyReport] No admin email. Set KOS_ADMIN_EMAIL in PropertiesService.');
      return { sent: false, reason: 'No admin email configured.' };
    }

    const now = new Date();
    const ts  = Utilities.formatDate(
      now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    // Group by context for scannable digest
    const grouped = {};
    unreported.forEach(({ row }) => {
      const ctx = String(row[1] || 'Unknown');
      if (!grouped[ctx]) grouped[ctx] = [];
      grouped[ctx].push({
        ts:    row[0],
        msg:   String(row[2] || ''),
        stack: String(row[3] || ''),
      });
    });

    const SEP  = '═'.repeat(48);
    const DASH = '─'.repeat(48);
    const lines = [
      'KOS v8.0 — Daily Error Digest',
      SEP,
      'Generated   : ' + ts,
      'Total errors: ' + unreported.length,
      'Contexts    : ' + Object.keys(grouped).length,
      'System      : ' + CFG.SYSTEM_NAME + ' v' + CFG.SYSTEM_VERSION,
      '',
      DASH,
      '',
    ];

    Object.entries(grouped).forEach(([ctx, errors]) => {
      lines.push('[' + ctx + ']  —  ' + errors.length + ' occurrence(s)');
      errors.forEach((e, i) => {
        let errTs = '?';
        try {
          errTs = Utilities.formatDate(
            new Date(e.ts), Session.getScriptTimeZone(), 'MM-dd HH:mm:ss');
        } catch (_) {}
        lines.push('  ' + (i + 1) + '. ' + errTs);
        lines.push('     ' + e.msg);
        if (e.stack) lines.push('     ' + e.stack.split('\n')[0]);
      });
      lines.push('');
    });

    lines.push(DASH);
    lines.push('ERROR_LOG: ' + ss.getUrl());
    lines.push('');
    lines.push('This digest covers all unreported errors since the last run.');

    const subject =
      '[KOS v8.0] Error Digest — ' + unreported.length + ' error(s) — ' +
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'MMM dd yyyy');

    MailApp.sendEmail(adminEmail, subject, lines.join('\n'));

    // Mark rows as reported
    unreported.forEach(({ sheetRow }) =>
      logSheet.getRange(sheetRow, 5).setValue(ts)
    );
    SpreadsheetApp.flush();

    console.log('[DailyReport] Sent to ' + adminEmail + ' — ' + unreported.length + ' error(s).');
    return { sent: true, count: unreported.length, to: adminEmail };

  } catch (e) {
    // Do NOT call _reportError here — would cause infinite loop
    console.error('[DailyReport] Failed: ' + e.message);
    return { sent: false, reason: e.message };
  }
}


// ================================================================
// UUID & CHUNKING
// ================================================================

/**
 * Generates a content-derived log ID: LOG-{8-char MD5 hash}.
 * Deterministic — the same text always produces the same ID — because
 * every duplicate-detection check that uses this ID's output
 * (sensor1_scanInboundSessions, submitSessionLog, submitExternalData)
 * compares it against previously-stored IDs to answer "has this exact
 * content already been queued?" That comparison only works if calling
 * this twice on the same text returns the same string.
 *
 * FIXED: a prior version prefixed the hash with the current
 * timestamp (`LOG-{ts}-{hash}`), which made every call's output unique
 * regardless of content — the dedup checks compared two different
 * per-call strings and could never match, so the exact same session log
 * (or external-data paste) submitted twice was silently chunked, queued,
 * and processed twice. Caught during a full codebase review, fixed by
 * dropping the timestamp from the ID entirely rather than reordering it
 * — a per-call-varying value anywhere in the compared string breaks an
 * exact/prefix match regardless of position.
 *
 * Known accepted tradeoff, unchanged by this fix: 8 hex chars is 32 bits
 * of MD5, so two genuinely different texts could in principle collide
 * and get misdiagnosed as a duplicate (skipped, not corrupted) — this
 * was already the design's collision surface before this fix; only the
 * comparison itself was broken, not the hash length.
 *
 * @param  {string}  text  Source text to derive hash from.
 * @returns {string}       e.g. "LOG-a3f2c891"
 */
function _generateLogUUID(text) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text))
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 8);
  return 'LOG-' + hash;
}


/**
 * Splits raw session log text into chunks of at most
 * CFG.MAX_CHUNK_SIZE characters, respecting the CFG.DELIMITER
 * boundary so semantic blocks are never split mid-entry — unless a
 * single delimiter-bounded block (or the whole text, if no delimiter is
 * found at all) is itself bigger than CFG.MAX_CHUNK_SIZE, in which case
 * _splitOversizedBlock_ divides it further (by paragraph, then by raw
 * length as a last resort) so every returned chunk actually honors the
 * limit. FIXED: this guarantee used to be aspirational, not enforced —
 * an oversized block was previously returned whole as its own
 * over-limit chunk.
 *
 * @param  {string}   text  Raw session log text.
 * @returns {string[]}      Array of chunk strings, each ≤ MAX_CHUNK_SIZE chars.
 */
function _semanticChunker(text) {
  const splits = text.split(CFG.DELIMITER);
  const chunks = [];
  let   cur    = '';

  splits.forEach((s, i) => {
    if (!s.trim()) return;
    const block = (i === 0 && !text.startsWith(CFG.DELIMITER))
      ? s
      : CFG.DELIMITER + s;
    if ((cur.length + block.length) > CFG.MAX_CHUNK_SIZE) {
      if (cur) chunks.push(cur.trim());
      // FIXED: a single CFG.DELIMITER-bounded block bigger than
      // CFG.MAX_CHUNK_SIZE on its own used to become `cur` here
      // unchanged, then get pushed as one over-limit chunk — this
      // function's own doc/callers assume "already chunked to under
      // CFG.MAX_CHUNK_SIZE" (see STUDIO_INTEGRATION_SPEC.md), so an
      // oversized block silently broke that guarantee and produced
      // truncated/failed inference that got misdiagnosed as a
      // Studio-side problem rather than an unsplit chunk. Split it
      // further instead of carrying it forward whole.
      if (block.length > CFG.MAX_CHUNK_SIZE) {
        chunks.push(..._splitOversizedBlock_(block));
        cur = '';
      } else {
        cur = block;
      }
    } else {
      cur += (cur ? '\n\n' : '') + block;
    }
  });

  if (cur) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

/**
 * Splits a single block already known to exceed CFG.MAX_CHUNK_SIZE into
 * multiple sub-chunks, each within the limit. Two-tier fallback:
 *   1. Greedily accumulate by paragraph (\n\n) — same algorithm as
 *      _semanticChunker's own delimiter-block accumulation, just one
 *      level down, so paragraph boundaries are preserved where possible.
 *   2. If a single paragraph is itself still oversized (pathological —
 *      one unbroken wall of text with no paragraph breaks at all), fall
 *      back to raw fixed-size character slicing so the
 *      ≤ CFG.MAX_CHUNK_SIZE guarantee holds unconditionally.
 *
 * @param  {string} block  A single block, block.length > CFG.MAX_CHUNK_SIZE.
 * @returns {string[]} One or more sub-chunks, each ≤ CFG.MAX_CHUNK_SIZE.
 */
function _splitOversizedBlock_(block) {
  const paragraphs = block.split('\n\n');
  const subChunks   = [];
  let   cur         = '';

  paragraphs.forEach(p => {
    if (!p.trim()) return;
    if (p.length > CFG.MAX_CHUNK_SIZE) {
      // Tier 2 — a single paragraph alone exceeds the limit.
      if (cur) { subChunks.push(cur.trim()); cur = ''; }
      for (let i = 0; i < p.length; i += CFG.MAX_CHUNK_SIZE) {
        subChunks.push(p.substring(i, i + CFG.MAX_CHUNK_SIZE));
      }
    } else if ((cur.length + p.length) > CFG.MAX_CHUNK_SIZE) {
      if (cur) subChunks.push(cur.trim());
      cur = p;
    } else {
      cur += (cur ? '\n\n' : '') + p;
    }
  });

  if (cur) subChunks.push(cur.trim());
  console.log('[_splitOversizedBlock_] Oversized block (' + block.length +
    ' chars) split into ' + subChunks.length + ' sub-chunk(s).');
  return subChunks;
}


// ================================================================
// ASSET RESOLUTION
// ================================================================

/**
 * Retrieves a system asset (folder or spreadsheet) by looking up
 * its ID in PropertiesService. Falls back to a Drive name search
 * if the cached ID is stale or missing, and re-caches on success.
 *
 * @param  {string}  name     Display name of the asset in Drive.
 * @param  {string}  propKey  PropertiesService key for the asset ID.
 * @param  {boolean} isFolder true = Folder result, false = Spreadsheet.
 * @returns {Folder|Spreadsheet}
 * @throws  {Error} if the asset cannot be found at all.
 */
function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);
  if (id) {
    try {
      return isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id);
    } catch (_) {}  // stale ID — fall through
  }
  const it = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!it.hasNext()) {
    throw new Error('Asset not found: "' + name + '". Run deployFullSystem() first.');
  }
  const asset = it.next();
  props.setProperty(propKey, asset.getId());
  return isFolder ? asset : SpreadsheetApp.openById(asset.getId());
}


/**
 * Returns the named sheet tab from `ss`, creating it with the
 * correct header row if it does not yet exist.
 *
 * CANONICAL v8.0 version. Supersedes the copies in
 * 1_Config_And_Deploy.gs and KOS_PHASE0_PATCHES.gs — remove those.
 *
 * @param  {Spreadsheet} ss    Open spreadsheet.
 * @param  {string}      name  Sheet tab name.
 * @returns {Sheet}
 */
function _getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);

  const H = {
    // ── Pipeline ──────────────────────────────────────────────
    [CFG.STAGING_SHEET]: [
      'Timestamp','Payload_UID','Payload_Type',
      'Doc_URL','File_ID','Status','Retry_Count',
    ],
    'STAGING_ARCHIVE': [
      'Archived_At','Timestamp','Payload_UID','Payload_Type',
      'Doc_URL','File_ID','Status','Retry_Count',
    ],
    'EXECUTION_LEDGER': [
      'UID','TIMESTAMP','SEMANTIC_TAG','FILE_URL','STATUS','ATTEMPT_TRACKER',
    ],
    [CFG.INFERENCE_BUFFER_SHEET]: [
      'Timestamp','Session_ID','Chunk_ID','Inference_Payload','Status',
    ],

    // ── Vector & matrix ───────────────────────────────────────
    // MATRIX_LEDGER: fixed audit log of raw scores per session.
    // v8.0 adds GAS_DEVELOPMENT + RELATIONAL to match CFG.KNOWN_VECTORS.
    // DOMAIN_COMPLIANCE added when the 7th known vector was adopted
    // (tracked alongside RELATIONAL rather than replacing it — the SMP's
    // audit example used DOMAIN_COMPLIANCE, real live sessions use
    // RELATIONAL; both are kept as known vectors going forward).
    [CFG.MATRIX_LEDGER_SHEET]: [
      'Session_UID','Timestamp',
      'ARCHITECTURE','UI','SECURITY','PEDAGOGY',
      'GAS_DEVELOPMENT','RELATIONAL','DOMAIN_COMPLIANCE',
      'TOTAL',
    ],
    // DYNAMIC_STATE_MATRIX: long-format decayed scores per theme/session.
    [CFG.DYNAMIC_STATE_MATRIX]: [
      'Session_UID','Timestamp','Theme',
      'Raw_Score','Decayed_Score','Session_Count','Promoted',
    ],
    // VECTOR_MATRIX: wide-format living state with decay.
    // Columns grow when themes are promoted from the incubator.
    // CHECKSUM (row-integrity hash, CFG.MATRIX_ROW_CHECKSUM_ALGO) is
    // always the last column, after INCUBATOR_SIGNALS — see
    // _writeMatrixRow's header-parsing guard in 4_Vector_Router.gs,
    // which must keep excluding exactly these two trailing columns.
    [CFG.VECTOR_MATRIX_SHEET]: [
      'Session_UID','Timestamp',
      ...CFG.KNOWN_VECTORS,
      'INCUBATOR_SIGNALS',
      'CHECKSUM',
    ],
    // INCUBATOR: cumulative-score + half-life-decay lifecycle (CE-SMP
    // Vector Weight Calculation Engine v1.0). Raw_Score_Log is a JSON
    // array of {session_id, raw_score} — the historical record migrated
    // verbatim into VECTOR_MATRIX on promotion, never re-normalized.
    [CFG.INCUBATOR_SHEET]: [
      'Theme','First_Detected','Last_Touched',
      'Session_Count','Cumulative_Score','Raw_Score_Log','Status',
    ],

    // ── Governance ────────────────────────────────────────────
    [CFG.BLACKBOARD_SHEET]: [
      'Target_Doc_ID','CE_Tag','Doc_Title','Version',
      'Find_String','Replace_Payload','Alt_Doc_ID','Notes',
      'Filed_By','Filed_Date','Status','Deploy_Trigger',
    ],

    // ── Ledgers ───────────────────────────────────────────────
    [CFG.ACTION_REGISTER_SHEET]: [
      'Session_UID','Timestamp','Type','Item',
      'Owner','Protected_Time_Risk','Status',
    ],
    [CFG.SESSION_LOG_SHEET]: [
      'Session_UID','Timestamp','Session_Type',
      'Cold_Start','RTP_Version','Session_Summary',
    ],
    [CFG.COG_REGISTRY_SHEET]: [
      'Session_UID','Timestamp','Cog','Final_Status','Summary',
    ],

    // ── Onboarding ────────────────────────────────────────────
    [CFG.ONBOARDING_SHEET]: [
      'Day','Date','Event','Note','Vision_90_Day',
    ],

    // ── v8.0 additions ────────────────────────────────────────
    [CFG.EXTERNAL_TELEMETRY_SHEET]: [
      'Timestamp','Title','Content','Status','Payload_UID',
    ],
    [CFG.ERROR_LOG_SHEET]: [
      'Timestamp','Context','Message','Stack','Reported_At',
    ],
  };

  const headers = H[name] || ['Timestamp', 'Data'];
  sheet.appendRow(headers);
  sheet.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
  sheet.setFrozenRows(1);
  return sheet;
}


/**
 * Returns or creates a Google Sheets spreadsheet by name inside
 * parentFolder.
 *
 * @param  {string} name          Spreadsheet display name.
 * @param  {Folder} parentFolder  Destination folder.
 * @returns {Spreadsheet}
 */
function _getOrCreateSpreadsheet(name, parentFolder) {
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId());
    }
  }
  const ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}


/**
 * Returns or creates a Google Doc by name inside folder.
 * BUG-03 pattern: captures dId before saveAndClose, uses it
 * for moveTo and the return openById call — no Drive name search.
 *
 * @param  {string} docName  Doc display name.
 * @param  {Folder} folder   Destination Drive folder.
 * @returns {Document}       Open Document ready for editing.
 */
function _getOrCreateDoc(docName, folder) {
  const existing = folder.getFilesByName(docName);
  if (existing.hasNext()) return DocumentApp.openById(existing.next().getId());
  const doc  = DocumentApp.create(docName);
  const dId  = doc.getId();
  doc.saveAndClose();
  DriveApp.getFileById(dId).moveTo(folder);
  return DocumentApp.openById(dId);
}


/**
 * Returns or creates a Drive folder with the given name inside
 * parent. Defaults to My Drive root if parent is null/undefined.
 *
 * @param  {string}      name    Folder display name.
 * @param  {Folder|null} parent  Parent folder, or null for root.
 * @returns {Folder}
 */
function _getOrCreateFolder(name, parent) {
  const p  = parent || DriveApp.getRootFolder();
  const it = p.getFoldersByName(name);
  return it.hasNext() ? it.next() : p.createFolder(name);
}


/**
 * Finds a named folder inside parent without creating it.
 *
 * @param  {string} name    Folder name.
 * @param  {Folder} parent  Parent to search.
 * @returns {Folder|null}
 */
function _findFolder(name, parent) {
  if (!parent) return null;
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}


// ================================================================
// SECURITY & IDENTITY
// ================================================================

/**
 * Generates a 16-char uppercase MD5-derived Identity Key from the
 * CORE_THESIS doc content combined with the operator's salt.
 * Stores the result in PropertiesService — never logged.
 *
 * Safe to re-run: overwrites existing key. If CORE_THESIS text
 * is unavailable (fresh deploy) the salt alone is used as source.
 *
 * @returns {string|null}  Generated key, or null on error.
 */
function generateIdentityKey() {
  try {
    const props  = PropertiesService.getScriptProperties();
    const salt   = props.getProperty('IDENTITY_KEY_SALT') || 'DEFAULT_SALT';
    let   thesis = '';

    const tid = props.getProperty('ID_CORE_THESIS');
    if (tid) {
      try { thesis = DocumentApp.openById(tid).getBody().getText(); } catch (_) {}
    }
    if (!thesis) {
      const f = DriveApp.getFilesByName('CORE_THESIS');
      if (f.hasNext()) {
        try { thesis = DocumentApp.openById(f.next().getId()).getBody().getText(); } catch (_) {}
      }
    }

    const combined = (thesis.substring(0, 500) + salt).trim();
    const key = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, combined)
      .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    props.setProperty('IDENTITY_KEY', key);
    console.log('[IDENTITY_KEY_GENERATED] 16-char key derived and sequestered.');
    return key;
  } catch (e) {
    _reportError('generateIdentityKey', e, null);
    return null;
  }
}


/**
 * Scans a payload string for hardened security violations (PIVOT 008).
 * Throws on first detected pattern so callers abort immediately.
 * Sensor 1 and submitSessionLog wrap this in try/catch.
 *
 * @param  {string}  payload  Text to audit.
 * @returns {boolean}         true if clean.
 * @throws  {Error}           On detected vulnerability pattern.
 */
function runHardeningAudit(payload) {
  const patterns = [
    { re: /weight\s*[:=]\s*0\.\d+/i,          label: 'Hardcoded weight value'    },
    { re: /threshold\s*[:=]\s*0\.\d+/i,       label: 'Hardcoded threshold value' },
    { re: /IDENTITY_KEY\s*[:=]\s*['"].+['"]/,  label: 'Exposed Identity Key'      },
    { re: /SALT\s*[:=]\s*['"].+['"]/i,         label: 'Exposed salt string'       },
  ];
  patterns.forEach(({ re, label }) => {
    if (re.test(payload)) {
      throw new Error(
        '[VULNERABILITY_DETECTED] ' + label +
        '. Aborted per PIVOT 008. ' +
        'Move this value to PropertiesService via setupCalibration().'
      );
    }
  });
  return true;
}


/**
 * Returns engine arming status without UI access.
 * Called by deployFullSystem() in 1_Config_And_Deploy.gs.
 *
 * @returns {{ armed: boolean, count: number }}
 */
function _getCalibrationStatus() {
  const props = PropertiesService.getScriptProperties();
  const found = CFG.CALIBRATION_KEYS.filter(k => props.getProperty(k) !== null);
  return { armed: found.length > 0, count: found.length };
}


/**
 * PIVOT 008 loading point. Fill in your values, run ONCE, then
 * immediately clear the value literals from this function body.
 * Run auditCalibrationHealth() from 9_UI_Diagnostics.gs to verify.
 */
function setupCalibration() {
  // ── FILL IN → RUN ONCE → CLEAR ───────────────────────────────
  PropertiesService.getScriptProperties().setProperties({
    'THEME_ARCHITECTURE':     'YOUR_WEIGHT_HERE',
    'THEME_PEDAGOGY':         'YOUR_WEIGHT_HERE',
    'THEME_FAMILY_ALIGNMENT': 'YOUR_WEIGHT_HERE',
    'SOCRATIC_THRESHOLD':     'YOUR_WEIGHT_HERE',
    'IDENTITY_KEY_SALT':      'YOUR_PRIVATE_PASSPHRASE_HERE',
  });
  // ─────────────────────────────────────────────────────────────
  console.log('[HARDENING_COMPLETE] Values sequestered. Clear this function body now.');
}


/**
 * Reads a calibration weight from PropertiesService by key.
 * Logs a console error if missing (PIVOT 008 guard).
 *
 * @param  {string}      key  PropertiesService key.
 * @returns {string|null}
 */
function getKOSCalibration(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) console.error('[CALIBRATION_MISSING] "' + key + '". Run setupCalibration().');
  return val;
}


/**
 * Infers starting calibration weights from the operator role
 * string collected during Socratic Onboarding.
 *
 * @param  {string} role  Operator role from onboarding step 1.
 * @returns {Object}      { THEME_ARCHITECTURE, THEME_PEDAGOGY, ... }
 */
function _inferCalibrationWeights(role) {
  const r = (role || '').toLowerCase();
  const w = {
    THEME_ARCHITECTURE:     '0.75',
    THEME_PEDAGOGY:         '0.75',
    THEME_FAMILY_ALIGNMENT: '0.75',
    SOCRATIC_THRESHOLD:     '0.75',
  };
  if (/teach|educat|curriculum|instruc|tutor|profess/.test(r)) {
    w.THEME_PEDAGOGY = '0.92'; w.THEME_FAMILY_ALIGNMENT = '0.88';
    w.THEME_ARCHITECTURE = '0.72'; w.SOCRATIC_THRESHOLD = '0.80';
  } else if (/coach|business|sales|market|consult|entrepreneur/.test(r)) {
    w.THEME_FAMILY_ALIGNMENT = '0.92'; w.THEME_PEDAGOGY = '0.68';
    w.THEME_ARCHITECTURE = '0.78'; w.SOCRATIC_THRESHOLD = '0.72';
  } else if (/develop|engineer|code|software|technical|architect/.test(r)) {
    w.THEME_ARCHITECTURE = '0.90'; w.THEME_PEDAGOGY = '0.55';
    w.THEME_FAMILY_ALIGNMENT = '0.70'; w.SOCRATIC_THRESHOLD = '0.70';
  } else if (/nonprofit|community|social|advocate|director/.test(r)) {
    w.THEME_FAMILY_ALIGNMENT = '0.95'; w.THEME_PEDAGOGY = '0.80';
    w.THEME_ARCHITECTURE = '0.65'; w.SOCRATIC_THRESHOLD = '0.78';
  }
  return w;
}


/**
 * Populates the CORE_THESIS doc with sealed onboarding answers.
 * Called by runSocraticOnboarding() in 9_UI_Diagnostics.gs.
 *
 * @param {Object} a           Onboarding answers object.
 * @param {string} deployType  INDIVIDUAL | EDUCATOR | COMMERCIAL
 */
function _seedCoreThesisDoc(a, deployType) {
  try {
    const props = PropertiesService.getScriptProperties();
    let   id    = props.getProperty('ID_CORE_THESIS');
    if (!id) {
      const f = DriveApp.getFilesByName('CORE_THESIS');
      if (f.hasNext()) { id = f.next().getId(); props.setProperty('ID_CORE_THESIS', id); }
    }
    if (!id) return;

    const doc  = DocumentApp.openById(id);
    const body = doc.getBody();
    body.clear();

    const sections = [
      { h1: 'CORE THESIS' },
      { h3: 'Sealed: ' + new Date().toLocaleDateString() +
            '  |  Deployment: ' + deployType +
            '  |  KOS v' + CFG.SYSTEM_VERSION },
      { hr: true },
      { h2: 'Primary Role' },             { p: a.role       || '' },
      { h2: 'Who I Serve' },              { p: a.audience   || '' },
      { h2: 'The Admin Ghost' },          { p: a.adminGhost || '' },
      { h2: 'The Necessary Struggle' },   { p: a.struggle   || '' },
      { h2: 'Relational Targets' },       { p: a.targets    || '' },
      { h2: '90-Day Vision' },            { p: a.vision     || '' },
      { hr: true },
      { h2: 'License' },
      { p:  CFG.LICENSE_TYPE + '\nDeployment: ' + deployType +
            '\nAuthor: ' + CFG.AUTHOR +
            '\nFidelity Clause: preserve PERSONA_ALIGNMENT and HITL Firewall.' },
    ];
    sections.forEach(s => {
      if      (s.h1) body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      else if (s.h2) body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      else if (s.h3) body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      else if (s.p  !== undefined) body.appendParagraph(String(s.p));
      else if (s.hr) body.appendHorizontalRule();
    });
    doc.saveAndClose();
  } catch (e) {
    console.error('[_seedCoreThesisDoc] ' + e.message);
  }
}


// ================================================================
// SHADOW MATRIX (reconciliation decision 1)
// ================================================================
//
// Implements the shadow matrix described in kos-personal/README.md's
// "Architecture in Two Paragraphs" and fully specified in
// SCHEMA_REFERENCE.md's "Shadow Matrix JSON Shape" — previously
// documented in detail but absent from every delivered file.
//
// Maintains confidence intervals for 5 operator values, updated
// passively from each processed session's `alignment_observations`
// (see STUDIO_INTEGRATION_SPEC.md Step 5). Stored as a single JSON
// blob under PropertiesService key KOS_SHADOW_MATRIX, matching the
// pattern already used for KOS_PROMOTED_VECTORS and COUNCIL_LAST_RUN.
// ================================================================

const SHADOW_QUESTIONS = ['admin_ghost', 'relational_targets', 'necessary_struggle', 'prime_directive', 'temporal_constraints'];

const SHADOW_LABELS = {
  admin_ghost:          'Admin Ghost',
  relational_targets:   'Relational Targets',
  necessary_struggle:   'Necessary Struggle',
  prime_directive:      'Prime Directive',
  temporal_constraints: 'Temporal Constraints',
};

// Maps a shadow question to the existing CFG.PROP key it auto-populates
// once VERIFIED, per README.md: "At 0.75 confidence, a value is marked
// VERIFIED and auto-populated into the system's operator properties."
// Only questions with a direct 1:1 onboarding-property equivalent are
// listed — prime_directive and temporal_constraints have no matching
// operator property today, so they live in the shadow matrix only.
const SHADOW_TO_PROP = {
  admin_ghost:        CFG.PROP.ADMIN_GHOST,
  relational_targets: CFG.PROP.RELATIONAL_TARGETS,
  necessary_struggle: CFG.PROP.NECESSARY_STRUGGLE,
};

/**
 * Classifies a confidence score per SCHEMA_REFERENCE.md's thresholds:
 * UNKNOWN (0.0–0.09), HYPOTHESIZED (0.10–0.74), VERIFIED (0.75–1.0).
 * The VERIFIED cutoff is CFG.SHADOW_VERIFY_THRESHOLD, not hardcoded.
 *
 * @param  {number} confidence  0.0–1.0
 * @returns {string}            'UNKNOWN' | 'HYPOTHESIZED' | 'VERIFIED'
 */
function _classifyShadowStatus(confidence) {
  if (confidence >= CFG.SHADOW_VERIFY_THRESHOLD) return 'VERIFIED';
  if (confidence >= 0.10) return 'HYPOTHESIZED';
  return 'UNKNOWN';
}

/**
 * Reads the shadow matrix from PropertiesService, initializing any
 * missing question to the UNKNOWN baseline shape from SCHEMA_REFERENCE.md.
 *
 * @returns {Object}  { [question]: { inferred_value, confidence, status, evidence_count, last_updated } }
 */
function _readShadowMatrix() {
  let matrix = {};
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('KOS_SHADOW_MATRIX');
    if (raw) matrix = JSON.parse(raw);
  } catch (e) {
    console.warn('[ShadowMatrix] Stored matrix corrupt — resetting. ' + e.message);
    matrix = {};
  }
  SHADOW_QUESTIONS.forEach(q => {
    if (!matrix[q]) {
      matrix[q] = { inferred_value: '', confidence: 0, status: 'UNKNOWN', evidence_count: 0, last_updated: '' };
    }
  });
  return matrix;
}

/**
 * Applies one session's `alignment_observations` (STUDIO_INTEGRATION_SPEC.md
 * Step 5) to the shadow matrix: adds each confidence_delta (never negative,
 * capped at 1.0 per question, max +0.15/session per the spec), updates
 * inferred_value when a new non-null signal string is present, bumps
 * evidence_count when a positive delta was applied, and re-classifies
 * status. When a question crosses into VERIFIED, auto-populates the
 * corresponding operator property (SHADOW_TO_PROP) — but only if that
 * property isn't already set, so explicit onboarding answers are never
 * silently overwritten by an inferred one.
 *
 * Called by processIntakePayload (3_Queue_Processor.gs) after every
 * successful intake. Non-fatal — caller wraps this in try/catch.
 *
 * @param {Object} observations  pd.alignment_observations from the
 *                                inference payload. No-ops if absent.
 */
function _updateShadowMatrix(observations) {
  if (!observations) return;
  const deltas = observations.confidence_deltas || {};
  const props  = PropertiesService.getScriptProperties();
  const matrix = _readShadowMatrix();
  const ts     = new Date().toISOString();

  const signalKeyFor = {
    admin_ghost:          'admin_ghost_signal',
    relational_targets:   'relational_signal',
    necessary_struggle:   'necessary_struggle_signal',
    prime_directive:      'prime_directive_signal',
    temporal_constraints: 'temporal_signal',
  };

  SHADOW_QUESTIONS.forEach(q => {
    const rawDelta = parseFloat(deltas[q]) || 0;
    // Per spec: confidence only increases, never decreases; cap 0.15/session.
    const delta = Math.max(0, Math.min(rawDelta, 0.15));

    const entry = matrix[q];
    if (delta > 0) {
      entry.confidence      = Math.min(1, parseFloat((entry.confidence + delta).toFixed(4)));
      entry.evidence_count  = (entry.evidence_count || 0) + 1;
      entry.last_updated    = ts;
    }

    const signal = observations[signalKeyFor[q]];
    if (signal && typeof signal === 'string' && signal.trim()) {
      entry.inferred_value = signal.trim();
    }

    const wasVerified = entry.status === 'VERIFIED';
    entry.status = _classifyShadowStatus(entry.confidence);

    // Auto-populate the matching operator property on first VERIFIED —
    // only if the operator hasn't already set it explicitly.
    if (!wasVerified && entry.status === 'VERIFIED' && SHADOW_TO_PROP[q]) {
      const propKey = SHADOW_TO_PROP[q];
      if (propKey && !props.getProperty(propKey) && entry.inferred_value) {
        props.setProperty(propKey, entry.inferred_value);
        console.log('[ShadowMatrix] ' + q + ' VERIFIED — auto-populated ' + propKey);
      }
    }
  });

  props.setProperty('KOS_SHADOW_MATRIX', JSON.stringify(matrix));
}

/**
 * Returns the shadow matrix state for the web app Diagnostics tab
 * (the "Ambient Calibration" section and header engine-mode dot).
 *
 * engine_mode:
 *   CALIBRATED — engine armed via Socratic Onboarding / completeOnboarding
 *   LEARNING   — not armed, but at least one shadow question has evidence
 *   COLD       — not armed, no shadow evidence yet
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(fn).getShadowMatrixStatus()
 *
 * @returns {Object} { success, engine_mode, all_verified, questions[] }
 */
function getShadowMatrixStatus() {
  try {
    const props   = PropertiesService.getScriptProperties();
    const armed   = !!props.getProperty('IDENTITY_KEY') &&
                     props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true';
    const matrix  = _readShadowMatrix();

    const questions = SHADOW_QUESTIONS.map(q => ({
      key:        q,
      label:      SHADOW_LABELS[q],
      confidence: matrix[q].confidence,
      status:     matrix[q].status,
      inferred:   matrix[q].inferred_value || '',
    }));

    const hasEvidence = SHADOW_QUESTIONS.some(q => (matrix[q].evidence_count || 0) > 0);
    const allVerified = SHADOW_QUESTIONS.every(q => matrix[q].status === 'VERIFIED');

    const engineMode = armed ? 'CALIBRATED' : (hasEvidence ? 'LEARNING' : 'COLD');

    return { success: true, engine_mode: engineMode, all_verified: allVerified, questions };

  } catch (e) {
    _reportError('getShadowMatrixStatus', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// ONBOARDING HELPERS
// ================================================================

/**
 * Headless counterpart to runSocraticOnboarding() (9_UI_Diagnostics.gs)
 * — the deployed standalone web app has no bound-spreadsheet UI context
 * for ui.prompt(), so this JSON-payload version is the only viable
 * onboarding path for the real product surface (reconciliation decision 3).
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .completeOnboarding({ deployType, role, audience, vision,
 *                           adminGhost, struggle, targets, passphrase, adminEmail })
 *
 * @param  {Object} payload  Form fields from the "Arm Engine" modal (8_WebApp_UI.html).
 * @returns {Object} { success, message }
 */
function completeOnboarding(payload) {
  try {
    const p = payload || {};
    if (!p.role || !p.role.trim())       return { success: false, message: 'Role is required.' };
    if (!p.vision || !p.vision.trim())   return { success: false, message: '90-Day Vision is required.' };
    if (!p.passphrase)                   return { success: false, message: 'Passphrase is required.' };

    const props = PropertiesService.getScriptProperties();
    const dt = ['INDIVIDUAL', 'EDUCATOR', 'COMMERCIAL'].includes((p.deployType || '').toUpperCase())
      ? p.deployType.toUpperCase() : 'INDIVIDUAL';

    props.setProperty('IDENTITY_KEY_SALT', p.passphrase);
    props.setProperty(CFG.PROP.DEPLOYMENT_TYPE,   dt);
    props.setProperty(CFG.PROP.OPERATOR_ROLE,     p.role.trim());
    props.setProperty(CFG.PROP.OPERATOR_AUDIENCE, (p.audience  || '').trim());
    props.setProperty(CFG.PROP.ADMIN_GHOST,       (p.adminGhost || '').trim());
    props.setProperty(CFG.PROP.NECESSARY_STRUGGLE,(p.struggle  || '').trim());
    props.setProperty(CFG.PROP.RELATIONAL_TARGETS,(p.targets   || '').trim());
    props.setProperty(CFG.PROP.VISION_90_DAY,     p.vision.trim());

    if (p.adminEmail && p.adminEmail.trim()) {
      props.setProperty('KOS_ADMIN_EMAIL', p.adminEmail.trim());
    }

    Object.entries(_inferCalibrationWeights(p.role)).forEach(([k, v]) => {
      if (!props.getProperty(k)) props.setProperty(k, String(v));
    });

    _seedCoreThesisDoc({
      role: p.role, audience: p.audience, adminGhost: p.adminGhost,
      struggle: p.struggle, targets: p.targets, vision: p.vision,
    }, dt);
    generateIdentityKey();

    props.setProperty(CFG.PROP.THESIS_VERIFIED, 'true');
    props.setProperty(CFG.PROP.ONBOARDING_DAY,  '1');
    props.setProperty(CFG.PROP.ONBOARDING_START, new Date().toISOString());
    _logOnboardingDay(1, 'WEB_ONBOARDING_COMPLETE', p.vision);

    console.log('[completeOnboarding] Engine armed via web app. Deployment: ' + dt);
    return { success: true, message: 'Engine armed. Day 1 of ' + CFG.ONBOARDING_DAYS + '.' };

  } catch (e) {
    _reportError('completeOnboarding', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Increments the onboarding day counter in PropertiesService and
 * writes an event row to ONBOARDING_TRACKER. Called by
 * processInferenceQueue after at least one successful intake.
 * No-ops silently if engine is cold or day cap is reached.
 */
function _advanceOnboardingDay() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(CFG.PROP.THESIS_VERIFIED) !== 'true') return;
  const cur = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY) || '1');
  if (cur >= CFG.ONBOARDING_DAYS) return;
  props.setProperty(CFG.PROP.ONBOARDING_DAY, String(cur + 1));
  _logOnboardingDay(cur + 1, 'SESSION_COMPLETE', '');
}


/**
 * Appends one row to ONBOARDING_TRACKER. Non-fatal — failure is
 * caught and logged to console only.
 *
 * @param {number} day    Onboarding day number.
 * @param {string} event  Event label.
 * @param {string} note   Optional note.
 */
function _logOnboardingDay(day, event, note) {
  try {
    const id = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!id) return;
    const ss = SpreadsheetApp.openById(id);
    const t  = _getOrCreateSheet(ss, CFG.ONBOARDING_SHEET);
    t.appendRow([
      day,
      new Date(),
      event,
      note || '',
      PropertiesService.getScriptProperties().getProperty(CFG.PROP.VISION_90_DAY) || '',
    ]);
  } catch (e) {
    console.warn('[_logOnboardingDay] ' + e.message);
  }
}


/**
 * Returns the operator's Relational Targets as an array.
 *
 * @returns {string[]}  e.g. ['Alice', 'Bob', 'Carol']
 */
function getRelationalTargets() {
  const raw = PropertiesService.getScriptProperties()
                .getProperty(CFG.PROP.RELATIONAL_TARGETS) || '';
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}


// ================================================================
// PIPELINE ADMIN
// ================================================================

/**
 * Moves all terminal-status rows from STAGING_PIPELINE to
 * STAGING_ARCHIVE. Fully headless — no ui.alert.
 *
 * Terminal statuses: PROCESSED, INTAKE_PROCESSED, PARTITIONED,
 *   CONSOLIDATED, FAILED_PARSE, PHASE_2_ERROR, INTAKE_ERROR,
 *   MISSING_FILE_ID, PROCESSING_ERROR.
 *
 * FIXED: MISSING_FILE_ID and PROCESSING_ERROR (3_Queue_Processor.gs)
 * used to be set as a bare 'ERROR: ...' string, which matched none of
 * these named prefixes (startsWith() below is a genuine prefix match,
 * not a substring search) — those rows accumulated in STAGING_PIPELINE
 * forever with no path to this archive. Both are real, named statuses
 * now and recognized here.
 *
 * Called by the web app Diagnostics tab:
 *   google.script.run.withSuccessHandler(fn).archiveStagingPipeline()
 *
 * @returns {number}  Rows archived (displayed by web app).
 */
function archiveStagingPipeline() {
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    let   archive = ss.getSheetByName('STAGING_ARCHIVE');

    if (!archive) {
      archive = ss.insertSheet('STAGING_ARCHIVE');
      archive.appendRow([
        'Archived_At','Timestamp','Payload_UID','Payload_Type',
        'Doc_URL','File_ID','Status','Retry_Count',
      ]);
      archive.getRange('1:1').setFontWeight('bold').setBackground('#f0e2d5');
      archive.setFrozenRows(1);
    }

    const terminal = [
      'PROCESSED','INTAKE_PROCESSED','PARTITIONED','CONSOLIDATED',
      'FAILED_PARSE','PHASE_2_ERROR','INTAKE_ERROR',
      'MISSING_FILE_ID','PROCESSING_ERROR',
    ];
    const data = staging.getDataRange().getValues();
    const now  = new Date();
    let   done = 0;

    // Reverse iteration: row deletions don't shift unprocessed indices
    for (let i = data.length - 1; i >= 1; i--) {
      const rowStatus = String(data[i][CFG.STAGING_COLS.STATUS]);
      if (terminal.some(s => rowStatus.startsWith(s))) {
        archive.appendRow([now, ...data[i]]);
        staging.deleteRow(i + 1);
        done++;
      }
    }

    if (done > 0) SpreadsheetApp.flush();
    console.log('[archiveStagingPipeline] Archived ' + done + ' row(s).');
    return done;

  } catch (e) {
    _reportError('archiveStagingPipeline', e, null);
    return 0;
  }
}


/**
 * Clears routing pointer cache from PropertiesService while
 * preserving calibration keys, identity key, onboarding state,
 * and promoted vector list.
 *
 * Run setupRoutingProperties() (1_Config_And_Deploy.gs) afterwards
 * to re-index Drive IDs.
 *
 * v8.0: also preserves KOS_PROMOTED_VECTORS and KOS_ADMIN_EMAIL (the
 * latter is what sendDailyErrorReport(), above, reads as its digest
 * target — this is the canonical resetProperties(); a stale duplicate
 * missing KOS_ADMIN_EMAIL used to also exist in 1_Config_And_Deploy.gs).
 *
 * @returns {{ kept: number }}
 */
function resetProperties() {
  const props = PropertiesService.getScriptProperties();
  const keep  = {};

  [
    ...CFG.CALIBRATION_KEYS,
    'IDENTITY_KEY',
    'KOS_PROMOTED_VECTORS',          // v8.0 — vector promotion persistence
    'KOS_ADMIN_EMAIL',               // v8.0 — daily digest target
    ...Object.values(CFG.PROP),
    'KOS_OPERATOR_ROLE',
    'KOS_OPERATOR_AUDIENCE',
    'KOS_ADMIN_GHOST',
    'KOS_NECESSARY_STRUGGLE',
    'KOS_RELATIONAL_TARGETS',
    'KOS_VISION_90_DAY',
  ].forEach(k => {
    const v = props.getProperty(k);
    if (v) keep[k] = v;
  });

  props.deleteAllProperties();
  if (Object.keys(keep).length > 0) props.setProperties(keep);

  console.log(
    '[resetProperties] Routing cache cleared. ' +
    Object.keys(keep).length + ' calibration/state key(s) preserved. ' +
    'Run setupRoutingProperties() to re-index.'
  );
  return { kept: Object.keys(keep).length };
}


/**
 * Dumps all PropertiesService keys to the execution log.
 * Calibration and Identity Key values are masked (PIVOT 008).
 * Safe to call from the Apps Script editor at any time.
 */
function dumpAllProperties() {
  const props     = PropertiesService.getScriptProperties();
  const all       = props.getProperties();
  const maskKeys  = [...CFG.CALIBRATION_KEYS, 'IDENTITY_KEY', 'IDENTITY_KEY_SALT'];
  const onboardKs = Object.keys(all).filter(k => k.startsWith('KOS_'));
  const routingKs = Object.keys(all)
    .filter(k => !maskKeys.includes(k) && !onboardKs.includes(k))
    .sort();

  console.log('══ ROUTING & ASSET POINTERS ══');
  routingKs.forEach(k => {
    const v = all[k];
    console.log(k.padEnd(34) + (v ? v.substring(0, 32) + (v.length > 32 ? '…' : '') : '⚠ NULL'));
  });

  console.log('\n══ CALIBRATION (masked — PIVOT 008) ══');
  maskKeys.forEach(k =>
    console.log(k.padEnd(34) + (all[k] ? '✔ SET' : '⚠ NOT SET'))
  );

  console.log('\n══ ONBOARDING & RUNTIME STATE ══');
  onboardKs.forEach(k => {
    const v = all[k];
    console.log(k.padEnd(34) + (v ? v.substring(0, 42) : '⚠ NOT SET'));
  });

  console.log('\nTotal keys: ' + Object.keys(all).length);
}


// ================================================================
// END 5_Error_And_Utilities.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 6_Governance.gs
// ================================================================
