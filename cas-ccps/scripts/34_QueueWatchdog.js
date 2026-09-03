// =============================================================================
// FILE: 34_QueueWatchdog.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS: runQueueWatchdog — time-driven, every 10 minutes (see setup note
//           at the bottom of this file)
//
// PURPOSE: kos-personal has had real staleness/timeout/unknown-status
// monitoring since an actual production incident (10_Turnstile.gs's own
// comments: "Say/Do Ledger kos-personal finding #2, closed" — a row with
// no Studio flow ever completing it used to cycle forever, Retry_Count
// climbing without bound, completely invisible). This gives cas-ccps a
// tighter, Chat-alerting, auto-escalating layer on top of what already
// exists for its three Studio-flow-driven queues.
//
// A CORRECTION TO THIS FILE'S OWN EARLIER SELF-ASSESSMENT: an initial
// drop of this file claimed "cas-ccps has none of this for any of its
// three queues — confirmed by grep." That grep missed real, already-
// deployed coverage — confirmed directly, not assumed:
//   - RubricQueue: 10_AdminRecoveryPanel.js's autoHealthAlert() already
//     flags a PENDING_EXTRACTION row stuck past 2 hours, admin-email,
//     once daily.
//   - STAGING_PIPELINE: the SAME autoHealthAlert() also flags stuck
//     IN_PROCESS/PENDING_INFERENCE rows daily, AND
//     06_StagingPipeline_Turnstile.js's own runStagingTurnstile()
//     already auto-demotes a row stuck IN_PROCESS past 12 minutes to
//     ERROR_TIMEOUT every single minute — genuine, working, already-
//     deployed staleness *recovery*, not just alerting.
//   - WarmUpQueue is the one queue with genuinely zero existing
//     coverage of any kind.
// This file is still worth landing for all three: it adds a materially
// different layer (10-minute Chat-alerting cadence, auto-escalation to
// a terminal status, unknown-status detection) that the existing
// daily-email/fast-turnstile mechanisms don't provide, and it acts as a
// backstop specifically for the case those existing mechanisms
// themselves stop running (a deleted trigger, a quota exhaustion) — at
// a threshold long enough (see WD_STUCK_THRESHOLD below) that it never
// fires ahead of 06's own 12-minute recovery in the normal case, only
// once something has been stuck for far longer than that fast layer
// should ever allow.
//
// FIXES APPLIED HERE, per the Studio Steps adoption review, before
// this file was considered safe to land — all four were confirmed
// against real reader/writer code, not assumed:
//   1. UNBOUNDED PropertiesService GROWTH (a repeat of a bug class this
//      repo has already been burned by — leader-hub/EmailBridge.gs's
//      CONSUMED_ID_CAP comment, kos-personal/10_Turnstile.gs's own
//      pruning). An earlier drop copied the release-map read/write
//      helpers verbatim but dropped the pruning step entirely — every
//      row that ever passed through a watched status left a permanent
//      entry. Fixed: runQueueWatchdog() now tracks every release-map
//      key actually touched during a run (_wdTouchedKeys_ below) and
//      prunes everything else after all three queues are scanned —
//      any key belonging to a row that has since moved to a different
//      status, been resolved, or been removed from its sheet entirely
//      naturally stops being touched and gets dropped.
//   2. WRONG TERMINAL STATUS orphaned rows downstream. STUDIO_TIMEOUT
//      (kos-personal's own terminal-status name) means nothing to
//      cas-ccps's real readers: 03_QueueBridge.js's own
//      backPropagateCompletions() only recognizes ERROR_TIMEOUT and
//      COMPLETE for STAGING_PIPELINE (`if (stagingStatus !== "COMPLETE")
//      continue;` — a STUDIO_TIMEOUT row matches neither branch and
//      would sit there forever, ReviewQueue never closed, teacher never
//      notified — strictly worse than the STAGING_PIPELINE staleness
//      handling that already exists). Fixed: WD_TIMEOUT_STATUS below
//      maps each queue to the terminal status ITS OWN real readers
//      already understand — STAGING_PIPELINE escalates to ERROR_TIMEOUT
//      (exactly what 06_StagingPipeline_Turnstile.js already writes on
//      its own stale-IN_PROCESS path, and what 03's backprop already
//      drains), WarmUpQueue escalates to INCOMPLETE (already one of the
//      three terminal statuses 25_WarmUpWriter.js's own registry scan
//      recognizes). RubricQueue keeps STUDIO_TIMEOUT — confirmed no
//      downstream reader depends on its specific terminal value beyond
//      "did it leave PENDING_EXTRACTION" (10_AdminRecoveryPanel.js's own
//      check), so nothing there breaks.
//   3. WRONG MUTEX. Used LockService.getScriptLock() — a project-wide
//      lock that blocks every OTHER execution in this entire GAS
//      project while held, unlike every real writer to these same
//      cells (03_QueueBridge.js:54, 06_StagingPipeline_Turnstile.js:21,
//      08_TeacherConfirmationStep.js:203), which all use
//      getDocumentLock() (scoped to this spreadsheet only). Fixed:
//      switched to getDocumentLock(), same convention.
//   4. SHARED RELEASE-MAP KEY ACROSS WarmUpQueue's THREE STATUS PASSES.
//      The key was sheetLabel + ':' + queueId — the SAME key whether a
//      row was at PENDING, PENDING_BRIDGE, or PENDING_EVAL. A row that
//      legitimately transitioned PENDING -> PENDING_EVAL inherited its
//      OLD, possibly-ancient firstSeenMs from the PENDING phase,
//      instantly reading as stale the moment the PENDING_EVAL pass
//      first looked at it — an early, false escalation for a row that
//      had just made real, normal progress. Fixed: the release-map key
//      now includes the row's OWN current status, so each phase gets
//      its own independent clock.
//
// ALSO FIXED (non-blocking but confirmed real):
//   - WD_STAGING_PIPELINE_KNOWN_STATUSES was missing PENDING_INFERENCE
//     — a real, routine, momentary status every staged row passes
//     through (03_QueueBridge.js:128, 06_StagingPipeline_Turnstile.js:88)
//     — which would have alerted as "unrecognized status" on every
//     single row, forever. Added.
//   - WD_WARMUP_QUEUE_KNOWN_STATUSES was missing INCOMPLETE — a real,
//     routine terminal status for a zero-response warm-up
//     (25_WarmUpWriter.js's own stampIncomplete_) — same permanent
//     false-alarm risk. Added.
//   - scanUnknownToo was only ever passed for WarmUpQueue's PENDING
//     pass, contradicting this file's own header claim of "an unknown-
//     status catch-all per queue." Wired true for RubricQueue and
//     STAGING_PIPELINE's single-pass checks too, so the claim is
//     actually true now.
//   - A missing tab used to return a silent all-clear
//     ({watched:0,timedOut:0,unknown:0}) — a monitor that fails silent-
//     healthy on the one condition (a renamed/deleted tab) it should be
//     loudest about. Fixed: logs an error, sends a Chat alert, and
//     reports sheetMissing:true so the Health tab shows it distinctly
//     rather than as a clean zero.
//   - No dry-run mode. Fixed: CAS_WATCHDOG_DRY_RUN script property,
//     defaulting to dry-run TRUE (anything other than the literal
//     string "false" stays in dry-run) — deploying this file for the
//     first time is safe by construction; going live needs a deliberate
//     opt-out. See the dry-run section below for exactly what it does
//     and doesn't skip.
//
// DELIBERATELY MIRRORS kos-personal's PATTERN, NOT REINVENTED:
//   - Staleness tracked via a PropertiesService-backed release map
//     (10_Turnstile.gs's _readReleaseMap_/_writeReleaseMap_), not a new
//     sheet column — avoids touching RubricQueue/STAGING_PIPELINE/
//     WarmUpQueue's existing schemas at all.
//   - A row stuck past its threshold escalates to a terminal status
//     instead of resetting forever — kos-personal's own fix for the
//     exact "cycles invisibly forever" failure mode (see fix #2 above
//     for why the specific status differs per queue here, unlike
//     kos-personal's single STUDIO_TIMEOUT).
//   - An unknown-status catch-all per queue (10_Turnstile.gs's
//     _alertOnUnknownStatuses_), memoized so a standing unknown status
//     doesn't re-alert every run.
//   - A Chat webhook alert (5_Error_And_Utilities.gs's _sendChatAlert),
//     using cas-ccps's OWN script property (CAS_CHAT_WEBHOOK_URL, not
//     kos-personal's KOS_CHAT_WEBHOOK_URL) — a different Google account
//     and Chat space per SMP-004's account bifurcation.
//
// ONE THING THIS FILE CANNOT MIRROR: kos-personal's Retry_Count lives on
// STAGING_PIPELINE itself (a real column, SC.RETRY_COUNT). None of
// cas-ccps's three queues has an equivalent column, and none of RubricQueue
// or (cas-ccps's own) STAGING_PIPELINE has a true unique-row identifier the
// way WarmUpQueue's Queue_ID or kos-personal's Payload_UID does. Handled
// two ways below, both tracked entirely in the PropertiesService release
// map rather than any sheet column:
//   - WarmUpQueue rows are keyed by Queue_ID (a real, generated UID).
//   - RubricQueue and STAGING_PIPELINE rows are keyed by sheet row number.
//     This is a real tradeoff, not a hidden one: a row number is stable
//     for as long as nothing above it is deleted or reordered, which
//     holds for how both sheets are actually used today (rows are marked
//     COMPLETE/terminal in place, never deleted, by anything currently in
//     this codebase) — but it's worth knowing if that ever changes.
// =============================================================================

