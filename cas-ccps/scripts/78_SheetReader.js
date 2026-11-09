// =============================================================================
// FILE: 78_SheetReader.js
// BOUND TO: Student Dashboard web app (cas-ccps:student-dashboard), where
//   Submit runs, as the deploying account (USER_DEPLOYING), an editor of
//   every student sheet copy since Phase 4d (02's _intakeWorkFile_). The
//   project already has the spreadsheets scope (the Ledger); this file opens
//   only the student's own copy, by the ID on their own Ledger row.
//
// Phase 4d (2026-11-09; meta/STUDENT_WORK_PLAN_2026-10.md §5): the Sheet
// reader at Submit, built as 75 (forms) and 77 (decks) are. For a Sheets
// part, 13's Submit:
//   1. reads the sheet's STRUCTURE (readSheetStructure_): each tab's name,
//      its filled range's shown values and formulas (at most SH_READ_ROWS
//      rows by SH_READ_COLS columns; past that the tab says it was cut),
//      and each chart's type, title and source ranges. Never the file's
//      name (the copy is named after the student), never a write. A test
//      holds every call here to a fixed list of getters.
//   2. runs the part's exact checks (sheetCheckReasons_, sheetChecks in
//      PARTS.json, 00's normalizeSheetChecks_). A failure is a plain-words
//      "Not yet" on the card and goes nowhere else.
//   3. on a pass, rewrites the sheet's snapshot doc (75's writeFormSnapshot_)
//      with a plain-text table of each tab (sheetSnapshotText_; at most
//      SH_SNAPSHOT_ROWS rows by SH_SNAPSHOT_COLS columns a tab, and it says
//      so), which Flow 2 reads.
// The probe (2026-11-01): tab names, the filled range, formulas told from
// typed numbers, and each chart's type, title and range all read back.
// =============================================================================

// What the reader reads of a tab, at most (the checks count within it).
const SH_READ_ROWS = 1000;
const SH_READ_COLS = 52;
// What the snapshot shows of a tab, at most, and of a cell.
const SH_SNAPSHOT_ROWS = 50;
const SH_SNAPSHOT_COLS = 12;
const SH_CELL_MAX = 200;
const SH_SNAPSHOT_MAX = 20000;

// "A" for column 0, "AA" for 26.
function shColumnName_(i) {
  let n = i + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function _shColumnIndex_(name) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = n * 26 + (name.charCodeAt(i) - 64);
  return n - 1;
}

// A formulasIn range as 0-based bounds: { r1, r2, c1, c2, label }, or null.
// "D" is the whole column, "D2:D20" a block, "B2:E" rows 2 down of B to E.
function shRangeBounds_(a1) {
  const m = SHEET_RANGE_RE.exec(String(a1 || "").trim().toUpperCase());
  if (!m) return null;
  const c1 = _shColumnIndex_(m[1]);
  const c2 = m[3] ? _shColumnIndex_(m[3]) : c1;
  const r1 = m[2] ? Number(m[2]) - 1 : 0;
  const r2 = m[4] ? Number(m[4]) - 1 : (m[3] || !m[2] ? Infinity : r1);
  return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2),
    label: !m[2] && !m[3] ? "column " + m[1] : m[0] };
}

// The sheet's structure, as plain data. Throws if it can't be opened.
// { tabs: [{ name, lastRow, lastColumn, values: [[shown text]],
//   formulas: [[formula or ""]], cut, charts: [{ type, title, ranges }] }] }
function readSheetStructure_(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const tryRead = function (fn, fallback) { try { return fn(); } catch (e) { return fallback; } };
  const out = { tabs: [] };
  ss.getSheets().forEach(function (sh) {
    const lastRow = Number(sh.getLastRow()) || 0, lastColumn = Number(sh.getLastColumn()) || 0;
    const rows = Math.min(lastRow, SH_READ_ROWS), cols = Math.min(lastColumn, SH_READ_COLS);
    const t = { name: String(sh.getName()), lastRow: lastRow, lastColumn: lastColumn, values: [], formulas: [],
      cut: lastRow > rows || lastColumn > cols, charts: [] };
    if (rows > 0 && cols > 0) {
      const range = sh.getRange(1, 1, rows, cols);
      t.values = range.getDisplayValues().map(function (r) { return r.map(String); });
      t.formulas = range.getFormulas().map(function (r) { return r.map(String); });
    }
    t.charts = (tryRead(function () { return sh.getCharts(); }, []) || []).map(function (ch) {
      return {
        type: String(tryRead(function () { return ch.modify().getChartType(); }, "") || ""),
        title: String(tryRead(function () { return ch.getOptions().get("title"); }, "") || ""),
        ranges: tryRead(function () {
          return ch.getRanges().map(function (r) { return String(r.getSheet().getName()) + "!" + String(r.getA1Notation()); });
        }, [])
      };
    });
    out.tabs.push(t);
  });
  return out;
}

