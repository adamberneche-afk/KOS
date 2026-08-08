/**
 * ============================================================
 * RTP Council Simulator — v2.0
 * Trigger: Time-driven, every 1 hour
 * Reads recent logs + persona files → writes interjections
 * ============================================================
 */

// ── ENTRY POINT (bind to hourly time trigger) ─────────────────
function runCouncilSynthesis() {
  Logger.log("🧠 Council Synthesis starting...");

  try {
    const recentLogs   = _getRecentSessionLogs(5);
    if (!recentLogs.length) { Logger.log("No new logs since last synthesis. Skipping."); return; }

    const personaRules = _loadAllPersonas();
    const currentState = _loadDocContent("CURRENT_STATE", "[03_Dynamic_State]");
    const pivots       = _loadDocContent("PIVOTS_AND_LESSONS", "[03_Dynamic_State]");

    const interjections = _runCouncilRound(recentLogs, personaRules, currentState, pivots);
    if (!interjections) { Logger.log("Council returned no interjections this cycle."); return; }

    _writeInterjections(interjections);
    _updateCurrentState(interjections);

    // Check for persona evolution trigger
    _checkPersonaEvolution();

    Logger.log("✅ Council Synthesis complete.");

  } catch (err) {
    _logCouncilError("Council_Simulator", err.message, err.stack);
  }
}

// ── LOAD RECENT SESSION LOGS ──────────────────────────────────
function _getRecentSessionLogs(limit) {
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty("INDEX_SHEET_ID");
  if (!ssId) throw new Error("INDEX_SHEET_ID not set. Run Genesis first.");

  const ss    = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName("LOG_INDEX");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const startRow = Math.max(2, lastRow - limit + 1);
  const rows     = sheet.getRange(startRow, 1, lastRow - startRow + 1, 6).getValues();

  // Only return logs from the last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return rows
    .filter(r => r[0] && new Date(r[0]) > cutoff)
    .map(r => ({ timestamp: r[0], summary: r[1], vectors: r[2], sessionId: r[4] }));
}

// ── LOAD ALL PERSONA FILES ────────────────────────────────────
function _loadAllPersonas() {
  return {
    architect : _loadDocContent("PERSONA_ARCHITECT", "[02_Council_Alignments]"),
    muse      : _loadDocContent("PERSONA_MUSE",      "[02_Council_Alignments]"),
    auditor   : _loadDocContent("PERSONA_AUDITOR",   "[02_Council_Alignments]")
  };
}

// ── LOAD DOC CONTENT BY NAME + FOLDER ─────────────────────────
function _loadDocContent(docName, folderName) {
  try {
    const props    = PropertiesService.getScriptProperties();
    const rootId   = props.getProperty("ROOT_FOLDER_ID");
    const root     = DriveApp.getFolderById(rootId);
    const folderIt = root.getFoldersByName(folderName);
    if (!folderIt.hasNext()) return `[${docName} not found]`;

    const folder = folderIt.next();
    const fileIt = folder.getFilesByName(docName);
    if (!fileIt.hasNext()) return `[${docName} not found]`;

    const doc  = DocumentApp.openById(fileIt.next().getId());
    return doc.getBody().getText().substring(0, 3000); // cap to avoid token overflow
  } catch(e) {
    return `[Error loading ${docName}: ${e.message}]`;
  }
}

// ── RUN COUNCIL ROUND VIA GEMINI ─────────────────────────────
function _runCouncilRound(logs, personas, currentState, pivots) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set.");

  const logSummaries = logs.map((l, i) =>
    `Session ${i+1} [${l.sessionId}]:\n${l.summary}`
  ).join("\n\n---\n\n");

  const prompt = `You are orchestrating a Council of three AI personas who review recent work sessions.
Return ONLY valid JSON, no markdown.

RECENT SESSION SUMMARIES:
"""
${logSummaries}
"""

CURRENT PROJECT STATE:
"""
${currentState}
"""

PIVOTS & LESSONS (past mistakes to check against):
"""
${pivots}
"""

PERSONA RULES:
ARCHITECT: ${personas.architect.substring(0, 800)}
MUSE: ${personas.muse.substring(0, 800)}
AUDITOR: ${personas.auditor.substring(0, 800)}

Return this JSON:
{
  "has_interjections": true_or_false,
  "architect_note": null_or_"structural insight or concern",
  "muse_note": null_or_"creative opportunity or expansion idea",
  "auditor_note": null_or_"conflict with past lessons or risky assumption",
  "consensus_summary": "1-2 sentence synthesis of the council's overall read",
  "recommended_next_action": "the single most important thing to do next",
  "persona_evolution_signal": null_or_"topic that has appeared >3x and may need a new specialist persona",
  "current_state_update": null_or_"suggested text to append to CURRENT_STATE doc"
}

RULES:
- Only set has_interjections=true if there are genuine, substantive notes to share
- auditor_note should reference specific past lessons if applicable
- Be direct and useful — avoid vague or generic observations`;

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
  };

  const response = _geminiCall(url, body);
  if (!response) return null;

  try {
    const text = response.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return parsed.has_interjections ? parsed : null;
  } catch (err) {
    _logCouncilError("_runCouncilRound", `JSON parse failed: ${err.message}`);
    return null;
  }
}