// -----------------------------------------------------------------------
// Column indices — re-derived directly from each writer's actual row
// construction, not from any pre-existing constant. Worth noting why:
// RubricQueue's own RQ05 constant in 05_TeacherIntakePipeline.js had drifted
// out of sync with the real queueRow array it describes — it ended at
// STATUS: 8 with no TeacherMatrixSsId entry, against a 10-field row with
// TeacherMatrixSsId at 8 and Status at 9. It was confirmed dead code
// (declared once, used nowhere), so nothing was broken by the drift, and this
// note recorded it rather than fixing it. **RQ05 has since been corrected**
// and now matches. The indices below still come from the real appendRow()
// call rather than from RQ05, which is the right habit whatever the constant
// currently says: derive from the writer, verify against the constant.
// -----------------------------------------------------------------------
const WD_RUBRIC_QUEUE_COLUMNS = {
  TIMESTAMP: 0, TEACHER_EMAIL: 1, TEACHER_NAME: 2, SUBJECT: 3,
  COURSE_NAME: 4, TIER: 5, RUBRIC_TEXT: 6, PROMPT_TEMPLATE_ID: 7,
  TEACHER_MATRIX_SS_ID: 8, STATUS: 9,
};
// STAGING_PIPELINE (cas-ccps's own — Flow 2's trigger tab, not
// kos-personal's identically-named sheet on a different account).
// Confirmed from 03_QueueBridge.js's bridgeQueue().
const WD_STAGING_PIPELINE_COLUMNS = {
  TIMESTAMP: 0, QUEUE_ROW_REF: 1, STUDENT_FILE_ID: 2, CONFIG_ID: 3,
  TEACHER_EMAIL: 4, STATUS: 5,
};
// WarmUpQueue — confirmed from 25_WarmUpWriter.js's WQ25_* constants and
// this project's own studio-steps code, both already cross-checked
// against each other earlier in this project's history.
// LESSON_DATE and ARCHIVE_STATUS added for _archiveExpiredWarmUpQueueRows_
// below — WarmUpQueue was the one major operational tab with no retention
// mechanism at all, a third-party review found. ARCHIVE_STATUS (21) is a
// genuinely new column past WQ25_BRIDGE_OUTPUT (20), the last one
// 25_WarmUpWriter.js itself writes — self-healing, see
// _ensureWarmUpQueueArchiveColumn_ below.
const WD_WARMUP_QUEUE_COLUMNS = {
  QUEUE_ID: 0, LESSON_DATE: 5, STATUS: 8, ARCHETYPE: 19, BRIDGE_OUTPUT: 20,
  ARCHIVE_STATUS: 21,
};

