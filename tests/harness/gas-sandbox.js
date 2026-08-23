'use strict';
// A small, in-memory fake of the Google Apps Script Sheets/Properties/
// Session APIs, just deep enough to load and exercise a real .gs file's
// source without touching a real Google account. Rebuilds the same kind of
// harness leader-hub/README.md describes past sessions using ad hoc
// (verify_ee2.js) and never committing — this version is committed and
// wired into CI specifically so it doesn't have to be rebuilt from scratch
// again next time something in EmailBridge.gs changes.
//
// Deliberately covers only what EmailBridge.gs's AI-queue and Organization
// Sync functions actually call: PropertiesService, SpreadsheetApp, and
// Session. DriveApp/GmailApp/DocumentApp/ContentService are NOT mocked —
// loading the file still works (those globals are only referenced inside
// function bodies that are never invoked by these tests, and JS doesn't
// evaluate a function body's free variables until it's called), but
// calling createSubPlanDoc_/createBragDraft_/scanHorizonLabel_/doGet/doPost
// from a test using this sandbox will throw ReferenceError by design.

const vm = require('vm');
const fs = require('fs');

// See tests/harness/vm-run.js's crossRealmSafe for why this exists: a
// plain object/array returned by a function that ran inside the vm
// context has a different realm than the test file calling it, which
// makes assert.deepStrictEqual report a false mismatch even when the
// value is correct. structuredClone rebuilds it using the caller's own
// built-ins before handing it back.
function crossRealmSafe(value) {
  if (value === null || typeof value !== 'object') return value;
  return structuredClone(value);
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  setValues(values) {
    for (let r = 0; r < this.numRows; r++) {
      const targetRow = this.row - 1 + r;
      while (this.sheet.rows.length <= targetRow) this.sheet.rows.push([]);
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.rows[targetRow][this.col - 1 + c] = values[r][c];
      }
    }
    return this;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const sourceRow = this.sheet.rows[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = sourceRow[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.frozenRows = 0;
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  appendRow(arr) { this.rows.push(arr.slice()); return this; }
  getLastRow() { return this.rows.length; }
  getRange(row, col, numRows, numCols) { return new FakeRange(this, row, col, numRows, numCols); }
  getDataRange() {
    const width = this.rows.reduce((m, r) => Math.max(m, r.length), 0) || 1;
    return new FakeRange(this, 1, 1, this.rows.length, width);
  }
  setFrozenRows(n) { this.frozenRows = n; return this; }
  clear() { this.rows = []; return this; }
  deleteRow(rowNum1Based) { this.rows.splice(rowNum1Based - 1, 1); }
}

class FakeSpreadsheet {
  constructor(name) {
    this.name = name;
    this.id = 'fake-ss-' + (++FakeSpreadsheet._counter);
    this.sheets = [new FakeSheet('Sheet1')];
  }
  getId() { return this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find((s) => s.name === name) || null; }
  insertSheet(name) {
    const s = new FakeSheet(name);
    this.sheets.push(s);
    return s;
  }
}
FakeSpreadsheet._counter = 0;

function makeSpreadsheetAppMock() {
  const registry = new Map();
  return {
    _registry: registry,
    create(name) {
      const ss = new FakeSpreadsheet(name);
      registry.set(ss.getId(), ss);
      return ss;
    },
    openById(id) {
      if (!registry.has(id)) throw new Error('Spreadsheet not found: ' + id);
      return registry.get(id);
    },
  };
}

function makePropertiesServiceMock() {
  const store = new Map();
  const scriptProperties = {
    getProperty(key) { return store.has(key) ? store.get(key) : null; },
    setProperty(key, value) { store.set(key, String(value)); return scriptProperties; },
    deleteProperty(key) { store.delete(key); return scriptProperties; },
  };
  return { getScriptProperties() { return scriptProperties; } };
}

function makeSessionMock(email = 'teacher@example.com') {
  return { getActiveUser() { return { getEmail() { return email; } }; } };
}

// Loads a real .gs file's source into a fresh vm context with the mocks
// above, then exposes the functions named in `exposeNames` for direct
// calling. Returns { exported, sandbox } — `sandbox` is the full vm context
// (so a test can reach into PropertiesService/SpreadsheetApp directly to
// set up or inspect state the public API doesn't expose, e.g. backdating a
// queue row's timestamp to simulate staleness).
function loadGasFile(absPath, exposeNames, extraGlobals = {}) {
  const source = fs.readFileSync(absPath, 'utf8');
  const sandbox = {
    console,
    PropertiesService: makePropertiesServiceMock(),
    SpreadsheetApp: makeSpreadsheetAppMock(),
    Session: makeSessionMock(),
    Utilities: { getUuid: () => 'fake-uuid-' + Math.random().toString(36).slice(2) },
    ...extraGlobals,
  };
  const context = vm.createContext(sandbox);
  const footer = `\n;globalThis.__exported = { ${exposeNames.join(', ')} };`;
  vm.runInContext(source + footer, context, { filename: absPath });

  const raw = context.__exported || {};
  const exported = {};
  for (const name of exposeNames) {
    const value = raw[name];
    exported[name] = typeof value === 'function'
      ? (...args) => crossRealmSafe(value(...args))
      : crossRealmSafe(value);
  }
  return { exported, sandbox: context };
}

module.exports = { loadGasFile, FakeSheet, FakeSpreadsheet };
