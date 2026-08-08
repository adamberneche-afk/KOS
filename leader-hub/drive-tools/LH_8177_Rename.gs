/**
 * LeaderHub — 8177 Individual Doc Rename Script
 * ================================================
 * Renames the 28 existing 8177 lesson plan docs to match the
 * naming convention: [COURSE] | [QUARTER] | [TYPE] | [Title]
 *
 * Example: "The Business of the Game" → "8177 | Q1 | TEACH | The Business of the Game"
 *
 * SETUP:
 *   1. Open script.google.com → New project → paste this file
 *   2. Set SEARCH_FOLDER_ID to the Drive folder containing your 8177 docs
 *      (or leave as '' to search all of My Drive — slower but works)
 *   3. Run previewRenames() first — shows what would be renamed, creates NOTHING
 *   4. If preview looks correct, change DRY_RUN to false and run executeRenames()
 *
 * HOW IT FINDS YOUR DOCS:
 *   The script searches by lesson title within the specified folder.
 *   It looks for files whose name contains each lesson title (case-insensitive).
 *   If it finds more than one match for a title, it logs a warning and skips that file.
 *   If it finds zero matches, it logs a "NOT FOUND" warning.
 *
 * IMPORTANT — lp_8177_05 "The Millionaire's Strike":
 *   This lesson exists in LESSON_PLANS but has no Drive doc yet.
 *   It is intentionally excluded from this rename script.
 *   Create a new doc for it manually, then add it to the manifest.
 *
 * AFTER RUNNING:
 *   Docs are renamed in place. Their IDs do NOT change.
 *   The doc IDs in student-leader-hub.html (LESSON_PLANS array) remain valid.
 *   No app update is needed after renaming — only the Drive display name changes.
 */

// ============================================================
// ⚠️  REQUIRED CONFIGURATION
// ============================================================

/**
 * The Drive folder containing your 8177 lesson plan docs.
 * Set this to the folder ID (from the URL) to limit search scope.
 * Leave as '' to search all of My Drive (works but slower).
 */
const SEARCH_FOLDER_ID = '';

/**
 * Set to true for preview mode — no files are modified.
 * Always run preview first.
 */
const DRY_RUN = true;

// ============================================================
// 8177 LESSON MANIFEST
// 28 docs (lp_8177_05 excluded — no doc exists for it)
// TYPE is per naming convention (LH_01_NAMING_CONVENTIONS.md)
// ============================================================

