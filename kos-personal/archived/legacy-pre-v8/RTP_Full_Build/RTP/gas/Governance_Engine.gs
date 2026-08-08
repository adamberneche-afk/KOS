/**
 * ============================================================
 * RTP Governance Engine — v2.0
 * Triggers:
 *   - Time-driven every 4 hours → runGovernanceCycle()
 *   - Web App GET/POST → doGet() handles approval clicks
 * ============================================================
 */

// ── WEB APP HANDLER (deploy this script as a Web App) ─────────
function doGet(e) {
  const action     = e.parameter.action     || "";
  const sessionId  = e.parameter.sessionId  || "";
  const vectorName = e.parameter.vectorName || "";
  const personaName= e.parameter.personaName|| "";

  let result = "";

  try {
    switch (action) {
      case "promote":
        result = _promoteToThesis(sessionId);
        break;
      case "reject":
        result = _rejectPromotion(sessionId);
        break;
      case "create_vector":
        result = _executeVectorCreation(vectorName, sessionId);
        break;
      case "create_persona":
        result = _executePersonaCreation(personaName);
        break;
      default:
        result = "⚠️ Unknown action. Valid: promote, reject, create_vector, create_persona";
    }
  } catch (err) {
    result = `❌ Error: ${err.message}`;
    _logGovError("doGet", err.message, err.stack);
  }

  return HtmlService.createHtmlOutput(`
    <html>
    <head>
      <style>
        body { font-family: monospace; background: #0f0f1a; color: #e0e0ff;
               display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
        .card { background:#1a1a2e; border:1px solid #333; border-radius:8px;
                padding:2rem; max-width:500px; text-align:center; }
        h2 { color:#7b68ee; }
        p  { line-height:1.6; }
        a  { color:#7b68ee; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🧠 RTP Governance</h2>
        <p>${result}</p>
        <p><small>You can close this tab.</small></p>
      </div>
    </body>
    </html>
  `);
}

// ── GOVERNANCE CYCLE (time-driven every 4h) ───────────────────
function runGovernanceCycle() {
  Logger.log("⚖️  Governance cycle starting...");
  try {
    _runIntegrityAudit();
    _runVectorLifecycleSync();
    _detectDecayedVectorDocs();
    Logger.log("✅ Governance cycle complete.");
  } catch (err) {
    _logGovError("runGovernanceCycle", err.message, err.stack);
  }
}

// ── PROMOTE SESSION INSIGHTS TO CORE THESIS ───────────────────
function _promoteToThesis(sessionId) {
  if (!sessionId) return "❌ No sessionId provided.";

  const insights = _getInsightsForSession(sessionId);
  if (!insights) return `⚠️ No insights found for session: ${sessionId}`;

  const coreDoc = _loadDocByName("CORE_THESIS", "[01_Canonical_Foundation]");
  if (!coreDoc) return "❌ CORE_THESIS doc not found.";

  const body = coreDoc.getBody();
  const date = new Date().toISOString().split("T")[0];

  body.appendHorizontalRule();
  body.appendParagraph(`ADOPTED — ${date} (from session ${sessionId})`).setBold(true);
  body.appendParagraph(insights.summary);

  if (insights.key_insights) {
    insights.key_insights.forEach(i => body.appendListItem(`• ${i}`));
  }

  // Archive from CURRENT_STATE
  _archiveFromCurrentState(sessionId);

  Logger.log(`✅ Session ${sessionId} promoted to CORE_THESIS.`);
  return `✅ Insights from session <strong>${sessionId}</strong> have been promoted to your Core Thesis.<br><br><em>"${insights.summary}"</em>`;
}

function _rejectPromotion(sessionId) {
  Logger.log(`↩️  Session ${sessionId} promotion rejected. Staying in Current State.`);
  return `↩️ Promotion rejected for session <strong>${sessionId}</strong>.<br>The insights remain in Current State.`;
}

// ── CREATE NEW VECTOR DOC (from email approval) ───────────────
function _executeVectorCreation(vectorName, sessionId) {
  if (!vectorName) return "❌ No vectorName provided.";

  const normalized = vectorName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const docName    = `VECTOR_${normalized}`;
  const props      = PropertiesService.getScriptProperties();
  const folderId   = props.getProperty("FOLDER_05_VECTOR_REPOSITORY");
  if (!folderId) return "❌ Vector Repository folder not found.";

  const folder = DriveApp.getFolderById(folderId);
  const exists = folder.getFilesByName(docName).hasNext();
  if (exists) return `⚠️ VECTOR_${normalized} already exists.`;

  // Create doc
  const doc  = DocumentApp.create(docName);
  const file = DriveApp.getFileById(doc.getId());
  DriveApp.getRootFolder().removeFile(file);
  folder.addFile(file);

  const body = doc.getBody();
  body.clear();
  body.appendParagraph(`VECTOR: ${normalized}`).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Created: ${new Date().toDateString()} | Origin session: ${sessionId || "Manual"}`);
  body.appendHorizontalRule();
  body.appendParagraph("SESSION LOG").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("[Sessions tagged to this vector will appear below]");

  // Register in VECTOR_MAP
  const ssId  = props.getProperty("INDEX_SHEET_ID");
  const ss    = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName("VECTOR_MAP");
  const docUrl= `https://docs.google.com/document/d/${doc.getId()}`;
  sheet.appendRow([normalized, doc.getId(), docUrl, new Date().toISOString(), new Date().toISOString(), 0]);

  // Seed with historical context
  _seedNewVectorDoc(doc.getId(), normalized);

  Logger.log(`✅ VECTOR_${normalized} created and seeded.`);
  return `✅ <strong>VECTOR_${normalized}</strong> has been created and seeded with historical context.<br><a href="${docUrl}" target="_blank">Open document →</a>`;
}

