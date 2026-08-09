/**
 * LeaderHub EmailBridge — Apps Script (Google Apps Script)
 * Deploy as: Web App → Execute as Me → Anyone in domain (or Anyone with link)
 *
 * POST endpoints (JSON body with "action" field):
 *   action: "subPlan"      → Create Google Doc sub plan  → {ok, docUrl}
 *   action: "bragEmail"    → Create Gmail draft           → {ok}
 *   action: "markConsumed" → Mark horizon items consumed  → {ok, consumed}
 *
 * GET endpoint (unchanged):
 *   Returns pending horizon items from Gmail label "LeaderHub"
 *
 * Setup:
 *   1. script.google.com → New Project → paste this file
 *   2. Deploy → New Deployment → Web App
 *      Execute as: Me | Access: Anyone in CCPS domain
 *   3. Copy /exec URL → LeaderHub Settings → Email Bridge URL
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
