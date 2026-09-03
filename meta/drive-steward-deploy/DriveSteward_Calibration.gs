/**
 * Drive Steward — Weekly Calibration + Digests
 * ================================================
 * Pure arithmetic, no AI: reads File_Registry, computes the Wilson
 * score interval per pattern_id for the week (formula and worked
 * example in ../Drive_Steward_Methodology_and_Prompt.md Part 2.5),
 * writes a Calibration_Log row, and mails the weekly artifact
 * described in that same Part's step 4. Also runs the lighter nightly
 * passive digest from Part 2 step 5b.
 *
 * IMPORTANT — this script NEVER writes to Pattern_Tiers. current_tier
 * and target_band_low/high are read-only inputs here, by design: "no
 * threshold changes take effect until Fluffy responds" (Part 2.5 step
 * 5) is enforced structurally — no function below calls any write
 * method on that sheet — not just as an instruction a prompt could
 * ignore or a person could forget.
 *
 * SETUP:
 *   1. Same Apps Script project as DriveSteward_SheetsSetup.gs and
 *      DriveSteward_Scanner.gs.
 *   2. Set DIGEST_EMAIL below. Leave TARGET_SPREADSHEET_ID blank if
 *      bound to the Drive Steward Sheet.
 *   3. Install two time-driven triggers:
 *      - runDriveStewardWeeklyCalibration → Week timer (e.g. every
 *        Monday, early morning)
 *      - runDriveStewardNightlyDigest     → Day timer (e.g. evening)
 *   4. Run wilsonInterval_'s companion check by hand once if you want
 *      to see it work: wilsonInterval_(4, 1, 1.96) should return
 *      approximately { lower: 0.0456, upper: 0.6994 } — the exact
 *      worked example in the methodology doc's Part 2.5.
 */

const TARGET_SPREADSHEET_ID = '';
const DIGEST_EMAIL = 'YOUR_EMAIL_HERE';
const Z_SCORE = 1.96; // 95% confidence — matches z_used in the doc

// ============================================================
// WEEKLY CALIBRATION (Part 2.5)
// ============================================================

function runDriveStewardWeeklyCalibration() {
  const ss = _openDriveStewardSheet_();
  if (!ss) return;
  const registry = ss.getSheetByName('File_Registry');
  const calLog = ss.getSheetByName('Calibration_Log');
  const tiers = ss.getSheetByName('Pattern_Tiers');
  if (!registry || !calLog || !tiers) {
    Logger.log('❌ Missing tabs — run setupDriveStewardSheets() first.');
    return;
  }

  const weekStart = _mostRecentMonday_(new Date());
  const weekStartIso = weekStart.toISOString().slice(0, 10);

  const registryRows = _readRowsAsObjects_(registry);
  const tierByPattern = {};
  _readRowsAsObjects_(tiers).forEach(t => { if (t.pattern_id) tierByPattern[t.pattern_id] = t; });

  // Group this week's File_Registry rows by pattern_id.
  const byPattern = {};
  registryRows.forEach(r => {
    if (!r.pattern_id || !r.created_date) return;
    const created = new Date(r.created_date);
    if (isNaN(created.getTime()) || created < weekStart) return;
    (byPattern[r.pattern_id] = byPattern[r.pattern_id] || []).push(r);
  });

  const summaryForDigest = [];

  Object.keys(byPattern).forEach(patternId => {
    const rows = byPattern[patternId];
    const nApplied = rows.length;
    const nFlagged = rows.filter(r => _lower_(r.confidence_score) === 'low').length;
    const nCorrected = rows.filter(r =>
      _lower_(r.confidence_score) === 'high' && _isTrue_(r.human_corrected)
    ).length;

    const observedDivergence = nApplied > 0 ? nCorrected / nApplied : null;
    const interval = nApplied > 0 ? wilsonInterval_(nApplied, nCorrected, Z_SCORE) : null;

    const tier = tierByPattern[patternId] || {};
    const targetLow = _toFloatOrNull_(tier.target_band_low);
    const targetHigh = _toFloatOrNull_(tier.target_band_high);

    let proposedAction = 'none';
    if (interval && targetLow !== null && targetHigh !== null) {
      if (interval.lower > targetHigh) proposedAction = 'tighten';
      else if (interval.upper < targetLow) proposedAction = 'loosen';
    }

    calLog.appendRow([
      patternId,
      weekStartIso,
      nApplied,
      nFlagged,
      nCorrected,
      observedDivergence === null ? '' : observedDivergence,
      Z_SCORE,
      interval ? interval.lower : '',
      interval ? interval.upper : '',
      tier.current_tier || '',
      targetLow === null ? '' : targetLow,
      targetHigh === null ? '' : targetHigh,
      proposedAction
    ]);

    summaryForDigest.push({
      patternId, nApplied, nFlagged, nCorrected, observedDivergence, interval,
      currentTier: tier.current_tier || '(unset)', proposedAction
    });
  });

  if (summaryForDigest.length === 0) {
    Logger.log('No pattern activity for week of ' + weekStartIso + ' — nothing to calibrate.');
    return;
  }

  _sendWeeklyDigestEmail_(weekStartIso, summaryForDigest);
  Logger.log('Wrote ' + summaryForDigest.length + ' Calibration_Log row(s) for week of ' + weekStartIso + '.');
}