// ── CREATE NEW PERSONA (from email approval) ──────────────────
function _executePersonaCreation(personaName) {
  if (!personaName) return "❌ No personaName provided.";

  const safeName  = personaName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const docName   = `PERSONA_${safeName}`;
  const props     = PropertiesService.getScriptProperties();
  const folderId  = props.getProperty("FOLDER_02_COUNCIL_ALIGNMENTS");
  if (!folderId) return "❌ Council Alignments folder not found.";

  const folder = DriveApp.getFolderById(folderId);
  if (folder.getFilesByName(docName).hasNext()) return `⚠️ ${docName} already exists.`;

  const doc  = DocumentApp.create(docName);
  const file = DriveApp.getFileById(doc.getId());
  DriveApp.getRootFolder().removeFile(file);
  folder.addFile(file);

  const body = doc.getBody();
  body.setText(`PERSONA_${safeName}.md — The ${safeName}
================================================
Role: [Define this persona's specialty and focus area]

BEHAVIORAL RULES:
- [Rule 1: What does this persona prioritize?]
- [Rule 2: What does it flag or challenge?]
- [Rule 3: What questions does it always ask?]

INTERJECTION TRIGGERS:
- [Situation 1 that activates this persona]
- [Situation 2 that activates this persona]

TONE: [Describe the communication style]
SAMPLE OUTPUT: "[Example of what this persona might say]"`);

  Logger.log(`✅ ${docName} created.`);
  return `✅ <strong>${docName}</strong> has been created.<br>Open it and fill in the behavioral rules to activate this persona in future Council rounds.`;
}

// ── INTEGRITY AUDIT ───────────────────────────────────────────
function _runIntegrityAudit() {
  Logger.log("  🔍 Running integrity audit...");
  const props = PropertiesService.getScriptProperties();
  const requiredProps = ["ROOT_FOLDER_ID", "INDEX_SHEET_ID", "GEMINI_API_KEY"];
  const issues = [];

  requiredProps.forEach(key => {
    if (!props.getProperty(key)) issues.push(`Missing Script Property: ${key}`);
  });

  const ssId = props.getProperty("INDEX_SHEET_ID");
  if (ssId) {
    const ss = SpreadsheetApp.openById(ssId);
    ["LOG_INDEX","VECTOR_MAP","SYSTEM_HEALTH","SYSTEM_ERRORS"].forEach(tabName => {
      if (!ss.getSheetByName(tabName)) issues.push(`Missing sheet tab: ${tabName}`);
    });

    // Update health score
    const healthScore = Math.max(0, 100 - (issues.length * 20));
    const health = ss.getSheetByName("SYSTEM_HEALTH");
    if (health) {
      health.appendRow([new Date().toISOString(), issues.length ? "ISSUES" : "OK",
                        healthScore, issues.join("; ") || "None"]);
      ss.getSheetByName("SYSTEM_HEALTH").getRange("G1").setValue(healthScore);
    }
  }

  if (issues.length > 0) {
    Logger.log(`  ⚠️ Integrity issues found: ${issues.join(", ")}`);
    _sendIntegrityAlert(issues);
  } else {
    Logger.log("  ✅ Integrity audit passed.");
  }
}

// ── VECTOR LIFECYCLE SYNC (Notebook gap detection) ────────────
function _runVectorLifecycleSync() {
  Logger.log("  🔗 Running vector lifecycle sync...");
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty("INDEX_SHEET_ID");
  if (!ssId) return;

  const ss    = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName("VECTOR_MAP");
  if (sheet.getLastRow() < 2) return;

  const data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const gaps  = data.filter(row => row[0] && !row[5]); // session_count = 0 means never routed to

  if (gaps.length > 0) {
    const gapNames = gaps.map(r => `VECTOR_${r[0]}`).join(", ");
    Logger.log(`  ⚠️ Source gap: ${gapNames} not yet used in routing.`);

    const userEmail = Session.getActiveUser().getEmail();
    MailApp.sendEmail({
      to: userEmail,
      subject: "⚠️ RTP — Source Gap Detected",
      body: `The following Vector Docs exist but have not yet received any routed sessions:

${gapNames}

RECOMMENDED ACTION:
1. Add these files to your NotebookLM source list.
2. Verify these vector topics appear in your recent session logs.
3. If these vectors are no longer relevant, you may delete them.

— RTP Governance Engine`
    });
  }
}