const LESSONS_8177 = [

  // ── Q1 · The Business of Sports & Entertainment ──────────────
  { id: 'lp_8177_01', quarter: 'Q1', type: 'TEACH',   title: 'The Business of the Game'                 },
  { id: 'lp_8177_02', quarter: 'Q1', type: 'DUE',     title: 'The Brand Board'                          },
  { id: 'lp_8177_03', quarter: 'Q1', type: 'DUE',     title: 'The 4 Ps of the Fan Experience'           },
  { id: 'lp_8177_04', quarter: 'Q1', type: 'TEACH',   title: 'The Battle for the Entertainment Dollar'  },
  // lp_8177_05 The Millionaire's Strike — NO DOC, intentionally skipped

  // ── Q2 · Operations, Revenue & the Fan Experience ────────────
  { id: 'lp_8177_06', quarter: 'Q2', type: 'DUE',     title: 'Promotional Flyer Design'                 },
  { id: 'lp_8177_07', quarter: 'Q2', type: 'DUE',     title: 'The Hype Machine'                         },
  { id: 'lp_8177_08', quarter: 'Q2', type: 'DUE',     title: 'School Store Planogram'                   },
  { id: 'lp_8177_09', quarter: 'Q2', type: 'DUE',     title: 'CHHS School Store Company Description'    },
  { id: 'lp_8177_10', quarter: 'Q2', type: 'PRESENT', title: 'The Product Pitch & Financial Analysis'   },
  { id: 'lp_8177_11', quarter: 'Q2', type: 'TEACH',   title: 'The Economics of the Arena'               },
  { id: 'lp_8177_12', quarter: 'Q2', type: 'TEACH',   title: 'The Front Lines'                          },
  { id: 'lp_8177_13', quarter: 'Q2', type: 'TEACH',   title: 'The Franchise Evolution'                  },
  { id: 'lp_8177_14', quarter: 'Q2', type: 'DUE',     title: 'Employee Handbook & Venue Operations'     },
  { id: 'lp_8177_15', quarter: 'Q2', type: 'TEACH',   title: 'The NIL Deal'                             },

  // ── Q3 · Research, Events & Sales Strategy ───────────────────
  { id: 'lp_8177_16', quarter: 'Q3', type: 'DUE',     title: 'Market Research & Survey Design'          },
  { id: 'lp_8177_17', quarter: 'Q3', type: 'TEACH',   title: 'Survey Deployment & Statistical Significance' },
  { id: 'lp_8177_18', quarter: 'Q3', type: 'DUE',     title: 'Survey Results Analysis'                  },
  { id: 'lp_8177_19', quarter: 'Q3', type: 'TEACH',   title: 'The Back Room'                            },
  { id: 'lp_8177_20', quarter: 'Q3', type: 'DUE',     title: 'The Richmond Festival Blueprint'          },
  { id: 'lp_8177_21', quarter: 'Q3', type: 'TEACH',   title: 'Secure the Perimeter'                     },
  { id: 'lp_8177_22', quarter: 'Q3', type: 'DUE',     title: 'The Sponsorship Negotiation'              },
  { id: 'lp_8177_23', quarter: 'Q3', type: 'DUE',     title: 'Tournament Sponsorship Proposal'          },
  { id: 'lp_8177_24', quarter: 'Q3', type: 'TEACH',   title: 'The Ticket Office'                        },
  { id: 'lp_8177_25', quarter: 'Q3', type: 'DUE',     title: 'The Bottom Line'                          },

  // ── Q4 · Global Expansion & Career Readiness ─────────────────
  { id: 'lp_8177_26', quarter: 'Q4', type: 'TEACH',   title: 'The Stadium Economy'                      },
  { id: 'lp_8177_27', quarter: 'Q4', type: 'TEACH',   title: 'The Global Expansion'                     },
  { id: 'lp_8177_28', quarter: 'Q4', type: 'DUE',     title: '"What is Branding?" Reflection Essay'     },
  { id: 'lp_8177_29', quarter: 'Q4', type: 'ASSESS',  title: 'The Final Whistle'                        },

];

// ============================================================
// PREVIEW
// ============================================================

/**
 * Preview all renames. Creates nothing. Run this first.
 * Check: does every lesson have exactly one matching doc?
 */
function previewRenames() {
  Logger.log('=== 8177 DOC RENAME — PREVIEW ===');
  Logger.log('DRY_RUN: ' + DRY_RUN);
  Logger.log('SEARCH_FOLDER_ID: ' + (SEARCH_FOLDER_ID || '(all of My Drive)'));
  Logger.log('Total lessons to rename: ' + LESSONS_8177.length);
  Logger.log('');

  let found = 0, ambiguous = 0, missing = 0;

  LESSONS_8177.forEach(lesson => {
    const newName = buildDocTitle('8177', lesson.quarter, lesson.type, lesson.title);
    const matches = findDocsByTitle(lesson.title);

    if (matches.length === 0) {
      Logger.log('❌ NOT FOUND: "' + lesson.title + '"');
      Logger.log('   Expected new name: "' + newName + '"');
      Logger.log('   → Check that the doc exists and is in the search folder');
      missing++;
    } else if (matches.length > 1) {
      Logger.log('⚠️  AMBIGUOUS: "' + lesson.title + '" — ' + matches.length + ' files match:');
      matches.forEach(f => Logger.log('   • ' + f.getId() + ' — "' + f.getName() + '"'));
      Logger.log('   → Delete or rename duplicates before running executeRenames()');
      ambiguous++;
    } else {
      const current = matches[0].getName();
      if (current === newName) {
        Logger.log('✓  ALREADY CORRECT: "' + newName + '"');
      } else {
        Logger.log('✅ RENAME: "' + current + '"');
        Logger.log('       → "' + newName + '"');
      }
      found++;
    }
  });

  Logger.log('');
  Logger.log('── Summary ──────────────────────────');
  Logger.log('Found (1 match):    ' + found);
  Logger.log('Ambiguous (>1):     ' + ambiguous);
  Logger.log('Not found (0):      ' + missing);
  Logger.log('');
  if (ambiguous > 0 || missing > 0) {
    Logger.log('⚠️  Resolve warnings above before running executeRenames().');
  } else {
    Logger.log('✅ All clear — set DRY_RUN=false and run executeRenames().');
  }
}

