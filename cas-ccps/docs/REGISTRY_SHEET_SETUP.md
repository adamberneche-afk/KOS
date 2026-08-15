# Script Registry Sheet — Setup Guide

The Script Registry Sheet is the central repository for all script file contents.
The AutoInstaller (Script 21) reads from this sheet to install scripts into each
Apps Script project automatically.

---

## Create the Sheet

1. In your admin Google account, go to **sheets.google.com** and create a new spreadsheet.
2. Name it: **Assignment System — Script Registry**
3. Rename the default sheet tab to: **Scripts**

---

## Column Structure

Add these three headers in Row 1:

| A | B | C |
|---|---|---|
| FileName | ProjectTarget | ScriptContent |

Make the header row bold and freeze it (View → Freeze → 1 row).

---

## ProjectTarget Values

Each row's ProjectTarget tells the installer which Apps Script project
to upload that file to. Use exactly these values (case-insensitive):

| ProjectTarget | What it installs to |
|---|---|
| `CENTRAL_LEDGER` | Central Ledger Spreadsheet |
| `RUBRIC_SHEET` | Master Rubric Response Sheet template |
| `MATRIX_SHEET` | Master Teacher Matrix Sheet template |
| `STUDENT_TEMPLATE` | Master Student Template Document |
| `TEACHER_DASHBOARD` | Teacher Dashboard web app (standalone) |
| `STUDENT_DASHBOARD` | Student Dashboard web app (standalone) |

---

## Which Files Go Where

Paste the complete contents of each script file into column C.

### CENTRAL_LEDGER
| FileName | ProjectTarget |
|---|---|
| 00_SharedConfig | CENTRAL_LEDGER |
| 02_Form1_IntakeAndWorkspaceGenerator | CENTRAL_LEDGER |
| 03_QueueBridge | CENTRAL_LEDGER |
| 04_Form2_TurnInGate | CENTRAL_LEDGER |
| 06_StagingPipeline_Turnstile | CENTRAL_LEDGER |
| 10_AdminRecoveryPanel | CENTRAL_LEDGER |
| 18_FormSubmitDispatcher | CENTRAL_LEDGER |

### RUBRIC_SHEET
| FileName | ProjectTarget |
|---|---|
| 00_SharedConfig | RUBRIC_SHEET |
| 05_TeacherIntakePipeline | RUBRIC_SHEET |
| 19_ClonedSheetConfig | RUBRIC_SHEET |

### MATRIX_SHEET
| FileName | ProjectTarget |
|---|---|
| 00_SharedConfig | MATRIX_SHEET |
| 08_TeacherConfirmationStep | MATRIX_SHEET |
| 19_ClonedSheetConfig | MATRIX_SHEET |

### STUDENT_TEMPLATE
| FileName | ProjectTarget |
|---|---|
| 00_SharedConfig | STUDENT_TEMPLATE |
| 01_StudentDoc_ContainerScript | STUDENT_TEMPLATE |
| 09_StudentRevisionGuidance | STUDENT_TEMPLATE |
| 17_MasterStudentTemplate | STUDENT_TEMPLATE |

### TEACHER_DASHBOARD
| FileName | ProjectTarget |
|---|---|
| 00_SharedConfig | TEACHER_DASHBOARD |
| 07_TeacherDashboard | TEACHER_DASHBOARD |
| 22_LessonContextHandler | TEACHER_DASHBOARD |
| 23_StudentProfileManager | TEACHER_DASHBOARD |
| 26_CompetencyAlignmentLog | TEACHER_DASHBOARD |
| 29_StudentContextAggregator | TEACHER_DASHBOARD |
| 31_PacingGuideManager | TEACHER_DASHBOARD |

### STUDENT_DASHBOARD
| FileName | ProjectTarget |
|---|---|
| 00_SharedConfig | STUDENT_DASHBOARD |
| 13_StudentDashboard | STUDENT_DASHBOARD |

---

## Pasting Script Contents

Column C cells will be large. For each file:

1. Click the cell in column C
2. Press **F2** (or double-click) to enter edit mode
3. Paste the full script file contents
4. Press **Enter** to confirm

**Important:** Do not wrap the content in quotes or add any formatting.
Paste the raw JavaScript exactly as-is.

For very large files, use the formula bar at the top of the sheet
rather than editing directly in the cell.

---

## Setting the Registry Sheet ID

No code editing required. The installer handles this automatically.

1. Copy the spreadsheet ID from the URL
   (the string between `/d/` and `/edit`)
2. Open your Admin Manual document
3. Click **⚙️ Assignment System → 🔧 Install Scripts Automatically**
4. The first time you run it, a dialog will appear asking for your
   Script Registry Sheet ID — paste it there
5. The installer validates the sheet is accessible before saving the ID

The ID is stored in Script Properties and remembered for all future runs.
You only enter it once.

---

## Updating Scripts

When a script file is updated:

1. Find the row in the registry sheet with the matching FileName
2. Click the cell in column C
3. Select all (Ctrl+A) and paste the new contents
4. The next installation will use the updated version

To update an already-installed project after changes:
1. Open the Admin Manual
2. Run **⚙️ Assignment System → 🔧 Install Scripts Automatically**
3. The installer uses checkpoints — it will update existing projects
   rather than creating new ones

---

## Keeping the Sheet Secure

- Share this sheet only with your admin Google account
- Do not share with teachers or students
- The script contents include no API keys or credentials
  (all sensitive values come from Script Properties set by the installer)
