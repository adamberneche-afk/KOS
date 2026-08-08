/**
 * ============================================================
 * RTP Genesis Module — v2.0
 * Run ONCE to scaffold the entire Active_Brain_Trust_System
 * in Google Drive. Safe to re-run: skips existing files.
 * ============================================================
 */

// ── CONFIG ────────────────────────────────────────────────────
const ROOT_FOLDER_NAME  = "Active_Brain_Trust_System";
const INDEX_SHEET_NAME  = "BRAIN_TRUST_INDEX";

const FOLDERS = [
  "[01_Canonical_Foundation]",
  "[02_Council_Alignments]",
  "[03_Dynamic_State]",
  "[04_Council_Logs]",
  "[05_Vector_Repository]"
];

// ── ENTRY POINT ───────────────────────────────────────────────
function runGenesis() {
  Logger.log("🚀 RTP Genesis starting...");

  const root    = _getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const folders = {};
  FOLDERS.forEach(name => { folders[name] = _getOrCreateFolder(root, name); });

  // 1. Canonical Foundation
  const canon = folders["[01_Canonical_Foundation]"];
  _getOrCreateDoc(canon, "CORE_THESIS",           _seedCoreThesis());
  _getOrCreateDoc(canon, "COUNCIL",               _seedCouncil());
  _getOrCreateDoc(canon, "APP_FLOW",              "# Application Flow\n\nDocument your user journeys here.");
  _getOrCreateDoc(canon, "FRONTEND_GUIDELINES",   "# Frontend Guidelines\n\nDocument UI standards here.");
  _getOrCreateDoc(canon, "BACKEND_STRUCTURE",     "# Backend Structure\n\nDocument API and DB schema here.");

  // 2. Council Alignments
  const alignments = folders["[02_Council_Alignments]"];
  _getOrCreateDoc(alignments, "PERSONA_ARCHITECT", _seedArchitect());
  _getOrCreateDoc(alignments, "PERSONA_MUSE",      _seedMuse());
  _getOrCreateDoc(alignments, "PERSONA_AUDITOR",   _seedAuditor());

  // 3. Dynamic State
  const state = folders["[03_Dynamic_State]"];
  _getOrCreateDoc(state, "CURRENT_STATE",         "# Current State\n\n## In Progress:\n\n## Next Steps:\n\n## Completed:");
  _getOrCreateDoc(state, "PIVOTS_AND_LESSONS",    "# Pivots & Lessons\n\n| Date | Mistake | Correction |\n|------|---------|------------|");

  // 4. Council Logs
  const logs = folders["[04_Council_Logs]"];
  _getOrCreateDoc(logs, "COUNCIL_INTERJECTIONS",  "# Council Interjections\n\n*Asynchronous notes from personas between live sessions.*\n\n---");

  // 5. Index Sheet
  const indexSheet = _getOrCreateSheet(root, INDEX_SHEET_NAME);
  _seedIndexSheet(indexSheet);

  // 6. Store folder IDs in Script Properties for other scripts
  _storeSystemIds(root, folders, indexSheet);

  Logger.log("✅ Genesis complete. All infrastructure is live.");
  Logger.log(`📁 Root folder: https://drive.google.com/drive/folders/${root.getId()}`);
  Logger.log(`📊 Index sheet: https://docs.google.com/spreadsheets/d/${indexSheet.getId()}`);

  // Email confirmation
  _sendGenesisReport(root, indexSheet);
}

// ── FOLDER HELPERS ────────────────────────────────────────────
function _getOrCreateFolder(parent, name) {
  const iter = parent.getFoldersByName(name);
  if (iter.hasNext()) {
    const f = iter.next();
    Logger.log(`  ↩️  Folder exists: ${name}`);
    return f;
  }
  Logger.log(`  ✅ Created folder: ${name}`);
  return parent.createFolder(name);
}

// ── DOCUMENT HELPERS ─────────────────────────────────────────
function _getOrCreateDoc(folder, name, seedContent) {
  const iter = folder.getFilesByName(name);
  if (iter.hasNext()) {
    Logger.log(`  ↩️  Doc exists: ${name}`);
    return DocumentApp.openById(iter.next().getId());
  }
  const doc  = DocumentApp.create(name);
  const file = DriveApp.getFileById(doc.getId());
  DriveApp.getRootFolder().removeFile(file);
  folder.addFile(file);
  if (seedContent) {
    doc.getBody().clear();
    doc.getBody().setText(seedContent);
  }
  Logger.log(`  ✅ Created doc: ${name}`);
  return doc;
}