// ============================================================
// EXECUTE
// ============================================================

/**
 * Execute all renames. Only run after previewRenames() shows all clear.
 * Set DRY_RUN = false before calling this.
 */
function executeRenames() {
  if (DRY_RUN) {
    Logger.log('DRY_RUN is true — set it to false to execute renames.');
    return;
  }

  Logger.log('=== 8177 DOC RENAME — EXECUTING ===');
  Logger.log('Started: ' + new Date().toISOString());
  Logger.log('');

  let renamed = 0, skipped = 0, errors = 0;

  LESSONS_8177.forEach(lesson => {
    const newName = buildDocTitle('8177', lesson.quarter, lesson.type, lesson.title);
    const matches = findDocsByTitle(lesson.title);

    if (matches.length === 0) {
      Logger.log('❌ ' + lesson.id + ' — NOT FOUND: "' + lesson.title + '"');
      errors++;
      return;
    }

    if (matches.length > 1) {
      Logger.log('⚠️  ' + lesson.id + ' — AMBIGUOUS (' + matches.length + ' matches): "' + lesson.title + '" — skipped');
      skipped++;
      return;
    }

    const file = matches[0];
    const currentName = file.getName();

    if (currentName === newName) {
      Logger.log('✓  ' + lesson.id + ' — already correct: "' + newName + '"');
      skipped++;
      return;
    }

    try {
      file.setName(newName);
      Logger.log('✅ ' + lesson.id + ' — renamed:');
      Logger.log('   "' + currentName + '"');
      Logger.log('   → "' + newName + '"');
      renamed++;
    } catch(e) {
      Logger.log('❌ ' + lesson.id + ' — rename failed: ' + e.message);
      errors++;
    }
  });

  Logger.log('');
  Logger.log('── Complete ─────────────────────────');
  Logger.log('Renamed:  ' + renamed);
  Logger.log('Skipped:  ' + skipped);
  Logger.log('Errors:   ' + errors);
  Logger.log('Finished: ' + new Date().toISOString());
  Logger.log('');
  Logger.log('NOTE: Doc IDs are unchanged — no app update needed for renames.');
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Find Drive files whose name contains the given title (case-insensitive).
 * Searches within SEARCH_FOLDER_ID if set, otherwise all of My Drive.
 */
function findDocsByTitle(title) {
  const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '\\"');
  // Search for docs whose title contains the lesson title
  const query = 'mimeType = "application/vnd.google-apps.document" and title contains \'' + safeTitle + '\'';
  let files;

  try {
    if (SEARCH_FOLDER_ID) {
      const folder = DriveApp.getFolderById(SEARCH_FOLDER_ID);
      files = folder.searchFiles(query);
    } else {
      files = DriveApp.searchFiles(query);
    }
  } catch(e) {
    Logger.log('Search error for "' + title + '": ' + e.message);
    return [];
  }

  const matches = [];
  while (files.hasNext()) {
    matches.push(files.next());
  }
  return matches;
}

/**
 * Build a doc title per naming convention.
 */
function buildDocTitle(course, quarter, type, title) {
  return course + ' | ' + quarter + ' | ' + type + ' | ' + title;
}

/**
 * Convenience: list all .gdoc files in SEARCH_FOLDER_ID (or root).
 * Run this to see what's actually in your folder before running renames.
 */
function listDocsInFolder() {
  Logger.log('=== Docs in search scope ===');
  const query = 'mimeType = "application/vnd.google-apps.document"';
  let files;

  if (SEARCH_FOLDER_ID) {
    files = DriveApp.getFolderById(SEARCH_FOLDER_ID).searchFiles(query);
  } else {
    files = DriveApp.searchFiles(query);
  }

  let count = 0;
  while (files.hasNext()) {
    const f = files.next();
    Logger.log(f.getId() + ' — "' + f.getName() + '"');
    count++;
    if (count >= 100) { Logger.log('(stopped at 100 — narrow with SEARCH_FOLDER_ID)'); break; }
  }
  Logger.log('Total shown: ' + count);
}
