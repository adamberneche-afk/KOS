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
// calling createSubPlanDoc_/createBragDraft_/scanHorizonLabel_/
// emailBridgeGetHorizonItems_/doPost from a test using this sandbox will
// throw ReferenceError by design.

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
  // Single-cell convenience API — real Range.setValue()/getValue() act on
  // the top-left cell of the range regardless of its size. Several cas-ccps
  // files call sheet.getRange(row, col) (a single cell, no numRows/numCols)
  // then .setValue()/.getValue() directly, rather than the array-shaped
  // setValues()/getValues() above.
  setValue(value) {
    const targetRow = this.row - 1;
    while (this.sheet.rows.length <= targetRow) this.sheet.rows.push([]);
    this.sheet.rows[targetRow][this.col - 1] = value;
    return this;
  }
  getValue() {
    const sourceRow = this.sheet.rows[this.row - 1] || [];
    const v = sourceRow[this.col - 1];
    return v === undefined ? '' : v;
  }
  // Real Apps Script API — blanks every cell in the range without
  // shifting any other row (unlike Sheet.deleteRow(), which removes the
  // row entirely and shifts everything below it up by one — see
  // 35_FlowPreflightAndCanary.js's own header on exactly this
  // distinction: cleanUpFlow1Canary() needs row numbers below the
  // cleared row to stay stable for anything else that tracks rows by
  // absolute position).
  clearContent() {
    return this.setValues(
      Array.from({ length: this.numRows }, () => Array.from({ length: this.numCols }, () => ''))
    );
  }
  // Real Apps Script API — cosmetic formatting calls. Every setup/tab-
  // creation function in this repo chains these right after writing a
  // header row (setFontWeight('bold'), setBackground('#f3f3f3')) or
  // forces a column to plain-text format (setNumberFormat('@'), see
  // 22_LessonContextHandler.js's own comment on the ISO-date-autoconvert
  // bug this prevents). No test in this repo asserts on formatting
  // itself — these exist only so a file that calls them can load and
  // run at all, chainable no-ops like the rest of this mock.
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat() { return this; }
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
  getRange(row, col, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols); }
  getDataRange() {
    const width = this.rows.reduce((m, r) => Math.max(m, r.length), 0) || 1;
    return new FakeRange(this, 1, 1, this.rows.length, width);
  }
  setFrozenRows(n) { this.frozenRows = n; return this; }
  clear() { this.rows = []; return this; }
  deleteRow(rowNum1Based) { this.rows.splice(rowNum1Based - 1, 1); }
  // Real Apps Script API — the sheet's used-range column count. Same
  // width calculation as getDataRange() above (the widest row seen so
  // far), 0 rather than 1 on a genuinely empty sheet (matching real
  // Sheets: getLastColumn() on a blank sheet is 0, unlike getDataRange()
  // which always returns at least a 1x1 range).
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  // Cosmetic only — no test in this repo asserts on column width.
  autoResizeColumns() { return this; }
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

// Real Apps Script API — the modal-dialog UI object SpreadsheetApp.getUi()/
// DocumentApp.getUi() return. Several admin-facing entry points (e.g.
// 35_FlowPreflightAndCanary.js's runFlowPreflightCheckNow()/
// runFlow1CanaryNow()) call .alert() as their one visible side effect —
// this mock records every call (text and button choice) so a test can
// assert on what the user would have seen, rather than needing to mock
// it away silently. alert() supports both the single-message form and
// the (title, message, buttonSet) form real Apps Script accepts;
// promptResponse lets a test script a canned Button answer for any
// alert with an OK_CANCEL/YES_NO button set, defaulting to OK/YES so a
// script that doesn't care about the branch still proceeds.
function makeUiMock(promptResponse) {
  const calls = [];
  const ButtonSet = { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' };
  const Button = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO', CLOSE: 'CLOSE' };
  return {
    _calls: calls,
    ButtonSet,
    Button,
    alert(...args) {
      const call = args.length >= 2
        ? { title: args[0], message: args[1], buttonSet: args[2] }
        : { title: null, message: args[0], buttonSet: null };
      calls.push(call);
      return promptResponse !== undefined ? promptResponse : Button.OK;
    },
  };
}

function makeSpreadsheetAppMock() {
  const registry = new Map();
  const ui = makeUiMock();
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
    // Real Apps Script API — several files call SpreadsheetApp.flush()
    // after a batch of writes to force them out before the next read. A
    // no-op here is correct: this mock's writes (FakeRange.setValue(s))
    // already apply synchronously, so there is nothing to flush.
    flush() {},
    getUi() { return ui; },
  };
}