// ── SPREADSHEET HELPERS ───────────────────────────────────────
function _getOrCreateSheet(folder, name) {
  const iter = folder.getFilesByName(name);
  if (iter.hasNext()) {
    Logger.log(`  ↩️  Sheet exists: ${name}`);
    return SpreadsheetApp.openById(iter.next().getId());
  }
  const ss   = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  DriveApp.getRootFolder().removeFile(file);
  folder.addFile(file);
  Logger.log(`  ✅ Created sheet: ${name}`);
  return ss;
}

function _seedIndexSheet(ss) {
  // LOG_INDEX tab
  let sheet = ss.getSheetByName("LOG_INDEX") || ss.insertSheet("LOG_INDEX");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp","Summary","Vectors_JSON","Char_Count","Session_ID","Target_Doc_IDs"]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,6).setBackground("#1a1a2e").setFontColor("#ffffff").setFontWeight("bold");
  }

  // VECTOR_MAP tab
  sheet = ss.getSheetByName("VECTOR_MAP") || ss.insertSheet("VECTOR_MAP");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Vector_Name","Doc_ID","Doc_URL","Created_Date","Last_Updated","Session_Count"]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,6).setBackground("#16213e").setFontColor("#ffffff").setFontWeight("bold");
  }

  // SYSTEM_HEALTH tab
  sheet = ss.getSheetByName("SYSTEM_HEALTH") || ss.insertSheet("SYSTEM_HEALTH");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Check_Time","Status","Health_Score","Issues"]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,4).setBackground("#0f3460").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange("F1").setValue("Health Score").setFontWeight("bold");
    sheet.getRange("G1").setValue(100);
  }

  // SYSTEM_ERRORS tab
  sheet = ss.getSheetByName("SYSTEM_ERRORS") || ss.insertSheet("SYSTEM_ERRORS");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp","Script","Error_Message","Stack"]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,4).setBackground("#450920").setFontColor("#ffffff").setFontWeight("bold");
  }

  // Remove default empty Sheet1
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getNumSheets() > 1) ss.deleteSheet(defaultSheet);
}

// ── STORE IDs IN SCRIPT PROPERTIES ────────────────────────────
function _storeSystemIds(root, folders, indexSheet) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ROOT_FOLDER_ID', root.getId());
  props.setProperty('INDEX_SHEET_ID', indexSheet.getId());
  FOLDERS.forEach(name => {
    const key = name.replace(/[\[\]]/g, '').toUpperCase().replace(/ /g, '_');
    props.setProperty(`FOLDER_${key}`, folders[name].getId());
  });
  Logger.log("  ✅ System IDs stored in Script Properties.");
}

// ── EMAIL REPORT ──────────────────────────────────────────────
function _sendGenesisReport(root, indexSheet) {
  const userEmail = Session.getActiveUser().getEmail();
  const body = `
🧠 Recursive Thought Partner — Genesis Complete

Your Active_Brain_Trust_System has been scaffolded successfully.

📁 Root Folder:
https://drive.google.com/drive/folders/${root.getId()}

📊 Brain Trust Index (your command center):
https://docs.google.com/spreadsheets/d/${indexSheet.getId()}

NEXT STEPS:
1. Add your GEMINI_API_KEY in Apps Script → Project Settings → Script Properties
2. Create your Google Form with a single "Paragraph" field for session logs
3. Link that Form to the BRAIN_TRUST_INDEX sheet
4. Set onFormSubmit trigger on Intake_Pipeline.gs → processNewLog()
5. Set hourly time trigger on Council_Simulator.gs → runCouncilSynthesis()
6. Deploy Governance_Engine.gs as a Web App

See DEPLOYMENT_GUIDE.md for full instructions.
  `;
  MailApp.sendEmail({ to: userEmail, subject: "✅ RTP Genesis Complete", body: body });
}

