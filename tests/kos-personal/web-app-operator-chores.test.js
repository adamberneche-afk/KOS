'use strict';
// kos-personal's web app (8_WebApp_UI.html), UX audit 2026-10-22: fix-first
// 14 and order-of-work 16. Pins what the operator now gets in the app:
//   - "Archive" moves finished rows only, and confirms with a count first;
//   - the Queue tab lists failed rows, with Retry on the existing requeue path;
//   - the System tab keeps the latest advisor review (ID, copy, document,
//     who has answered) and looks any review up by ID;
//   - a "Needs you" strip and tab badges show open items on every tab.
// The server halves are tested in staging-archive, staging-requeue and
// council-review-status. Markup is cut by plain string search, not a
// tag-matching regex (the pattern code scanning flags).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const UI = fs.readFileSync(path.join(KP, '8_WebApp_UI.html'), 'utf8');
const SCRIPT = UI.slice(UI.indexOf('<script>') + '<script>'.length, UI.lastIndexOf('</script>'));

function between(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, 'missing: ' + start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b >= 0, 'missing after ' + start + ': ' + end);
  return src.slice(a, b);
}
// The element whose opening tag carries this id, up to the next '>'.
function openTag(id) {
  const at = UI.indexOf('id="' + id + '"');
  assert.ok(at >= 0, 'no element with id ' + id);
  return UI.slice(UI.lastIndexOf('<', at), UI.indexOf('>', at) + 1);
}
// A string-list const from a .gs file: const NAME = ['A', 'B'];
function gsList(file, name) {
  const src = fs.readFileSync(path.join(KP, file), 'utf8');
  const line = between(src, 'const ' + name + ' = [', '];');
  return line.slice(line.indexOf('[') + 1).split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('Archive says finished rows, asks for the count first, and confirms with it', () => {
  const btn = between(UI, 'id="btn-archive"', '</button>');
  assert.ok(btn.includes('Archive finished rows'));
  assert.ok(!/failed/i.test(btn), 'the button no longer offers to archive failed rows');

  const handler = between(SCRIPT, 'function handleArchive()', 'function _runArchive_()');
  assert.ok(handler.includes("callServer('previewStagingArchive'"), 'the first tap only counts');
  assert.ok(!handler.includes("callServer('archiveStagingPipeline'"), 'the first tap never archives');
  assert.ok(handler.includes("_confirmTap_('btn-archive'"), 'a second tap confirms');
  const opts = between(SCRIPT, 'function _archiveConfirmOpts_()', 'function handleArchive()');
  assert.ok(opts.includes('p.finished') && opts.includes('p.failedKept'), 'the confirm names both counts');
  assert.ok(between(SCRIPT, 'function _runArchive_()', 'function handlePromotion()')
    .includes("callServer('archiveStagingPipeline'"));
});

test('the Queue tab has a failed list whose Retry previews before it requeues', () => {
  assert.ok(openTag('failed-wrap').includes('display:none'), 'hidden until something failed');
  assert.ok(openTag('failed-list'));
  const preview = between(SCRIPT, 'function previewRetry(', 'function confirmRetry(');
  assert.ok(preview.includes("callServer('previewRetryFailedRow'"));
  assert.ok(!preview.includes("callServer('retryFailedRow'"));
  assert.ok(between(SCRIPT, 'function confirmRetry(', 'function cancelRetry(')
    .includes("callServer('retryFailedRow'"));
  assert.ok(between(SCRIPT, 'function renderQueue(', 'function _fmtSyncTime(').includes('loadFailedRows()'));
});

test('every failed status has a plain name, and Retry is offered only where the server can requeue', () => {
  const ctx = {};
  vm.runInNewContext(between(SCRIPT, 'const FAILED_STATUS_TEXT', 'const NO_RETRY_NOTE') +
    '\nthis.out = FAILED_STATUS_TEXT;', ctx);
  const text = ctx.out;
  const terminal = gsList('5_Error_And_Utilities.gs', 'TERMINAL_FAILED_STATUSES');
  const requeueable = gsList('19_StagingRequeue.gs', 'RQ_STATUSES');
  assert.ok(terminal.length >= 7);
  for (const st of terminal) {
    assert.ok(text[st], 'no plain name for ' + st);
    assert.ok(!/_/.test(text[st].label), 'a plain label for ' + st);
    assert.equal(text[st].retry, requeueable.includes(st), 'retry flag for ' + st);
  }
});

test('the System tab keeps the latest advisor review and looks one up by ID', () => {
  assert.ok(openTag('council-panel'));
  assert.ok(openTag('council-lookup').includes('type="text"'));
  assert.ok(UI.includes('for="council-lookup"'), 'the lookup field has a label');
  const render = between(SCRIPT, 'function renderCouncilPanel(', 'function copyCouncilId(');
  for (const piece of ['copyCouncilId()', 'res.docUrl', 'goToVerdict()', 'res.pending', 'res.unrecognized', 'res.halted']) {
    assert.ok(render.includes(piece), 'the review panel shows ' + piece);
  }
  assert.ok(between(SCRIPT, 'function loadCouncilPanel(', 'function lookupCouncil(')
    .includes("callServer('getCouncilReviewForWebApp'"));
  assert.ok(between(SCRIPT, 'function goToVerdict()', '// ── Diagnostics')
    .includes("switchType('cogverdict')"), 'Record a verdict opens the verdict form');
  assert.ok(between(SCRIPT, 'function loadDiagnostics()', '}').includes('loadCouncilPanel()'));
});

function needsHelpers() {
  const ctx = { Date };
  vm.runInNewContext(between(SCRIPT, 'const needsState', 'function renderNeedsYou()') +
    '\nfunction plainAdvisor(n){return n;}\nthis.out = { needsState, _needsItems_ };', ctx);
  return ctx.out;
}

test('the Needs you strip lists open items from every tab, and nothing when all is done', () => {
  const { needsState, _needsItems_: raw } = needsHelpers();
  // Plain copies: arrays made inside the vm fail deepEqual on their prototype.
  const _needsItems_ = () => JSON.parse(JSON.stringify(raw()));
  assert.deepEqual(_needsItems_(), [], 'nothing loaded yet shows nothing');

  needsState.review = 2;
  needsState.failed = 1;
  needsState.unknown = 0;
  needsState.notPersonalized = true;
  needsState.council = { success: true, councilId: 'SB_1', complete: false, halted: false,
    pending: ['MUSE', 'CURATOR'], expected: 6, startedAt: new Date().toISOString() };
  const items = _needsItems_();
  assert.deepEqual(items.map((i) => i.tab), ['queue', 'queue', 'diag', 'diag']);
  assert.match(items[0].text, /^2 items need your help/);
  assert.match(items[1].text, /^1 failed item /);
  assert.match(items[3].text, /SB_1: waiting on 2 of 6 advisors/);

  needsState.council = Object.assign({}, needsState.council, { halted: true, nonApprovedCount: 3 });
  assert.match(_needsItems_()[3].text, /halted/);

  needsState.council = Object.assign({}, needsState.council, { halted: false,
    startedAt: new Date(Date.now() - 30 * 86400000).toISOString() });
  assert.equal(_needsItems_().length, 3, 'an unfinished review stops nagging after a while');

  Object.assign(needsState, { review: 0, failed: 0, unknown: 0, notPersonalized: false, council: { success: true, none: true } });
  assert.deepEqual(_needsItems_(), []);
});

test('the strip is on every tab, and the Queue and System tabs carry badges', () => {
  const main = UI.indexOf('id="main-content"');
  const strip = UI.indexOf('id="needs-you"');
  const firstTab = UI.indexOf('id="tab-ingest"');
  assert.ok(main < strip && strip < firstTab, 'the strip sits above the tabs, not inside one');
  assert.ok(openTag('needs-you').includes('aria-labelledby="needs-you-title"'));
  assert.ok(between(UI, 'id="nav-queue"', '</button>').includes('id="badge-queue"'));
  assert.ok(between(UI, 'id="nav-diag"', '</button>').includes('id="badge-diag"'));
  const boot = between(SCRIPT, '(function init()', '})();');
  assert.ok(boot.includes("callServer('getQueueMetrics'") && boot.includes('loadCouncilPanel()'),
    'the strip is filled at load, before any tab is opened');
});
