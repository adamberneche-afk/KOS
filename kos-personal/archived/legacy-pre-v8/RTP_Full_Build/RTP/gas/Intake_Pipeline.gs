/**
 * ============================================================
 * RTP Intake Pipeline — v2.0
 * Trigger: onFormSubmit (linked to Google Form)
 * Flow: Raw log → Gemini summarize → Index → Vector Router
 * ============================================================
 */

// ── ENTRY POINT (bind this to onFormSubmit) ───────────────────
function processNewLog(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    _logError("Intake_Pipeline", "Lock timeout — concurrent submission blocked.");
    return;
  }

  try {
    const rawLog    = _extractFormResponse(e);
    if (!rawLog || rawLog.trim().length < 50) {
      _logError("Intake_Pipeline", "Submission too short (<50 chars). Skipped.");
      return;
    }

    Logger.log(`📥 New log received. Length: ${rawLog.length} chars.`);

    // 1. Summarize + vectorize via Gemini
    const analysis  = _analyzeLog(rawLog);
    if (!analysis)  { _logError("Intake_Pipeline", "Gemini analysis returned null."); return; }

    // 2. Write to INDEX sheet
    const sessionId = _writeToIndex(rawLog, analysis);

    // 3. Route to Vector Docs
    VectorRouter.route(analysis, sessionId);

    // 4. Check if any insight is stable enough for Core Thesis proposal
    _checkForStableInsights(analysis, sessionId);

    Logger.log(`✅ Session ${sessionId} processed successfully.`);

  } catch (err) {
    _logError("Intake_Pipeline", err.message, err.stack);
  } finally {
    lock.releaseLock();
  }
}

// ── FORM EXTRACTION ───────────────────────────────────────────
function _extractFormResponse(e) {
  // Works with both Form-linked Sheet trigger and direct Form trigger
  if (e && e.namedValues) {
    // Form submit event — grab first paragraph field
    const keys = Object.keys(e.namedValues);
    for (const key of keys) {
      const val = e.namedValues[key][0];
      if (val && val.length > 20) return val;
    }
  }
  if (e && e.response) {
    return e.response.getItemResponses().map(r => r.getResponse()).join("\n\n");
  }
  return null;
}

// ── GEMINI ANALYSIS ───────────────────────────────────────────
function _analyzeLog(rawLog) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in Script Properties.");

  const existingVectors = _getExistingVectorNames();

  const prompt = `You are the intelligence core of a Recursive Thought Partner system.
Analyze this session log and return ONLY valid JSON (no markdown, no explanation).

SESSION LOG:
"""
${rawLog.substring(0, 8000)}
"""

EXISTING VECTOR CATEGORIES: ${JSON.stringify(existingVectors)}

Return this exact JSON structure:
{
  "summary": "3-5 sentence summary of key breakthroughs and decisions",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "action_items": ["action 1", "action 2"],
  "vector_weights": {"CATEGORY_NAME": 0.0_to_1.0},
  "new_vector_proposed": null_or_"PROPOSED_VECTOR_NAME",
  "new_vector_rationale": null_or_"why this new vector is needed",
  "stability_score": 0.0_to_1.0,
  "stability_rationale": "why this score — is this a stable insight or volatile exploration?",
  "contradictions": [],
  "council_flags": {
    "architect": null_or_"structural concern",
    "muse": null_or_"creative opportunity",
    "auditor": null_or_"conflict or risk"
  }
}

RULES:
- vector_weights: only include categories with weight > 0.15
- stability_score > 0.75 means the insight is ready for Core Thesis promotion
- contradictions: list any ideas that conflict with what sounds like established decisions
- Be precise and evidence-based. Do not hallucinate context not present in the log.`;

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
  };

  const response = _callGeminiWithBackoff(url, body);
  if (!response) return null;

  try {
    const text = response.candidates[0].content.parts[0].text;
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    _logError("Intake_Pipeline._analyzeLog", `JSON parse failed: ${err.message}`);
    return null;
  }
}