// ── SEED CONTENT ──────────────────────────────────────────────
function _seedCoreThesis() {
  return `CORE THESIS — Project Law (Immutable)
================================================
Last Updated: ${new Date().toDateString()}

This document defines the unchangeable pillars of this project.
Content moved here by the Governance Engine is considered stable and permanent.

PILLARS:
[Add your first pillar here after your first session]

CONSTRAINTS:
[Add non-negotiables here]

ARCHITECTURE DECISIONS:
[Add locked-in architecture decisions here]`;
}

function _seedCouncil() {
  return `COUNCIL.md — Master Configuration
================================================
Version: 2.0 | Status: Active

THE COUNCIL OF EXPERTS
This system uses three AI personas to provide 360-degree feedback.
Read PERSONA_ARCHITECT, PERSONA_MUSE, and PERSONA_AUDITOR for their rules.

INTERACTION PROTOCOLS:
1. Every session log submitted via Form is auto-processed.
2. Vector weights > 0.7 route summaries to dedicated VECTOR_[TOPIC] docs.
3. Stable insights are proposed for promotion to CORE_THESIS via email.
4. The Auditor flags contradictions. The Muse flags opportunities. The Architect flags gaps.

DATA HIERARCHY:
CORE_THESIS > CURRENT_STATE > VECTOR_DOCS > SESSION_LOGS

GOVERNANCE RHYTHM:
- Ingestion: Real-time (Form Submit)
- Council Synthesis: Hourly
- Health Audit: Every 4 hours
- Refactor Proposals: When vector weight stability threshold met`;
}

function _seedArchitect() {
  return `PERSONA_ARCHITECT.md — The Architect
================================================
Role: Structural integrity, logic, and infrastructure guardian.

BEHAVIORAL RULES:
- Focus exclusively on system architecture, data flow, and backend logic.
- Flag any proposed feature that lacks a clear data model.
- Reject scope creep that introduces technical debt without justification.
- Ask: "Where does this data live? How does it connect to existing structures?"

INTERJECTION TRIGGERS:
- Missing API endpoint for a new feature
- Undefined database schema for a new entity
- Logic gap between two system components
- Circular dependency detected

TONE: Direct, technical, no-nonsense. Uses precise language.
SAMPLE OUTPUT: "The proposed flow has no error handling for API rate limits. 
Add exponential backoff before this goes to CORE_THESIS."`;
}

function _seedMuse() {
  return `PERSONA_MUSE.md — The Muse
================================================
Role: Creative expansion, UX innovation, and opportunity identification.

BEHAVIORAL RULES:
- Look for unexplored angles and adjacent features worth exploring.
- Challenge conventional approaches with creative alternatives.
- Identify where the user experience could be more elegant or delightful.
- Ask: "What would make this 10x more useful or beautiful?"

INTERJECTION TRIGGERS:
- Repetitive pattern that could be abstracted into a reusable system
- User friction point that could be eliminated
- Unexplored market or use case adjacent to current work
- Feature that could delight users beyond their expectations

TONE: Expansive, enthusiastic, conceptual. Uses vivid analogies.
SAMPLE OUTPUT: "What if the Vector Docs auto-generated a mind-map view 
every Friday? The user could see their thinking evolve visually."`;
}

function _seedAuditor() {
  return `PERSONA_AUDITOR.md — The Auditor
================================================
Role: Conflict detection, historical alignment, and assumption challenging.

BEHAVIORAL RULES:
- Cross-reference every new proposal against PIVOTS_AND_LESSONS.
- Flag when a new decision contradicts a past decision.
- Challenge assumptions: demand evidence before accepting claims.
- Ask: "Have we tried this before? What was the outcome?"

INTERJECTION TRIGGERS:
- New proposal contradicts a logged lesson
- Assumption stated as fact without evidence
- Scope that has been explicitly rejected before
- Risk that has not been acknowledged

TONE: Skeptical, precise, evidence-driven. Never dismissive, always constructive.
SAMPLE OUTPUT: "CONFLICT DETECTED: On [date], we decided against 
real-time sync due to quota limits (see PIVOTS_AND_LESSONS, entry 3). 
This proposal reintroduces the same pattern. Justify or document the pivot."`;
}
