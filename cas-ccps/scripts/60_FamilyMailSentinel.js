// =============================================================================
// FILE: 60_FamilyMailSentinel.js
// BOUND TO: Family Mail Sentinel spreadsheet (cas-ccps:family-sentinel), a
//           private sheet owned by the teacher. Not the Central Ledger: this
//           project reads the teacher's mail, and no other cas-ccps project
//           should hold a Gmail scope.
// TRIGGERS: runFamilySentinel() every 15 minutes
//           (installFamilySentinelTrigger()).
//
// PURPOSE: student and parent mail is the most urgent mail the teacher gets,
// and the one kind Claude must not read. This file lets the KOS Claude
// Project's `start` brief say how urgent it is, without names or wording:
//
//   1. scanFamilyMail() finds family mail in the inbox and labels its
//      thread KOS/Family. The KOS Project's mail search excludes that label,
//      so Claude never opens these threads.
//   2. It queues each message for the Gemini flow (Google-side, like every
//      other cas-ccps flow) with names, addresses and numbers redacted.
//   3. harvestFamilyMailReturns() reads Gemini's category, urgency, safety
//      flag and a one-line ask, and checks the ask names nobody.
//   4. writeFamilySignal() rewrites the KOS_FAMILY_SIGNAL Google Doc:
//      one line per thread waiting on the teacher, with course, period,
//      category, ask, hours waiting and repeat contact, and no names.
//      The KOS Project reads that doc. It never reads the mail.
//
// TWO TIERS (2026-10-20). WAITING ON YOU lists threads that need a reply;
// FOR YOUR EYES lists the rest (thanks, an FYI), with no "urgent". Gemini
// says needs_reply; _fmsNeedsReply_() forces it true for safety, a
// sensitive category, urgency 4 or more, a due date, a family's 2nd+
// contact this week, or no classification (Flow down or a bad answer), and
// a missing answer counts as true. A needs-reply message in an "eyes"
// thread moves the thread to WAITING. A thread with no message left in
// INBOX (archived) counts as handled and is in neither list.
//
// WHAT COUNTS AS FAMILY MAIL (_fmsDetectFamily_):
//   student   — from @student.ccpsnet.net.
//   parent    — from an address in the FamilyContacts tab (the teacher fills
//               it in) or the Central Ledger's ParentReportLog.
//   staff     — from a ccpsnet.net colleague, naming a rostered student.
//   canvas    — a Canvas notification naming a rostered student.
//   external  — any other sender, not a mailing list, naming a rostered
//               student's full name, or first name with a parent word
//               ("my son"). Gemini confirms; a NOT_FAMILY verdict removes
//               the label.
//   The roster is the Central Ledger's Ledger tab (names, course, period),
//   read by ID through getConfig_().ledgerSsId. A surname may be hyphenated
//   or several words ("De La Cruz"); _fmsNameParts_() keeps every form.
//   Never family mail: Google's system senders (FMS_SYSTEM_SENDERS: Drive
//   shares, Docs comments, Classroom), even when they name a student.
//   reclassifySystemSenderThreads() clears ones logged before 2026-10-20.
//
// SAFETY. A message with any sign that a student may be unsafe is never
// summarized: KOS/Family/Now goes on the thread, and the signal doc lists it
// first as "needs you now". Two independent checks set it: Gemini's safety
// flag, and a keyword tripwire here (FMS_SAFETY_TERMS) that runs before
// Gemini sees anything, so a Flow that is down cannot hide one.
// sendFamilySafetyAlerts() then pushes a notification to the teacher's phone
// through ntfy (the free ntfy app, subscribed to a private topic the
// sentinel makes, Script Property FAMILY_ALERT_NTFY_TOPIC, never in the
// repo): one push per run however many threads, each thread once, at any
// hour. The push is FMS_ALERT_TITLE and FMS_ALERT_TEXT with a count. No
// name, course or word of the message goes to ntfy. (Email-to-text was the
// first choice; AT&T, the teacher's carrier, no longer has a gateway.)
//
// SENSITIVE categories (FMS_SENSITIVE_CATEGORIES) show no course, period or
// ask: in a 21-student class, "IEP question, period 2" can identify a child.
//
// WHAT LEAVES THIS ACCOUNT: nothing. Gemini runs in the Workspace Flow. The
// signal doc holds no names or message text. Mail text sits in the
// FamilyMailInput tab only until the Flow answers, then is deleted; a row
// unanswered after FMS_INPUT_MAX_AGE_HOURS is deleted anyway.
//
// THE FLOW (meta/FLOW_DOCTRINE.md "The shape"; build it from the
// FamilyMailBuildSpec tab, syncFamilyMailFlowBuildSpec()):
//   Starter: a row in FamilyMailInput with Status = READY.
//   Ask Gemini: instructions = @trigger.PromptText (prompt and redacted
//               message, already joined here).
//   Add row to FamilyMailReturn: Returned_At = now, Item_ID =
//               @trigger.Item_ID, Primary_JSON = Gemini's answer.
//
// CHECKS (rule 9): runFamilySentinelPreflight(), runFamilyMailCanary(),
// checkFamilyMailFlowBinding(), checkFamilyMailFlowLiveness();
// installFamilyMailFixture() gives the Flow a synthetic row to match;
// runFamilySafetyAlertFixture() runs the phone alert path end to end.
//
// GMAIL: the advanced Gmail service (Gmail API v1), scope gmail.modify, for
// reading messages and adding labels. Through Gmail it never sends, drafts,
// archives, trashes or deletes. The one send is the safety push, through
// ntfy, to the teacher's own phone (sendFamilySafetyAlerts()).
// =============================================================================

const FMS_INPUT_TAB = "FamilyMailInput";
const FMS_INPUT_HEADERS = ["Item_ID", "Status", "Queued_At", "PromptText"];
const FMS_IN = { ITEM_ID: 0, STATUS: 1, QUEUED_AT: 2, PROMPT_TEXT: 3 };

const FMS_RETURN_TAB = "FamilyMailReturn";
const FMS_RETURN_HEADERS = ["Returned_At", "Item_ID", "Primary_JSON"];
const FMS_RET = { RETURNED_AT: 0, ITEM_ID: 1, PRIMARY_JSON: 2 };

const FMS_LOG_TAB = "FamilyMailLog";
const FMS_LOG_HEADERS = [
  "Message_ID", "Thread_ID", "Received_At", "Source", "Family_Key", "Course",
  "Period", "Status", "Category", "Urgency", "Safety", "Sensitive", "Ask",
  "Due", "Classified_At", "Note", "Alerted_At", "Needs_Reply",
];
const FMS_LOG = {
  MESSAGE_ID: 0, THREAD_ID: 1, RECEIVED_AT: 2, SOURCE: 3, FAMILY_KEY: 4,
  COURSE: 5, PERIOD: 6, STATUS: 7, CATEGORY: 8, URGENCY: 9, SAFETY: 10,
  SENSITIVE: 11, ASK: 12, DUE: 13, CLASSIFIED_AT: 14, NOTE: 15, ALERTED_AT: 16,
  NEEDS_REPLY: 17,
};

const FMS_CONTACTS_TAB = "FamilyContacts";
const FMS_CONTACTS_HEADERS = ["Parent_Email", "Student_Email", "Note"];

const FMS_SPEC_TAB = "FamilyMailBuildSpec";

const FMS_STATUS = {
  READY: "READY",
  QUEUED: "QUEUED",
  CLASSIFIED: "CLASSIFIED",
  NOT_FAMILY: "NOT_FAMILY",
  FAILED: "FAILED",
  UNCLASSIFIED: "UNCLASSIFIED",
  FIXTURE: "FIXTURE",
  SAFETY_FIXTURE: "SAFETY_FIXTURE",
};

const FMS_LABEL = "KOS/Family";
const FMS_LABEL_NOW = "KOS/Family/Now";

const FMS_ITEM_PREFIX = "FMS-";
const FMS_FIXTURE_PREFIX = "FMS-FIXTURE-";
const FMS_CANARY_PREFIX = "FMS-CANARY-";

const FMS_STUDENT_DOMAIN = "@student.ccpsnet.net";
const FMS_DISTRICT_DOMAIN = "@ccpsnet.net";
const FMS_CANVAS_DOMAIN = "instructure.com";

// Google's notification senders: a Drive share, a Docs comment, Classroom.
// They often name a student (the doc's title, the commenter) but are not
// mail from a family, and listing them buried the real messages.
const FMS_SYSTEM_SENDERS = [
  "drive-shares-noreply@google.com", "drive-shares-dm-noreply@google.com",
  "comments-noreply@docs.google.com",
  "no-reply@classroom.google.com", "classroom-noreply@google.com",
];

const FMS_SCAN_QUERY = "-in:sent -in:chats -in:spam -in:trash";
const FMS_SCAN_WINDOW_HOURS = 48;   // the first scan, and the furthest back any scan looks
const FMS_SCAN_OVERLAP_HOURS = 1;   // each scan re-reads the last hour, for mail that arrives late
const FMS_SCAN_MAX = 100;
const FMS_BODY_MAX_CHARS = 3000;
const FMS_ASK_MAX_CHARS = 140;
const FMS_INPUT_MAX_AGE_HOURS = 48;
const FMS_SIGNAL_DAYS = 7;
const FMS_LOG_KEEP_DAYS = 30;
const FMS_TRIGGER_HANDLER = "runFamilySentinel";
const FMS_TRIGGER_MINUTES = 15;
const FMS_SIGNAL_TITLE = "KOS_FAMILY_SIGNAL";

// The whole push ntfy ever sees: no student, sender, course or message
// detail; "{n}" is the only variable. Anyone who learned the topic name could
// read it, which is why it carries nothing else.
const FMS_ALERT_TITLE = "KOS";
const FMS_ALERT_TEXT = "{n} now. Open Gmail, label KOS/Family/Now.";
const FMS_ALERT_LOOKBACK_HOURS = 24;  // older safety messages are not pushed
const FMS_ALERT_DAILY_CAP = 10;       // pushes per day, in case something loops
const FMS_NTFY_SERVER = "https://ntfy.sh";

const FMS_CATEGORIES = {
  absence_makeup: "absence or makeup",
  grade_question: "grade question",
  assignment_help: "assignment help",
  accommodation: "accommodation",
  health: "health",
  discipline: "discipline",
  family_situation: "family situation",
  safety_wellbeing: "safety",
  scheduling: "meeting request",
  technology_access: "tech access",
  praise_thanks: "thanks",
  other: "other",
};
const FMS_SENSITIVE_CATEGORIES = [
  "accommodation", "health", "discipline", "family_situation", "safety_wellbeing",
];