// ── WRITE TO INDEX ────────────────────────────────────────────
function _writeToIndex(rawLog, analysis) {
  const props   = PropertiesService.getScriptProperties();
  const ssId    = props.getProperty("INDEX_SHEET_ID");
  const ss      = SpreadsheetApp.openById(ssId);
  const sheet   = ss.getSheetByName("LOG_INDEX");

  const sessionId   = `SES-${Date.now()}`;
  const vectorsJson = JSON.stringify(analysis.vector_weights || {});

  sheet.appendRow([
    new Date().toISOString(),
    analysis.summary,
    vectorsJson,
    rawLog.length,
    sessionId,
    "" // Target doc IDs filled in by Vector Router
  ]);

  // Update health score cell
  const healthSheet = ss.getSheetByName("SYSTEM_HEALTH");
  healthSheet.appendRow([new Date().toISOString(), "OK", 100, "None"]);

  return sessionId;
}

// ── STABLE INSIGHT CHECK → GOVERNANCE EMAIL ───────────────────
function _checkForStableInsights(analysis, sessionId) {
  if (!analysis.stability_score || analysis.stability_score < 0.75) return;

  const userEmail = Session.getActiveUser().getEmail();
  const webAppUrl = PropertiesService.getScriptProperties().getProperty("GOVERNANCE_WEB_APP_URL") || "[Deploy Governance_Engine as Web App to get URL]";

  const insightList = (analysis.key_insights || []).map((i, n) => `${n+1}. ${i}`).join("\n");
  const approveUrl  = `${webAppUrl}?action=promote&sessionId=${sessionId}`;
  const rejectUrl   = `${webAppUrl}?action=reject&sessionId=${sessionId}`;

  MailApp.sendEmail({
    to: userEmail,
    subject: `🧠 RTP — Core Thesis Promotion Proposal (Score: ${analysis.stability_score})`,
    body: `The RTP Council has identified insights with high stability (${analysis.stability_score}/1.0).

PROPOSED INSIGHTS FOR CORE THESIS:
${insightList}

RATIONALE: ${analysis.stability_rationale}

SESSION: ${sessionId}

→ APPROVE (move to Core Thesis): ${approveUrl}
→ REJECT (keep in Current State): ${rejectUrl}

This email was auto-generated by the RTP Governance Engine.`
  });

  Logger.log(`📧 Core Thesis promotion email sent for session ${sessionId}`);
}

// ── EXISTING VECTOR NAMES ─────────────────────────────────────
function _getExistingVectorNames() {
  try {
    const props = PropertiesService.getScriptProperties();
    const ssId  = props.getProperty("INDEX_SHEET_ID");
    const ss    = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("VECTOR_MAP");
    if (sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
                .getValues().flat().filter(Boolean);
  } catch(e) {
    return [];
  }
}

// ── GEMINI WITH EXPONENTIAL BACKOFF ───────────────────────────
function _callGeminiWithBackoff(url, body, maxRetries = 4) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      if (code === 200) return JSON.parse(res.getContentText());
      if (code === 429 || code >= 500) {
        Logger.log(`  ⚠️ Gemini HTTP ${code}. Retry ${attempt}/${maxRetries} in ${delay}ms`);
        Utilities.sleep(delay);
        delay *= 2;
      } else {
        _logError("Intake_Pipeline._callGemini", `HTTP ${code}: ${res.getContentText()}`);
        return null;
      }
    } catch (err) {
      _logError("Intake_Pipeline._callGemini", err.message);
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
  return null;
}

// ── ERROR LOGGER ──────────────────────────────────────────────
function _logError(script, message, stack) {
  Logger.log(`❌ ERROR [${script}]: ${message}`);
  try {
    const props = PropertiesService.getScriptProperties();
    const ssId  = props.getProperty("INDEX_SHEET_ID");
    if (!ssId) return;
    const ss    = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("SYSTEM_ERRORS");
    sheet.appendRow([new Date().toISOString(), script, message, stack || ""]);
  } catch(e) { /* fail silently */ }
}