// -----------------------------------------------------------------------
// Known statuses per queue. Anything NOT in a queue's known list is
// treated as unknown — see checkUnknownStatuses_ below. Terminal-failure
// statuses use a shared list matched by prefix (mirrors
// TERMINAL_FAILED_STATUSES in kos-personal/5_Error_And_Utilities.gs)
// since more than one queue can produce these.
//
// EXTRACTION_ERROR is listed here even though nothing writes it today —
// see this file's closing section on the Flow 1 gap this watchdog can't
// fix by itself, only make visible once the flow's own wiring is fixed
// to write it.
// -----------------------------------------------------------------------
const WD_TERMINAL_FAILED_STATUSES = ['STUDIO_TIMEOUT', 'ERROR', 'ERROR_TIMEOUT', 'EVAL_ERROR', 'EXTRACTION_ERROR'];

const WD_RUBRIC_QUEUE_KNOWN_STATUSES = ['PENDING_EXTRACTION', 'COMPLETE'];
const WD_STAGING_PIPELINE_KNOWN_STATUSES = ['PENDING_INFERENCE', 'IN_PROCESS', 'COMPLETE'];
const WD_WARMUP_QUEUE_KNOWN_STATUSES = [
  'PENDING', 'PENDING_BRIDGE', 'PENDING_EVAL', 'DELIVERED', 'SCORED', 'INCOMPLETE',
];

// The terminal status each queue escalates a stuck row to — deliberately
// NOT a single shared constant (see fix #2 in this file's own header):
// each value here is one a real, already-existing reader in this queue's
// own downstream code already understands.
const WD_TIMEOUT_STATUS = {
  RUBRIC_QUEUE: 'STUDIO_TIMEOUT',
  STAGING_PIPELINE: 'ERROR_TIMEOUT',
  WARMUP_QUEUE: 'INCOMPLETE',
};

function _wdIsKnownStatus_(status, knownList) {
  const s = String(status);
  if (knownList.indexOf(s) !== -1) return true;
  return WD_TERMINAL_FAILED_STATUSES.some(function (prefix) { return s.indexOf(prefix) === 0; });
}

// -----------------------------------------------------------------------
// Staleness thresholds. cas-ccps's Studio flows are all single-pass
// (one Gemini call, sometimes two for Flow 2's optional Auditor step) —
// tighter than kos-personal's 30-minute default felt reasonable for the
// three WarmUpQueue statuses specifically, since Flows 3/4/5 are each
// simpler than kos-personal's Curator flow. RubricQueue and
// STAGING_PIPELINE kept at 30 to match kos-personal's own default until
// there's a reason to tune them differently.
//
// STAGING_PIPELINE specifically: kept well above
// 06_StagingPipeline_Turnstile.js's own 12-minute stale-IN_PROCESS
// threshold on purpose — this file's role there is a backstop for the
// case that fast layer itself has stopped running, not a competing
// faster response. At 30 stale-minutes x WD_STUCK_THRESHOLD stale
// resets below, this watchdog's own escalation can only ever fire after
// something has been stuck roughly 7.5x longer than 06's own recovery
// window — it should essentially never win that race under normal
// operation.
// -----------------------------------------------------------------------
const WD_STALE_MINS = {
  RUBRIC_QUEUE: 30,
  STAGING_PIPELINE: 30,
  WARMUP_PENDING: 20,
  WARMUP_PENDING_BRIDGE: 20,
  WARMUP_PENDING_EVAL: 20,
};
const WD_STUCK_THRESHOLD = 3; // stale resets before escalating to a terminal status