function makePropertiesServiceMock() {
  const store = new Map();
  const scriptProperties = {
    getProperty(key) { return store.has(key) ? store.get(key) : null; },
    setProperty(key, value) { store.set(key, String(value)); return scriptProperties; },
    deleteProperty(key) { store.delete(key); return scriptProperties; },
    // Real Apps Script API — getConfig_() (00_SharedConfig.js) reads every
    // Script Property at once via getProperties(), and several cron-style
    // functions (e.g. 25_WarmUpWriter.js's _checkCronHealth_) batch-write
    // several keys at once via setProperties(). Both were missing here,
    // which made any file calling either throw "is not a function" for a
    // reason that had nothing to do with the logic actually under test.
    getProperties() { return Object.fromEntries(store); },
    setProperties(properties, deleteAllOthers) {
      if (deleteAllOthers) store.clear();
      Object.keys(properties || {}).forEach((k) => store.set(k, String(properties[k])));
      return scriptProperties;
    },
  };
  return { getScriptProperties() { return scriptProperties; } };
}

function makeSessionMock(email = 'teacher@example.com') {
  return {
    getActiveUser() { return { getEmail() { return email; } }; },
    getEffectiveUser() { return { getEmail() { return email; } }; },
    // Real Apps Script API — needs no OAuth scope (unlike
    // getActiveUser()/getEffectiveUser()), which is exactly why
    // CreateWarmUpDocStep.gs uses this rather than a hardcoded timezone
    // string; see that file's own header. A fixed value is enough here —
    // no test in this repo needs real per-environment timezone behavior.
    getScriptTimeZone() { return 'America/New_York'; },
  };
}

// Real Apps Script API — get()/put()/remove() on getScriptCache(). No TTL
// enforcement (a unit test controls its own clock only via explicit
// remove() calls, not real elapsed time) — good enough for testing the
// cache-hit/cache-miss/invalidation logic itself, not for testing expiry
// timing, which no test in this repo needs.
function makeCacheServiceMock() {
  const store = new Map();
  const cache = {
    get(key) { return store.has(key) ? store.get(key) : null; },
    put(key, value /* , ttlSeconds — ignored, see comment above */) { store.set(key, String(value)); },
    remove(key) { store.delete(key); },
  };
  return { getScriptCache() { return cache; }, getUserCache() { return cache; } };
}

// Real Apps Script API — a no-op lock. A synchronous VM sandbox can never
// exercise real cross-request contention (there's only ever one thread of
// execution), so this exists purely so a file that calls
// LockService.getScriptLock().waitLock()/.releaseLock() (e.g. SCR.gs,
// guarding its read-modify-write of the scores sheet against two
// overlapping flushes) can load and run at all — not to test locking
// behavior itself, which no test in this repo needs.
function makeLockServiceMock() {
  const lock = { waitLock() {}, releaseLock() {}, tryLock() { return true; }, hasLock() { return true; } };
  return { getScriptLock() { return lock; }, getUserLock() { return lock; }, getDocumentLock() { return lock; } };
}

