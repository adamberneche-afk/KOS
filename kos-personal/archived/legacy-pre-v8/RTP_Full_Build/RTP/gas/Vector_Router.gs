/**
 * ============================================================
 * RTP Vector Router — v2.0
 * Routes processed log summaries to the correct VECTOR_[TOPIC]
 * Google Docs based on Gemini-assigned weights.
 * Called internally by Intake_Pipeline.gs
 * ============================================================
 */

const VectorRouter = (() => {

  const WEIGHT_THRESHOLD = 0.7; // Only route if weight >= this value

  // ── PUBLIC: MAIN ROUTE FUNCTION ──────────────────────────────
  function route(analysis, sessionId) {
    const weights = analysis.vector_weights || {};
    const routedDocIds = [];

    // 1. Route to existing vector docs
    for (const [vectorName, weight] of Object.entries(weights)) {
      if (weight < WEIGHT_THRESHOLD) continue;
      const docId = _getOrCreateVectorDoc(vectorName);
      if (docId) {
        _appendToVectorDoc(docId, vectorName, analysis, sessionId, weight);
        routedDocIds.push(docId);
        _updateVectorMap(vectorName, docId);
      }
    }

    // 2. Propose new vector if Gemini flagged one
    if (analysis.new_vector_proposed) {
      _proposeNewVector(analysis.new_vector_proposed, analysis.new_vector_rationale, sessionId);
    }

    // 3. Write routed doc IDs back to LOG_INDEX
    if (routedDocIds.length > 0) {
      _updateLogIndexDocIds(sessionId, routedDocIds);
    }

    // 4. Post council flags to COUNCIL_INTERJECTIONS
    if (analysis.council_flags) {
      _writeCouncilFlags(analysis.council_flags, analysis.summary, sessionId);
    }

    Logger.log(`🗺️  Routed session ${sessionId} → ${routedDocIds.length} vector doc(s).`);
    return routedDocIds;
  }

  // ── GET OR CREATE VECTOR DOC ──────────────────────────────────
  function _getOrCreateVectorDoc(vectorName) {
    const normalized = vectorName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const docName    = `VECTOR_${normalized}`;
    const props      = PropertiesService.getScriptProperties();
    const folderId   = props.getProperty("FOLDER_05_VECTOR_REPOSITORY");

    if (!folderId) {
      Logger.log("⚠️  Vector Repository folder ID not found. Run Genesis first.");
      return null;
    }

    const folder = DriveApp.getFolderById(folderId);
    const iter   = folder.getFilesByName(docName);

    if (iter.hasNext()) {
      return iter.next().getId();
    }

    // Create new vector doc
    const doc  = DocumentApp.create(docName);
    const file = DriveApp.getFileById(doc.getId());
    DriveApp.getRootFolder().removeFile(file);
    folder.addFile(file);

    // Seed the new doc
    const body = doc.getBody();
    body.clear();
    body.appendParagraph(`VECTOR: ${normalized}`).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Created: ${new Date().toDateString()}`);
    body.appendParagraph("This document auto-captures all session insights tagged to this vector.\nEach entry includes a summary, key insights, and a link to the session log.");
    body.appendHorizontalRule();
    body.appendParagraph("HISTORICAL CONTEXT").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph("[Auto-seeded historical context will appear here on first run of the Seeding script]");
    body.appendHorizontalRule();
    body.appendParagraph("SESSION LOG").setHeading(DocumentApp.ParagraphHeading.HEADING2);

    Logger.log(`  ✅ Created new vector doc: ${docName}`);
    _sendNewVectorEmail(normalized, doc.getId());
    return doc.getId();
  }

  // ── APPEND TO VECTOR DOC ──────────────────────────────────────
  function _appendToVectorDoc(docId, vectorName, analysis, sessionId, weight) {
    const doc  = DocumentApp.openById(docId);
    const body = doc.getBody();

    const dateStr = new Date().toISOString().split("T")[0];

    body.appendHorizontalRule();
    body.appendParagraph(`📅 ${dateStr} | Session: ${sessionId} | Weight: ${weight.toFixed(2)}`).setBold(true);
    body.appendParagraph(analysis.summary);

    if (analysis.key_insights && analysis.key_insights.length > 0) {
      body.appendParagraph("Key Insights:").setBold(true);
      analysis.key_insights.forEach(insight => {
        body.appendListItem(`• ${insight}`);
      });
    }

    if (analysis.action_items && analysis.action_items.length > 0) {
      body.appendParagraph("Action Items:").setBold(true);
      analysis.action_items.forEach(item => {
        body.appendListItem(`☐ ${item}`);
      });
    }

    if (analysis.contradictions && analysis.contradictions.length > 0) {
      body.appendParagraph("⚠️ Contradictions Flagged:").setBold(true);
      analysis.contradictions.forEach(c => body.appendListItem(`• ${c}`));
    }

    Logger.log(`  📝 Appended to VECTOR_${vectorName.toUpperCase()}`);
  }

  // ── UPDATE VECTOR MAP SHEET ───────────────────────────────────
  function _updateVectorMap(vectorName, docId) {
    const props  = PropertiesService.getScriptProperties();
    const ssId   = props.getProperty("INDEX_SHEET_ID");
    const ss     = SpreadsheetApp.openById(ssId);
    const sheet  = ss.getSheetByName("VECTOR_MAP");

    const normalized = vectorName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const data       = sheet.getDataRange().getValues();
    const rowIndex   = data.findIndex(row => row[0] === normalized);

    if (rowIndex > 0) {
      // Update existing entry
      sheet.getRange(rowIndex + 1, 5).setValue(new Date().toISOString()); // Last Updated
      const currentCount = sheet.getRange(rowIndex + 1, 6).getValue() || 0;
      sheet.getRange(rowIndex + 1, 6).setValue(currentCount + 1);
    } else {
      // New entry
      const docUrl = `https://docs.google.com/document/d/${docId}`;
      sheet.appendRow([normalized, docId, docUrl, new Date().toISOString(), new Date().toISOString(), 1]);
    }
  }

  // ── UPDATE LOG INDEX WITH DOC IDs ────────────────────────────
  function _updateLogIndexDocIds(sessionId, docIds) {
    const props  = PropertiesService.getScriptProperties();
    const ssId   = props.getProperty("INDEX_SHEET_ID");
    const ss     = SpreadsheetApp.openById(ssId);
    const sheet  = ss.getSheetByName("LOG_INDEX");
    const data   = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] === sessionId) {
        sheet.getRange(i + 1, 6).setValue(docIds.join(", "));
        break;
      }
    }
  }

  // ── WRITE COUNCIL FLAGS ────────────────────────────────────────
  function _writeCouncilFlags(flags, sessionSummary, sessionId) {
    const hasFlag = flags.architect || flags.muse || flags.auditor;
    if (!hasFlag) return;

    const props    = PropertiesService.getScriptProperties();
    const folderId = props.getProperty("FOLDER_04_COUNCIL_LOGS");
    if (!folderId) return;

    const folder = DriveApp.getFolderById(folderId);
    const iter   = folder.getFilesByName("COUNCIL_INTERJECTIONS");
    if (!iter.hasNext()) return;

    const doc  = DocumentApp.openById(iter.next().getId());
    const body = doc.getBody();
    const date = new Date().toISOString().split("T")[0];

    body.appendHorizontalRule();
    body.appendParagraph(`🗓️ ${date} | Session: ${sessionId}`).setBold(true);
    body.appendParagraph(`Context: ${sessionSummary}`).setItalic(true);

    if (flags.architect) {
      body.appendParagraph("🏗️ ARCHITECT:").setBold(true);
      body.appendParagraph(flags.architect);
    }
    if (flags.muse) {
      body.appendParagraph("🎨 MUSE:").setBold(true);
      body.appendParagraph(flags.muse);
    }
    if (flags.auditor) {
      body.appendParagraph("🔍 AUDITOR:").setBold(true);
      body.appendParagraph(flags.auditor);
    }
  }

  // ── PROPOSE NEW VECTOR EMAIL ──────────────────────────────────
  function _proposeNewVector(vectorName, rationale, sessionId) {
    const userEmail = Session.getActiveUser().getEmail();
    const webAppUrl = PropertiesService.getScriptProperties().getProperty("GOVERNANCE_WEB_APP_URL")
                      || "[Set GOVERNANCE_WEB_APP_URL in Script Properties]";

    const normalized = vectorName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const approveUrl = `${webAppUrl}?action=create_vector&vectorName=${normalized}&sessionId=${sessionId}`;

    MailApp.sendEmail({
      to: userEmail,
      subject: `🗺️ RTP — New Vector Proposed: ${normalized}`,
      body: `The RTP system has detected a recurring theme that warrants a dedicated Vector Document.

PROPOSED VECTOR: VECTOR_${normalized}

RATIONALE: ${rationale || "High-frequency theme detected across recent session."}

SESSION: ${sessionId}

→ APPROVE (create VECTOR_${normalized} and begin routing): ${approveUrl}

If you approve, the system will:
1. Create a new VECTOR_${normalized} Google Doc in your Vector Repository
2. Seed it with relevant context from existing session history
3. Begin auto-routing future logs with this theme to the new doc

This email was auto-generated by the RTP Vector Router.`
    });
    Logger.log(`📧 New vector proposal email sent: ${normalized}`);
  }

  return { route };
})();