// =============================================================================
// runQueueWatchdog — main entry point. Fully headless, matching
// kos-personal's runMatrixTurnstile(): no ui.alert, errors don't propagate
// out and abort the whole run, one queue's problem doesn't hide another's.
//
// DRY RUN, ON BY DEFAULT: reads CAS_WATCHDOG_DRY_RUN as a Script
// Property. Anything other than the exact string "false" (unset,
// "true", a typo — all of them) keeps this run in dry-run mode. In dry
// run, every scan, staleness clock, retry count, Chat alert, and Health
// tab write happens exactly as it would live — the ONE thing skipped is
// the actual terminal-status write to the monitored sheet itself (see
// _wdCheckSheet_ below). This means a row that would have escalated
// keeps sitting in its original watched status after a dry run, so if
// it's still genuinely stuck it will be flagged again on a later run —
// unlike a live escalation, which removes the row from the watched list
// entirely. That's the correct, expected difference: dry run observes,
// it doesn't fix anything, so of course an unresolved problem keeps
// showing up. Set CAS_WATCHDOG_DRY_RUN = "false" once you've watched at
// least one full cycle and are comfortable with what it reports.
// =============================================================================
function runQueueWatchdog() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    console.log('[Watchdog] Could not acquire lock — another run is active. Skipping.');
    return;
  }
  try {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.adminSsId);
    const releaseMap = _wdReadReleaseMap_();
    const dryRun = PropertiesService.getScriptProperties().getProperty('CAS_WATCHDOG_DRY_RUN') !== 'false';
    const touchedKeys = new Set(); // every release-map key this run actually looked at — see _wdPruneReleaseMap_

    const results = {
      rubricQueue: _wdCheckRubricQueue_(ss, releaseMap, touchedKeys, dryRun),
      stagingPipeline: _wdCheckStagingPipeline_(ss, releaseMap, touchedKeys, dryRun),
      warmUpQueue: _wdCheckWarmUpQueue_(ss, releaseMap, touchedKeys, dryRun),
    };

    _wdPruneReleaseMap_(releaseMap, touchedKeys);
    _wdWriteReleaseMap_(releaseMap);
    _wdWriteHealthTab_(ss, results, dryRun);

    const totalTimedOut = results.rubricQueue.timedOut + results.stagingPipeline.timedOut +
      results.warmUpQueue.timedOut;
    const totalUnknown = results.rubricQueue.unknown + results.stagingPipeline.unknown +
      results.warmUpQueue.unknown;
    if (totalTimedOut > 0 || totalUnknown > 0) {
      console.log('[Watchdog]' + (dryRun ? ' [DRY RUN]' : '') + ' ' + totalTimedOut +
        ' row(s) timed out, ' + totalUnknown + ' unknown-status row(s) this run.');
    }
  } catch (e) {
    console.error('[Watchdog] Run failed: ' + e.message);
    _wdSendChatAlert_('🔴 cas-ccps Queue Watchdog itself failed to run: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

// -----------------------------------------------------------------------
// Per-queue check functions. Each: scans rows in a watched status,
// checks the release map for how long the row's been in that status,
// escalates past WD_STUCK_THRESHOLD stale checks, and counts unknown
// statuses. Returns { watched, timedOut, unknown, sheetMissing? } for
// the health tab / summary. A missing tab is reported loudly (log +
// Chat alert), not silently folded into a clean all-zero result.
// -----------------------------------------------------------------------

function _wdCheckRubricQueue_(ss, releaseMap, touchedKeys, dryRun) {
  const sheet = ss.getSheetByName('RubricQueue');
  if (!sheet) return _wdReportMissingTab_('RubricQueue');
  const C = WD_RUBRIC_QUEUE_COLUMNS;
  return _wdCheckSheet_(sheet, 'RubricQueue', C.STATUS, ['PENDING_EXTRACTION'],
    WD_RUBRIC_QUEUE_KNOWN_STATUSES, WD_STALE_MINS.RUBRIC_QUEUE, WD_TIMEOUT_STATUS.RUBRIC_QUEUE,
    releaseMap, touchedKeys, function (row, rowNum) { return 'row:' + rowNum; }, true, dryRun);
  // no true UID for RubricQueue — see file header. scanUnknownToo=true.
}

function _wdCheckStagingPipeline_(ss, releaseMap, touchedKeys, dryRun) {
  const sheet = ss.getSheetByName('STAGING_PIPELINE');
  if (!sheet) return _wdReportMissingTab_('STAGING_PIPELINE');
  const C = WD_STAGING_PIPELINE_COLUMNS;
  return _wdCheckSheet_(sheet, 'STAGING_PIPELINE', C.STATUS, ['IN_PROCESS'],
    WD_STAGING_PIPELINE_KNOWN_STATUSES, WD_STALE_MINS.STAGING_PIPELINE, WD_TIMEOUT_STATUS.STAGING_PIPELINE,
    releaseMap, touchedKeys, function (row, rowNum) { return 'row:' + rowNum; }, true, dryRun);
}

// WarmUpQueue watches THREE statuses with different thresholds and (for
// PENDING_BRIDGE specifically) the highest practical value of all of
// this: a row stuck at PENDING_BRIDGE means Flow 5 never picked it up —
// exactly the new failure mode the Flow 5/Flow 3 ordering fix
// (24_WarmUpBridge.js, a later step in this adoption) introduces if
// Flow 5 itself is ever misconfigured or turned off in Studio. Before
// that fix, this risk didn't exist because there was no PENDING_BRIDGE
// status at all — worth being direct that this watchdog is partly
// covering a risk that later fix creates, not just pre-existing ones.
// PENDING_BRIDGE is watched here even though nothing writes it yet
// (that fix lands after this one, per this adoption's own landing
// order) — deliberately, so monitoring is already live the moment it
// starts being written, rather than needing a third change to this
// file later.
function _wdCheckWarmUpQueue_(ss, releaseMap, touchedKeys, dryRun) {
  const sheet = ss.getSheetByName('WarmUpQueue');
  if (!sheet) return _wdReportMissingTab_('WarmUpQueue');
  const C = WD_WARMUP_QUEUE_COLUMNS;
  const timeoutStatus = WD_TIMEOUT_STATUS.WARMUP_QUEUE;

  const pending = _wdCheckSheet_(sheet, 'WarmUpQueue', C.STATUS, ['PENDING'],
    WD_WARMUP_QUEUE_KNOWN_STATUSES, WD_STALE_MINS.WARMUP_PENDING, timeoutStatus,
    releaseMap, touchedKeys, function (row) { return String(row[C.QUEUE_ID]).trim(); }, true, dryRun);
  const pendingBridge = _wdCheckSheet_(sheet, 'WarmUpQueue', C.STATUS, ['PENDING_BRIDGE'],
    WD_WARMUP_QUEUE_KNOWN_STATUSES, WD_STALE_MINS.WARMUP_PENDING_BRIDGE, timeoutStatus,
    releaseMap, touchedKeys, function (row) { return String(row[C.QUEUE_ID]).trim(); }, false, dryRun);
  const pendingEval = _wdCheckSheet_(sheet, 'WarmUpQueue', C.STATUS, ['PENDING_EVAL'],
    WD_WARMUP_QUEUE_KNOWN_STATUSES, WD_STALE_MINS.WARMUP_PENDING_EVAL, timeoutStatus,
    releaseMap, touchedKeys, function (row) { return String(row[C.QUEUE_ID]).trim(); }, false, dryRun);
  // Unknown-status scan only needs to run once per sheet, not once per
  // watched status — folded into the PENDING pass above via its own
  // scanUnknownToo=true (that pass already loops over every row in the
  // sheet, not just PENDING ones, so it alone sees the whole tab). The
  // other two passes leave scanUnknownToo false so an unknown status
  // isn't triple-counted across all three passes for the same row —
  // this is the fix for the review's finding that the ORIGINAL zip's
  // now-removed third branch (a scanUnknownToo=false pass silently
  // tallying an unknown count that its own return statement then
  // discarded) was genuinely dead code, not a real safety net.
  return {
    watched: pending.watched + pendingBridge.watched + pendingEval.watched,
    timedOut: pending.timedOut + pendingBridge.timedOut + pendingEval.timedOut,
    unknown: pending.unknown,
  };
}

function _wdReportMissingTab_(sheetLabel) {
  const msg = sheetLabel + ' tab not found — the watchdog cannot monitor this queue at all.';
  console.error('[Watchdog] ' + msg);
  _wdSendChatAlert_('🔴 ' + msg);
  return { watched: 0, timedOut: 0, unknown: 0, sheetMissing: true };
}

// Shared scan logic for one sheet + one watched status. scanUnknownToo
// runs the unknown-status catch-all as part of this same pass.
//
// dryRun: when true, every read, clock, and alert below happens exactly
// as it would live — the ONE line skipped is the actual
// sheet.getRange(...).setValue(timeoutStatus) write. See
// runQueueWatchdog's own header for the full reasoning.
function _wdCheckSheet_(sheet, sheetLabel, statusCol, watchedStatuses, knownStatuses,
                          staleMins, timeoutStatus, releaseMap, touchedKeys, keyFn,
                          scanUnknownToo, dryRun) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { watched: 0, timedOut: 0, unknown: 0 };

  const data = sheet.getDataRange().getValues();
  const nowMs = new Date().getTime();
  const staleMs = staleMins * 60 * 1000;
  let watched = 0, timedOut = 0, unknown = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;
    const status = String(row[statusCol]).trim();

    if (watchedStatuses.indexOf(status) !== -1) {
      watched++;
      // The key includes the row's OWN current status (fix #4 in this
      // file's header) — a row that legitimately transitions to a
      // different watched status (e.g. WarmUpQueue's PENDING ->
      // PENDING_EVAL) starts a fresh clock under a new key, rather than
      // inheriting a stale timestamp from its previous phase.
      const key = sheetLabel + ':' + status + ':' + keyFn(row, rowNum);
      touchedKeys.add(key);
      const firstSeenMs = releaseMap[key];

      if (!firstSeenMs) {
        releaseMap[key] = nowMs; // first time seen in this status
      } else if (nowMs - firstSeenMs > staleMs) {
        const retryKey = key + ':retries';
        touchedKeys.add(retryKey);
        const retries = (releaseMap[retryKey] || 0) + 1;
        releaseMap[retryKey] = retries;
        releaseMap[key] = nowMs; // reset the clock either way

        if (retries >= WD_STUCK_THRESHOLD) {
          if (!dryRun) {
            sheet.getRange(rowNum, statusCol + 1).setValue(timeoutStatus);
          }
          timedOut++;
          delete releaseMap[key];
          delete releaseMap[retryKey];
          console.error('[Watchdog]' + (dryRun ? ' [DRY RUN]' : '') + ' ' + sheetLabel + ' row ' + rowNum +
            (dryRun ? ' would escalate to ' : ' -> ') + timeoutStatus +
            ' after ' + retries + ' stale checks (status was ' + status + ').');
          _wdSendChatAlert_(
            '🔴 ' + (dryRun ? '[DRY RUN] would escalate to ' + timeoutStatus : timeoutStatus + ' — escalated') +
            ' — ' + sheetLabel + ' row ' + rowNum + '\n' +
            'Stuck at "' + status + '" for over ' + (staleMins * retries) + ' minutes.\n' +
            'A Studio flow likely never picked this row up — check the flow is turned on ' +
            'and its trigger condition matches this status.'
          );
        }
      }
      // else: still within the staleness window, nothing to do yet.
    } else if (scanUnknownToo && !_wdIsKnownStatus_(status, knownStatuses)) {
      unknown++;
      const alertKey = sheetLabel + ':unknown:' + rowNum + ':' + status;
      touchedKeys.add(alertKey);
      if (!releaseMap[alertKey]) {
        releaseMap[alertKey] = nowMs;
        console.error('[Watchdog] ' + sheetLabel + ' row ' + rowNum +
          ' has unrecognized status "' + status + '".');
        _wdSendChatAlert_(
          '⚠️ Unrecognized status — ' + sheetLabel + ' row ' + rowNum + '\n' +
          '"' + status + '" doesn’t match any known or terminal-failure status. ' +
          'Alerting once; this row won’t re-alert unless the status text changes.'
        );
      }
    }
  }

  return { watched: watched, timedOut: timedOut, unknown: scanUnknownToo ? unknown : 0 };
}