// Checked on the raw text, before redaction and before Gemini. Deliberately
// broad: a false alarm costs the teacher one look at a message; a miss costs
// far more.
const FMS_SAFETY_TERMS = [
  "suicide", "suicidal", "kill myself", "killing myself", "end my life",
  "want to die", "self harm", "self-harm", "cutting myself", "hurt myself",
  "hurting myself", "abuse", "abused", "hits me", "hitting me", "unsafe at home",
  "not safe", "threatened", "threatening me", "threatening to", "weapon",
  "a gun", "bring a knife", "bullied", "bullying", "harass", "harassed",
  "overdose", "runaway", "ran away",
];
// Not "threat" on its own: "threat of new entrants" is coursework here.

// Words a parent uses about their own child: with a rostered first name,
// they make an outside sender a candidate.
const FMS_PARENT_WORDS = [
  "my son", "my daughter", "my child", "my kid", "our son", "our daughter",
  "our child", "my stepson", "my stepdaughter", "my grandson",
  "my granddaughter", "parent of", "mother of", "father of", "guardian",
];

// Capitalized words an ask may contain without naming anyone.
const FMS_ALLOWED_CAPS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Canvas", "Google", "Gmail",
  "Chromebook", "Zoom", "IEP", "AP", "CTE", "DECA", "FBLA", "ESL", "ELL",
];

const FMS_STOPWORDS = [
  "the", "and", "for", "with", "that", "this", "from", "about", "asks", "asking",
  "wants", "would", "could", "should", "their", "there", "they", "have", "has",
  "student", "parent", "colleague", "teacher", "please", "into", "what", "when",
  "will", "your", "you", "are", "was", "were", "been", "being", "need", "needs",
];

// ── Entry points ─────────────────────────────────────────────────────────────

// The 15-minute trigger: scan, harvest, rewrite the signal doc. Each step runs
// even if an earlier one failed, so a Gmail hiccup never stops the signal doc
// from showing what was already known.
function runFamilySentinel() {
  if (_fmsProp_("FAMILY_SENTINEL_ENABLED") === "false") {
    Logger.log("Family Mail Sentinel is off (FAMILY_SENTINEL_ENABLED = false).");
    return { skipped: true };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { skipped: true, reason: "another run holds the lock" };
  const result = {};
  try {
    try { result.scan = scanFamilyMail(); } catch (e) { result.scan = { error: String(e) }; }
    // Texted before the harvest waits on Gemini: the tripwire alone is enough.
    try { result.alertAfterScan = sendFamilySafetyAlerts(); } catch (e) { result.alertAfterScan = { error: String(e) }; }
    try { result.harvest = harvestFamilyMailReturns(); } catch (e) { result.harvest = { error: String(e) }; }
    try { result.alertAfterHarvest = sendFamilySafetyAlerts(); } catch (e) { result.alertAfterHarvest = { error: String(e) }; }
    try { result.signal = writeFamilySignal(); } catch (e) { result.signal = { error: String(e) }; }
  } finally {
    lock.releaseLock();
  }
  Logger.log("Family Mail Sentinel: " + JSON.stringify(result));
  return result;
}

function installFamilySentinelTrigger() {
  const existing = ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === FMS_TRIGGER_HANDLER; });
  if (existing.length) {
    Logger.log("Trigger already installed.");
    return { installed: false, existing: existing.length };
  }
  ScriptApp.newTrigger("runFamilySentinel").timeBased().everyMinutes(FMS_TRIGGER_MINUTES).create();
  Logger.log("Installed " + FMS_TRIGGER_HANDLER + " every " + FMS_TRIGGER_MINUTES + " minutes.");
  return { installed: true };
}

function removeFamilySentinelTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === FMS_TRIGGER_HANDLER) { ScriptApp.deleteTrigger(t); removed++; }
  });
  return { removed: removed };
}

// One-time setup: tabs, labels, the signal doc. Safe to re-run.
function setupFamilySentinel() {
  const ss = _fmsSpreadsheet_();
  _fmsEnsureTab_(ss, FMS_INPUT_TAB, FMS_INPUT_HEADERS);
  _fmsEnsureTab_(ss, FMS_RETURN_TAB, FMS_RETURN_HEADERS);
  _fmsEnsureTab_(ss, FMS_LOG_TAB, FMS_LOG_HEADERS);
  _fmsEnsureTab_(ss, FMS_CONTACTS_TAB, FMS_CONTACTS_HEADERS);
  const labels = _fmsEnsureLabels_();
  const doc = _fmsSignalDoc_();
  syncFamilyMailFlowBuildSpec();
  const out = { tabs: "ok", labels: labels, signalDocUrl: doc.getUrl ? doc.getUrl() : doc.getId() };
  Logger.log(JSON.stringify(out));
  return out;
}

// ── Scan: Gmail → label → queue ──────────────────────────────────────────────

// Finds new family mail, labels its thread and queues it for the Flow.
// Mail that is not family mail is left untouched and unrecorded.
function scanFamilyMail(opts) {
  opts = opts || {};
  const ss = _fmsSpreadsheet_();
  const logSheet = _fmsEnsureTab_(ss, FMS_LOG_TAB, FMS_LOG_HEADERS);
  const inputSheet = _fmsEnsureTab_(ss, FMS_INPUT_TAB, FMS_INPUT_HEADERS);
  const seen = {};
  _fmsRows_(logSheet).forEach(function (r) { seen[String(r[FMS_LOG.MESSAGE_ID])] = true; });

  const operator = _fmsOperatorEmail_();
  const roster = _fmsLoadRoster_();
  const contacts = _fmsLoadContacts_(ss);
  const labels = _fmsEnsureLabels_();
  const props = PropertiesService.getScriptProperties();
  const startedAt = Date.now();
  const list = Gmail.Users.Messages.list("me", { q: _fmsScanQuery_(props, startedAt), maxResults: FMS_SCAN_MAX }) || {};
  const refs = list.messages || [];
  const familyThreads = {};
  _fmsRows_(logSheet).forEach(function (r) {
    const st = String(r[FMS_LOG.STATUS]);
    if (r[FMS_LOG.THREAD_ID] && st !== FMS_STATUS.NOT_FAMILY && st !== FMS_STATUS.FIXTURE) familyThreads[String(r[FMS_LOG.THREAD_ID])] = r;
  });

  const out = { checked: 0, queued: 0, safety: 0, errors: 0 };
  refs.forEach(function (ref) {
    if (seen[ref.id]) return;
    out.checked++;
    let msg;
    try {
      msg = _fmsReadMessage_(Gmail.Users.Messages.get("me", ref.id, { format: "full" }));
    } catch (e) {
      // One unreadable message is skipped, not the whole scan. The scan
      // mark isn't moved (below), so it is tried again next run.
      out.errors++;
      out.lastError = String(e);
      return;
    }
    const fam = _fmsDetectFamily_(msg, roster, contacts, operator) ||
      _fmsFromFamilyThread_(msg, familyThreads[msg.threadId], operator);
    if (!fam) return;

    const tripwire = _fmsSafetyTripwire_(msg.subject + "\n" + msg.body);
    const addIds = [labels[FMS_LABEL]];
    if (tripwire) { addIds.push(labels[FMS_LABEL_NOW]); out.safety++; }
    Gmail.Users.Threads.modify({ addLabelIds: addIds }, "me", msg.threadId);

    const prompt = _fmsBuildPromptText_(msg, fam, roster);
    inputSheet.appendRow([FMS_ITEM_PREFIX + msg.id, FMS_STATUS.READY, new Date(), prompt]);
    const row = _fmsBlankLogRow_();
    row[FMS_LOG.MESSAGE_ID] = msg.id;
    row[FMS_LOG.THREAD_ID] = msg.threadId;
    row[FMS_LOG.RECEIVED_AT] = new Date(msg.receivedAt);
    row[FMS_LOG.SOURCE] = fam.source;
    row[FMS_LOG.FAMILY_KEY] = fam.familyKey || _fmsFamilyKey_(fam.studentEmail || msg.fromEmail);
    row[FMS_LOG.COURSE] = fam.course || "";
    row[FMS_LOG.PERIOD] = fam.period || "";
    row[FMS_LOG.STATUS] = FMS_STATUS.QUEUED;
    row[FMS_LOG.SAFETY] = tripwire;
    row[FMS_LOG.SENSITIVE] = tripwire;
    row[FMS_LOG.NOTE] = tripwire ? "safety tripwire" : "";
    logSheet.appendRow(row);
    seen[msg.id] = true;
    familyThreads[msg.threadId] = row;
    out.queued++;
  });
  if (!out.errors) props.setProperty("FAMILY_SENTINEL_LAST_SCAN_AT", String(startedAt));
  return out;
}

// Only mail since the last scan (less an hour's overlap), never more than
// FMS_SCAN_WINDOW_HOURS back. Without the mark every run re-read two days of
// mail that was already checked and wasn't family mail.
function _fmsScanQuery_(props, nowMs) {
  const last = Number(props.getProperty("FAMILY_SENTINEL_LAST_SCAN_AT")) || 0;
  const floor = nowMs - FMS_SCAN_WINDOW_HOURS * 3600 * 1000;
  const from = Math.max(floor, last - FMS_SCAN_OVERLAP_HOURS * 3600 * 1000);
  return FMS_SCAN_QUERY + " after:" + Math.floor(from / 1000);
}

// A reply in a thread that is already family mail is family mail, whoever
// sends it and whether or not it names the student.
function _fmsFromFamilyThread_(msg, prior, operator) {
  if (!prior || !msg.fromEmail || msg.fromEmail === operator || _fmsIsSystemSender_(msg.fromEmail)) return null;
  return {
    source: String(prior[FMS_LOG.SOURCE]) || "external",
    studentEmail: "",
    familyKey: String(prior[FMS_LOG.FAMILY_KEY]),
    course: String(prior[FMS_LOG.COURSE] || ""),
    period: String(prior[FMS_LOG.PERIOD] || ""),
    student: null,
  };
}