// Real Workspace Add-ons API — the Studio custom-step output wrapper
// (cas-ccps/studio-steps/*.gs, kos-personal/studio-steps/*.gs). A step's
// onXExecute never returns its output values directly; every one funnels
// them through StepsShared.gs's stringVar_()/intVar_() ->
// buildOutputRenderAction_() chain, built on top of
// AddOnsResponseService.newVariableData()/newReturnOutputVariablesAction()/
// newHostAppAction()/newRenderActionBuilder(). This mock keeps each
// variable's value in the same { stringValues: [...] } / { intValues: [...] }
// shape the real API uses (and the same shape these steps themselves read
// *inputs* in via inStr_()) so a test can assert on
// result.variables.someOutputId.stringValues[0] without needing to know
// anything about the real API's internal wiring.
function makeAddOnsResponseServiceMock() {
  function newVariableData() {
    const data = {};
    return {
      addStringValue(v) { data.stringValues = [String(v)]; return data; },
      addIntegerValue(v) { data.intValues = [Math.trunc(Number(v) || 0)]; return data; },
    };
  }
  function newReturnOutputVariablesAction() {
    let map = {};
    const self = { setVariableDataMap(m) { map = m; return self; }, _map() { return map; } };
    return self;
  }
  function newHostAppAction() {
    let workflowAction = null;
    const self = { setWorkflowAction(wa) { workflowAction = wa; return self; }, _action() { return workflowAction; } };
    return self;
  }
  function newRenderActionBuilder() {
    let hostAppAction = null;
    const self = {
      setHostAppAction(a) { hostAppAction = a; return self; },
      build() { return { variables: hostAppAction._action()._map() }; },
    };
    return self;
  }
  return { newVariableData, newReturnOutputVariablesAction, newHostAppAction, newRenderActionBuilder };
}

// Real Apps Script API — Drive folder/file tree, deep enough for
// CreateWarmUpDocStep.gs's resolveWarmUpFolderPath_()/getOrCreateFolder_()
// (getFolderById, getFoldersByName/createFolder, getRootFolder,
// addFile/removeFile) and its post-create sharing calls
// (setSharing/addEditor on a file). Folder/file identity is by object
// reference within a single test's registry, same spirit as
// FakeSpreadsheet's id-keyed registry above — good enough to exercise the
// real folder-chain logic without a real Drive account.
class FakeDriveFolder {
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.children = []; // sub-folders
    this.files = [];
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getFoldersByName(name) {
    const matches = this.children.filter((f) => f.name === name);
    let i = 0;
    return { hasNext() { return i < matches.length; }, next() { return matches[i++]; } };
  }
  createFolder(name) {
    const f = new FakeDriveFolder(name, 'fake-folder-' + (++FakeDriveFolder._counter));
    this.children.push(f);
    return f;
  }
  addFile(file) { if (!this.files.includes(file)) this.files.push(file); return this; }
  removeFile(file) { this.files = this.files.filter((f) => f !== file); return this; }
}
FakeDriveFolder._counter = 0;

class FakeDriveFile {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sharingAccess = null;
    this.sharingPermission = null;
    this.editors = [];
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://fake-drive.example/file/' + this.id; }
  setSharing(access, permission) { this.sharingAccess = access; this.sharingPermission = permission; return this; }
  addEditor(email) { this.editors.push(email); return this; }
}