// -----------------------------------------------------------------------
// Release map — PropertiesService-backed { "sheet:status:key": timestampMs },
// same storage pattern as kos-personal's KOS_TURNSTILE_RELEASED
// (10_Turnstile.gs), separate property key so the two never collide.
// -----------------------------------------------------------------------
function _wdReadReleaseMap_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('CAS_WATCHDOG_RELEASED');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[Watchdog] Release map corrupt — resetting. ' + e.message);
    return {};
  }
}

function _wdWriteReleaseMap_(map) {
  PropertiesService.getScriptProperties()
    .setProperty('CAS_WATCHDOG_RELEASED', JSON.stringify(map));
}

// Drops every release-map key NOT touched during this run — see
// runQueueWatchdog's own header, fix #1. Every row still in a watched
// status gets its key touched every single run (the scan is a full pass
// over every row, not incremental), so anything left over belongs to a
// row that has since moved to an untracked status (resolved normally,
// escalated, or archived/deleted) and is safe to drop. This is what
// keeps CAS_WATCHDOG_RELEASED from growing without bound over the
// system's lifetime — the same failure class documented in
// leader-hub/EmailBridge.gs's CONSUMED_ID_CAP comment and already fixed
// once in kos-personal/10_Turnstile.gs, which this port had otherwise
// silently reintroduced.
function _wdPruneReleaseMap_(releaseMap, touchedKeys) {
  Object.keys(releaseMap).forEach(function (key) {
    if (!touchedKeys.has(key)) delete releaseMap[key];
  });
}

