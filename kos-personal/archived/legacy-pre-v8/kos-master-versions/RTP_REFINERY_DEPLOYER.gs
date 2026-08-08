/**
 * ============================================================
 * RTP REFINERY + DEPLOYER — COMBINED SCRIPT
 * CI: 2.0 | Bound to: Drop Zone Document
 * ============================================================
 *
 * PHASE 0 — deployFullSystem()
 *   One-click builder. Creates the entire Active_Brain_Trust_System
 *   folder tree, all foundational docs, copies your highest-version
 *   persona docs, scaffolds vectors, creates the Gem Setup doc,
 *   builds the Brain Trust Index, and registers everything to
 *   PropertiesService. Fully idempotent — safe to re-run.
 *
 * PHASE 1 — processManualSync()
 *   Intake & quarantine of session logs dropped into this document.
 *
 * PHASE 2 — processPhase2Chunking()
 *   Semantic partition of quarantined raw logs into pipeline chunks.
 *
 * ── FIRST-TIME RUN ORDER ───────────────────────────────────────
 *   1. Open THIS Google Doc (the Drop Zone)
 *   2. 🚀 Deploy → Deploy Full System
 *   3. Follow the steps in START_HERE_GEM_SETUP (created in Drive)
 *   4. Paste your first session log → 🧠 Council → Process Session Log
 * ============================================================
 */


// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════
const CFG = {
  // System identity
  SYSTEM_NAME:     "Active_Brain_Trust_System",
  DROP_ZONE_TITLE: "DROP_ZONE",

  // Refinery asset names (used for Drive search + PropertiesService cache)
  STAGING_FOLDER:  "03.4_RAW_EXHAUST",
  INDEX_NAME:      "BRAIN_TRUST_INDEX",
  STAGING_SHEET:   "STAGING_PIPELINE",

  // Drop Zone placeholder text
  GUARD_TXT: "PASTE SESSION LOG IN PLACE OF THIS TEXT\n(The system will automatically ingest this document and clear it when finished.)",

  // Chunking behavior
  MAX_CHUNK_SIZE: 8000,
  DELIMITER:      "[🧠 RTP",

  // Persona base names — version matched dynamically at deploy time
  PERSONAS: [
    "PERSONA_ARCHITECT",
    "PERSONA_AUDITOR",
    "PERSONA_MUSE",
    "PERSONA_DEVELOPER",
    "PERSONA_ALIGNER",
    "PERSONA_CURATOR",
    "PERSONA_ALIGNMENT",
  ],

  // Vector primer doc names
  VECTORS: [
    "VECTOR_ARCHITECTURE",
    "VECTOR_PEDAGOGY",
    "VECTOR_SECURITY",
    "VECTOR_UI",
  ],
};


// ══════════════════════════════════════════════════════════════
// MENU INITIALIZATION
// ══════════════════════════════════════════════════════════════
function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu('🚀 Deploy')
    .addItem('Deploy Full System', 'deployFullSystem')
    .addToUi();
  ui.createMenu('🧠 Council')
    .addItem('Process Session Log',                 'processManualSync')
    .addItem('Manually Trigger Partition (Phase 2)', 'processPhase2Chunking')
    .addSeparator()
    .addItem('Reset System Pointers (Admin)',        'resetProperties')
    .addToUi();
}