// Gmail API message → the plain fields this file uses.
function _fmsReadMessage_(m) {
  const headers = {};
  ((m.payload && m.payload.headers) || []).forEach(function (h) {
    headers[String(h.name).toLowerCase()] = String(h.value || "");
  });
  const from = headers.from || "";
  const addr = /<([^>]+)>/.exec(from);
  const fromEmail = String(addr ? addr[1] : from).trim().toLowerCase();
  const fromName = addr ? from.slice(0, from.indexOf("<")).replace(/"/g, "").trim() : "";
  return {
    id: m.id,
    threadId: m.threadId,
    receivedAt: Number(m.internalDate) || Date.now(),
    fromEmail: fromEmail,
    fromName: fromName,
    subject: headers.subject || "",
    isBulk: !!(headers["list-unsubscribe"] || headers["list-id"] ||
      /^(bulk|list|junk)$/i.test(headers.precedence || "")),
    body: _fmsBodyText_(m.payload),
  };
}

function _fmsBodyText_(payload) {
  if (!payload) return "";
  const found = { plain: "", html: "" };
  _fmsCollectBodies_(payload, found);
  const plain = found.plain, html = found.html;
  if (plain) return plain;
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Depth-first through a MIME tree: the first text/plain and text/html parts.
function _fmsCollectBodies_(part, found) {
  if (!part) return;
  const type = String(part.mimeType || "");
  const data = part.body && part.body.data;
  if (data && type === "text/plain" && !found.plain) found.plain = _fmsDecode_(data);
  if (data && type === "text/html" && !found.html) found.html = _fmsDecode_(data);
  (part.parts || []).forEach(function (child) { _fmsCollectBodies_(child, found); });
}

// A body part's data, as text. In Apps Script the advanced Gmail service
// usually hands back the bytes already decoded (a byte array), not the
// API's base64url string; decoding that again threw "Could not decode
// string" on the first live run (2026-10-12). Both shapes are handled, a
// string gets its "=" padding back first, and anything undecodable comes
// back "" so one odd message can't stop a scan.
function _fmsDecode_(data) {
  if (data === null || data === undefined || data === "") return "";
  try {
    if (typeof data !== "string") return Utilities.newBlob(data).getDataAsString("UTF-8");
    const padded = data + "===".slice(0, (4 - data.length % 4) % 4);
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString("UTF-8");
  } catch (e) {
    return "";
  }
}

// Returns null, or { source, studentEmail, course, period, student }.
function _fmsDetectFamily_(msg, roster, contacts, operator) {
  const from = msg.fromEmail;
  if (!from || from === operator || _fmsIsSystemSender_(from)) return null;
  const text = msg.subject + "\n" + _fmsStripQuoted_(msg.body);
  const named = _fmsFindRosterName_(text, roster);

  function hit(source, student) {
    return {
      source: source,
      studentEmail: student ? student.email : "",
      course: student ? student.course : "",
      period: student ? student.period : "",
      student: student || null,
    };
  }

  if (_fmsEndsWith_(from, FMS_STUDENT_DOMAIN)) return hit("student", roster.byEmail[from] || named.full || null);
  if (contacts[from]) return hit("parent", roster.byEmail[contacts[from]] || named.full || null);
  if (_fmsEndsWith_(from, FMS_DISTRICT_DOMAIN)) return named.full ? hit("staff", named.full) : null;
  if (_fmsEndsWith_(from, "." + FMS_CANVAS_DOMAIN) || _fmsEndsWith_(from, "@" + FMS_CANVAS_DOMAIN)) {
    return named.full ? hit("canvas", named.full) : null;
  }
  if (msg.isBulk) return null;
  if (named.full) return hit("external", named.full);
  if (named.first && _fmsHasAny_(text, FMS_PARENT_WORDS)) return hit("external", named.first);
  return null;
}

// Finds a rostered student in text: full name (either order) first, then a
// first name on its own (only used with a parent word; see above). Every
// surname form counts ("de la cruz", "cruz", "smith-jones", "smith jones").
function _fmsFindRosterName_(text, roster) {
  const lower = " " + String(text).toLowerCase().replace(/[^a-z' -]+/g, " ").replace(/\s+/g, " ") + " ";
  let full = null, first = null;
  for (let i = 0; i < roster.students.length && !full; i++) {
    const s = roster.students[i];
    const lasts = s.surnames || (s.last ? [s.last] : []);
    if (!s.first || !lasts.length) continue;
    for (let j = 0; j < lasts.length && !full; j++) {
      if (lower.indexOf(" " + s.first + " " + lasts[j] + " ") !== -1 ||
          lower.indexOf(" " + lasts[j] + " " + s.first + " ") !== -1) full = s;
    }
    if (!full && !first && s.first.length >= 3 && lower.indexOf(" " + s.first + " ") !== -1) first = s;
  }
  return { full: full, first: first };
}

function _fmsIsSystemSender_(email) {
  return FMS_SYSTEM_SENDERS.indexOf(String(email || "").trim().toLowerCase()) !== -1;
}

function _fmsSafetyTripwire_(text) {
  return _fmsHasAny_(text, FMS_SAFETY_TERMS);
}

// ── Backfill: system senders logged before 2026-10-20 ───────────────────────

// Marks logged threads from FMS_SYSTEM_SENDERS NOT_FAMILY and takes the
// KOS/Family label off them. A dry run (the default, and what the Run button
// does) changes nothing; reclassifySystemSenderThreadsNow() is the real run.
// The log holds no sender, so each message's From is read from Gmail. Left
// alone, and counted: a thread with a safety flag (a person should look),
// and a thread that also holds a real family message (its rows from the
// system sender are reclassified, the label stays). Logs counts only.
function reclassifySystemSenderThreads(dryRun) {
  const apply = dryRun === false;
  const logSheet = _fmsEnsureTab_(_fmsSpreadsheet_(), FMS_LOG_TAB, FMS_LOG_HEADERS);
  const rows = _fmsRows_(logSheet);
  const out = { dryRun: !apply, checked: 0, systemMessages: 0, reclassified: 0, threads: 0,
    labelsRemoved: 0, keptSafety: 0, keptLabelMixed: 0, unreadable: 0 };
  const byThread = {};
  rows.forEach(function (r, i) {
    const st = String(r[FMS_LOG.STATUS]);
    const thread = String(r[FMS_LOG.THREAD_ID] || "");
    if (!thread || st === FMS_STATUS.NOT_FAMILY || st === FMS_STATUS.FIXTURE || st === FMS_STATUS.SAFETY_FIXTURE) return;
    (byThread[thread] = byThread[thread] || []).push(i);
  });
  let labels = null;
  Object.keys(byThread).forEach(function (thread) {
    const system = [];
    let other = 0;
    byThread[thread].forEach(function (i) {
      out.checked++;
      let from = "";
      try {
        from = _fmsReadMessage_(Gmail.Users.Messages.get("me", String(rows[i][FMS_LOG.MESSAGE_ID]),
          { format: "metadata", metadataHeaders: ["From"] })).fromEmail;
      } catch (e) {
        out.unreadable++; other++; return;
      }
      if (_fmsIsSystemSender_(from)) system.push(i); else other++;
    });
    if (!system.length) return;
    out.systemMessages += system.length;
    if (system.some(function (i) { return _fmsTrue_(rows[i][FMS_LOG.SAFETY]); })) { out.keptSafety++; return; }
    out.threads++;
    out.reclassified += system.length;
    if (other) out.keptLabelMixed++; else out.labelsRemoved++;
    if (!apply) return;
    system.forEach(function (i) {
      rows[i][FMS_LOG.STATUS] = FMS_STATUS.NOT_FAMILY;
      rows[i][FMS_LOG.NOTE] = _fmsJoinNote_(rows[i][FMS_LOG.NOTE], "system sender (backfill)");
      logSheet.getRange(i + 2, 1, 1, FMS_LOG_HEADERS.length).setValues([rows[i].slice(0, FMS_LOG_HEADERS.length)]);
    });
    if (!other) {
      labels = labels || _fmsEnsureLabels_();
      Gmail.Users.Threads.modify({ removeLabelIds: [labels[FMS_LABEL]] }, "me", thread);
    }
  });
  Logger.log((apply ? "Reclassified " : "DRY RUN: would reclassify ") + out.reclassified +
    " message(s) in " + out.threads + " thread(s) from system senders; KOS/Family " +
    (apply ? "removed from " : "would come off ") + out.labelsRemoved + " thread(s). Left alone: " +
    out.keptSafety + " with a safety flag, " + out.keptLabelMixed + " (label kept) that also hold a family message; " +
    out.unreadable + " message(s) unreadable. Checked " + out.checked + ".");
  return out;
}

// The real run of reclassifySystemSenderThreads(), for the Run button.
function reclassifySystemSenderThreadsNow() {
  return reclassifySystemSenderThreads(false);
}

// ── Redaction and the prompt ─────────────────────────────────────────────────

function _fmsBuildPromptText_(msg, fam, roster) {
  const ctx = _fmsRedactionContext_(msg, roster);
  const body = _fmsRedact_(_fmsStripQuoted_(msg.body), ctx).slice(0, FMS_BODY_MAX_CHARS);
  return FAMILY_MAIL_TRIAGE_PROMPT + "\n" +
    "SENDER ROLE: " + fam.source + "\n" +
    "SUBJECT: " + _fmsRedact_(msg.subject, ctx) + "\n" +
    "MESSAGE:\n" + body;
}

// Every name the redactor and the leak check look for: all rostered first
// and last names, and the sender's own name.
function _fmsRedactionContext_(msg, roster) {
  const names = {};
  roster.students.forEach(function (s) {
    (s.words || [s.first, s.last]).forEach(function (n) { if (n && n.length >= 3) names[n] = "[STUDENT]"; });
  });
  String(msg && msg.fromName || "").toLowerCase().split(/[^a-z']+/).forEach(function (n) {
    if (n.length >= 3 && !names[n]) names[n] = "[SENDER]";
  });
  return { names: names };
}

function _fmsRedact_(text, ctx) {
  let t = String(text || "");
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]");
  t = t.replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[PHONE]");
  t = t.replace(/\b\d{5,}\b/g, "[NUMBER]");
  return t.replace(/[A-Za-z']+/g, function (word) {
    return ctx.names[word.toLowerCase()] || word;
  });
}

// Drops the quoted history under a reply, so an old message isn't re-read.
function _fmsStripQuoted_(body) {
  const lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From: .+/.test(l) && out.length) break;
    if (/^\s*>/.test(l)) continue;
    out.push(l);
  }
  return out.join("\n").trim();
}

// ── Harvest: Flow answer → log ───────────────────────────────────────────────

// Applies every answer in FamilyMailReturn, then deletes the answered input
// and return rows: mail text is kept only until Gemini has read it.
// A bad answer is not retried. The same stored output can only fail the same
// check again (rule 17), and the message still shows in the signal doc as
// "couldn't classify", with its course and waiting time.
function harvestFamilyMailReturns() {
  const ss = _fmsSpreadsheet_();
  const inputSheet = _fmsEnsureTab_(ss, FMS_INPUT_TAB, FMS_INPUT_HEADERS);
  const returnSheet = _fmsEnsureTab_(ss, FMS_RETURN_TAB, FMS_RETURN_HEADERS);
  const logSheet = _fmsEnsureTab_(ss, FMS_LOG_TAB, FMS_LOG_HEADERS);
  const inputs = _fmsRows_(inputSheet);
  const returns = _fmsRows_(returnSheet);
  const logRows = _fmsRows_(logSheet);
  const roster = _fmsLoadRoster_();
  let labels = null;

  const out = { harvested: 0, classified: 0, failed: 0, notFamily: 0, fixtures: 0, unmatched: 0, expired: 0 };
  const doneItems = {};
  const doneReturnRows = [];

  returns.forEach(function (ret, ri) {
    const itemId = String(ret[FMS_RET.ITEM_ID] || "").trim();
    const inputIdx = _fmsFindIndex_(inputs, FMS_IN.ITEM_ID, itemId);
    const promptText = inputIdx === -1 ? "" : String(inputs[inputIdx][FMS_IN.PROMPT_TEXT] || "");
    const verdict = _fmsParseVerdict_(ret[FMS_RET.PRIMARY_JSON]);

    if (itemId.indexOf(FMS_FIXTURE_PREFIX) === 0 || itemId.indexOf(FMS_CANARY_PREFIX) === 0) {
      const row = _fmsBlankLogRow_();
      row[FMS_LOG.MESSAGE_ID] = itemId;
      row[FMS_LOG.STATUS] = FMS_STATUS.FIXTURE;
      row[FMS_LOG.CLASSIFIED_AT] = new Date();
      row[FMS_LOG.NOTE] = verdict.ok ? "fixture answered: " + verdict.value.category : "fixture answer unusable: " + verdict.error;
      if (verdict.ok) {
        const applied = _fmsApplyVerdict_(row, verdict.value, promptText, _fmsRedactionContext_(null, roster));
        row[FMS_LOG.STATUS] = FMS_STATUS.FIXTURE;
        row[FMS_LOG.NOTE] = applied.note ? "fixture answered; " + applied.note : row[FMS_LOG.NOTE];
      }
      logSheet.appendRow(row);
      out.fixtures++;
      doneItems[itemId] = true;
      doneReturnRows.push(ri);
      return;
    }

    const messageId = itemId.indexOf(FMS_ITEM_PREFIX) === 0 ? itemId.slice(FMS_ITEM_PREFIX.length) : "";
    const li = messageId ? _fmsFindIndex_(logRows, FMS_LOG.MESSAGE_ID, messageId) : -1;
    if (li === -1) { out.unmatched++; return; } // binding problem: left for checkFamilyMailFlowBinding()
    const row = logRows[li];
    if (String(row[FMS_LOG.STATUS]) !== FMS_STATUS.QUEUED) {
      doneItems[itemId] = true; doneReturnRows.push(ri); return; // a duplicate answer
    }

    if (!verdict.ok) {
      row[FMS_LOG.STATUS] = FMS_STATUS.FAILED;
      row[FMS_LOG.NOTE] = _fmsJoinNote_(row[FMS_LOG.NOTE], "unusable answer: " + verdict.error);
      out.failed++;
    } else if (!verdict.value.is_family && String(row[FMS_LOG.SOURCE]) === "external" && !row[FMS_LOG.SAFETY]) {
      row[FMS_LOG.STATUS] = FMS_STATUS.NOT_FAMILY;
      row[FMS_LOG.CLASSIFIED_AT] = new Date();
      labels = labels || _fmsEnsureLabels_();
      try {
        Gmail.Users.Threads.modify({ removeLabelIds: [labels[FMS_LABEL]] }, "me", String(row[FMS_LOG.THREAD_ID]));
      } catch (e) {
        row[FMS_LOG.NOTE] = _fmsJoinNote_(row[FMS_LOG.NOTE], "label not removed: " + e);
      }
      out.notFamily++;
    } else {
      const wasSafe = row[FMS_LOG.SAFETY] === true || String(row[FMS_LOG.SAFETY]).toUpperCase() === "TRUE";
      const applied = _fmsApplyVerdict_(row, verdict.value, promptText, _fmsRedactionContext_(null, roster));
      if (wasSafe) { row[FMS_LOG.SAFETY] = true; row[FMS_LOG.SENSITIVE] = true; row[FMS_LOG.ASK] = ""; }
      if (row[FMS_LOG.SAFETY] === true && !wasSafe) {
        labels = labels || _fmsEnsureLabels_();
        try {
          Gmail.Users.Threads.modify({ addLabelIds: [labels[FMS_LABEL_NOW]] }, "me", String(row[FMS_LOG.THREAD_ID]));
        } catch (e) {
          row[FMS_LOG.NOTE] = _fmsJoinNote_(row[FMS_LOG.NOTE], "Now label not added: " + e);
        }
      }
      if (applied.note) row[FMS_LOG.NOTE] = _fmsJoinNote_(row[FMS_LOG.NOTE], applied.note);
      out.classified++;
    }
    logSheet.getRange(li + 2, 1, 1, FMS_LOG_HEADERS.length).setValues([row]);
    doneItems[itemId] = true;
    doneReturnRows.push(ri);
  });
  out.harvested = doneReturnRows.length;

  // Input rows unanswered too long: their mail text goes, the log keeps the
  // message as UNCLASSIFIED so the signal doc still shows it.
  const cutoff = Date.now() - FMS_INPUT_MAX_AGE_HOURS * 3600 * 1000;
  inputs.forEach(function (inp) {
    const id = String(inp[FMS_IN.ITEM_ID] || "");
    if (doneItems[id]) return;
    const queued = new Date(inp[FMS_IN.QUEUED_AT]).getTime();
    if (!(queued < cutoff)) return;
    doneItems[id] = true;
    out.expired++;
    const li = _fmsFindIndex_(logRows, FMS_LOG.MESSAGE_ID, id.slice(FMS_ITEM_PREFIX.length));
    if (li !== -1 && String(logRows[li][FMS_LOG.STATUS]) === FMS_STATUS.QUEUED) {
      logRows[li][FMS_LOG.STATUS] = FMS_STATUS.UNCLASSIFIED;
      logRows[li][FMS_LOG.NOTE] = _fmsJoinNote_(logRows[li][FMS_LOG.NOTE], "no Flow answer in " + FMS_INPUT_MAX_AGE_HOURS + " h");
      logSheet.getRange(li + 2, 1, 1, FMS_LOG_HEADERS.length).setValues([logRows[li]]);
    }
  });

  _fmsDeleteRows_(returnSheet, doneReturnRows);
  _fmsDeleteRows_(inputSheet, inputs.map(function (r, i) { return doneItems[String(r[FMS_IN.ITEM_ID])] ? i : -1; })
    .filter(function (i) { return i !== -1; }));
  _fmsPruneLog_(logSheet);
  return out;
}

// Parses and validates Gemini's answer. Returns { ok, value } or { ok:false, error }.
function _fmsParseVerdict_(raw) {
  let text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "no JSON object" };
  let v;
  try { v = JSON.parse(text.slice(start, end + 1)); } catch (e) { return { ok: false, error: "invalid JSON" }; }
  if (!v || typeof v !== "object") return { ok: false, error: "not an object" };
  if (!Object.prototype.hasOwnProperty.call(FMS_CATEGORIES, v.category)) return { ok: false, error: "unknown category" };
  const urgency = Number(v.urgency);
  if (!(urgency >= 1 && urgency <= 5)) return { ok: false, error: "urgency out of range" };
  return {
    ok: true,
    value: {
      is_family: v.is_family !== false,
      category: v.category,
      urgency: Math.round(urgency),
      safety: v.safety === true,
      ask: typeof v.ask === "string" ? v.ask.trim() : "",
      due: typeof v.due === "string" ? v.due.trim().slice(0, 30) : "",
      // Missing, or anything but a plain false, means a reply is needed.
      needs_reply: !(v.needs_reply === false || String(v.needs_reply).toLowerCase() === "false"),
    },
  };
}