function _shFilled_(t, r, c) {
  return String((t.values[r] || [])[c] || "") !== "" || String((t.formulas[r] || [])[c] || "") !== "";
}

// A tab's counts: { rows (filled), cells (filled), columns (to the last
// filled), formulas, formulasIn (within bounds, if given) }.
function shTabCounts_(t, bounds) {
  const out = { rows: 0, cells: 0, columns: 0, formulas: 0, formulasIn: 0 };
  (t.values || []).forEach(function (row, r) {
    let any = false;
    for (let c = 0; c < Math.max(row.length, (t.formulas[r] || []).length); c++) {
      if (!_shFilled_(t, r, c)) continue;
      any = true;
      out.cells++;
      out.columns = Math.max(out.columns, c + 1);
      if (String((t.formulas[r] || [])[c] || "") !== "") {
        out.formulas++;
        if (bounds && r >= bounds.r1 && r <= bounds.r2 && c >= bounds.c1 && c <= bounds.c2) out.formulasIn++;
      }
    }
    if (any) out.rows++;
  });
  return out;
}

const _shSameName_ = function (a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };
function _shPlural_(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

// The exact checks: [] on a pass, else one plain-words reason per failure.
function sheetCheckReasons_(structure, checks) {
  const c = normalizeSheetChecks_(checks);
  const tabs = structure.tabs || [];
  const reasons = [];
  const has = function (name) { return tabs.some(function (t) { return _shSameName_(t.name, name); }); };
  const missing = (c.requiredTabs || []).slice();
  if (c.tab && !missing.some(function (n) { return _shSameName_(n, c.tab); })) missing.push(c.tab);
  missing.filter(function (n) { return !has(n); }).forEach(function (n) {
    reasons.push("Your sheet needs a tab named " + _frQuote_(n) + ". Add one with + at the bottom left, " +
      "or rename a tab by double-clicking its name.");
  });
  const target = c.tab ? tabs.filter(function (t) { return _shSameName_(t.name, c.tab); }) : tabs;
  if (c.tab && !target.length) return reasons; // the counts below have nothing to look at
  const on = c.tab ? " on " + _frQuote_(c.tab) : "";
  const bounds = c.formulasIn ? shRangeBounds_(c.formulasIn) : null;
  const counts = target.map(function (t) { return shTabCounts_(t, bounds); });
  const sum = function (k) { return counts.reduce(function (n, x) { return n + x[k]; }, 0); };
  const cells = sum("cells");
  if (cells === 0) {
    reasons.push("Your sheet is still empty" + on + ". Fill in your table, then submit again.");
  } else if (cells < c.minFilledCells) {
    reasons.push("Your sheet has " + _shPlural_(cells, "cell") + " filled in" + on + ". It needs at least " + c.minFilledCells + ".");
  }
  if (c.minFilledRows) {
    const rows = counts.reduce(function (n, x) { return Math.max(n, x.rows); }, 0);
    if (cells > 0 && rows < c.minFilledRows) {
      reasons.push("Your sheet has " + _shPlural_(rows, "row") + " filled in" + (on || (tabs.length > 1 ? " on any one tab" : "")) +
        ". It needs at least " + c.minFilledRows + ".");
    }
  }
  const need = c.formulasRequired || (bounds ? 1 : 0);
  if (need) {
    const have = bounds ? sum("formulasIn") : sum("formulas");
    if (have < need) {
      const where = (bounds ? " in " + bounds.label : "") + on;
      reasons.push("Your sheet has " + _shPlural_(have, "formula") + where + ". It needs at least " + need +
        ": a cell that calculates starts with =, like =B2-C2. A number typed in is not a formula.");
    }
  }
  if (c.requireChart && !tabs.some(function (t) { return (t.charts || []).length > 0; })) {
    reasons.push("Your sheet needs a chart: select your table, then Insert, then Chart.");
  }
  return reasons;
}

// Every string the student wrote into the sheet: tab names, cells,
// formulas, chart titles.
function _shStudentStrings_(st) {
  const out = [];
  (st.tabs || []).forEach(function (t) {
    out.push(t.name);
    (t.values || []).concat(t.formulas || []).forEach(function (row) { row.forEach(function (x) { if (x) out.push(x); }); });
    (t.charts || []).forEach(function (ch) { out.push(ch.title); });
  });
  return out;
}

// The first system-text token in the student's sheet, or "" (00's findSystemText_).
function sheetSystemText_(structure) {
  const all = _shStudentStrings_(structure);
  for (let i = 0; i < all.length; i++) {
    const found = findSystemText_(all[i]);
    if (found) return found;
  }
  return "";
}

function _shCell_(text) {
  const s = String(text || "");
  return _frQuote_(s.length > SH_CELL_MAX ? s.slice(0, SH_CELL_MAX) + "…" : s);
}

// The plain-text account Flow 2 reads and the teacher sees: each tab as a
// table, row by row, each filled cell with its column letter, its shown
// value quoted and, for a formula, the formula after it in [ ]; then the
// tab's charts. At most SH_SNAPSHOT_ROWS rows by SH_SNAPSHOT_COLS columns a
// tab, and what was left out is said.
function sheetSnapshotText_(structure) {
  const tabs = structure.tabs || [];
  const charts = tabs.reduce(function (n, t) { return n + (t.charts || []).length; }, 0);
  const lines = [
    "GOOGLE SHEET, as it was when the student pressed Submit",
    "Tabs: " + tabs.length + " (" + tabs.map(function (t) { return _frQuote_(t.name); }).join(", ") + ") · charts: " + charts,
    "Each tab shows at most its first " + SH_SNAPSHOT_ROWS + " filled rows and " + SH_SNAPSHOT_COLS +
      " columns. A cell with a formula shows its value, then the formula in [ ]. Empty cells are left out.",
    ""
  ];
  tabs.forEach(function (t) {
    const n = shTabCounts_(t, null);
    lines.push("Tab " + _frQuote_(t.name) + ": " + (n.cells
      ? _shPlural_(n.rows, "row") + " filled, to column " + shColumnName_(n.columns - 1) + ", " + _shPlural_(n.formulas, "formula")
      : "empty") + (t.cut ? " (only the first " + SH_READ_ROWS + " rows and " + SH_READ_COLS + " columns were read)" : ""));
    let shown = 0, left = 0;
    (t.values || []).forEach(function (row, r) {
      const cells = [];
      let wide = false;
      for (let c = 0; c < row.length; c++) {
        if (!_shFilled_(t, r, c)) continue;
        if (c >= SH_SNAPSHOT_COLS) { wide = true; continue; }
        const f = String((t.formulas[r] || [])[c] || "");
        cells.push(shColumnName_(c) + " " + _shCell_(row[c]) + (f ? " [" + _shCell_(f).slice(1, -1) + "]" : ""));
      }
      if (!cells.length && !wide) return;
      if (shown >= SH_SNAPSHOT_ROWS) { left++; return; }
      shown++;
      lines.push("  Row " + (r + 1) + ": " + (cells.length ? cells.join(" | ") : "(only past column " +
        shColumnName_(SH_SNAPSHOT_COLS - 1) + ")") + (wide ? " | (more past column " + shColumnName_(SH_SNAPSHOT_COLS - 1) + ")" : ""));
    });
    if (left) lines.push("  (" + _shPlural_(left, "more filled row") + " not shown)");
    (t.charts || []).forEach(function (ch) {
      lines.push("  Chart: " + (ch.type ? ch.type.toLowerCase().replace(/_/g, " ") + " chart" : "a chart") +
        (ch.title ? " " + _frQuote_(ch.title) : ", no title") +
        (ch.ranges && ch.ranges.length ? " from " + ch.ranges.map(_frQuote_).join(", ") : ""));
    });
  });
  let text = lines.join("\n").trim();
  if (text.length > SH_SNAPSHOT_MAX) text = text.slice(0, SH_SNAPSHOT_MAX) + " […]";
  return text;
}
