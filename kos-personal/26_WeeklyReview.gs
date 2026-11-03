// ================================================================
// 26_WeeklyReview.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// Mails the operator the week's build review on Monday morning.
//
// The review itself is written on Sunday evening by a scheduled Claude
// Code run (CLAUDE.md, "The weekly review"): a Google Doc named
// KOS_WEEKLY_REVIEW, rewritten in place each week from the repo plan's
// "From the RTP session logs" section, the merged PRs and the week's
// session logs. It is the one place the session-log loop is never silent:
// an item accepted without discussion during the week still appears here.
//
// This file only delivers it. It reads the newest doc of that name and
// mails its text. A review older than WR_STALE_HOURS is not sent as if it
// were this week's: the mail says the Sunday run didn't produce one, so a
// missed week is visible rather than quiet. No model call; nothing in the
// doc is generated here.
//
// ENTRY POINTS (no trailing underscore — GAS hides those from the Run
// dropdown):
//   sendWeeklyReview()   — the Monday trigger; safe to run by hand
// ================================================================

const WR_DOC_NAME = 'KOS_WEEKLY_REVIEW';
const WR_STALE_HOURS = 36; // Sunday evening to Monday morning is about 11
const WR_SCAN_MAX = 20;

/** The newest Google Doc named KOS_WEEKLY_REVIEW, or null. */
function _wrNewestReview_() {
  const it = DriveApp.getFilesByName(WR_DOC_NAME);
  let newest = null;
  let seen = 0;
  while (it.hasNext() && seen < WR_SCAN_MAX) {
    seen++;
    const f = it.next();
    if (f.isTrashed && f.isTrashed()) continue;
    const at = f.getLastUpdated ? new Date(f.getLastUpdated()).getTime() : 0;
    if (!newest || at > newest.at) newest = { file: f, at: at };
  }
  return newest;
}

function _wrAdminEmail_() {
  let email = PropertiesService.getScriptProperties().getProperty('KOS_ADMIN_EMAIL') || '';
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail(); } catch (e) { email = ''; }
  }
  return email;
}

/**
 * Mails this week's review, or says plainly that there isn't one.
 * @returns {{sent:boolean, fresh:boolean, reason?:string}}
 */
function sendWeeklyReview() {
  const to = _wrAdminEmail_();
  if (!to) {
    console.error('[WeeklyReview] No admin email. Set KOS_ADMIN_EMAIL in Script Properties.');
    return { sent: false, fresh: false, reason: 'No admin email configured.' };
  }
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const review = _wrNewestReview_();
  const fresh = !!review && review.at && now.getTime() - review.at <= WR_STALE_HOURS * 3600000;

  if (!fresh) {
    const last = review && review.at ? Utilities.formatDate(new Date(review.at), tz, 'yyyy-MM-dd HH:mm') : 'never';
    MailApp.sendEmail(to, 'KOS weekly review — not produced this week (' + today + ')', [
      'The Sunday review did not arrive. The last ' + WR_DOC_NAME + ' was written: ' + last + '.',
      '',
      'Check the scheduled task "KOS weekly review" (claude.ai, scheduled tasks): did it run on Sunday,',
      'and did it fail? Until it runs, the week\'s build decisions are in the repo plan,',
      'meta/PLAN_<month>.md, section "From the RTP session logs".',
    ].join('\n'));
    console.log('[WeeklyReview] stale or missing (last: ' + last + '); said so.');
    return { sent: true, fresh: false, reason: 'stale or missing' };
  }

  let text = '';
  try {
    text = DocumentApp.openById(review.file.getId()).getBody().getText();
  } catch (e) {
    _reportError('sendWeeklyReview', e, null);
    return { sent: false, fresh: true, reason: 'The review doc could not be read: ' + e.message };
  }
  MailApp.sendEmail(to, 'KOS weekly review — ' + today, text + '\n\n(The doc: ' + review.file.getUrl() + ')');
  console.log('[WeeklyReview] sent (' + text.length + ' characters).');
  return { sent: true, fresh: true };
}

// ================================================================
// END 26_WeeklyReview.gs
// ================================================================