// Writes a validated verdict into a log row. The ask is withheld (and the
// reason noted) when it names anyone, isn't grounded in the message, or the
// category is sensitive.
function _fmsApplyVerdict_(row, v, promptText, ctx) {
  const sensitive = FMS_SENSITIVE_CATEGORIES.indexOf(v.category) !== -1;
  const safety = v.safety || v.category === "safety_wellbeing";
  row[FMS_LOG.STATUS] = FMS_STATUS.CLASSIFIED;
  row[FMS_LOG.CATEGORY] = v.category;
  row[FMS_LOG.URGENCY] = safety ? 5 : v.urgency;
  row[FMS_LOG.SAFETY] = safety;
  row[FMS_LOG.SENSITIVE] = sensitive || safety;
  row[FMS_LOG.DUE] = _fmsLeaks_(v.due, ctx) ? "" : v.due;
  row[FMS_LOG.CLASSIFIED_AT] = new Date();
  row[FMS_LOG.NEEDS_REPLY] = v.needs_reply !== false;
  let note = "";
  let ask = v.ask.slice(0, FMS_ASK_MAX_CHARS);
  if (sensitive || safety) ask = "";
  else if (ask && _fmsLeaks_(ask, ctx)) { ask = ""; note = "ask withheld: named someone"; }
  else if (ask && !_fmsGrounded_(ask, promptText)) { ask = ""; note = "ask withheld: not grounded in the message"; }
  row[FMS_LOG.ASK] = ask;
  return { note: note };
}

// Does this message need a reply? Gemini's needs_reply, forced true by any
// fail-safe: safety, a sensitive category, urgency 4 or more, a due date, the
// family's 2nd+ contact this week (contacts), or no classification at all
// (still queued, the Flow down, or a bad answer). Only an explicit FALSE
// from a classified message makes it "for your eyes".
function _fmsNeedsReply_(r, contacts) {
  if (String(r[FMS_LOG.STATUS]) !== FMS_STATUS.CLASSIFIED) return true;
  if (_fmsTrue_(r[FMS_LOG.SAFETY]) || _fmsTrue_(r[FMS_LOG.SENSITIVE])) return true; // Sensitive covers the categories
  if (Number(r[FMS_LOG.URGENCY]) >= 4) return true;
  if (String(r[FMS_LOG.DUE] || "").trim()) return true;
  if (contacts >= 2) return true;
  const v = r[FMS_LOG.NEEDS_REPLY];
  return !(v === false || String(v).toUpperCase() === "FALSE");
}