// -----------------------------------------------------------------------
// Health tab — a Sheets-native dashboard, matching how cas-ccps actually
// surfaces things (custom menus + sheet tabs) rather than kos-personal's
// web-app-centric getQueueMetrics(), which cas-ccps has no equivalent
// surface for. Overwrites a single "Health" tab in place each run rather
// than appending a growing log — this is a current-state snapshot, not
// a history (ERROR_LOG-style history logging would be a reasonable next
// addition, not built here).
// -----------------------------------------------------------------------
function _wdWriteHealthTab_(ss, results, dryRun) {
  let sheet = ss.getSheetByName('Health');
  if (!sheet) sheet = ss.insertSheet('Health');
  sheet.clear();

  const watchedCell = function (r) { return r.sheetMissing ? 'TAB MISSING' : r.watched; };
  const timedOutCell = function (r) { return r.sheetMissing ? '—' : r.timedOut; };
  const unknownCell = function (r) { return r.sheetMissing ? '—' : r.unknown; };

  const rows = [
    ['cas-ccps Queue Health' + (dryRun ? ' (DRY RUN)' : ''), '', ''],
    ['Last checked', new Date(), ''],
    ['', '', ''],
    ['Queue', 'Watched (in-flight)', 'Timed out this run'],
    ['RubricQueue (Flow 1)', watchedCell(results.rubricQueue), timedOutCell(results.rubricQueue)],
    ['STAGING_PIPELINE (Flow 2)', watchedCell(results.stagingPipeline), timedOutCell(results.stagingPipeline)],
    ['WarmUpQueue (Flows 3/4/5)', watchedCell(results.warmUpQueue), timedOutCell(results.warmUpQueue)],
    ['', '', ''],
    ['Unknown-status rows found', '', ''],
    ['RubricQueue', unknownCell(results.rubricQueue), ''],
    ['STAGING_PIPELINE', unknownCell(results.stagingPipeline), ''],
    ['WarmUpQueue', unknownCell(results.warmUpQueue), ''],
  ];
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.getRange(4, 1, 1, 3).setFontWeight('bold');
  sheet.autoResizeColumns(1, 3);
}