// ── DETECT DECAYED VECTOR DOCS ─────────────────────────────────
function _detectDecayedVectorDocs() {
  Logger.log("  📅 Checking for decayed vector docs (>7 days inactive)...");
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty("INDEX_SHEET_ID");
  if (!ssId) return;

  const ss    = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName("VECTOR_MAP");
  if (sheet.getLastRow() < 2) return;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const data   = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const decayed= data.filter(row => row[4] && new Date(row[4]) < cutoff);

  if (decayed.length > 0) {
    const names = decayed.map(r => `VECTOR_${r[0]}`).join(", ");
    Logger.log(`  ⚠️ Decayed vectors: ${names}`);
  }
}

// ── SEED HISTORICAL CONTEXT INTO NEW VECTOR DOC ───────────────
function _seedNewVectorDoc(docId, vectorName) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) return;

  const existingContext = _loadDocByName("CURRENT_STATE", "[03_Dynamic_State]");
  const coreThesis      = _loadDocByName("CORE_THESIS",   "[01_Canonical_Foundation]");
  if (!existingContext || !coreThesis) return;

  const contextText = DocumentApp.openById(existingContext.getId()).getBody().getText();
  const thesisText  = DocumentApp.openById(coreThesis.getId()).getBody().getText();

  const prompt = `Extract all content relevant to "${vectorName}" from these documents.
Return ONLY valid JSON, no markdown.

CURRENT STATE:
"""${contextText.substring(0,3000)}"""

CORE THESIS:
"""${thesisText.substring(0,2000)}"""

Return: {"relevant_excerpts": ["excerpt1", "excerpt2"], "seed_summary": "2-3 sentence overview"}`;

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = { contents: [{ parts: [{ text: prompt }] }],
                 generationConfig: { responseMimeType: "application/json", temperature: 0.2 } };

  const res = UrlFetchApp.fetch(url, { method:"post", contentType:"application/json",
                                       payload: JSON.stringify(body), muteHttpExceptions:true });
  if (res.getResponseCode() !== 200) return;

  try {
    const parsed  = JSON.parse(JSON.parse(res.getContentText()).candidates[0].content.parts[0].text);
    const seedDoc = DocumentApp.openById(docId);
    const db      = seedDoc.getBody();

    db.appendParagraph("HISTORICAL CONTEXT (Auto-Seeded)").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (parsed.seed_summary) db.appendParagraph(parsed.seed_summary).setItalic(true);
    (parsed.relevant_excerpts || []).forEach(e => db.appendListItem(`• ${e}`));
    db.appendHorizontalRule();
  } catch(e) { Logger.log("  ⚠️ Seeding failed: " + e.message); }
}

// ── HELPERS ───────────────────────────────────────────────────
function _loadDocByName(docName, folderName) {
  try {
    const props  = PropertiesService.getScriptProperties();
    const rootId = props.getProperty("ROOT_FOLDER_ID");
    const folderIt = DriveApp.getFolderById(rootId).getFoldersByName(folderName);
    if (!folderIt.hasNext()) return null;
    const fileIt = folderIt.next().getFilesByName(docName);
    return fileIt.hasNext() ? DriveApp.getFileById(fileIt.next().getId()) : null;
  } catch(e) { return null; }
}

function _getInsightsForSession(sessionId) {
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty("INDEX_SHEET_ID");
  if (!ssId) return null;
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName("LOG_INDEX");
  const data  = sheet.getDataRange().getValues();
  const row   = data.find(r => r[4] === sessionId);
  if (!row) return null;
  return { summary: row[1], key_insights: [] };
}

function _archiveFromCurrentState(sessionId) {
  // Append a note to CURRENT_STATE that this session was promoted
  const file = _loadDocByName("CURRENT_STATE", "[03_Dynamic_State]");
  if (!file) return;
  const doc  = DocumentApp.openById(file.getId());
  doc.getBody().appendParagraph(`[Promoted to CORE_THESIS — session ${sessionId} — ${new Date().toDateString()}]`).setItalic(true);
}

function _sendIntegrityAlert(issues) {
  const userEmail = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: userEmail,
    subject: "🚨 RTP — Integrity Issues Detected",
    body: `The RTP system found the following issues during its integrity audit:\n\n${issues.map((i,n)=>`${n+1}. ${i}`).join("\n")}\n\nPlease review your Script Properties and folder structure.\n\n— RTP Governance Engine`
  });
}

function _logGovError(script, message, stack) {
  Logger.log(`❌ [${script}]: ${message}`);
  try {
    const props = PropertiesService.getScriptProperties();
    const ssId  = props.getProperty("INDEX_SHEET_ID");
    if (!ssId) return;
    SpreadsheetApp.openById(ssId).getSheetByName("SYSTEM_ERRORS")
      .appendRow([new Date().toISOString(), script, message, stack || ""]);
  } catch(e) {}
}