function makeDriveAppMock() {
  const folders = new Map();
  const files = new Map();
  const root = new FakeDriveFolder('My Drive', 'fake-root');
  folders.set(root.id, root);
  return {
    _folders: folders,
    _files: files,
    Access: { PRIVATE: 'PRIVATE', ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', DOMAIN: 'DOMAIN' },
    Permission: { NONE: 'NONE', VIEW: 'VIEW', EDIT: 'EDIT', COMMENT: 'COMMENT' },
    getRootFolder() { return root; },
    getFolderById(id) {
      if (!folders.has(id)) throw new Error('Folder not found: ' + id);
      return folders.get(id);
    },
    // Registers a pre-made folder under a given id — a test's setup hook,
    // not a real DriveApp method, for seeding the admin-root folder a
    // step's config references before the step runs.
    _registerFolder(folder) { folders.set(folder.id, folder); },
    getFileById(id) {
      if (!files.has(id)) throw new Error('File not found: ' + id);
      return files.get(id);
    },
    _registerFile(file) { files.set(file.id, file); },
  };
}

// Real Apps Script API — enough of Docs to exercise
// CreateWarmUpDocStep.gs's createWarmUpDoc_(), FinalizeWarmUpScoreStep.gs's
// appendWarmUpFeedbackToDoc_(), and both kos-personal steps'
// overwriteDocBody_(): create/openById, getBody, clear/setText/
// appendParagraph, and the editAsText() chain (setFontSize/
// setForegroundColor/setItalic — accepted and ignored; no test in this
// repo asserts on formatting, only on the resulting text). Wired to the
// same DriveApp mock's file registry, since DocumentApp.create() in real
// Apps Script always creates a matching Drive file with the same ID.
class FakeParagraph {
  constructor(text) { this.text = text; }
  getText() { return this.text; }
  editAsText() {
    const self = {
      setFontSize() { return self; },
      setForegroundColor() { return self; },
      setItalic() { return self; },
      setBold() { return self; },
    };
    return self;
  }
}

class FakeDocBody {
  constructor() { this.paragraphs = []; }
  clear() { this.paragraphs = []; return this; }
  appendParagraph(text) {
    const p = new FakeParagraph(text);
    this.paragraphs.push(p);
    return p;
  }
  setText(text) { this.paragraphs = [new FakeParagraph(text)]; return this; }
  getText() { return this.paragraphs.map((p) => p.text).join('\n'); }
}

class FakeDoc {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.body = new FakeDocBody();
  }
  getId() { return this.id; }
  getBody() { return this.body; }
  saveAndClose() {}
}

function makeDocumentAppMock(driveAppMock) {
  const docs = new Map();
  return {
    _docs: docs,
    create(title) {
      const id = 'fake-doc-' + (++makeDocumentAppMock._counter);
      const doc = new FakeDoc(id, title);
      docs.set(id, doc);
      const file = new FakeDriveFile(id, title);
      driveAppMock._registerFile(file);
      driveAppMock.getRootFolder().addFile(file); // DocumentApp.create() lands in root first, same as real Docs
      return doc;
    },
    openById(id) {
      if (!docs.has(id)) throw new Error('Document not found: ' + id);
      return docs.get(id);
    },
  };
}
makeDocumentAppMock._counter = 0;