/**
 * Wilson score interval — exact formula from
 * ../Drive_Steward_Methodology_and_Prompt.md Part 2.5. Verified
 * against that doc's own worked example: wilsonInterval_(4, 1, 1.96)
 * returns lower≈0.0456, upper≈0.6994.
 *
 * Bounds are clamped to [0, 1]: the raw formula can produce a value
 * like -5.5e-17 instead of exactly 0 at small n purely from
 * floating-point rounding (confirmed while building this script) —
 * mathematically inconsequential, but clamping keeps a stray near-zero
 * negative from ever showing up in the Sheet looking like a real
 * out-of-range value.
 */
function wilsonInterval_(n, nCorrected, z) {
  if (n <= 0) return null;
  const pHat = nCorrected / n;
  const zSq = z * z;
  const center = (pHat + zSq / (2 * n)) / (1 + zSq / n);
  const margin = (z / (1 + zSq / n)) *
    Math.sqrt((pHat * (1 - pHat)) / n + zSq / (4 * n * n));
  return {
    lower: Math.max(0, Math.min(1, center - margin)),
    upper: Math.max(0, Math.min(1, center + margin))
  };
}

// ============================================================
// FLOW HEALTH (meta/FLOW_INVENTORY.md's shared three-state signal)
// ============================================================

/**
 * The Studio Flow (STUDIO_FLOW_SETUP.md) is a human-built dependency
 * this code hands off to and can't see or control directly — exactly
 * the kind of thing meta/FLOW_INVENTORY.md exists to track. Reuses that
 * doc's shared three-state semantics rather than inventing a new one:
 *   'no_jobs'         — Drive_Steward_Intake has never had a row (the
 *                        Scanner hasn't run yet, or nothing's changed).
 *   'never_completed' — at least one intake row exists, but
 *                        File_Registry is still empty — the Flow hasn't
 *                        classified anything yet. A hedge, not an
 *                        alarm: it may simply be newly wired up.
 *   'healthy'          — File_Registry has at least one row — the Flow
 *                        has classified something at least once.
 */
function getDriveStewardFlowHealth_(ss) {
  const intake = ss.getSheetByName('Drive_Steward_Intake');
  const registry = ss.getSheetByName('File_Registry');
  if (!intake || !registry) return 'no_jobs';
  if (intake.getLastRow() <= 1) return 'no_jobs';
  if (registry.getLastRow() <= 1) return 'never_completed';
  return 'healthy';
}

// ============================================================
// NIGHTLY PASSIVE DIGEST (Part 2 step 5b)
// ============================================================