// Callable from a custom menu item ("Health > Run Watchdog Now") for a
// manual, on-demand check, same "safe to run manually" convention
// kos-personal's runMatrixTurnstile() documents for itself.
function runQueueWatchdogNow() {
  const dryRun = PropertiesService.getScriptProperties().getProperty('CAS_WATCHDOG_DRY_RUN') !== 'false';
  runQueueWatchdog();
  SpreadsheetApp.getUi().alert(
    'Watchdog run complete' + (dryRun ? ' (DRY RUN — nothing was actually changed)' : '') +
    ' — see the Health tab.'
  );
}

// =============================================================================
// WARMUP QUEUE RETENTION — a third-party review found WarmUpQueue was the
// one major operational tab (alongside Ledger, SCRDecisionLog,
// CompetencyEvidence, ParentReportLog) with zero retention/archival
// mechanism at all. Same pattern as the other four: a configurable
// *_RETENTION_YEARS Script Property (default 5, same "unconfirmed against
// a primary source" caveat FERPA_DATA_MAP.md already carries for the
// others), a self-healing archive_status column, never deletes — just
// flips a status marker — and a read-only counter for
// _ferpaHealthChecks_() in 10_AdminRecoveryPanel.js. Lives here rather than
// in 25_WarmUpWriter.js because this file is already this tab's dedicated
// health/monitoring owner (see this file's own header) and already keeps
// its own WD_WARMUP_QUEUE_COLUMNS map — WarmUpQueue is operational
// instructional data like CompetencyEvidence/Ledger, not a legal
// disposition/disclosure record like SCRDecisionLog/ParentReportLog, so it
// gets the same plain, reversible "ARCHIVED" marker and a reactivate path,
// not a "pending disposition review" legal-hold marker.
// =============================================================================

function _warmUpQueueRetentionYears_() {
  const raw = PropertiesService.getScriptProperties().getProperty('WARMUP_QUEUE_RETENTION_YEARS');
  const n = Number(raw);
  return (n && n > 0) ? n : 5;
}

// Idempotent header add for the archive_status column — same self-healing
// pattern as _ensureCompetencyEvidenceArchiveColumn_/_ensureParentReportArchiveColumn_.
function _ensureWarmUpQueueArchiveColumn_(sheet) {
  const cell = sheet.getRange(1, WD_WARMUP_QUEUE_COLUMNS.ARCHIVE_STATUS + 1);
  if (String(cell.getValue()).trim() !== 'archive_status') {
    cell.setValue('archive_status');
  }
}

// Anchors "how old is this row" on lesson_date, the same "age of the record
// itself" anchor Ledger (TIMESTAMP), SCRDecisionLog (DECIDED_AT),
// CompetencyEvidence (evaluated_at), and ParentReportLog (GENERATED_AT) all
// use. Never deletes. Safe with WarmUpQueue missing (returns zeros).
function _archiveExpiredWarmUpQueueRows_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.warmUpQueue || 'WarmUpQueue');
  if (!sheet || sheet.getLastRow() < 2) return { archived: 0, checked: 0 };
  _ensureWarmUpQueueArchiveColumn_(sheet);

  const C = WD_WARMUP_QUEUE_COLUMNS;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _warmUpQueueRetentionYears_());

  const data = sheet.getRange(1, 1, sheet.getLastRow(), C.ARCHIVE_STATUS + 1).getValues();
  let archived = 0;
  let checked = 0;
  for (let i = 1; i < data.length; i++) {
    checked++;
    if (String(data[i][C.ARCHIVE_STATUS] || '').trim() !== '') continue; // already archived

    const lessonDate = _normalizeLessonDateCell_(data[i][C.LESSON_DATE]);
    if (!lessonDate) continue;
    const lessonDateObj = new Date(lessonDate);
    if (isNaN(lessonDateObj.getTime()) || lessonDateObj >= cutoff) continue;

    sheet.getRange(i + 1, C.ARCHIVE_STATUS + 1).setValue('ARCHIVED');
    archived++;
  }
  if (archived > 0) {
    Logger.log('[Watchdog] Archived ' + archived + ' WarmUpQueue row(s) past the ' +
      _warmUpQueueRetentionYears_() + '-year retention window.');
  }
  return { archived: archived, checked: checked };
}