// Real Apps Script API — Utilities.formatDate(date, timeZone, format).
// Only implements the handful of format tokens this repo's studio-steps
// actually use (yyyy-MM-dd, MMMM d, yyyy) — good enough to exercise real
// date-formatting call sites without pulling in a full date-format
// library. timeZone is accepted (steps must pass one; several past bugs
// in this repo were hardcoded timezone strings — see
// CreateWarmUpDocStep.gs's own header) but not applied to the underlying
// Date's fields, since a synchronous VM sandbox test controls its input
// Date directly rather than needing real timezone-conversion behavior.
function formatDateMock(date, timeZone, format) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const pad2 = (n) => String(n).padStart(2, '0');
  if (format === 'yyyy-MM-dd') {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  if (format === 'MMMM d, yyyy') {
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
  if (format === 'yyyyMMdd') {
    return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  }
  if (format === 'yyyy-MM-dd HH:mm') {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  throw new Error('formatDateMock: unsupported format "' + format + '" — add it to tests/harness/gas-sandbox.js');
}

// Loads a real .gs file's source into a fresh vm context with the mocks
// above, then exposes the functions named in `exposeNames` for direct
// calling. Returns { exported, sandbox } — `sandbox` is the full vm context
// (so a test can reach into PropertiesService/SpreadsheetApp directly to
// set up or inspect state the public API doesn't expose, e.g. backdating a
// queue row's timestamp to simulate staleness).
function loadGasFile(absPath, exposeNames, extraGlobals = {}) {
  return loadGasFiles([absPath], exposeNames, extraGlobals);
}

// Same as loadGasFile, but concatenates multiple files' source before
// running it — mirrors how a real Apps Script project actually works
// (every file bound to the same project shares one global scope; see
// tools/gas-lint/project-map.json). Needed whenever the function under
// test calls a helper declared in a sibling file of the same GAS project
// (e.g. cas-ccps's 30_SCRSuggestionEngine.js calling 00_SharedConfig.js's
// getConfig_()) — loading either file alone would throw a ReferenceError
// that has nothing to do with the logic actually being tested.
function loadGasFiles(absPaths, exposeNames, extraGlobals = {}) {
  const source = absPaths.map((p) => fs.readFileSync(p, 'utf8')).join('\n;\n');
  const driveAppMock = makeDriveAppMock();
  const sandbox = {
    console,
    PropertiesService: makePropertiesServiceMock(),
    SpreadsheetApp: makeSpreadsheetAppMock(),
    Session: makeSessionMock(),
    CacheService: makeCacheServiceMock(),
    LockService: makeLockServiceMock(),
    AddOnsResponseService: makeAddOnsResponseServiceMock(),
    DriveApp: driveAppMock,
    DocumentApp: makeDocumentAppMock(driveAppMock),
    Utilities: {
      getUuid: () => 'fake-uuid-' + Math.random().toString(36).slice(2),
      formatDate: formatDateMock,
      // Real Apps Script API — blocks for real inside a live GAS
      // execution. A no-op here, not a real setTimeout/delay: a
      // synchronous VM sandbox test needs a polling loop (e.g.
      // 35_FlowPreflightAndCanary.js's runFlow1Canary()) to run through
      // all its iterations instantly, not actually wait real wall-clock
      // seconds per attempt.
      sleep() {},
    },
    // Every cas-ccps file logs through Logger.log(...) (Apps Script's
    // built-in logger, distinct from console) on essentially every code
    // path, including ones this harness exists to exercise — without a
    // mock, calling any of them throws "Logger is not defined" for a
    // reason that has nothing to do with the logic under test.
    Logger: { log: () => {} },
    ...extraGlobals,
  };
  const context = vm.createContext(sandbox);
  const footer = `\n;globalThis.__exported = { ${exposeNames.join(', ')} };`;
  vm.runInContext(source + footer, context, { filename: absPaths[absPaths.length - 1] });

  // vm.createContext's sandbox object does NOT gain standard built-ins
  // (Date, Array, ...) as ordinary properties just by being contextified —
  // `context.Date` is undefined even though `Date` resolves fine to code
  // running *inside* the context. A test that needs to construct a value
  // the loaded file will `instanceof`-check (e.g. a Date cell) has to use
  // the context's OWN Date constructor, not this file's — so pull it out
  // here as a plain, directly-usable property on the returned `sandbox`.
  context.Date = vm.runInContext('Date', context);

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

// Builds a fake Workspace Studio step-execution event: every
// cas-ccps/studio-steps and kos-personal/studio-steps file reads its
// inputs from event.workflow.actionInvocation.inputs[name].stringValues[0]
// (via StepsShared.gs's inStr_()). inputMap's values become each input's
// sole stringValues entry; pass null (not "") for a field to leave it
// genuinely unmapped — the shape a real unmapped Studio input actually
// has (no stringValues at all), so a test can exercise inStr_()'s
// default-value fallback the same way a live flow with a field left
// unmapped would.
function makeStudioEvent(inputMap) {
  const inputs = {};
  for (const [key, value] of Object.entries(inputMap)) {
    if (value === null) continue; // unmapped — omit the key entirely
    inputs[key] = { stringValues: [String(value)] };
  }
  return { workflow: { actionInvocation: { inputs } } };
}

module.exports = {
  loadGasFile, loadGasFiles, FakeSheet, FakeSpreadsheet,
  FakeDriveFolder, FakeDriveFile, FakeDoc, makeStudioEvent,
};