// True when text holds an address, a long number, a phone number, or any
// rostered student's or the sender's name.
function _fmsLeaks_(text, ctx) {
  const t = String(text || "");
  if (!t) return false;
  if (/@/.test(t) || /\d{5,}/.test(t) || /\d{3}[\s.-]\d{4}/.test(t)) return true;
  const words = t.toLowerCase().split(/[^a-z']+/);
  for (let i = 0; i < words.length; i++) if (ctx.names[words[i]]) return true;
  // A name the roster doesn't hold (a parent, a sibling): a title, or a
  // capitalized word mid-sentence that isn't a day, a month or a known term.
  if (/\b(Mr|Mrs|Ms|Miss|Dr|Coach)\.?\s+[A-Z]/.test(t)) return true;
  const caps = t.match(/(?:^|[^.!?]\s)([A-Z][a-z']+)/g) || [];
  for (let i = 0; i < caps.length; i++) {
    const w = caps[i].replace(/^.*?([A-Z][a-z']+)$/, "$1");
    if (i === 0 && t.indexOf(w) === 0) continue; // the sentence's first word
    if (FMS_ALLOWED_CAPS.indexOf(w) === -1) return true;
  }
  return false;
}

// Rule 15, adapted: the ask must share at least one content word with the
// redacted message Gemini was given. Without the message (input row already
// gone) it can't be checked, so it isn't trusted.
function _fmsGrounded_(ask, promptText) {
  const marker = "MESSAGE TO TRIAGE:";
  const at = String(promptText || "").lastIndexOf(marker);
  if (at === -1) return false;
  const source = " " + promptText.slice(at + marker.length).toLowerCase().replace(/[^a-z]+/g, " ") + " ";
  const words = String(ask).toLowerCase().split(/[^a-z]+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 4 || FMS_STOPWORDS.indexOf(w) !== -1) continue;
    if (source.indexOf(" " + w) !== -1) return true;
  }
  return false;
}

// ── The signal doc ───────────────────────────────────────────────────────────

// Rewrites KOS_FAMILY_SIGNAL in place (same file ID every time, like the KOS
// primer): one line per thread still waiting on the teacher, safety first,
// then by urgency and hours waiting. Numbers are assigned fresh each run, so
// "#3" never follows a family from one day to the next; repeat contact is
// counted here instead. A thread is WAITING ON YOU when any message since
// the teacher's last reply needs one (_fmsNeedsReply_), else FOR YOUR EYES;
// an archived thread (no message in INBOX) is in neither.
function writeFamilySignal(now) {
  now = now ? new Date(now) : new Date();
  const ss = _fmsSpreadsheet_();
  const logSheet = _fmsEnsureTab_(ss, FMS_LOG_TAB, FMS_LOG_HEADERS);
  const since = now.getTime() - FMS_SIGNAL_DAYS * 24 * 3600 * 1000;
  const rows = _fmsRows_(logSheet).filter(function (r) {
    const st = String(r[FMS_LOG.STATUS]);
    return r[FMS_LOG.THREAD_ID] && st !== FMS_STATUS.NOT_FAMILY && st !== FMS_STATUS.FIXTURE &&
      st !== FMS_STATUS.SAFETY_FIXTURE &&
      new Date(r[FMS_LOG.RECEIVED_AT]).getTime() >= since;
  });

  const byThread = {};
  const contactCount = {};
  rows.forEach(function (r) {
    const t = String(r[FMS_LOG.THREAD_ID]);
    (byThread[t] = byThread[t] || []).push(r);
    const k = String(r[FMS_LOG.FAMILY_KEY]);
    contactCount[k] = (contactCount[k] || 0) + 1;
  });

  const open = [];
  const replyHours = [];
  Object.keys(byThread).forEach(function (threadId) {
    const msgs = byThread[threadId].slice().sort(function (a, b) {
      return new Date(a[FMS_LOG.RECEIVED_AT]) - new Date(b[FMS_LOG.RECEIVED_AT]);
    });
    const state = _fmsThreadState_(threadId, msgs);
    if (!state) return;
    if (state.replyHours !== null) replyHours.push(state.replyHours);
    if (!state.waitingSince || state.archived) return;
    const latest = msgs[msgs.length - 1];
    const unanswered = msgs.filter(function (r) { return new Date(r[FMS_LOG.RECEIVED_AT]).getTime() >= state.waitingSince; });
    const contacts = contactCount[String(latest[FMS_LOG.FAMILY_KEY])] || 1;
    open.push({
      threadId: threadId,
      row: latest,
      safety: unanswered.some(function (r) { return _fmsTrue_(r[FMS_LOG.SAFETY]); }),
      sensitive: unanswered.some(function (r) { return _fmsTrue_(r[FMS_LOG.SENSITIVE]); }),
      urgency: Math.max.apply(null, unanswered.map(function (r) { return Number(r[FMS_LOG.URGENCY]) || 0; })),
      needsReply: unanswered.some(function (r) { return _fmsNeedsReply_(r, contacts); }),
      waitingHours: Math.max(0, (now.getTime() - state.waitingSince) / 3600000),
      contacts: contacts,
    });
  });

  open.sort(function (a, b) {
    if (a.safety !== b.safety) return a.safety ? -1 : 1;
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    return b.waitingHours - a.waitingHours;
  });

  const lines = _fmsSignalLines_(open, replyHours, now);
  const doc = _fmsSignalDoc_();
  const body = doc.getBody();
  // A cleared body keeps one empty paragraph: the title goes into it, so the
  // doc starts with KOS_FAMILY_SIGNAL like the KOS primer, not a blank line.
  body.clear();
  body.setText(lines[0].text);
  lines.slice(1).forEach(function (l) {
    const p = body.appendParagraph(l.text);
    if (l.url && l.text.indexOf("open") !== -1) {
      const at = l.text.lastIndexOf("open");
      p.editAsText().setLinkUrl(at, at + 3, l.url);
    }
  });
  doc.saveAndClose();
  return {
    open: open.length,
    safety: open.filter(function (o) { return o.safety; }).length,
    waiting: open.filter(function (o) { return o.needsReply; }).length,
    eyes: open.filter(function (o) { return !o.needsReply; }).length,
  };
}

// Reads the thread's message times from Gmail. waitingSince is the first
// family message after the teacher's last reply (null when answered);
// replyHours is how long the last answered message waited; archived is true
// when no message is left in INBOX (the teacher filed it: handled).
function _fmsThreadState_(threadId, msgs) {
  let thread;
  try {
    thread = Gmail.Users.Threads.get("me", threadId, { format: "metadata", metadataHeaders: ["From"] });
  } catch (e) {
    return null; // deleted or moved out of reach: nothing to wait on
  }
  const familyIds = {};
  msgs.forEach(function (r) { familyIds[String(r[FMS_LOG.MESSAGE_ID])] = true; });
  const sent = [];
  const fam = [];
  let inInbox = false;
  ((thread && thread.messages) || []).forEach(function (m) {
    const t = Number(m.internalDate);
    if ((m.labelIds || []).indexOf("INBOX") !== -1) inInbox = true;
    if ((m.labelIds || []).indexOf("SENT") !== -1) sent.push(t);
    else if (familyIds[m.id]) fam.push(t);
  });
  msgs.forEach(function (r) {
    const t = new Date(r[FMS_LOG.RECEIVED_AT]).getTime();
    if (fam.indexOf(t) === -1) fam.push(t);
  });
  sent.sort(function (a, b) { return a - b; });
  fam.sort(function (a, b) { return a - b; });
  const lastSent = sent.length ? sent[sent.length - 1] : 0;
  const waiting = fam.filter(function (t) { return t > lastSent; });
  let replyHours = null;
  const answered = fam.filter(function (t) { return t <= lastSent; });
  if (answered.length) {
    const lastAnswered = answered[answered.length - 1];
    const reply = sent.filter(function (t) { return t >= lastAnswered; })[0];
    if (reply) replyHours = (reply - lastAnswered) / 3600000;
  }
  return { waitingSince: waiting.length ? waiting[0] : null, replyHours: replyHours, archived: !inInbox };
}

function _fmsSignalLines_(open, replyHours, now) {
  const tz = Session.getScriptTimeZone();
  const lines = [
    { text: FMS_SIGNAL_TITLE },
    { text: "Generated at: " + Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm") + " (" + tz + ")" },
    { text: "Student and family mail, without names or message text. Numbers are reassigned every run. Read and answer the mail itself in Gmail (label KOS/Family)." },
    { text: "" },
  ];
  const safety = open.filter(function (o) { return o.safety; });
  const rest = open.filter(function (o) { return !o.safety && o.needsReply; });
  const eyes = open.filter(function (o) { return !o.safety && !o.needsReply; });
  const waitingCount = safety.length + rest.length;

  if (safety.length) {
    lines.push({ text: "NEEDS YOU NOW: " + safety.length + (safety.length === 1 ? " message" : " messages") + ", not summarized." });
    safety.forEach(function (o) {
      lines.push({ text: "Needs you now · waiting " + _fmsHours_(o.waitingHours) + " · open", url: _fmsThreadUrl_(o.threadId) });
    });
    lines.push({ text: "" });
  }

  if (!waitingCount) {
    lines.push({ text: "WAITING ON YOU: none." });
  } else {
    const oldest = safety.concat(rest).reduce(function (m, o) { return Math.max(m, o.waitingHours); }, 0);
    lines.push({ text: "WAITING ON YOU: " + waitingCount + ", oldest " + _fmsHours_(oldest) + "." });
    rest.forEach(function (o, i) {
      lines.push({ text: "#" + (i + 1) + " · " + _fmsItemText_(o), url: _fmsThreadUrl_(o.threadId) });
    });
  }
  lines.push({ text: "" });

  // Numbered on from WAITING, so no two lines share a number.
  if (!eyes.length) {
    lines.push({ text: "FOR YOUR EYES: none." });
  } else {
    const oldestEyes = eyes.reduce(function (m, o) { return Math.max(m, o.waitingHours); }, 0);
    lines.push({ text: "FOR YOUR EYES: " + eyes.length + ", oldest " + _fmsHours_(oldestEyes) + "." });
    eyes.forEach(function (o, i) {
      lines.push({ text: "#" + (rest.length + i + 1) + " · " + _fmsEyesText_(o), url: _fmsThreadUrl_(o.threadId) });
    });
  }
  lines.push({ text: "" });

  if (replyHours.length) {
    const sorted = replyHours.slice().sort(function (a, b) { return a - b; });
    const mid = sorted[Math.floor((sorted.length - 1) / 2)];
    lines.push({ text: "ANSWERED IN THE LAST " + FMS_SIGNAL_DAYS + " DAYS: " + replyHours.length + ", median reply " + _fmsHours_(mid) + "." });
  } else {
    lines.push({ text: "ANSWERED IN THE LAST " + FMS_SIGNAL_DAYS + " DAYS: none recorded." });
  }
  return lines;
}

function _fmsItemText_(o) {
  const r = o.row;
  const parts = [];
  const st = String(r[FMS_LOG.STATUS]);
  if (o.sensitive) {
    parts.push("sensitive");
  } else {
    const course = String(r[FMS_LOG.COURSE] || "");
    const period = String(r[FMS_LOG.PERIOD] || "");
    parts.push(course ? course + (period ? " P" + period : "") : "course unknown");
    parts.push(_fmsSourceText_(String(r[FMS_LOG.SOURCE])));
    if (st === FMS_STATUS.CLASSIFIED) {
      parts.push(FMS_CATEGORIES[String(r[FMS_LOG.CATEGORY])] || "other");
      if (r[FMS_LOG.ASK]) parts.push(String(r[FMS_LOG.ASK]).replace(/\.$/, ""));
    } else if (st === FMS_STATUS.QUEUED) {
      parts.push("not yet classified");
    } else {
      parts.push("couldn't classify");
    }
  }
  parts.push("waiting " + _fmsHours_(o.waitingHours));
  if (!o.sensitive && o.contacts > 1) parts.push(_fmsOrdinal_(o.contacts) + " contact this week");
  if (!o.sensitive && r[FMS_LOG.DUE]) parts.push("due " + r[FMS_LOG.DUE]);
  if (!o.sensitive && Number(r[FMS_LOG.URGENCY]) >= 4) parts.push("urgent");
  parts.push("open");
  return parts.join(" · ");
}

// A "for your eyes" line: course, category, ask and wait. Never "urgent",
// a due date or repeat contact (any of those would have made it WAITING).
function _fmsEyesText_(o) {
  const r = o.row;
  const course = String(r[FMS_LOG.COURSE] || "");
  const period = String(r[FMS_LOG.PERIOD] || "");
  const parts = [course ? course + (period ? " P" + period : "") : "course unknown"];
  parts.push(FMS_CATEGORIES[String(r[FMS_LOG.CATEGORY])] || "other");
  if (r[FMS_LOG.ASK]) parts.push(String(r[FMS_LOG.ASK]).replace(/\.$/, ""));
  parts.push("waiting " + _fmsHours_(o.waitingHours));
  parts.push("open");
  return parts.join(" · ");
}

function _fmsSourceText_(source) {
  return { student: "from a student", parent: "from a parent", staff: "from a colleague",
    canvas: "Canvas message", external: "from a family" }[source] || "family mail";
}

function _fmsHours_(h) {
  if (h < 1) return "under 1 h";
  if (h < 48) return Math.round(h) + " h";
  return Math.round(h / 24) + " days";
}

function _fmsOrdinal_(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function _fmsThreadUrl_(threadId) {
  return "https://mail.google.com/mail/u/0/#all/" + encodeURIComponent(threadId);
}

function _fmsSignalDoc_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("FAMILY_SIGNAL_DOC_ID");
  if (id) {
    try { return DocumentApp.openById(id); } catch (e) { /* recreated below */ }
  }
  const doc = DocumentApp.create(FMS_SIGNAL_TITLE);
  const folderId = props.getProperty("FAMILY_SIGNAL_FOLDER_ID");
  if (folderId) {
    try { DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(folderId)); } catch (e) { /* stays in My Drive */ }
  }
  props.setProperty("FAMILY_SIGNAL_DOC_ID", doc.getId());
  return doc;
}

// ── Roster and contacts ──────────────────────────────────────────────────────

// The Central Ledger's Ledger tab: one entry per student email, with name
// parts for matching. Canvas stores "Last, First"; both orders are handled.
function _fmsLoadRoster_() {
  const roster = { byEmail: {}, students: [] };
  let sheet;
  try {
    const cfg = getConfig_();
    if (!cfg.ledgerSsId) return roster;
    sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  } catch (e) {
    Logger.log("Family Mail Sentinel: roster unavailable (" + e + ").");
    return roster;
  }
  if (!sheet || sheet.getLastRow() < 2) return roster;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  data.forEach(function (r) {
    const email = String(r[LEDGER.GOOGLE_ID] || "").trim().toLowerCase();
    if (!email || roster.byEmail[email]) return;
    const parts = _fmsNameParts_(String(r[LEDGER.STUDENT_NAME] || ""));
    const s = {
      email: email,
      first: parts.first,
      last: parts.last,
      surnames: parts.surnames,
      words: parts.words,
      course: String(r[LEDGER.COURSE_NAME] || "").trim(),
      period: String(r[LEDGER.PERIOD] || "").trim(),
    };
    roster.byEmail[email] = s;
    roster.students.push(s);
  });
  return roster;
}

// { first, last, surnames, words }. "Last, First" (Canvas) keeps the whole
// part before the comma as the surname, so "De La Cruz, Ana" is "de la
// cruz"; "First Middle Last" can't say where the surname starts, so every
// tail counts ("ann smith", "smith"). A hyphenated surname also matches
// written with a space. words: every name word, split at hyphens too, for
// the redactor and the leak check.
function _fmsNameParts_(name) {
  const clean = function (t) {
    return String(t).toLowerCase().replace(/[^a-z' -]+/g, " ").split(/\s+/).filter(Boolean);
  };
  const n = String(name).trim();
  const comma = n.indexOf(",");
  let given, surnames = [];
  if (comma !== -1) {
    const lastWords = clean(n.slice(0, comma));
    given = clean(n.slice(comma + 1));
    if (lastWords.length) {
      surnames.push(lastWords.join(" "));
      for (let i = 1; i < given.length; i++) surnames.push(given.slice(i).concat(lastWords).join(" "));
    }
  } else {
    const all = clean(n);
    given = all.slice(0, 1);
    for (let i = 1; i < all.length; i++) surnames.push(all.slice(i).join(" "));
  }
  surnames.slice().forEach(function (l) {
    if (l.indexOf("-") !== -1) surnames.push(l.replace(/-/g, " "));
  });
  const words = [];
  given.concat(surnames).join(" ").split(/[\s-]+/).forEach(function (w) {
    if (w && words.indexOf(w) === -1) words.push(w);
  });
  return { first: given[0] || "", last: surnames[0] || "", surnames: surnames, words: words };
}

// Parent address → student email: the FamilyContacts tab, then every address
// a weekly parent report was sent to (the Central Ledger's ParentReportLog).
function _fmsLoadContacts_(ss) {
  const contacts = {};
  const tab = _fmsEnsureTab_(ss, FMS_CONTACTS_TAB, FMS_CONTACTS_HEADERS);
  _fmsRows_(tab).forEach(function (r) {
    const p = String(r[0] || "").trim().toLowerCase();
    if (p) contacts[p] = String(r[1] || "").trim().toLowerCase();
  });
  try {
    const cfg = getConfig_();
    const log = cfg.ledgerSsId && SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.parentReportLog || "ParentReportLog");
    if (log && log.getLastRow() > 1) {
      const head = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0].map(String);
      const si = head.indexOf("student_email"), ri = head.indexOf("recipient_address");
      if (si !== -1 && ri !== -1) {
        log.getRange(2, 1, log.getLastRow() - 1, log.getLastColumn()).getValues().forEach(function (r) {
          const p = String(r[ri] || "").trim().toLowerCase();
          if (p && !contacts[p]) contacts[p] = String(r[si] || "").trim().toLowerCase();
        });
      }
    }
  } catch (e) { /* the FamilyContacts tab alone still works */ }
  return contacts;
}

// ── Labels ───────────────────────────────────────────────────────────────────

// Returns { "KOS/Family": id, "KOS/Family/Now": id }, creating either if missing.
function _fmsEnsureLabels_() {
  const have = {};
  ((Gmail.Users.Labels.list("me") || {}).labels || []).forEach(function (l) { have[l.name] = l.id; });
  [FMS_LABEL, FMS_LABEL_NOW].forEach(function (name) {
    if (!have[name]) {
      const created = Gmail.Users.Labels.create({
        name: name, labelListVisibility: "labelShow", messageListVisibility: "show",
      }, "me");
      have[name] = created.id;
    }
  });
  const out = {};
  out[FMS_LABEL] = have[FMS_LABEL];
  out[FMS_LABEL_NOW] = have[FMS_LABEL_NOW];
  return out;
}

// ── Safety pushes (ntfy) ─────────────────────────────────────────────────────

// Pushes once for every thread that turned "needs you now" in the last
// FMS_ALERT_LOOKBACK_HOURS and hasn't been pushed. One push per call, with a
// count. A failed push leaves Alerted_At blank, so the next run tries again.
// Without FAMILY_ALERT_NTFY_TOPIC it does nothing (preflight says so).
function sendFamilySafetyAlerts(now) {
  now = now ? new Date(now) : new Date();
  const props = PropertiesService.getScriptProperties();
  const topic = String(props.getProperty("FAMILY_ALERT_NTFY_TOPIC") || "").trim();
  if (!topic) return { sent: 0, reason: "FAMILY_ALERT_NTFY_TOPIC not set" };

  const logSheet = _fmsEnsureTab_(_fmsSpreadsheet_(), FMS_LOG_TAB, FMS_LOG_HEADERS);
  const rows = _fmsRows_(logSheet);
  const since = now.getTime() - FMS_ALERT_LOOKBACK_HOURS * 3600 * 1000;
  const alertedThreads = {};
  rows.forEach(function (r) { if (r[FMS_LOG.ALERTED_AT]) alertedThreads[String(r[FMS_LOG.THREAD_ID])] = true; });

  const due = [];
  const threads = {};
  rows.forEach(function (r, i) {
    const thread = String(r[FMS_LOG.THREAD_ID] || "");
    const st = String(r[FMS_LOG.STATUS]);
    if (!thread || !_fmsTrue_(r[FMS_LOG.SAFETY]) || r[FMS_LOG.ALERTED_AT]) return;
    if (st === FMS_STATUS.NOT_FAMILY || st === FMS_STATUS.FIXTURE) return;
    if (new Date(r[FMS_LOG.RECEIVED_AT]).getTime() < since) return;
    due.push(i);
    if (!alertedThreads[thread]) threads[thread] = st === FMS_STATUS.SAFETY_FIXTURE ? "fixture" : "real";
  });
  if (!due.length) return { sent: 0 };

  const n = Object.keys(threads).length;
  // Only fixture rows due: the push says it's a test. Any real row: a real push.
  const onlyFixture = n > 0 && Object.keys(threads).every(function (t) { return threads[t] === "fixture"; });
  if (n) {
    const dayKey = "FAMILY_ALERT_COUNT_" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd");
    const today = Number(props.getProperty(dayKey)) || 0;
    if (today >= FMS_ALERT_DAILY_CAP) return { sent: 0, reason: "daily cap reached", waiting: n };
    const push = onlyFixture
      ? _fmsPush_(topic, "Test: " + _fmsAlertText_(n), "urgent", FMS_ALERT_TITLE + " TEST")
      : _fmsPush_(topic, _fmsAlertText_(n), "urgent", FMS_ALERT_TITLE);
    if (!push.ok) return { sent: 0, error: push.error, waiting: n };
    props.setProperty(dayKey, String(today + 1));
  }
  // Every due row is marked, including a second message in a thread already
  // pushed: one push per thread, not per message.
  due.forEach(function (i) {
    rows[i][FMS_LOG.ALERTED_AT] = now;
    logSheet.getRange(i + 2, 1, 1, FMS_LOG_HEADERS.length).setValues([rows[i]]);
  });
  return { sent: n ? 1 : 0, threads: n, test: onlyFixture };
}

function _fmsAlertText_(n) {
  return FMS_ALERT_TEXT.replace("{n}", n === 1 ? "A family message needs you" : n + " family messages need you");
}

// One POST to ntfy. "urgent" is ntfy's top priority (5): a long vibration
// burst, and on iPhone a time-sensitive notification, which Focus can let
// through. Returns { ok } or { ok:false, error }.
function _fmsPush_(topic, text, priority, title) {
  try {
    const res = UrlFetchApp.fetch(FMS_NTFY_SERVER + "/" + encodeURIComponent(topic), {
      method: "post",
      payload: text,
      headers: { Title: title || FMS_ALERT_TITLE, Priority: priority, Tags: "rotating_light" },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    return code >= 200 && code < 300 ? { ok: true } : { ok: false, error: "ntfy answered " + code };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// One-time: makes a private, unguessable topic name, stores it, and logs it
// so the operator can subscribe to it in the ntfy app. Won't replace an
// existing topic unless asked, since the phone is subscribed to that one.
function makeFamilyAlertTopic(replace) {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty("FAMILY_ALERT_NTFY_TOPIC");
  if (existing && replace !== true) {
    Logger.log("Topic already set: " + existing + " (makeFamilyAlertTopic(true) makes a new one).");
    return { topic: existing, created: false };
  }
  const topic = "kos-" + Utilities.getUuid().replace(/-/g, "");
  props.setProperty("FAMILY_ALERT_NTFY_TOPIC", topic);
  Logger.log("In the ntfy app: + → Subscribe to topic → " + topic + " (server ntfy.sh). Then run sendFamilyAlertTest().");
  return { topic: topic, created: true };
}

// The notification fixture: runs the real alert path end to end. It adds a
// synthetic safety row to FamilyMailLog (no mail, no student), runs
// sendFamilySafetyAlerts() exactly as the trigger does (topic, daily cap,
// urgent push, Alerted_At), checks the row was marked, then deletes it.
// The push reads "KOS TEST / Test: A family message needs you now. ...".
// sendFamilyAlertTest() only proves ntfy reaches the phone; this proves the
// sentinel would push for a flagged message. It counts toward the daily cap.
function runFamilySafetyAlertFixture() {
  const logSheet = _fmsEnsureTab_(_fmsSpreadsheet_(), FMS_LOG_TAB, FMS_LOG_HEADERS);
  const id = FMS_FIXTURE_PREFIX + "SAFETY-" + Date.now();
  const row = _fmsBlankLogRow_();
  row[FMS_LOG.MESSAGE_ID] = id;
  row[FMS_LOG.THREAD_ID] = id;
  row[FMS_LOG.RECEIVED_AT] = new Date();
  row[FMS_LOG.SOURCE] = "fixture";
  row[FMS_LOG.STATUS] = FMS_STATUS.SAFETY_FIXTURE;
  row[FMS_LOG.SAFETY] = true;
  row[FMS_LOG.SENSITIVE] = true;
  row[FMS_LOG.NOTE] = "notification fixture";
  logSheet.appendRow(row);

  let result, marked = false;
  try {
    result = sendFamilySafetyAlerts();
  } finally {
    const rows = _fmsRows_(logSheet);
    const i = _fmsFindIndex_(rows, FMS_LOG.MESSAGE_ID, id);
    if (i !== -1) {
      marked = !!rows[i][FMS_LOG.ALERTED_AT];
      logSheet.deleteRow(i + 2);
    }
  }
  const ok = !!(result && result.sent === 1 && result.test && marked);
  Logger.log(ok
    ? "Notification fixture: PASS. A \"KOS TEST\" push went out through the real alert path; check the phone."
    : "Notification fixture: FAIL — " + JSON.stringify(result) + (marked ? "" : "; the fixture row was not marked alerted"));
  return { ok: ok, result: result, marked: marked };
}

// Sends one test push at normal priority, so the operator can confirm the
// phone gets it.
function sendFamilyAlertTest() {
  const topic = String(PropertiesService.getScriptProperties().getProperty("FAMILY_ALERT_NTFY_TOPIC") || "").trim();
  if (!topic) throw new Error("Run makeFamilyAlertTopic() first and subscribe to its topic in the ntfy app.");
  const push = _fmsPush_(topic, "Test. Family Mail Sentinel alerts will look like this.", "default");
  if (!push.ok) throw new Error("The test push failed: " + push.error);
  Logger.log("Test push sent to " + topic + ". If the phone didn't show it, check the ntfy app's subscription and notification settings.");
  return { sent: true };
}

// ── Checks (meta/FLOW_DOCTRINE.md rule 9) ────────────────────────────────────

// Is the structure sound? Tabs and headers, roster, labels, trigger, doc.
function runFamilySentinelPreflight() {
  const checks = [];
  function check(name, probe) {
    try {
      const r = probe.call(null);
      checks.push({ name: name, ok: r.ok, detail: r.detail || "" });
    } catch (e) {
      checks.push({ name: name, ok: false, detail: String(e) });
    }
  }
  const ss = _fmsSpreadsheet_();
  [[FMS_INPUT_TAB, FMS_INPUT_HEADERS], [FMS_RETURN_TAB, FMS_RETURN_HEADERS],
    [FMS_LOG_TAB, FMS_LOG_HEADERS], [FMS_CONTACTS_TAB, FMS_CONTACTS_HEADERS]].forEach(function (t) {
    check("tab " + t[0], function () {
      const sh = ss.getSheetByName(t[0]);
      if (!sh) return { ok: false, detail: "missing; run setupFamilySentinel()" };
      const head = sh.getRange(1, 1, 1, t[1].length).getValues()[0].map(String);
      const bad = t[1].filter(function (h, i) { return head[i] !== h; });
      return { ok: !bad.length, detail: bad.length ? "headers differ at " + bad.join(", ") : "ok" };
    });
  });
  check("Gmail advanced service", function () {
    if (typeof Gmail === "undefined") return { ok: false, detail: "enable Gmail API v1 under Services" };
    return { ok: true };
  });
  check("labels", function () {
    if (typeof Gmail === "undefined") return { ok: false, detail: "no Gmail service" };
    const names = ((Gmail.Users.Labels.list("me") || {}).labels || []).map(function (l) { return l.name; });
    const missing = [FMS_LABEL, FMS_LABEL_NOW].filter(function (n) { return names.indexOf(n) === -1; });
    return { ok: !missing.length, detail: missing.length ? "missing " + missing.join(", ") + "; run setupFamilySentinel()" : "ok" };
  });
  check("roster", function () {
    const n = _fmsLoadRoster_().students.length;
    return { ok: n > 0, detail: n + " students (Central Ledger via CENTRAL_LEDGER_SS_ID)" };
  });
  check("trigger", function () {
    const n = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === FMS_TRIGGER_HANDLER; }).length;
    return { ok: n === 1, detail: n + " installed; want 1 (installFamilySentinelTrigger())" };
  });
  check("safety pushes", function () {
    const topic = PropertiesService.getScriptProperties().getProperty("FAMILY_ALERT_NTFY_TOPIC");
    return { ok: !!topic, detail: topic ? "set; sendFamilyAlertTest() to confirm the phone gets it" : "FAMILY_ALERT_NTFY_TOPIC not set (makeFamilyAlertTopic()): safety messages won't reach the phone" };
  });
  check("signal doc", function () {
    const id = PropertiesService.getScriptProperties().getProperty("FAMILY_SIGNAL_DOC_ID");
    return { ok: !!id, detail: id ? "ok" : "not created; run setupFamilySentinel()" };
  });
  const ok = checks.every(function (c) { return c.ok; });
  checks.forEach(function (c) { Logger.log((c.ok ? "PASS " : "FAIL ") + c.name + ": " + c.detail); });
  Logger.log(ok ? "Preflight: PASS" : "Preflight: FAIL");
  return { ok: ok, checks: checks };
}

// Does the Apps Script half work? The Flow and Gmail are both STUBBED here:
// a synthetic message goes through redaction and the prompt, a hand-written
// answer stands in for Gemini, and the harvest must accept it, keep the ask,
// and leave no name in it. Cleans up after itself. A pass says nothing about
// the Flow; checkFamilyMailFlowLiveness() does.
function runFamilyMailCanary() {
  const ss = _fmsSpreadsheet_();
  const inputSheet = _fmsEnsureTab_(ss, FMS_INPUT_TAB, FMS_INPUT_HEADERS);
  const returnSheet = _fmsEnsureTab_(ss, FMS_RETURN_TAB, FMS_RETURN_HEADERS);
  const logSheet = _fmsEnsureTab_(ss, FMS_LOG_TAB, FMS_LOG_HEADERS);
  const itemId = FMS_CANARY_PREFIX + Date.now();
  const msg = _fmsSyntheticMessage_();
  const roster = { byEmail: {}, students: [{ email: "x@student.ccpsnet.net", first: "jordan", last: "rivers", course: "8175", period: "3" }] };
  const prompt = _fmsBuildPromptText_(msg, { source: "parent" }, roster);
  const problems = [];
  if (/jordan|rivers/i.test(prompt.slice(FAMILY_MAIL_TRIAGE_PROMPT.length))) problems.push("redaction left a name in the prompt");
  inputSheet.appendRow([itemId, FMS_STATUS.READY, new Date(), prompt]);
  returnSheet.appendRow([new Date(), itemId, JSON.stringify({
    is_family: true, category: "absence_makeup", urgency: 3, safety: false,
    ask: "The parent asks when the makeup test can be taken.", due: "Thursday",
  })]);
  harvestFamilyMailReturns();
  const rows = _fmsRows_(logSheet);
  const li = _fmsFindIndex_(rows, FMS_LOG.MESSAGE_ID, itemId);
  if (li === -1) problems.push("harvest did not record the canary");
  else if (!rows[li][FMS_LOG.ASK]) problems.push("harvest withheld a clean ask: " + rows[li][FMS_LOG.NOTE]);
  if (_fmsFindIndex_(_fmsRows_(inputSheet), FMS_IN.ITEM_ID, itemId) !== -1) problems.push("input row not deleted after harvest");
  if (li !== -1) logSheet.deleteRow(li + 2);
  const ok = !problems.length;
  Logger.log(ok ? "Canary: PASS (Flow and Gmail stubbed)" : "Canary: FAIL — " + problems.join("; "));
  return { ok: ok, problems: problems, stubbed: ["Gemini Flow", "Gmail"] };
}

function _fmsSyntheticMessage_() {
  return {
    id: "synthetic", threadId: "synthetic", receivedAt: Date.now(),
    fromEmail: "pat.example@example.com", fromName: "Pat Example",
    subject: "Jordan Rivers missed the test",
    body: "Hello, my son Jordan Rivers was absent Tuesday. When can he take the makeup test? He is free Thursday. Call me at 555-123-4567. Thanks, Pat",
    isBulk: false,
  };
}

// Are the Flow's columns bound right? Logs the exact binding, then looks for
// the two signs of a wrong one: answers whose Item_ID matches nothing, and
// answers with an empty Primary_JSON.
function checkFamilyMailFlowBinding() {
  const ss = _fmsSpreadsheet_();
  const returns = _fmsRows_(_fmsEnsureTab_(ss, FMS_RETURN_TAB, FMS_RETURN_HEADERS));
  const inputs = _fmsRows_(_fmsEnsureTab_(ss, FMS_INPUT_TAB, FMS_INPUT_HEADERS));
  const logRows = _fmsRows_(_fmsEnsureTab_(ss, FMS_LOG_TAB, FMS_LOG_HEADERS));
  const known = {};
  inputs.forEach(function (r) { known[String(r[FMS_IN.ITEM_ID])] = true; });
  logRows.forEach(function (r) { known[FMS_ITEM_PREFIX + String(r[FMS_LOG.MESSAGE_ID])] = true; });
  const unmatched = returns.filter(function (r) { return !known[String(r[FMS_RET.ITEM_ID])]; }).length;
  const empty = returns.filter(function (r) { return !String(r[FMS_RET.PRIMARY_JSON] || "").trim(); }).length;
  const binding = _fmsBuildSpecRows_().map(function (r) { return r.join(" | "); });
  binding.forEach(function (l) { Logger.log(l); });
  const ok = !unmatched && !empty;
  Logger.log(ok ? "Binding: no sign of a wrong column" :
    "Binding: " + unmatched + " answer(s) match no Item_ID, " + empty + " with an empty Primary_JSON");
  return { ok: ok, unmatched: unmatched, emptyAnswers: empty, waitingInputs: inputs.length, binding: binding };
}

// Has the Flow ever answered? Counts real classifications and fixture
// answers, and reports the newest of each.
function checkFamilyMailFlowLiveness() {
  const rows = _fmsRows_(_fmsEnsureTab_(_fmsSpreadsheet_(), FMS_LOG_TAB, FMS_LOG_HEADERS));
  let real = 0, fixtures = 0, lastReal = null, lastFixture = null;
  rows.forEach(function (r) {
    const st = String(r[FMS_LOG.STATUS]);
    const at = r[FMS_LOG.CLASSIFIED_AT] ? new Date(r[FMS_LOG.CLASSIFIED_AT]) : null;
    if (st === FMS_STATUS.FIXTURE && String(r[FMS_LOG.MESSAGE_ID]).indexOf(FMS_FIXTURE_PREFIX) === 0) {
      fixtures++; if (at && (!lastFixture || at > lastFixture)) lastFixture = at;
    } else if (st === FMS_STATUS.CLASSIFIED || st === FMS_STATUS.NOT_FAMILY) {
      real++; if (at && (!lastReal || at > lastReal)) lastReal = at;
    }
  });
  const answered = real + fixtures > 0;
  Logger.log(answered
    ? "Liveness: the Flow has answered (" + real + " real, " + fixtures + " fixture)."
    : "Liveness: the Flow has NEVER answered. Build it, then installFamilyMailFixture().");
  return {
    answered: answered, real: real, fixtures: fixtures,
    lastReal: lastReal ? lastReal.toISOString() : null,
    lastFixture: lastFixture ? lastFixture.toISOString() : null,
  };
}

// Gives the Flow a READY row to match while it's being built: a synthetic
// message, no real mail. Its answer is harvested like any other and recorded
// as FIXTURE, never shown in the signal doc. Idempotent per day.
function installFamilyMailFixture() {
  const ss = _fmsSpreadsheet_();
  const inputSheet = _fmsEnsureTab_(ss, FMS_INPUT_TAB, FMS_INPUT_HEADERS);
  const itemId = FMS_FIXTURE_PREFIX + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  if (_fmsFindIndex_(_fmsRows_(inputSheet), FMS_IN.ITEM_ID, itemId) !== -1) {
    return { installed: false, itemId: itemId };
  }
  const roster = { byEmail: {}, students: [{ email: "x@student.ccpsnet.net", first: "jordan", last: "rivers", course: "8175", period: "3" }] };
  inputSheet.appendRow([itemId, FMS_STATUS.READY, new Date(),
    _fmsBuildPromptText_(_fmsSyntheticMessage_(), { source: "parent" }, roster)]);
  Logger.log("Fixture row " + itemId + " is READY in " + FMS_INPUT_TAB + ".");
  return { installed: true, itemId: itemId };
}

// Writes the Studio build values to the FamilyMailBuildSpec tab, derived from
// the constants above (rule 11): build the Flow from the tab, not from prose.
function syncFamilyMailFlowBuildSpec() {
  const ss = _fmsSpreadsheet_();
  const rows = [["Step", "Field", "Value"]].concat(_fmsBuildSpecRows_());
  let sh = ss.getSheetByName(FMS_SPEC_TAB);
  if (!sh) sh = ss.insertSheet(FMS_SPEC_TAB);
  sh.clear();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  return { rows: rows.length - 1 };
}

function _fmsBuildSpecRows_() {
  function col(headers, name) { return String.fromCharCode(65 + headers.indexOf(name)) + " (" + name + ")"; }
  return [
    ["1 Starter: sheet row", "Spreadsheet", "this spreadsheet"],
    ["1 Starter: sheet row", "Tab", FMS_INPUT_TAB],
    ["1 Starter: sheet row", "Condition", col(FMS_INPUT_HEADERS, "Status") + " = " + FMS_STATUS.READY],
    ["2 Ask Gemini", "Instructions", "@trigger." + FMS_INPUT_HEADERS[FMS_IN.PROMPT_TEXT] + " (nothing else)"],
    ["3 Add row to sheet", "Tab", FMS_RETURN_TAB],
    ["3 Add row to sheet", col(FMS_RETURN_HEADERS, "Returned_At"), "the run's current time"],
    ["3 Add row to sheet", col(FMS_RETURN_HEADERS, "Item_ID"), "@trigger." + FMS_INPUT_HEADERS[FMS_IN.ITEM_ID]],
    ["3 Add row to sheet", col(FMS_RETURN_HEADERS, "Primary_JSON"), "step 2's output"],
  ];
}

// ── Small helpers ────────────────────────────────────────────────────────────

function _fmsSpreadsheet_() {
  const id = _fmsProp_("FAMILY_SENTINEL_SS_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function _fmsProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function _fmsOperatorEmail_() {
  return String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
}

// Makes the tab, or adds headers appended since it was made (FamilyMailLog's
// Needs_Reply, 2026-10-20), when the ones it has are the start of the list.
function _fmsEnsureTab_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  const width = sh.getLastColumn();
  if (width > 0 && width < headers.length) {
    const have = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
    if (have.every(function (h, i) { return h === headers[i]; })) {
      sh.getRange(1, width + 1, 1, headers.length - width).setValues([headers.slice(width)]);
    }
  }
  return sh;
}

// Data rows below the header, as arrays.
function _fmsRows_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const width = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(2, 1, last - 1, width).getValues();
}

function _fmsFindIndex_(rows, col, value) {
  for (let i = 0; i < rows.length; i++) if (String(rows[i][col]) === String(value)) return i;
  return -1;
}

// Deletes data rows by 0-based index, bottom up so indexes stay valid.
function _fmsDeleteRows_(sheet, indexes) {
  indexes.slice().sort(function (a, b) { return b - a; })
    .forEach(function (i) { sheet.deleteRow(i + 2); });
}

// Keeps FamilyMailLog to FMS_LOG_KEEP_DAYS: older rows are deleted. Fixture
// rows are kept, so liveness can still say the Flow once answered.
function _fmsPruneLog_(logSheet) {
  const cutoff = Date.now() - FMS_LOG_KEEP_DAYS * 24 * 3600 * 1000;
  const old = [];
  _fmsRows_(logSheet).forEach(function (r, i) {
    if (String(r[FMS_LOG.STATUS]) === FMS_STATUS.FIXTURE) return;
    const t = new Date(r[FMS_LOG.RECEIVED_AT]).getTime();
    if (t && t < cutoff) old.push(i);
  });
  _fmsDeleteRows_(logSheet, old);
}

function _fmsBlankLogRow_() {
  return FMS_LOG_HEADERS.map(function () { return ""; });
}

function _fmsFamilyKey_(identity) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(identity).toLowerCase());
  return bytes.slice(0, 6).map(function (b) { return ((b < 0 ? b + 256 : b) + 256).toString(16).slice(1); }).join("");
}

function _fmsJoinNote_(a, b) { return a ? String(a) + "; " + b : b; }
function _fmsTrue_(v) { return v === true || String(v).toUpperCase() === "TRUE"; }
function _fmsEndsWith_(s, suffix) { return s.length >= suffix.length && s.slice(-suffix.length) === suffix; }
// Whole words or phrases only: "gun" must not match "begun".
function _fmsHasAny_(text, terms) {
  const t = " " + String(text).toLowerCase().replace(/[^a-z'-]+/g, " ") + " ";
  for (let i = 0; i < terms.length; i++) if (t.indexOf(" " + terms[i] + " ") !== -1) return true;
  return false;
}