// ── WRITE INTERJECTIONS TO DOC ────────────────────────────────
function _writeInterjections(data) {
  const content = _loadDocById("COUNCIL_INTERJECTIONS", "[04_Council_Logs]");
  if (!content.doc) { Logger.log("⚠️ COUNCIL_INTERJECTIONS doc not found."); return; }

  const body = content.doc.getBody();
  const date = new Date().toISOString().split("T")[0];
  const time = new Date().toTimeString().split(" ")[0];

  body.appendHorizontalRule();
  body.appendParagraph(`⏰ Council Session — ${date} ${time}`).setBold(true);

  if (data.architect_note) {
    body.appendParagraph("🏗️ ARCHITECT:").setBold(true);
    body.appendParagraph(data.architect_note);
  }
  if (data.muse_note) {
    body.appendParagraph("🎨 MUSE:").setBold(true);
    body.appendParagraph(data.muse_note);
  }
  if (data.auditor_note) {
    body.appendParagraph("🔍 AUDITOR:").setBold(true);
    body.appendParagraph(data.auditor_note);
  }
  if (data.consensus_summary) {
    body.appendParagraph("🤝 CONSENSUS:").setBold(true);
    body.appendParagraph(data.consensus_summary);
  }
  if (data.recommended_next_action) {
    body.appendParagraph(`⭐ NEXT ACTION: ${data.recommended_next_action}`).setBold(true);
  }

  Logger.log("  📝 Interjections written to COUNCIL_INTERJECTIONS.");
}

// ── UPDATE CURRENT STATE DOC ──────────────────────────────────
function _updateCurrentState(data) {
  if (!data.current_state_update) return;

  const content = _loadDocById("CURRENT_STATE", "[03_Dynamic_State]");
  if (!content.doc) return;

  const body = content.doc.getBody();
  const date = new Date().toISOString().split("T")[0];
  body.appendParagraph(`\n[Council Update — ${date}]`).setBold(true);
  body.appendParagraph(data.current_state_update);
  Logger.log("  📝 CURRENT_STATE updated by council.");
}

// ── CHECK FOR PERSONA EVOLUTION SIGNAL ────────────────────────
function _checkPersonaEvolution(data) {
  if (!data || !data.persona_evolution_signal) return;

  const topic     = data.persona_evolution_signal;
  const userEmail = Session.getActiveUser().getEmail();
  const webAppUrl = PropertiesService.getScriptProperties().getProperty("GOVERNANCE_WEB_APP_URL")
                    || "[Set GOVERNANCE_WEB_APP_URL in Script Properties]";
  const safeName  = topic.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const approveUrl = `${webAppUrl}?action=create_persona&personaName=${safeName}`;

  MailApp.sendEmail({
    to: userEmail,
    subject: `👤 RTP — New Council Persona Proposed: THE ${safeName}`,
    body: `The Council has detected that "${topic}" has become a dominant theme requiring a specialist.

PROPOSED NEW PERSONA: THE ${safeName}
BENEFIT: Specialized depth and precision for all "${topic}" related decisions.

→ APPROVE (create PERSONA_${safeName}.md): ${approveUrl}

Upon approval, the system will:
1. Create PERSONA_${safeName}.md in your Council Alignments folder
2. Update COUNCIL.md to include this new voice
3. Begin including this persona in future Council synthesis rounds`
  });
  Logger.log(`📧 Persona evolution email sent for: ${safeName}`);
}

// ── DOC LOADER BY NAME + FOLDER ───────────────────────────────
function _loadDocById(docName, folderName) {
  try {
    const props    = PropertiesService.getScriptProperties();
    const rootId   = props.getProperty("ROOT_FOLDER_ID");
    const root     = DriveApp.getFolderById(rootId);
    const folderIt = root.getFoldersByName(folderName);
    if (!folderIt.hasNext()) return { doc: null };
    const folder = folderIt.next();
    const fileIt = folder.getFilesByName(docName);
    if (!fileIt.hasNext()) return { doc: null };
    return { doc: DocumentApp.openById(fileIt.next().getId()) };
  } catch(e) { return { doc: null }; }
}

// ── GEMINI CALL ───────────────────────────────────────────────
function _geminiCall(url, body, maxRetries = 3) {
  let delay = 1500;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res  = UrlFetchApp.fetch(url, {
        method: "post", contentType: "application/json",
        payload: JSON.stringify(body), muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) return JSON.parse(res.getContentText());
      Utilities.sleep(delay); delay *= 2;
    } catch(e) { Utilities.sleep(delay); delay *= 2; }
  }
  return null;
}

// ── ERROR LOGGER ──────────────────────────────────────────────
function _logCouncilError(script, message, stack) {
  Logger.log(`❌ [${script}]: ${message}`);
  try {
    const props = PropertiesService.getScriptProperties();
    const ssId  = props.getProperty("INDEX_SHEET_ID");
    if (!ssId) return;
    SpreadsheetApp.openById(ssId).getSheetByName("SYSTEM_ERRORS")
      .appendRow([new Date().toISOString(), script, message, stack || ""]);
  } catch(e) {}
}