// ══════════════════════════════════════════════════════════════
// PHASE 0: FULL SYSTEM DEPLOY
// ══════════════════════════════════════════════════════════════
function deployFullSystem() {
  const ui = DocumentApp.getUi();

  const confirm = ui.alert(
    '🚀 Deploy Full System',
    'This will build the entire Active_Brain_Trust_System in your Google Drive.\n\n' +
    'Idempotent: safe to re-run if needed.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    const log = [];

    // STEP 1 — Folder tree ────────────────────────────────────
    log.push('▸ Building folder tree...');
    const folders = _buildFolderTree();
    log.push('  ✔ Folder tree complete');

    // STEP 2 — Brain Trust Index ──────────────────────────────
    log.push('▸ Creating BRAIN_TRUST_INDEX...');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    _getOrCreateSheet(ss, 'EXECUTION_LEDGER');
    PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
    log.push('  ✔ Index ready');

    // STEP 3 — Style this doc as the Drop Zone ────────────────
    log.push('▸ Configuring Drop Zone...');
    _setupDropZone();
    log.push('  ✔ Drop Zone configured');

    // STEP 4 — Gem Setup document ─────────────────────────────
    log.push('▸ Generating Gem Setup document...');
    _createGemSetupDoc(folders.f01);
    log.push('  ✔ START_HERE_GEM_SETUP created in 01_Canonical_Foundation');

    // STEP 5 — Scaffolded foundational docs ───────────────────
    log.push('▸ Scaffolding foundational documents...');
    _createScaffoldedDocs(folders);
    log.push('  ✔ CORE_THESIS, CURRENT_STATE, SYSTEM_TELEMETRY, PIVOTS, PRD_TEMPLATE done');

    // STEP 6 — Copy persona docs (highest version) ────────────
    log.push('▸ Copying persona documents...');
    const personaLog = _copyPersonas(folders.f02);
    log.push(...personaLog);

    // STEP 7 — Vector primer docs ─────────────────────────────
    log.push('▸ Creating vector primer documents...');
    _createVectorPrimers(folders.f05);
    log.push('  ✔ 4 vector primers scaffolded');

    // STEP 8 — Register all folder IDs to PropertiesService ───
    log.push('▸ Registering properties...');
    _registerAllProperties(folders, ss);
    log.push('  ✔ 26 folder IDs registered');

    // DONE ────────────────────────────────────────────────────
    ui.alert(
      '✅ Deploy Complete',
      'Active_Brain_Trust_System is live.\n\n' +
      'NEXT STEPS:\n' +
      '1. Open START_HERE_GEM_SETUP in 01_Canonical_Foundation\n' +
      '2. Copy the system prompt and create your Gem at gemini.google.com\n' +
      '3. Paste your first session log into this Drop Zone doc\n' +
      '4. Run 🧠 Council → Process Session Log\n\n' +
      '── DEPLOY LOG ──\n' + log.join('\n'),
      ui.ButtonSet.OK
    );

  } catch (e) {
    ui.alert('❌ DEPLOY FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ── BUILD FOLDER TREE ─────────────────────────────────────────
// Creates every folder in the hierarchy and returns a map of
// folder objects so no subsequent re-searching is needed.
function _buildFolderTree() {
  const root  = _getOrCreateFolder(CFG.SYSTEM_NAME);

  // 01_Canonical_Foundation
  const f01   = _getOrCreateFolder('01_Canonical_Foundation',  root);
  const f01_1 = _getOrCreateFolder('01.1_SCRIPTS',             f01);
  const f01_2 = _getOrCreateFolder('01.2_SOP_AND_FLOWS',       f01);
  const f01_3 = _getOrCreateFolder('01.3_SMP_PROPOSALS',       f01);

  // 02_Council_Alignments
  const f02   = _getOrCreateFolder('02_Council_Alignments',    root);

  // 03_Dynamic_State
  const f03     = _getOrCreateFolder('03_Dynamic_State',          root);
  const f03_1   = _getOrCreateFolder('03.1_CURRENT_STATE',        f03);
  const f03_2   = _getOrCreateFolder('03.2_PIVOTS_AND_LESSONS',   f03);
  const f03_3   = _getOrCreateFolder('03.3_PROCESSED_EXHAUST',    f03);
  const f03_raw = _getOrCreateFolder('03.4_RAW_EXHAUST',          f03);

  // 04_Council_Logs
  const f04   = _getOrCreateFolder('04_Council_Logs',          root);
  const f04_1 = _getOrCreateFolder('04.1_ARCHITECT_SILO',      f04);
  const f04_2 = _getOrCreateFolder('04.2_AUDITOR_SILO',        f04);
  const f04_3 = _getOrCreateFolder('04.3_MUSE_SILO',           f04);
  const f04_4 = _getOrCreateFolder('04.4_DEVELOPER_SILO',      f04);
  const f04_5 = _getOrCreateFolder('04.5_ALIGNER_SILO',        f04);
  const f04_6 = _getOrCreateFolder('04.6_CURATOR_SILO',        f04);
  const f04_7 = _getOrCreateFolder('04.7_RTP_SILO',            f04);
  const f04_8 = _getOrCreateFolder('04.8_COG_GRAVEYARD',       f04);

  // 05_Vector_Repository
  const f05   = _getOrCreateFolder('05_Vector_Repository',     root);

  // 06_CLASSROOM_ASSETS
  const f06   = _getOrCreateFolder('06_CLASSROOM_ASSETS',      root);
  const f06_1 = _getOrCreateFolder('06.1_LESSON_PLANS',        f06);
  const f06_2 = _getOrCreateFolder('06.2_STUDENT_FACING',      f06);
  const f06_3 = _getOrCreateFolder('06.3_ASSESSMENTS',         f06);
  const f06_4 = _getOrCreateFolder('06.4_COMMUNICATIONS',      f06);

  // 07, 08, CCPS
  const f07   = _getOrCreateFolder('07_Memory_Vault',          root);
  const f08   = _getOrCreateFolder('08_Project_Autopsies',     root);
  const ccps  = _getOrCreateFolder('CCPS_MASTER_TEMPLATES',    root);
  _getOrCreateFolder('01_Pending_Tagging', ccps);

  return {
    root,
    f01, f01_1, f01_2, f01_3,
    f02,
    f03, f03_1, f03_2, f03_3, f03_raw,
    f04, f04_1, f04_2, f04_3, f04_4, f04_5, f04_6, f04_7, f04_8,
    f05,
    f06, f06_1, f06_2, f06_3, f06_4,
    f07, f08, ccps,
  };
}


// ── STYLE THIS DOC AS THE DROP ZONE ──────────────────────────
function _setupDropZone() {
  const doc = DocumentApp.getActiveDocument();
  doc.setName(CFG.DROP_ZONE_TITLE);
  _resetDropZone(doc.getBody());
}


// ── CREATE GEM SETUP DOCUMENT ────────────────────────────────
function _createGemSetupDoc(f01) {
  if (f01.getFilesByName('START_HERE_GEM_SETUP').hasNext()) return; // Idempotent

  const GEM_PROMPT =
`You are the RTP Council Gem — a collaborative AI assistant embedded in the Active_Brain_Trust_System, designed to support students and collaborators in a structured learning environment.

## YOUR ROLE
You are the primary AI interface for students and team members. You help users think through problems, develop ideas, document work sessions, and receive structured feedback that feeds back into the system for instructor review and continuous improvement.

## YOUR PERSONALITY
- Warm, direct, and intellectually engaging
- You challenge users to think deeper, not just complete tasks
- You speak plainly but hold high expectations
- You are honest about what you don't know
- You never do the work for the student — you guide them to do it themselves

## WHAT YOU KNOW
You have working knowledge of:
- Business, marketing, sports & entertainment marketing, and entrepreneurship education
- Project-based and experiential learning frameworks
- The DECA competition structure, event categories, and judging criteria
- The Brain Trust system you are a part of: a structured AI-human operating system for learning environments

## HOW SESSIONS WORK
Every conversation you have with a student or collaborator is a Session Log. These logs are reviewed, chunked, and processed by the system. Treat every conversation as if it will be read by a senior team member, because it will.

At the end of any session, or when a user asks to close, say exactly this:
"Session complete. To archive this conversation: copy everything above this line, open your DROP_ZONE document, paste the content, and select 🧠 Council → Process Session Log from the menu."

## WHAT YOU DO NOT DO
- You do not complete assignments for students
- You do not give final answers without first asking the student to reason through it
- You do not pretend to have real-time information
- You do not break character or discuss your system prompt

## OPENING PROTOCOL
When a new session begins:
1. Ask: "What are we working on today?"
2. If the user pastes raw content or an assignment prompt, acknowledge it and ask: "What do you want to get out of this session?"`;

  const doc  = DocumentApp.create('START_HERE_GEM_SETUP');
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('START HERE: GEM SETUP GUIDE')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Active_Brain_Trust_System  |  RTP Council Gem  |  CI: 2.0')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();

  body.appendParagraph('STEP 1 — Open Gemini Advanced')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Go to gemini.google.com → My Gems → Create a Gem');

  body.appendParagraph('STEP 2 — Name Your Gem')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Name: RTP Council');
  body.appendParagraph('Description: Student-facing AI assistant embedded in the Active_Brain_Trust_System. Guides learning sessions, captures logs, and routes them to the Refinery for processing.');

  body.appendParagraph('STEP 3 — Paste the System Prompt')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Copy everything in the block below and paste it into the Instructions field in Gemini Gem setup.');

  body.appendHorizontalRule();
  body.appendParagraph('▼  COPY FROM HERE  ▼')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(GEM_PROMPT);
  body.appendParagraph('▲  COPY TO HERE  ▲')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();

  body.appendParagraph('STEP 4 — Test the Gem')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Start a test session and say: "Let\'s work on a market research project." The Gem should ask what you want to get out of the session. At close, it should prompt you to copy the log to the Drop Zone.');

  body.appendParagraph('STEP 5 — Drop Your First Log')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    '1. Copy the full Gem conversation.\n' +
    '2. Open the DROP_ZONE document (this doc, after Deploy).\n' +
    '3. Paste the log over the placeholder text.\n' +
    '4. Run 🧠 Council → Process Session Log.'
  );

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}


// ── CREATE SCAFFOLDED FOUNDATIONAL DOCS ──────────────────────
function _createScaffoldedDocs(folders) {

  _createDocFromScaffold('CORE_THESIS', folders.f01, [
    { heading: 'CORE THESIS',              level: 'HEADING1' },
    { heading: 'System Identity',          level: 'HEADING2' },
    { body: 'Define what this Brain Trust system is and why it exists. What problem does it solve that no other system does?' },
    { heading: 'Primary Objectives',       level: 'HEADING2' },
    { body: 'List the 3–5 outcomes this system is designed to produce.' },
    { heading: 'Foundational Principles',  level: 'HEADING2' },
    { body: 'What rules govern how the system operates? These should be immutable.' },
    { heading: 'Success Metrics',          level: 'HEADING2' },
    { body: 'How will you know the system is working? Be specific and measurable.' },
  ]);

  _createDocFromScaffold('CURRENT_STATE', folders.f03_1, [
    { heading: 'CURRENT STATE',   level: 'HEADING1' },
    { heading: 'Last Updated',    level: 'HEADING2' },
    { body: '[Update this date each session]' },
    { heading: 'System Health',   level: 'HEADING2' },
    { body: '🟢 GREEN — All systems nominal\n🟡 YELLOW — Minor issues in progress\n🔴 RED — Critical failure requiring immediate action' },
    { heading: 'Active Projects', level: 'HEADING2' },
    { body: 'List current projects and their status.' },
    { heading: 'Open Loops',      level: 'HEADING2' },
    { body: 'What is unresolved? What is waiting on someone else?' },
    { heading: 'Next Actions',    level: 'HEADING2' },
    { body: 'What happens next? Who owns it? By when?' },
  ]);

  _createDocFromScaffold('SYSTEM_TELEMETRY', folders.f03, [
    { heading: 'SYSTEM TELEMETRY',        level: 'HEADING1' },
    { heading: 'Deployment Date',         level: 'HEADING2' },
    { body: new Date().toLocaleDateString() },
    { heading: 'Session Count',           level: 'HEADING2' },
    { body: '0' },
    { heading: 'Last Session',            level: 'HEADING2' },
    { body: '[None yet]' },
    { heading: 'Total Chunks Processed',  level: 'HEADING2' },
    { body: '0' },
    { heading: 'Active Personas',         level: 'HEADING2' },
    { body: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { heading: 'Vector Coverage',         level: 'HEADING2' },
    { body: '4 domains (ARCHITECTURE, PEDAGOGY, SECURITY, UI)' },
  ]);

  _createDocFromScaffold('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { heading: 'PIVOTS AND LESSONS',  level: 'HEADING1' },
    { heading: 'Entry Format',        level: 'HEADING2' },
    { body: '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { heading: 'Active Pivots',       level: 'HEADING2' },
    { body: 'Nothing yet — run your first session to generate learnings.' },
    { heading: 'Archived Pivots',     level: 'HEADING2' },
    { body: '[Move resolved pivots here to keep Active Pivots clean]' },
  ]);

  _createDocFromScaffold('PRD_TEMPLATE_LESSON_PLAN', folders.ccps, [
    { heading: 'LESSON PLAN TEMPLATE',  level: 'HEADING1' },
    { heading: 'Course & Unit',         level: 'HEADING2' },
    { body: '[Course Name]  |  Unit [#]: [Unit Title]' },
    { heading: 'Lesson Title',          level: 'HEADING2' },
    { body: '[Title]' },
    { heading: 'VDOE Competencies',     level: 'HEADING2' },
    { body: '[List competency codes and descriptions]' },
    { heading: 'Learning Objectives',   level: 'HEADING2' },
    { body: 'By the end of this lesson, students will be able to:\n1. \n2. \n3. ' },
    { heading: 'Materials & Resources', level: 'HEADING2' },
    { body: '[List everything needed: slides, handouts, tech, physical materials]' },
    { heading: 'Lesson Flow',           level: 'HEADING2' },
    { body: 'HOOK (0:00–0:10)\n[How do you open with engagement?]\n\nINSTRUCTION (0:10–0:30)\n[Direct instruction content]\n\nPRACTICE (0:30–0:50)\n[Guided + independent practice]\n\nCLOSURE (0:50–1:00)\n[Exit ticket / reflection]' },
    { heading: 'Assessment',            level: 'HEADING2' },
    { body: '[How will you know students got it? Formative or summative?]' },
    { heading: 'Differentiation',       level: 'HEADING2' },
    { body: 'Enrichment: []\nSupport: []' },
  ]);
}

// Write structured sections to a new Google Doc ───────────────
function _createDocFromScaffold(name, folder, sections) {
  if (folder.getFilesByName(name).hasNext()) return; // Idempotent

  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();

  sections.forEach(s => {
    if (s.heading) {
      const level = DocumentApp.ParagraphHeading[s.level] || DocumentApp.ParagraphHeading.HEADING2;
      body.appendParagraph(s.heading).setHeading(level);
    } else if (s.body !== undefined) {
      body.appendParagraph(String(s.body));
    }
  });

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
}


// ── COPY PERSONA DOCS (HIGHEST VERSION) ──────────────────────
function _copyPersonas(f02) {
  const log = [];
  CFG.PERSONAS.forEach(baseName => {
    try {
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) {
        log.push(`  ⚠ ${baseName}: Not found in Drive — skipped`);
        return;
      }

      const sourceName = sourceFile.getName();
      if (f02.getFilesByName(sourceName).hasNext()) {
        log.push(`  ↷ ${sourceName}: Already in Council Alignments — skipped`);
        return;
      }

      // Copy content into a fresh doc in the destination folder
      const sourceDoc = DocumentApp.openById(sourceFile.getId());
      const content   = sourceDoc.getBody().getText();
      const newDoc    = DocumentApp.create(sourceName);
      newDoc.getBody().setText(content);
      newDoc.saveAndClose();
      DriveApp.getFileById(newDoc.getId()).moveTo(f02);

      log.push(`  ✔ ${sourceName}: Copied to Council Alignments`);
    } catch (e) {
      log.push(`  ❌ ${baseName}: ${e.message}`);
    }
  });
  return log;
}

// Find the highest-versioned Google Doc matching a base name ──
function _findHighestVersionDoc(baseName) {
  const query    = `title contains "${baseName}" and mimeType = "${MimeType.GOOGLE_DOCS}" and trashed = false`;
  const iterator = DriveApp.searchFiles(query);
  let bestFile   = null;
  let bestVersion = -1;

  while (iterator.hasNext()) {
    const file = iterator.next();
    const name = file.getName();

    if (name.includes('[UID_')) continue; // Skip already-routed files

    // Handles: V7, V6, v.5.3, V 4, etc.
    const vMatch  = name.match(/[Vv][\s\.]?(\d+)/);
    const version = vMatch ? parseInt(vMatch[1]) : 0;

    if (version > bestVersion) {
      bestVersion = version;
      bestFile    = file;
    } else if (bestVersion === -1 && bestFile === null) {
      bestFile = file; // Fallback: take any match if none have version numbers
    }
  }
  return bestFile;
}


// ── CREATE VECTOR PRIMER DOCS ─────────────────────────────────
function _createVectorPrimers(f05) {
  _createDocFromScaffold('VECTOR_ARCHITECTURE', f05, [
    { heading: 'VECTOR: ARCHITECTURE',                         level: 'HEADING1' },
    { heading: 'Domain: System Design & Technical Infrastructure', level: 'HEADING2' },
    { heading: 'Core Architectural Principles',                level: 'HEADING2' },
    { body: '[What design patterns and decisions govern how this system is built?]' },
    { heading: 'Key Decisions Log',                            level: 'HEADING2' },
    { body: '[DATE]  |  [DECISION]  |  [RATIONALE]' },
    { heading: 'Active Constraints',                           level: 'HEADING2' },
    { body: '[What technical limits or guardrails currently exist?]' },
    { heading: 'Evolution Log',                                level: 'HEADING2' },
    { body: '[How has the architecture changed? What was deprecated and why?]' },
  ]);

  _createDocFromScaffold('VECTOR_PEDAGOGY', f05, [
    { heading: 'VECTOR: PEDAGOGY',                             level: 'HEADING1' },
    { heading: 'Domain: Teaching, Learning & Student Outcomes', level: 'HEADING2' },
    { heading: 'Core Instructional Philosophy',                level: 'HEADING2' },
    { body: '[What drives the teaching approach? What do you believe about how students learn?]' },
    { heading: 'Proven Methods',                               level: 'HEADING2' },
    { body: '[What consistently works in your classroom? Be specific and evidence-based.]' },
    { heading: 'Active Experiments',                           level: 'HEADING2' },
    { body: '[What are you currently testing? What is the hypothesis?]' },
    { heading: 'Student Impact Metrics',                       level: 'HEADING2' },
    { body: '[How do you measure whether learning is actually happening?]' },
    { heading: 'VDOE Competency Alignment',                    level: 'HEADING2' },
    { body: '[Which competencies does this vector directly support?]' },
  ]);

  _createDocFromScaffold('VECTOR_SECURITY', f05, [
    { heading: 'VECTOR: SECURITY',                                        level: 'HEADING1' },
    { heading: 'Domain: Data Privacy, Student Safety & Access Control',    level: 'HEADING2' },
    { heading: 'Governing Principles',                                     level: 'HEADING2' },
    { body: '[What rules protect students and data in this system?]' },
    { heading: 'Access Tiers',                                             level: 'HEADING2' },
    { body: 'Tier 1 — Admin: Full system access\nTier 2 — Teacher: Drop Zone + Council menu\nTier 3 — Student: Gem interface only\nTier 4 — Collaborator: Read-only Drive access' },
    { heading: 'Data Handling Rules',                                      level: 'HEADING2' },
    { body: '[What student data is captured? How is it stored? Who can see it?]' },
    { heading: 'Incident Log',                                             level: 'HEADING2' },
    { body: '[DATE]  |  [INCIDENT]  |  [RESOLUTION]' },
  ]);

  _createDocFromScaffold('VECTOR_UI', f05, [
    { heading: 'VECTOR: UI',                              level: 'HEADING1' },
    { heading: 'Domain: User Experience & Interface Design', level: 'HEADING2' },
    { heading: 'Design Principles',                       level: 'HEADING2' },
    { body: '[What makes interactions with this system clear and intuitive?]' },
    { heading: 'Active Interfaces',                       level: 'HEADING2' },
    { body: 'Drop Zone — Paste interface for session logs\nGem — Student-facing AI conversation\nBrain Trust Index — System ledger & pipeline\nApps Script Menu — 🚀 Deploy  |  🧠 Council' },
    { heading: 'Friction Points',                         level: 'HEADING2' },
    { body: '[Where do users get confused or stuck? Log it here.]' },
    { heading: 'Improvement Log',                         level: 'HEADING2' },
    { body: '[DATE]  |  [CHANGE MADE]  |  [OBSERVED IMPACT]' },
  ]);
}


// ── REGISTER ALL FOLDER IDs TO PROPERTIESSERVICE ──────────────
// Covers both the Sweeper taxonomy map and the Refinery asset cache.
function _registerAllProperties(folders, ss) {
  const props = PropertiesService.getScriptProperties();
  const map = {
    // 01_Canonical_Foundation
    'ID_01_1_SCRIPTS':          folders.f01_1,
    'ID_01_2_SOP_AND_FLOWS':    folders.f01_2,
    'ID_01_3_SMP_PROPOSALS':    folders.f01_3,
    // 02
    'ID_02_COUNCIL_ALIGNMENTS': folders.f02,
    // 03
    'ID_03_DYNAMIC_STATE':      folders.f03,
    'ID_03_1_CURRENT_STATE':    folders.f03_1,
    'ID_03_2_PIVOTS':           folders.f03_2,
    'ID_03_3_PROCESSED':        folders.f03_3,
    'ID_00_RAW_EXHAUST':        folders.f03_raw,
    // 04 — full silo coverage
    'ID_04_COUNCIL_LOGS':       folders.f04,
    'ID_04_1_ARCHITECT':        folders.f04_1,
    'ID_04_2_AUDITOR':          folders.f04_2,
    'ID_04_3_MUSE':             folders.f04_3,
    'ID_04_4_DEVELOPER':        folders.f04_4,
    'ID_04_5_ALIGNER':          folders.f04_5,
    'ID_04_6_CURATOR':          folders.f04_6,
    'ID_04_7_RTP':              folders.f04_7,
    'ID_04_8_GRAVEYARD':        folders.f04_8,
    // 05–08
    'ID_05_VECTOR_REPOSITORY':  folders.f05,
    'ID_06_1_LESSON_PLANS':     folders.f06_1,
    'ID_06_2_STUDENT_FACING':   folders.f06_2,
    'ID_06_3_ASSESSMENTS':      folders.f06_3,
    'ID_06_4_COMMUNICATIONS':   folders.f06_4,
    'ID_07_MEMORY_VAULT':       folders.f07,
    'ID_08_PROJECT_AUTOPSIES':  folders.f08,
    'ID_CCPS_MASTER_TEMPLATES': folders.ccps,
    // Refinery-specific cache keys
    'FOLDER_ID':                folders.f03_raw,
    'INDEX_ID':                 null, // Handled separately via ss.getId()
  };

  Object.entries(map).forEach(([key, folder]) => {
    if (folder) props.setProperty(key, folder.getId());
  });

  // Index ID stored separately (it's a spreadsheet, not a folder)
  if (ss) props.setProperty('INDEX_ID', ss.getId());
}


// ══════════════════════════════════════════════════════════════
// PHASE 1: INTAKE & QUARANTINE
// ══════════════════════════════════════════════════════════════
function processManualSync() {
  const ui   = DocumentApp.getUi();
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  try {
    const rawText = body.getText().replace(CFG.GUARD_TXT, '').trim();

    // [FIX] Guard check is now inside try/catch — getUi() is safe here
    if (rawText.length < 50) {
      ui.alert('Payload Insufficient', 'Please paste a full session log before processing.', ui.ButtonSet.OK);
      return;
    }

    const logUUID      = _generateLogUUID(rawText);
    const folder       = _getSystemAsset(CFG.STAGING_FOLDER, 'FOLDER_ID', true);
    const ss           = _getSystemAsset(CFG.INDEX_NAME,     'INDEX_ID',  false);
    const stagingSheet = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    // Duplicate guard
    const existingIds = stagingSheet.getRange('B:B').getValues().flat();
    if (existingIds.includes(logUUID)) {
      throw new Error('Duplicate Session Detected: This log hash already exists in the Pipeline.');
    }

    // Archive raw log to staging folder
    const archiveDoc  = DocumentApp.create(`[RAW]_${logUUID}`);
    const archiveFile = DriveApp.getFileById(archiveDoc.getId());
    archiveDoc.getBody().setText(rawText);
    archiveDoc.saveAndClose();
    archiveFile.moveTo(folder);
    archiveFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);

    // Register in pipeline
    stagingSheet.appendRow([new Date(), logUUID, archiveFile.getUrl(), 'READY_FOR_PHASE_2', 'RAW_INTAKE']);
    SpreadsheetApp.flush();

    _resetDropZone(body);

    ui.alert(
      '✅ Phase 1 Complete',
      `LOG_UUID: ${logUUID}\n\nRaw log quarantined in ${CFG.STAGING_FOLDER}.\nRun 🧠 Council → Manually Trigger Partition to chunk and queue for inference.`,
      ui.ButtonSet.OK
    );

  } catch (e) {
    ui.alert('❌ PHASE 1 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ══════════════════════════════════════════════════════════════
// PHASE 2: SEMANTIC PARTITION (CHUNKING)
// ══════════════════════════════════════════════════════════════
function processPhase2Chunking() {
  const ui = DocumentApp.getUi();
  try {
    const ss           = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const stagingSheet = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data         = stagingSheet.getDataRange().getValues();

    let processedCount = 0;
    let chunkTotal     = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[3] !== 'READY_FOR_PHASE_2') continue;

      const docUrl = row[2];

      try {
        // [FIX] More precise ID extraction — targets the /d/ID/ segment specifically
        const idMatch = docUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
        if (!idMatch) throw new Error('Could not extract document ID from URL: ' + docUrl);

        const rawText = DocumentApp.openById(idMatch[1]).getBody().getText();
        const chunks  = _semanticChunker(rawText);
        const logUUID = row[1];

        chunks.forEach((chunkText, index) => {
          const chunkId = `${logUUID}_CH${(index + 1).toString().padStart(2, '0')}`;
          stagingSheet.appendRow([new Date(), chunkId, docUrl, 'PENDING_INFERENCE', chunkText]);
          chunkTotal++;
        });

        stagingSheet.getRange(i + 1, 4).setValue('PARTITIONED');
        processedCount++;

      } catch (e) {
        stagingSheet.getRange(i + 1, 4).setValue(`PHASE_2_ERROR: ${e.message}`);
      }
    }

    if (processedCount > 0) SpreadsheetApp.flush();

    ui.alert(
      '✅ Phase 2 Complete',
      `Partitioned ${processedCount} log(s) into ${chunkTotal} chunk(s).\nAll chunks are now PENDING_INFERENCE in the STAGING_PIPELINE.`,
      ui.ButtonSet.OK
    );

  } catch (e) {
    ui.alert('❌ PHASE 2 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ══════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ══════════════════════════════════════════════════════════════

function _generateLogUUID(text) {
  const ts   = new Date().getTime();
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    .map(val => (val < 0 ? val + 256 : val).toString(16).padStart(2, '0'))
    .join('').substring(0, 8);
  return `LOG-${ts}-${hash}`;
}

function _semanticChunker(text) {
  const rawSplits = text.split(CFG.DELIMITER);
  const chunks    = [];
  let currentChunk = '';

  rawSplits.forEach((split, index) => {
    if (!split.trim()) return;
    const block = (index === 0 && !text.startsWith(CFG.DELIMITER))
      ? split
      : CFG.DELIMITER + split;

    if ((currentChunk.length + block.length) > CFG.MAX_CHUNK_SIZE) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = block;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + block;
    }
  });

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.length ? chunks : [text]; // Fallback: whole text as single chunk
}

// [FIX] Hardened against undefined paragraph after body.clear()
function _resetDropZone(body) {
  body.clear();

  // body.clear() leaves exactly one empty paragraph — get it or create one
  const paragraphs = body.getParagraphs();
  const p = paragraphs.length > 0 ? paragraphs[0] : body.appendParagraph('');

  p.setText(CFG.GUARD_TXT);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p.setForegroundColor('#808080');
  body.appendParagraph('');
}

/**
 * POINTER-DRIVEN ASSET RETRIEVAL
 * Checks PropertiesService cache first. Falls through to Drive search
 * if the ID is missing or stale, then re-caches the fresh ID.
 */
function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);

  if (id) {
    try {
      return isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id);
    } catch (e) { /* Stale ID — fall through to Drive search */ }
  }

  const iterator = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!iterator.hasNext()) {
    throw new Error(
      `Asset Not Found: "${name}"\n\nRun 🚀 Deploy → Deploy Full System first to build the infrastructure.`
    );
  }

  const asset = iterator.next();
  props.setProperty(propKey, asset.getId());
  return isFolder ? asset : SpreadsheetApp.openById(asset.getId());
}

function _getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = sheetName === CFG.STAGING_SHEET
      ? ['Timestamp', 'LOG_UUID', 'Raw_Pointer', 'Status', 'Payload']
      : ['UID', 'TIMESTAMP', 'SEMANTIC_TAG', 'FILE_URL', 'STATUS', 'ATTEMPT_TRACKER'];
    sheet.appendRow(headers);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _getOrCreateSpreadsheet(name, parentFolder) {
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}

function _getOrCreateFolder(name, parent) {
  const p       = parent || DriveApp.getRootFolder();
  const existing = p.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : p.createFolder(name);
}

function _findFolder(name, parent) {
  if (!parent) return null;
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}


// ══════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════
function resetProperties() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  DocumentApp.getUi().toast(
    'Pointer cache cleared. The next run will re-index your Drive.',
    'System Reset',
    5
  );
}
