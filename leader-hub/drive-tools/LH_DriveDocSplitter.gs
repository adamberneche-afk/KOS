/**
 * LeaderHub — Drive Compilation Doc Splitter
 * ============================================
 * Splits 4 compilation Google Docs into individual lesson plan docs.
 * Also creates 10 blank stub docs for 6115 Q1 (no source doc exists).
 * All docs named per convention: [COURSE] | [QUARTER] | [TYPE] | [Title]
 *
 * SETUP — do this before running anything:
 *   1. Go to script.google.com → New project → paste this file
 *   2. Set TARGET_FOLDER_ID below (the Drive folder where individual docs should land)
 *      - Open your target folder in Drive → copy the ID from the URL
 *      - e.g., drive.google.com/drive/folders/1AbCdEfG → ID is "1AbCdEfG"
 *   3. Fill in each COMPILATION_DOCS entry's sourceDocId below (same
 *      copy-the-ID-from-the-URL step as TARGET_FOLDER_ID) — placeholder
 *      values ship here on purpose (external product review, Finding 9:
 *      the real IDs used to be hardcoded, which meant anyone with repo
 *      access could open specific Drive documents referenced by ID; now
 *      this is a local, uncommitted fill-in step, same as TARGET_FOLDER_ID
 *      always has been)
 *   4. Run previewAllSplits() first — reads docs, logs what it finds, creates NOTHING
 *   5. If the preview looks right, run runAll() to create all individual docs
 *   6. Copy the manifest JSON from the script logs
 *   7. Use LH_AppManifestUpdater.py (companion script) to patch student-leader-hub.html
 *
 * PERMISSIONS:
 *   First run will ask you to authorize access to Google Docs and Drive. That's expected.
 *
 * WHAT IT TOUCHES:
 *   - Reads: 4 source compilation docs (never modifies them)
 *   - Creates: 73 new individual docs in TARGET_FOLDER_ID
 *   - Does NOT modify the source compilation docs
 *
 * KNOWN LIMITATION:
 *   Apps Script cannot deep-copy inline images or complex drawing objects.
 *   If any lesson section contains embedded images, those will be skipped
 *   and flagged in the log. Plan a manual pass for those lessons.
 */

// ============================================================
// ⚠️  REQUIRED CONFIGURATION — set before running
// ============================================================

/** Google Drive folder ID where all new individual docs will be created. */
const TARGET_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';

/**
 * Set to true for a dry run.
 * Logs everything that would happen without creating or modifying any files.
 * Always do a dry run before the real run.
 */
const DRY_RUN = true;

// ============================================================
// COMPILATION DOC DEFINITIONS
// Each entry maps to one source Google Doc.
// TYPE is the naming-convention type for each lesson's Drive doc.
// ============================================================