function runDriveStewardNightlyDigest() {
  const ss = _openDriveStewardSheet_();
  if (!ss) return;
  const intake = ss.getSheetByName('Drive_Steward_Intake');
  const registry = ss.getSheetByName('File_Registry');
  if (!intake || !registry) {
    Logger.log('❌ Missing tabs — run setupDriveStewardSheets() first.');
    return;
  }

  const flowHealth = getDriveStewardFlowHealth_(ss);
  Logger.log('Flow health: ' + flowHealth);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const intakeRows = _readRowsAsObjects_(intake)
    .filter(r => r.discovered_date && new Date(r.discovered_date) >= since);
  const registryRows = _readRowsAsObjects_(registry)
    .filter(r => r.created_date && new Date(r.created_date) >= since);
  const autoFiled = registryRows.filter(r => _lower_(r.confidence_score) === 'high');
  const flagged = registryRows.filter(r => _lower_(r.confidence_score) === 'low');
  const superseded = registryRows.filter(r => _lower_(r.status) === 'archive-candidate');

  if (intakeRows.length === 0 && registryRows.length === 0) {
    Logger.log('Nightly digest: nothing new in the last 24h — no email sent.');
    return;
  }

  const lines = [
    'Drive Steward — nightly digest',
    '',
    'Flow health: ' + flowHealth
      + (flowHealth === 'never_completed'
          ? ' (files are queuing but the Studio Flow hasn\'t classified any yet — check it\'s wired up per STUDIO_FLOW_SETUP.md)'
          : ''),
    '',
    intakeRows.length + ' new file(s) discovered.',
    autoFiled.length + ' auto-filed/registered (high confidence).',
    flagged.length + ' flagged for your review (low confidence).',
    superseded.length + ' file(s) flagged as possibly superseded.',
    '',
    'This is a status update, not a task list — check the Batch_Queue',
    'tab for anything that actually needs your input (Part 2.6).'
  ];

  MailApp.sendEmail(DIGEST_EMAIL, 'Drive Steward — nightly digest', lines.join('\n'));
  Logger.log('Nightly digest sent.');
}

// ============================================================
// UTILITIES
// ============================================================

function _openDriveStewardSheet_() {
  const ss = TARGET_SPREADSHEET_ID
    ? SpreadsheetApp.openById(TARGET_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) Logger.log('❌ Set TARGET_SPREADSHEET_ID or bind this script to a Sheet.');
  return ss;
}

function _readRowsAsObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function _lower_(v) {
  return String(v || '').toLowerCase();
}

function _isTrue_(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

function _toFloatOrNull_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Monday of the current week, at local midnight. */
function _mostRecentMonday_(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? 6 : day - 1); // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _sendWeeklyDigestEmail_(weekStartIso, summary) {
  const lines = ['Drive Steward — weekly calibration, week of ' + weekStartIso, ''];
  summary.forEach(s => {
    lines.push('Pattern: ' + s.patternId);
    lines.push('  n_applied=' + s.nApplied + '  n_flagged=' + s.nFlagged + '  n_corrected=' + s.nCorrected);
    if (s.interval) {
      lines.push('  observed_divergence=' + (s.observedDivergence * 100).toFixed(1) + '%'
        + '  wilson=[' + (s.interval.lower * 100).toFixed(1) + '%, ' + (s.interval.upper * 100).toFixed(1) + '%]');
    }
    lines.push('  current_tier=' + s.currentTier + '  proposed_action=' + s.proposedAction);
    if (s.proposedAction !== 'none') {
      lines.push('  → This pattern\'s interval sits clearly outside its target band.');
      lines.push('    Update Pattern_Tiers directly if you want to act on this —');
      lines.push('    nothing changes automatically.');
    }
    lines.push('');
  });
  MailApp.sendEmail(DIGEST_EMAIL, 'Drive Steward — weekly calibration, week of ' + weekStartIso, lines.join('\n'));
}