// Read-only companion for _ferpaHealthChecks_(). Callers run
// _archiveExpiredWarmUpQueueRows_() immediately before this, so a nonzero
// result means archival itself failed — a real signal, not a tautology.
// Same shape as the Ledger/SCRDecisionLog/CompetencyEvidence/ParentReportLog
// counters.
function _countWarmUpQueueRowsPastRetentionUnarchived_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.warmUpQueue || 'WarmUpQueue');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const C = WD_WARMUP_QUEUE_COLUMNS;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _warmUpQueueRetentionYears_());

  const data = sheet.getRange(1, 1, sheet.getLastRow(), C.ARCHIVE_STATUS + 1).getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][C.ARCHIVE_STATUS] || '').trim() !== '') continue;
    const lessonDate = _normalizeLessonDateCell_(data[i][C.LESSON_DATE]);
    if (!lessonDate) continue;
    const lessonDateObj = new Date(lessonDate);
    if (!isNaN(lessonDateObj.getTime()) && lessonDateObj < cutoff) count++;
  }
  return count;
}

// Admin menu action — matches reactivateCompetencyEvidence()'s UI shape
// (30_SCRSuggestionEngine.js): WarmUpQueue is operational data, not a legal
// hold, so — like CompetencyEvidence and unlike SCRDecisionLog/
// ParentReportLog — it gets a real way back for a reopened case.
function reactivateWarmUpQueueArchival() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getConfig_();

  const emailRes = ui.prompt(
    'Reactivate WarmUpQueue Rows',
    "Enter the student's email address to reactivate archived warm-up rows for.\n\n" +
    'This clears the archived status on every matching WarmUpQueue row.',
    ui.ButtonSet.OK_CANCEL
  );
  if (emailRes.getSelectedButton() !== ui.Button.OK) return;

  const email = emailRes.getResponseText().trim().toLowerCase();
  if (!email) { ui.alert('Email cannot be blank.'); return; }

  const confirm = ui.alert(
    'Reactivate warm-up rows for "' + email + '"?',
    "This will clear the archived status on all of this student's WarmUpQueue rows.\n\n" +
    'Are you sure?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.warmUpQueue || 'WarmUpQueue');
  if (!sheet) { ui.alert('⚠️ WarmUpQueue tab not found.'); return; }

  const C = WD_WARMUP_QUEUE_COLUMNS;
  const data = sheet.getDataRange().getValues();
  let cleared = 0;
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][2] || '').trim().toLowerCase(); // WQ25_STUDENT_EMAIL
    if (rowEmail !== email) continue;
    if (String(data[i][C.ARCHIVE_STATUS] || '').trim() === '') continue;
    sheet.getRange(i + 1, C.ARCHIVE_STATUS + 1).setValue('');
    cleared++;
  }
  ui.alert('Reactivated ' + cleared + ' WarmUpQueue row(s) for ' + email + '.');
}

// -----------------------------------------------------------------------
// Chat alert — same shape as kos-personal's _sendChatAlert
// (5_Error_And_Utilities.gs): gracefully degrades to console.log if
// CAS_CHAT_WEBHOOK_URL isn't configured, never throws. A SEPARATE
// property from kos-personal's KOS_CHAT_WEBHOOK_URL — different Google
// account, different Chat space, per SMP-004.
// -----------------------------------------------------------------------
function _wdSendChatAlert_(message) {
  try {
    const url = PropertiesService.getScriptProperties().getProperty('CAS_CHAT_WEBHOOK_URL');
    if (!url) {
      console.log('[Watchdog:ChatAlert] No CAS_CHAT_WEBHOOK_URL configured — logging only: ' + message);
      return false;
    }
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: message }),
      muteHttpExceptions: true,
    });
    return true;
  } catch (e) {
    console.error('[Watchdog:ChatAlert] Failed to send: ' + e.message);
    return false;
  }
}

// =============================================================================
// SETUP NOTES
//
// 1. Time-driven trigger (once, from the Apps Script editor or
//    programmatically alongside this project's other trigger setup):
//    runQueueWatchdog, every 10 minutes.
// 2. Deploys in DRY RUN by default — see runQueueWatchdog's own header.
//    Watch at least one full cycle's Health tab / Chat alerts, then set
//    CAS_WATCHDOG_DRY_RUN = "false" as a Script Property to go live.
// 3. Optional: PropertiesService script property CAS_CHAT_WEBHOOK_URL,
//    a Google Chat incoming-webhook URL for this account's own Chat
//    space. Without it, alerts still happen — they just go to the
//    Apps Script execution log (console.error) instead of Chat.
// 4. A REAL GAP THIS FILE MAKES VISIBLE BUT CAN'T FIX ITSELF: Flow 1, as
//    configured per DEPLOYMENT_AND_FLOW_GUIDE.md, marks RubricQueue rows
//    COMPLETE unconditionally in its Step 4 — even when
//    CommitRubricDraftStep's own output was VALIDATION_FAILED and no
//    TeacherMatrix draft row was ever written. A teacher would see
//    "Complete" and never know the extraction actually failed silently.
//    That's a Studio flow-wiring fix, not something this script can
//    correct after the fact: add a native "Check if status =
//    VALIDATION_FAILED" branch before Step 4, and on that branch, write
//    "EXTRACTION_ERROR" to RubricQueue's Status column instead of
//    COMPLETE. EXTRACTION_ERROR is already in this file's
//    WD_TERMINAL_FAILED_STATUSES list, ready to be watched, the moment
//    the flow itself is fixed to write it.
// =============================================================================