const COMPILATION_DOCS = [

  // ----------------------------------------------------------------
  // 6115 Q2 — Marketing Functions, Branding & Promotion
  // Source: compilation doc with 16 lessons
  // ----------------------------------------------------------------
  {
    key: '6115_Q2',
    sourceDocId: 'YOUR_6115_Q2_SOURCE_DOC_ID_HERE',
    course: '6115',
    quarter: 'Q2',
    lessons: [
      { id: 'lp_6115_11', title: 'The Magnificent Seven',              type: 'TEACH'   },
      { id: 'lp_6115_12', title: 'Functions in Action',                type: 'TEACH'   },
      { id: 'lp_6115_13', title: 'The Corporate Autopsy',              type: 'DUE'     },
      { id: 'lp_6115_14', title: 'Diagnosing the Patient',             type: 'DUE'     },
      { id: 'lp_6115_15', title: 'The Turnaround Plan',                type: 'PRESENT' },
      { id: 'lp_6115_16', title: 'Brand Identity & The Taste Test',    type: 'TEACH'   },
      { id: 'lp_6115_17', title: 'Brand Strategies',                   type: 'TEACH'   },
      { id: 'lp_6115_18', title: 'Brand Creation Lab',                 type: 'DUE'     },
      { id: 'lp_6115_19', title: 'The Ad Autopsy',                     type: 'TEACH'   },
      { id: 'lp_6115_20', title: 'The Creative Studio',                type: 'DUE'     },
      { id: 'lp_6115_21', title: 'The Medium is the Message',          type: 'TEACH'   },
      { id: 'lp_6115_22', title: 'The Price of Eyeballs',              type: 'DUE'     },
      { id: 'lp_6115_23', title: 'The Sensory Store',                  type: 'TEACH'   },
      { id: 'lp_6115_24', title: 'The Architect',                      type: 'TEACH'   },
      { id: 'lp_6115_25', title: 'The Perfect Recipe',                 type: 'TEACH'   },
      { id: 'lp_6115_26', title: 'Mix Masters',                        type: 'DUE'     },
    ]
  },

  // ----------------------------------------------------------------
  // 6115 Q3 — Advertising, Pricing, Selling & Distribution
  // Source: compilation doc with 15 lessons
  // ----------------------------------------------------------------
  {
    key: '6115_Q3',
    sourceDocId: 'YOUR_6115_Q3_SOURCE_DOC_ID_HERE',
    course: '6115',
    quarter: 'Q3',
    lessons: [
      { id: 'lp_6115_27', title: 'The Multi-Million Dollar Minute',   type: 'DUE'    },
      { id: 'lp_6115_28', title: 'The Pitch Room',                    type: 'DUE'    },
      { id: 'lp_6115_29', title: 'The Better Mousetrap',              type: 'DUE'    },
      { id: 'lp_6115_30', title: 'The Disruption Detectives',         type: 'TEACH'  },
      { id: 'lp_6115_31', title: 'The Revolution Will Be Televised',  type: 'TEACH'  },
      { id: 'lp_6115_32', title: 'The Extended Marketing Mix',        type: 'TEACH'  },
      { id: 'lp_6115_33', title: 'The Price is Right',                type: 'TEACH'  },
      { id: 'lp_6115_34', title: 'Pricing Psychology & Analysis',     type: 'DUE'    },
      { id: 'lp_6115_35', title: 'The Golden Rule of Business',       type: 'TEACH'  },
      { id: 'lp_6115_36', title: 'The Value Equation',                type: 'TEACH'  },
      { id: 'lp_6115_37', title: 'The Sales Dojo',                    type: 'ASSESS' },
      { id: 'lp_6115_38', title: 'The Submarine Sonar',               type: 'TEACH'  },
      { id: 'lp_6115_39', title: 'Garbage In, Garbage Out',           type: 'DUE'    },
      { id: 'lp_6115_40', title: 'The Middleman Paradox',             type: 'TEACH'  },
      { id: 'lp_6115_41', title: 'Solving the Supply Chain',          type: 'DUE'    },
    ]
  },

  // ----------------------------------------------------------------
  // 6115 Q4 — Career Readiness & Business Capstone
  // Source: compilation doc with 12 lessons
  // ----------------------------------------------------------------
  {
    key: '6115_Q4',
    sourceDocId: 'YOUR_6115_Q4_SOURCE_DOC_ID_HERE',
    course: '6115',
    quarter: 'Q4',
    lessons: [
      { id: 'lp_6115_42', title: 'The Time Traveler',                 type: 'DUE'     },
      { id: 'lp_6115_43', title: 'You, Inc.',                         type: 'DUE'     },
      { id: 'lp_6115_44', title: 'The Architecture of You',           type: 'TEACH'   },
      { id: 'lp_6115_45', title: 'The Hype Man',                      type: 'DUE'     },
      { id: 'lp_6115_46', title: 'The Professional Breakup',          type: 'TEACH'   },
      { id: 'lp_6115_47', title: 'The "Adulting" Crash Course',       type: 'TEACH'   },
      { id: 'lp_6115_48', title: 'The Big Idea',                      type: 'PRESENT' },
      { id: 'lp_6115_49', title: 'Know Your Enemy',                   type: 'DUE'     },
      { id: 'lp_6115_50', title: 'The Structure',                     type: 'DUE'     },
      { id: 'lp_6115_51', title: 'Show Me the Money',                 type: 'DUE'     },
      { id: 'lp_6115_52', title: 'The Final Sell',                    type: 'PRESENT' },
      { id: 'lp_6115_53', title: 'Protecting the Empire',             type: 'TEACH'   },
    ]
  },

  // ----------------------------------------------------------------
  // 8175 ALL — Sports, Entertainment & Event Marketing, Q1–Q4
  // Source: single compilation doc with 36 lessons
  // NOTE: lp_8175_00 (Rebranding the Washington Football Team) already
  //       has its own individual doc and is NOT in this compilation.
  // ----------------------------------------------------------------
  {
    key: '8175_ALL',
    sourceDocId: 'YOUR_8175_ALL_SOURCE_DOC_ID_HERE',
    course: '8175',
    quarter: null, // spans Q1–Q4; each lesson carries its own quarter field
    lessons: [
      // Q1 — Personal Brand & Market Analysis (14 lessons; Rebranding already split)
      { id: 'lp_8175_01', title: 'Evolution of Marketing',               quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_02', title: 'Intrinsic Motivation',                 quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_03', title: 'Personal Branding',                    quarter: 'Q1', type: 'DUE'     },
      { id: 'lp_8175_04', title: 'Personal Brand Analysis',              quarter: 'Q1', type: 'DUE'     },
      { id: 'lp_8175_05', title: 'Sources of Support',                   quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_06', title: 'Skill Development Plan',               quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_07', title: 'Ethical Dilemmas Discussion',          quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_08', title: 'Effective PowerPoint Presentations',   quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_09', title: 'Defining Branding',                    quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_10', title: 'Service Experience Reflection',        quarter: 'Q1', type: 'TEACH'   },
      { id: 'lp_8175_11', title: 'CHHS Brand Audit',                     quarter: 'Q1', type: 'DUE'     },
      { id: 'lp_8175_12', title: 'SWOT Analysis (Company Edition)',      quarter: 'Q1', type: 'DUE'     },
      { id: 'lp_8175_13', title: 'CHHS Rebrand Pitch',                   quarter: 'Q1', type: 'PRESENT' },
      { id: 'lp_8175_14', title: 'Local Business Research Project',      quarter: 'Q1', type: 'DUE'     },
      // Q2 — Economics, Pricing & Promotion (9 lessons)
      { id: 'lp_8175_15', title: 'Olymponomics',                         quarter: 'Q2', type: 'TEACH'   },
      { id: 'lp_8175_16', title: 'Pricing Strategies',                   quarter: 'Q2', type: 'TEACH'   },
      { id: 'lp_8175_17', title: 'Distribution Channels',                quarter: 'Q2', type: 'TEACH'   },
      { id: 'lp_8175_18', title: 'Make an Olympic Sport',                quarter: 'Q2', type: 'DUE'     },
      { id: 'lp_8175_19', title: 'Album Release Project',                quarter: 'Q2', type: 'DUE'     },
      { id: 'lp_8175_20', title: 'My Cause My Cleats (Analysis)',        quarter: 'Q2', type: 'DUE'     },
      { id: 'lp_8175_21', title: 'Licensing and Law',                    quarter: 'Q2', type: 'TEACH'   },
      { id: 'lp_8175_22', title: 'My Cause My Cleats (Pitch)',           quarter: 'Q2', type: 'PRESENT' },
      { id: 'lp_8175_23', title: 'Industry Publication Project',         quarter: 'Q2', type: 'DUE'     },
      // Q3 — Sales, Entrepreneurship & Market Research (8 lessons)
      { id: 'lp_8175_24', title: 'The Art of the Sale',                  quarter: 'Q3', type: 'TEACH'   },
      { id: 'lp_8175_25', title: 'BHM Entrepreneur Valentine',           quarter: 'Q3', type: 'DUE'     },
      { id: 'lp_8175_26', title: 'Elevator Pitch',                       quarter: 'Q3', type: 'PRESENT' },
      { id: 'lp_8175_27', title: 'Spring Break Field Report',            quarter: 'Q3', type: 'DUE'     },
      { id: 'lp_8175_28', title: 'Market Research (Survey Design)',      quarter: 'Q3', type: 'DUE'     },
      { id: 'lp_8175_29', title: 'Survey Reflection',                    quarter: 'Q3', type: 'DUE'     },
      { id: 'lp_8175_30', title: 'Survey Creation',                      quarter: 'Q3', type: 'TEACH'   },
      { id: 'lp_8175_31', title: 'Survey Analysis',                      quarter: 'Q3', type: 'DUE'     },
      // Q4 — Career Readiness & Course Capstone (5 lessons)
      { id: 'lp_8175_32', title: 'AI and the Future of Work',            quarter: 'Q4', type: 'DUE'     },
      { id: 'lp_8175_33', title: 'The Paper Trail',                      quarter: 'Q4', type: 'DUE'     },
      { id: 'lp_8175_34', title: 'Interview Skills Practice Plan',       quarter: 'Q4', type: 'DUE'     },
      { id: 'lp_8175_35', title: 'Google Interview Simulation',          quarter: 'Q4', type: 'ASSESS'  },
      { id: 'lp_8175_36', title: 'Course Evaluation Brochure',           quarter: 'Q4', type: 'DUE'     },
    ]
  }

];

// ============================================================
// 6115 Q1 — CREATE BLANK STUB DOCS
// These have no source compilation doc (the placeholder doc ID in the
// app points to a non-individual file). We create 10 empty docs with
// a standard lesson plan template. Adam fills in the content.
// ============================================================

const Q1_6115_STUBS = [
  { id: 'lp_6115_01', title: 'Value is Personal',                              type: 'TEACH'  },
  { id: 'lp_6115_02', title: 'Marketing is Creating Value & Utility',          type: 'TEACH'  },
  { id: 'lp_6115_03', title: 'Economic Foundations & Competition',             type: 'TEACH'  },
  { id: 'lp_6115_04', title: 'Business Structures & The Cycle',                type: 'ASSESS' },
  { id: 'lp_6115_05', title: 'Consumer Power & Historic Boycotts Pt. 1',       type: 'DUE'    },
  { id: 'lp_6115_06', title: 'Anatomy of a Boycott Pt. 2',                     type: 'DUE'    },
  { id: 'lp_6115_07', title: 'The Invisible Hand',                             type: 'DUE'    },
  { id: 'lp_6115_08', title: 'Market Relationships',                           type: 'TEACH'  },
  { id: 'lp_6115_09', title: 'Diagnosing the Economy',                         type: 'TEACH'  },
  { id: 'lp_6115_10', title: 'Marketing Through the Storm',                    type: 'DUE'    },
];

// ============================================================
// PREVIEW — run this first, creates nothing
// ============================================================

/**
 * Preview what the splitter would do for all compilation docs.
 * Logs: total element count, first 40 elements (type + text snippet),
 * detected lesson boundaries, and any lessons it could NOT find.
 * Run this before runAll() to verify heading detection.
 */
function previewAllSplits() {
  Logger.log('=== LEADERHUB DRIVE SPLITTER — PREVIEW MODE ===');
  Logger.log('Date: ' + new Date().toISOString());
  Logger.log('');

  COMPILATION_DOCS.forEach(def => {
    Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    Logger.log('DOC: ' + def.key + ' (' + def.sourceDocId + ')');
    Logger.log('Expected lessons: ' + def.lessons.length);
    Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let doc;
    try {
      doc = DocumentApp.openById(def.sourceDocId);
    } catch(e) {
      Logger.log('❌ Cannot open doc: ' + e.message);
      return;
    }

    const body = doc.getBody();
    const numElements = body.getNumChildren();
    Logger.log('Total body elements: ' + numElements);
    Logger.log('');

    // Print first 40 non-empty paragraphs so Adam can see the structure
    Logger.log('--- First 40 non-empty paragraphs ---');
    let printed = 0;
    for (let i = 0; i < numElements && printed < 40; i++) {
      const elem = body.getChild(i);
      if (elem.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      const para = elem.asParagraph();
      const text = para.getText().trim();
      if (!text) continue;
      const heading = para.getHeading();
      const headingLabel = heading === DocumentApp.ParagraphHeading.NORMAL ? 'NORMAL' : heading.toString();
      Logger.log('[' + i + '] ' + headingLabel + ' | "' + text.substring(0, 100) + '"');
      printed++;
    }

    // Detect and report boundaries
    Logger.log('');
    Logger.log('--- Boundary detection ---');
    const boundaries = detectBoundaries(body, def.lessons);
    Logger.log('Found ' + boundaries.length + ' / ' + def.lessons.length + ' expected lessons');
    Logger.log('');

    boundaries.forEach(b => {
      const docTitle = buildDocTitle(def.course, b.quarter || def.quarter, b.type, b.title);
      Logger.log('✅ "' + b.title + '"');
      Logger.log('   Elements: ' + b.startIdx + '–' + b.endIdx + ' (' + (b.endIdx - b.startIdx + 1) + ' elements)');
      Logger.log('   → New doc title: "' + docTitle + '"');
    });

    // Report missing lessons
    const foundTitles = new Set(boundaries.map(b => normalizeTitle(b.title)));
    const missing = def.lessons.filter(l => !foundTitles.has(normalizeTitle(l.title)));
    if (missing.length > 0) {
      Logger.log('');
      Logger.log('⚠️  MISSING (' + missing.length + ' lessons not found in doc):');
      missing.forEach(l => Logger.log('   ❌ ' + l.id + ' — "' + l.title + '"'));
      Logger.log('');
      Logger.log('   If lessons are missing, the doc headings may not exactly match');
      Logger.log('   the lesson titles above. Check the heading text above and update');
      Logger.log('   the title in the COMPILATION_DOCS manifest to match exactly.');
    }
    Logger.log('');
  });

  Logger.log('');
  Logger.log('=== 6115 Q1 STUBS — would create ' + Q1_6115_STUBS.length + ' blank docs ===');
  Q1_6115_STUBS.forEach(l => {
    Logger.log('  6115 | Q1 | ' + l.type + ' | ' + l.title);
  });
  Logger.log('');
  Logger.log('=== END PREVIEW ===');
}

// ============================================================
// CORE: BOUNDARY DETECTION
// ============================================================

/**
 * Find where each lesson starts and ends within a doc body.
 *
 * Strategy (in order):
 *   Pass 1 — Match lesson titles against Heading 1/2 paragraphs (exact match)
 *   Pass 2 — Match against any non-empty paragraph (exact match, normalized)
 *   Pass 3 — Fuzzy: match if paragraph text CONTAINS the lesson title
 *
 * Returns array of { id, title, type, quarter, startIdx, endIdx }
 * sorted by startIdx.
 */
function detectBoundaries(body, lessons) {
  const numElements = body.getNumChildren();
  const foundIndices = [];
  const matchedIds = new Set();

  // Build a lookup: normalized title → lesson definition
  const byTitle = {};
  lessons.forEach(l => { byTitle[normalizeTitle(l.title)] = l; });

  // Pass 1: Heading paragraphs only
  for (let i = 0; i < numElements; i++) {
    const elem = body.getChild(i);
    if (elem.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const para = elem.asParagraph();
    if (para.getHeading() === DocumentApp.ParagraphHeading.NORMAL) continue;
    const norm = normalizeTitle(para.getText());
    if (byTitle[norm] && !matchedIds.has(byTitle[norm].id)) {
      foundIndices.push({ idx: i, lesson: byTitle[norm] });
      matchedIds.add(byTitle[norm].id);
    }
  }

  // Pass 2: Any paragraph (if pass 1 found nothing)
  if (foundIndices.length === 0) {
    for (let i = 0; i < numElements; i++) {
      const elem = body.getChild(i);
      if (elem.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      const norm = normalizeTitle(elem.asParagraph().getText());
      if (byTitle[norm] && !matchedIds.has(byTitle[norm].id)) {
        foundIndices.push({ idx: i, lesson: byTitle[norm] });
        matchedIds.add(byTitle[norm].id);
      }
    }
  }

  // Pass 3: Fuzzy — paragraph CONTAINS a lesson title (catch truncated headings)
  if (foundIndices.length < lessons.length) {
    for (let i = 0; i < numElements; i++) {
      const elem = body.getChild(i);
      if (elem.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      const text = normalizeTitle(elem.asParagraph().getText());
      if (!text) continue;
      lessons.forEach(l => {
        if (!matchedIds.has(l.id) && text.includes(normalizeTitle(l.title))) {
          foundIndices.push({ idx: i, lesson: l });
          matchedIds.add(l.id);
        }
      });
    }
  }

  // Sort by document position and build start/end ranges
  foundIndices.sort((a, b) => a.idx - b.idx);

  return foundIndices.map((entry, i) => ({
    id:       entry.lesson.id,
    title:    entry.lesson.title,
    type:     entry.lesson.type,
    quarter:  entry.lesson.quarter || null,
    startIdx: entry.idx,
    endIdx:   i < foundIndices.length - 1
                ? foundIndices[i + 1].idx - 1
                : numElements - 1
  }));
}

// ============================================================
// CORE: SPLIT A COMPILATION DOC
// ============================================================

/**
 * Split one compilation doc into individual files.
 * Returns { lessonId: newDocId } manifest object.
 */
function splitCompilationDoc(def) {
  const manifest = {};
  let doc;

  try {
    doc = DocumentApp.openById(def.sourceDocId);
  } catch(e) {
    Logger.log('❌ Cannot open source doc for ' + def.key + ': ' + e.message);
    return manifest;
  }

  const body = doc.getBody();
  const folder = DRY_RUN ? null : DriveApp.getFolderById(TARGET_FOLDER_ID);
  const boundaries = detectBoundaries(body, def.lessons);

  if (boundaries.length === 0) {
    Logger.log('⚠️  ' + def.key + ': No lesson boundaries detected. Run previewAllSplits() to inspect.');
    return manifest;
  }

  if (boundaries.length !== def.lessons.length) {
    Logger.log('⚠️  ' + def.key + ': Found ' + boundaries.length + ' / ' + def.lessons.length + ' lessons.');
    const foundIds = new Set(boundaries.map(b => b.id));
    def.lessons.filter(l => !foundIds.has(l.id)).forEach(l => {
      Logger.log('   Missing: ' + l.id + ' — "' + l.title + '"');
    });
  }

  boundaries.forEach(b => {
    const quarter = b.quarter || def.quarter;
    const docTitle = buildDocTitle(def.course, quarter, b.type, b.title);

    Logger.log((DRY_RUN ? '[DRY RUN] ' : '') + 'Creating: "' + docTitle + '"');

    if (DRY_RUN) {
      manifest[b.id] = 'DRY_RUN_' + b.id;
      return;
    }

    try {
      const result = createDocFromRange(body, b.startIdx, b.endIdx, docTitle, folder);
      manifest[b.id] = result.docId;
      Logger.log('  ✅ ' + result.docId + ' (' + result.elementCount + ' elements)');
      if (result.skippedImages > 0) {
        Logger.log('  ⚠️  ' + result.skippedImages + ' inline image(s) skipped — manual copy required');
      }
    } catch(e) {
      Logger.log('  ❌ Failed: ' + e.message);
    }
  });

  return manifest;
}

// ============================================================
// CORE: CREATE A SINGLE DOC FROM A RANGE OF BODY ELEMENTS
// ============================================================

/**
 * Create a new Google Doc and copy elements from sourceBody[startIdx..endIdx].
 * Returns { docId, elementCount, skippedImages }.
 */
function createDocFromRange(sourceBody, startIdx, endIdx, docTitle, folder) {
  const newDoc = DocumentApp.create(docTitle);
  const newBody = newDoc.getBody();
  newBody.clear();

  let elementCount = 0;
  let skippedImages = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const elem = sourceBody.getChild(i);
    const type = elem.getType();

    try {
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        const para = elem.asParagraph();
        const text = para.getText();
        if (!text.trim() && i === startIdx) continue; // skip blank at very start

        // Check for inline images in paragraph
        for (let c = 0; c < para.getNumChildren(); c++) {
          if (para.getChild(c).getType() === DocumentApp.ElementType.INLINE_IMAGE) {
            skippedImages++;
          }
        }

        const newPara = newBody.appendParagraph(text);
        newPara.setHeading(para.getHeading());
        applyParagraphFormatting(para, newPara);
        // Copy text run formatting (bold, italic, underline per run)
        copyTextRunFormatting(para, newPara);
        elementCount++;

      } else if (type === DocumentApp.ElementType.LIST_ITEM) {
        const item = elem.asListItem();
        const newItem = newBody.appendListItem(item.getText());
        newItem.setGlyphType(item.getGlyphType());
        newItem.setNestingLevel(item.getNestingLevel());
        copyTextRunFormatting(item, newItem);
        elementCount++;

      } else if (type === DocumentApp.ElementType.TABLE) {
        // Tables: copy via element.copy() — preserves cell structure
        // Note: images inside table cells are also lost
        try {
          const tableCopy = elem.asTable().copy();
          newBody.appendTable(tableCopy);
          elementCount++;
        } catch(tableErr) {
          Logger.log('    Table copy failed at element ' + i + ': ' + tableErr.message + ' — skipping');
        }

      } else if (type === DocumentApp.ElementType.INLINE_IMAGE) {
        skippedImages++;

      }
      // HORIZONTAL_RULE, PAGE_BREAK, and other types are intentionally skipped
      // (they rarely appear in lesson plans and cause noise)

    } catch(elemErr) {
      Logger.log('    Element error at index ' + i + ': ' + elemErr.message);
    }
  }

  newDoc.saveAndClose();

  // Move from My Drive root to target folder
  const file = DriveApp.getFileById(newDoc.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  return { docId: newDoc.getId(), elementCount, skippedImages };
}

/**
 * Copy paragraph-level formatting: alignment, line spacing, indent.
 */
function applyParagraphFormatting(src, dest) {
  try { dest.setAlignment(src.getAlignment()); } catch(e) {}
  try { dest.setSpacingBefore(src.getSpacingBefore()); } catch(e) {}
  try { dest.setSpacingAfter(src.getSpacingAfter()); } catch(e) {}
  try { dest.setLineSpacing(src.getLineSpacing()); } catch(e) {}
  try { dest.setIndentFirstLine(src.getIndentFirstLine()); } catch(e) {}
  try { dest.setIndentStart(src.getIndentStart()); } catch(e) {}
}

/**
 * Copy text run formatting (bold, italic, underline, font size, color)
 * from each child text element in source to destination.
 * Apps Script maps runs by index within the paragraph.
 */
// FIXED: this used to match source and destination Text children by
// index (source child c -> dest child c, `if (c >= destChildren) break`)
// — but the destination paragraph is built via a single
// `newBody.appendParagraph(text)` call (one Text child spanning the
// whole string), while the source paragraph can have several Text
// children when it has mixed formatting (e.g. plain text followed by a
// bolded phrase). Once c reached destChildren (1), the loop broke
// immediately, so only the source's FIRST run's formatting was ever
// applied — any bold/italic/underline carried by a 2nd+ run was
// silently dropped. Rewritten to track a global character offset across
// all of the source's runs and map each offset into whichever
// destination Text child actually contains it — correct regardless of
// how many Text children either side has, since both source and
// destination always contain the exact same total text (destElem was
// built from srcElem.getText() itself).
function copyTextRunFormatting(srcElem, destElem) {
  try {
    const numChildren = srcElem.getNumChildren();
    let globalOffset = 0; // position within the whole paragraph's text

    for (let c = 0; c < numChildren; c++) {
      const srcChild = srcElem.getChild(c);
      if (srcChild.getType() !== DocumentApp.ElementType.TEXT) continue;

      const srcText = srcChild.asText();
      const text = srcText.getText();
      if (!text) continue;

      // Apply attributes at each character position where they change
      for (let pos = 0; pos < text.length; pos++) {
        try {
          const attrs = srcText.getAttributes(pos);
          _setDestAttributesAtOffset_(destElem, globalOffset + pos, attrs);
        } catch(e) { /* non-fatal — some attributes may not transfer */ }
      }

      globalOffset += text.length;
    }
  } catch(e) {
    // Non-fatal: formatting copy is best-effort
  }
}

/**
 * Sets text attributes at a single character position identified by its
 * offset into the destination element's FULL concatenated text (across
 * all of its Text children), not a per-child offset. Finds which child
 * actually contains that position and applies the attributes there,
 * using the local (within-child) offset.
 */
function _setDestAttributesAtOffset_(destElem, globalOffset, attrs) {
  let consumed = 0;
  const destChildren = destElem.getNumChildren();
  for (let c = 0; c < destChildren; c++) {
    const destChild = destElem.getChild(c);
    if (destChild.getType() !== DocumentApp.ElementType.TEXT) continue;
    const destText = destChild.asText();
    const len = destText.getText().length;
    if (globalOffset < consumed + len) {
      const localOffset = globalOffset - consumed;
      destText.setAttributes(localOffset, localOffset, attrs);
      return;
    }
    consumed += len;
  }
  // globalOffset is beyond the end of all destination text — nothing to set
}

// ============================================================
// 6115 Q1 — CREATE BLANK STUB DOCS
// ============================================================

/**
 * Create 10 blank lesson plan stub docs for 6115 Q1.
 * Adam fills in content; LeaderHub gets the new doc IDs.
 * Returns { lessonId: newDocId } manifest.
 */
function create6115Q1Stubs() {
  const manifest = {};
  const folder = DRY_RUN ? null : DriveApp.getFolderById(TARGET_FOLDER_ID);

  Logger.log('');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('6115 Q1 STUBS — Creating ' + Q1_6115_STUBS.length + ' blank lesson plan docs');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  Q1_6115_STUBS.forEach(lesson => {
    const docTitle = buildDocTitle('6115', 'Q1', lesson.type, lesson.title);
    Logger.log((DRY_RUN ? '[DRY RUN] ' : '') + 'Creating: "' + docTitle + '"');

    if (DRY_RUN) {
      manifest[lesson.id] = 'DRY_RUN_' + lesson.id;
      return;
    }

    try {
      const newDoc = DocumentApp.create(docTitle);
      const body = newDoc.getBody();
      body.clear();

      // Heading
      body.appendParagraph(lesson.title)
          .setHeading(DocumentApp.ParagraphHeading.HEADING1);

      // Subtitle
      body.appendParagraph('6115 | Q1 | Foundations of Economics & Marketing')
          .setHeading(DocumentApp.ParagraphHeading.HEADING2);

      // Standard lesson plan sections
      [
        'Objective',
        'Standards Alignment (VACES)',
        'Materials & Resources',
        'Vocabulary',
        'Lesson Sequence',
        'Differentiation & Accommodations',
        'Assessment',
        'Teacher Notes / Reflection'
      ].forEach(section => {
        body.appendParagraph(section)
            .setHeading(DocumentApp.ParagraphHeading.HEADING3);
        body.appendParagraph('[ Content to be added ]');
      });

      newDoc.saveAndClose();

      const file = DriveApp.getFileById(newDoc.getId());
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);

      manifest[lesson.id] = newDoc.getId();
      Logger.log('  ✅ ' + newDoc.getId());
    } catch(e) {
      Logger.log('  ❌ Failed: ' + e.message);
    }
  });

  return manifest;
}

// ============================================================
// MASTER RUNNER
// ============================================================

/**
 * Run everything: split all 4 compilation docs + create 6115 Q1 stubs.
 * At the end, logs the combined manifest JSON for patching the app.
 *
 * Check Executions → Logs after this completes.
 * Copy the JSON block at the bottom and use LH_AppManifestUpdater.py
 * to patch student-leader-hub.html.
 */
function runAll() {
  Logger.log('╔══════════════════════════════════════════╗');
  Logger.log('║  LeaderHub Drive Splitter — runAll()     ║');
  Logger.log('╚══════════════════════════════════════════╝');
  Logger.log('Started: ' + new Date().toISOString());
  Logger.log('DRY_RUN: ' + DRY_RUN);
  Logger.log('TARGET_FOLDER_ID: ' + TARGET_FOLDER_ID);
  Logger.log('');

  if (TARGET_FOLDER_ID === 'YOUR_FOLDER_ID_HERE') {
    Logger.log('❌ STOPPED: TARGET_FOLDER_ID is not set.');
    Logger.log('   Open this script, set TARGET_FOLDER_ID at the top, and try again.');
    return;
  }

  const fullManifest = {};

  // Split compilation docs
  COMPILATION_DOCS.forEach(def => {
    Logger.log('');
    Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    Logger.log('SPLITTING: ' + def.key);
    Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
      const m = splitCompilationDoc(def);
      Object.assign(fullManifest, m);
    } catch(e) {
      Logger.log('❌ FAILED: ' + def.key + ' → ' + e.message);
    }
  });

  // Create Q1 stubs
  try {
    const m = create6115Q1Stubs();
    Object.assign(fullManifest, m);
  } catch(e) {
    Logger.log('❌ FAILED: 6115 Q1 stubs → ' + e.message);
  }

  // Output manifest
  Logger.log('');
  Logger.log('╔══════════════════════════════════════════╗');
  Logger.log('║  MANIFEST JSON — copy into updater script ║');
  Logger.log('╚══════════════════════════════════════════╝');
  Logger.log(JSON.stringify(fullManifest, null, 2));
  Logger.log('');
  Logger.log('Total docs in manifest: ' + Object.keys(fullManifest).length);
  Logger.log('Completed: ' + new Date().toISOString());
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Build a doc title per naming convention.
 * Format: [COURSE] | [QUARTER] | [TYPE] | [Title]
 */
function buildDocTitle(course, quarter, type, title) {
  return course + ' | ' + quarter + ' | ' + type + ' | ' + title;
}

/**
 * Normalize a string for comparison: trim, collapse whitespace, lowercase.
 */
function normalizeTitle(str) {
  return (str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Quick sanity check — verifies the script can open all source docs.
 * Run this before previewAllSplits() if you're not sure about permissions.
 */
function checkDocAccess() {
  Logger.log('Checking access to all source docs...');
  COMPILATION_DOCS.forEach(def => {
    try {
      const doc = DocumentApp.openById(def.sourceDocId);
      Logger.log('✅ ' + def.key + ' — "' + doc.getName() + '"');
    } catch(e) {
      Logger.log('❌ ' + def.key + ' (' + def.sourceDocId + ') — ' + e.message);
    }
  });
  if (TARGET_FOLDER_ID !== 'YOUR_FOLDER_ID_HERE') {
    try {
      DriveApp.getFolderById(TARGET_FOLDER_ID);
      Logger.log('✅ Target folder accessible');
    } catch(e) {
      Logger.log('❌ Target folder (' + TARGET_FOLDER_ID + '): ' + e.message);
    }
  } else {
    Logger.log('⚠️  TARGET_FOLDER_ID not set yet');
  }
}
