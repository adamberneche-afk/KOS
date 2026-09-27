// =============================================================================
// Diagnostics.gs — see what a deployment is doing when DevTools is blocked.
//
// District policy blocks DevTools on the devices LeaderHub runs on, so a
// blank or broken page gives no console, no network panel and no error
// text to go on. These modes put that information on the page itself and
// in the Apps Script editor's Executions log. They're reached through the
// same /exec or /dev URL as the app:
//
//   ?diag=1            A tiny server-checks page, no app code: who you're
//                      signed in as, whether you're the owner, how big the
//                      served app is, and two live google.script.run calls
//                      (one public, one to a private `_` function, since
//                      Apps Script refuses to run private functions from
//                      the browser).
//   ?diag=probe        The full app, plus a status panel pinned to the
//                      bottom of the screen: which of the page's script
//                      blocks actually ran, every error with its block and
//                      line, and page-load milestones. A summary is also
//                      sent to lhDiagReport, which logs it to Executions.
//   ?diag=probe&parts=N  The same, but only the first N script blocks are
//                      served. Use it to bisect a block that hangs the page
//                      before anything paints, when even the panel can't
//                      appear.
//
// Owner-only, like the app: ?diag=1 tells anyone else only the address
// they're signed in as, and probe mode serves nothing to them.
//
// Test changes at the /dev link without touching users:
//   .\run.ps1 -Latest -HeadOnly -Only leader-hub
// =============================================================================

// The name build.js stamps on each script block ("//# sourceURL=..." just
// before its closing tag). Every block the probe tracks carries one.
const LH_DIAG_BLOCK_MARKER = /\/\/# sourceURL=([^\s<]+)\s*$/;

// Called from doGet() whenever ?diag is present.
function lhDiagnosticResponse_(e) {
  const mode = String((e && e.parameter && e.parameter.diag) || '');
  const cfg = getConfig_();
  const owner = _isAuthorizedOwner_(cfg);

  if (mode === 'probe') {
    if (!owner) return _lhDiagNotOwner_();
    const raw = String((e.parameter && e.parameter.parts) || '').trim();
    const parts = /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
    const html = HtmlService.createHtmlOutputFromFile('student-leader-hub').getContent();
    return HtmlService.createHtmlOutput(lhDiagInstrument_(html, parts))
      .setTitle('LeaderHub — diagnostic')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput(_lhDiagServerPage_(cfg, owner))
    .setTitle('LeaderHub — diagnostic');
}

function _lhDiagNotOwner_() {
  const viewer = Session.getActiveUser().getEmail();
  return HtmlService.createHtmlOutput(
    '<p>Not authorized for this diagnostic. You are signed in as <b>' +
    _lhDiagEsc_(viewer || '(no address visible to this script)') +
    '</b>, which is not this deployment\'s OWNER_EMAIL.</p>'
  ).setTitle('LeaderHub — diagnostic');
}

// Finds every <script> element the way a browser's tokenizer does: HTML
// comments are skipped, and inside a script element nothing but its own
// closing tag counts. A plain search would trip on "<script" text inside
// a comment in the head, or inside a JavaScript string (a print template
// in block 1 builds a whole page as a string). Returns
// [{ start, end, name }] where name is the block's sourceURL, or null.
function lhDiagScriptElements_(html) {
  const out = [];
  const lower = html.toLowerCase();
  let pos = 0;
  while (pos < html.length) {
    const comment = lower.indexOf('<!--', pos);
    const script = lower.indexOf('<script', pos);
    if (script === -1) break;
    if (comment !== -1 && comment < script) {
      const close = lower.indexOf('-->', comment + 4);
      if (close === -1) break;
      pos = close + 3;
      continue;
    }
    const tagEnd = html.indexOf('>', script);
    const closeTag = lower.indexOf('</script', tagEnd + 1);
    if (tagEnd === -1 || closeTag === -1) break;
    const end = html.indexOf('>', closeTag) + 1;
    const body = html.slice(tagEnd + 1, closeTag);
    const m = LH_DIAG_BLOCK_MARKER.exec(body);
    out.push({ start: script, end: end, name: m ? m[1] : null });
    pos = end;
  }
  return out;
}

// The app's HTML with the probe added: a bootstrap at the top of <head>
// (so it runs before any app script), a marker after every named block,
// and, when `parts` is a number, every named block after the first
// `parts` replaced by a comment. Unnamed scripts (the Google sign-in
// loader) are left alone. Throws rather than serve a page it can't
// instrument correctly.
function lhDiagInstrument_(html, parts) {
  const blocks = lhDiagScriptElements_(html).filter(function (b) { return b.name; });
  const markerCount = lhDiagCountMarkers_(html);
  if (blocks.length === 0 || blocks.length !== markerCount) {
    throw new Error('Diagnostic probe: found ' + blocks.length + ' named script blocks but ' +
      markerCount + ' sourceURL markers. The page layout changed; the probe needs updating.');
  }
  const keep = parts === null || parts === undefined ? blocks.length : Math.max(0, parts);

  let out = '';
  let pos = 0;
  blocks.forEach(function (b, i) {
    out += html.slice(pos, b.start);
    if (i < keep) {
      out += html.slice(b.start, b.end) +
        '<script>window.__lhDiagRan && window.__lhDiagRan(' + lhDiagJsLiteral_(b.name) + ')</script>';
    } else {
      out += '<!-- lh-diag: ' + b.name + ' not served (parts=' + keep + ') -->';
    }
    pos = b.end;
  });
  out += html.slice(pos);

  const expected = blocks.slice(0, keep).map(function (b) { return b.name; });
  const boot = '<script>' + _lhDiagBootstrapJs_(expected, blocks.length, parts) + '</script>';
  const headStart = out.toLowerCase().indexOf('<head');
  const headEnd = headStart === -1 ? -1 : out.indexOf('>', headStart);
  if (headEnd === -1) throw new Error('Diagnostic probe: the page has no <head> tag.');
  const at = headEnd + 1;
  return out.slice(0, at) + boot + out.slice(at);
}

// A value as a JavaScript literal that is safe inside an inline <script>.
// JSON.stringify alone leaves <, >, / and the U+2028/U+2029 line
// separators as they are, so a value containing "</script>" would end the
// script element early. Block names can't contain "<" today (the marker
// pattern stops at it), but the probe shouldn't depend on that.
function lhDiagJsLiteral_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\//g, '\\u002f')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// How many "//# sourceURL=<name></script>" block endings the raw text
// has, found by plain string search rather than a tag-matching regex.
// lhDiagInstrument_ checks this against what the tokenizer found.
function lhDiagCountMarkers_(html) {
  const lower = html.toLowerCase();
  const tag = '//# sourceurl=';
  let count = 0;
  let pos = lower.indexOf(tag);
  while (pos !== -1) {
    let i = pos + tag.length;
    while (i < lower.length && !/[\s<]/.test(lower.charAt(i))) i++;
    while (i < lower.length && /\s/.test(lower.charAt(i))) i++;
    if (lower.startsWith('</script', i)) count++;
    pos = lower.indexOf(tag, i);
  }
  return count;
}

// Browser-side probe. Plain ES5 and self-contained, so it runs even if the
// app's own code is what's broken. Uses addEventListener rather than
// window.onerror, which the app's error handler replaces. The panel is
// attached to <html> straight away and moved into <body> once there is one.
function _lhDiagBootstrapJs_(expected, total, parts) {
  const cfg = lhDiagJsLiteral_({ expected: expected, total: total, parts: parts });
  return '(' + function (CFG) {
    var t0 = Date.now();
    var st = { expected: CFG.expected, total: CFG.total, parts: CFG.parts, ran: [], errors: [], events: [],
      ua: navigator.userAgent };
    window.__lhDiag = st;
    function ms() { return (Date.now() - t0) + 'ms'; }
    var panel = document.createElement('div');
    panel.id = 'lh-diag-panel';
    panel.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'max-height:45vh;overflow:auto;background:#111;color:#eee;font:12px/1.45 monospace;' +
      'padding:8px 10px;border-top:3px solid #f5a623;white-space:pre-wrap;');
    function attach() {
      var root = document.body || document.documentElement;
      if (panel.parentNode !== root) root.appendChild(panel);
    }
    function ranNames() { return st.ran.map(function (r) { return r.name; }); }
    function render() {
      var names = ranNames();
      var missing = st.expected.filter(function (n) { return names.indexOf(n) === -1; });
      var lines = ['LeaderHub diagnostic -- ' + (st.parts === null ? 'all ' + st.total + ' blocks served'
        : 'first ' + st.expected.length + ' of ' + st.total + ' blocks served')];
      lines.push('Blocks ran: ' + names.length + ' of ' + st.expected.length +
        (missing.length ? '   NOT RUN: ' + missing.join(', ') : '   (all)'));
      lines.push('Errors: ' + st.errors.length);
      st.errors.forEach(function (e) { lines.push('  ! ' + e); });
      if (st.events.length) lines.push('Events: ' + st.events.join(' | '));
      panel.textContent = lines.join('\n');
    }
    window.__lhDiagRan = function (name) { st.ran.push({ name: name, at: ms() }); render(); attach(); };
    window.addEventListener('error', function (ev) {
      var t = ev.target;
      var what = (t && t !== window && (t.src || t.href))
        ? 'failed to load ' + (t.src || t.href)
        : (ev.message || 'error') + ' @ ' + (ev.filename || '?') + ':' + (ev.lineno || '?') + ':' + (ev.colno || '?');
      st.errors.push(what + ' (' + ms() + ')');
      render(); attach();
    }, true);
    window.addEventListener('unhandledrejection', function (ev) {
      var r = ev.reason;
      st.errors.push('unhandled promise rejection: ' + ((r && r.message) || r) + ' (' + ms() + ')');
      render(); attach();
    });
    function report(label) {
      try {
        if (!(window.google && google.script && google.script.run)) {
          st.events.push(label + ': google.script.run unavailable'); render(); return;
        }
        var summary = { label: label, at: ms(), parts: st.parts, total: st.total,
          ran: ranNames(), missing: st.expected.filter(function (n) { return ranNames().indexOf(n) === -1; }),
          errors: st.errors, events: st.events, ua: st.ua };
        google.script.run
          .withSuccessHandler(function () { st.events.push(label + ' logged to Executions'); render(); })
          .withFailureHandler(function (e) { st.events.push(label + ' log failed: ' + ((e && e.message) || e)); render(); })
          .lhDiagReport(JSON.stringify(summary));
      } catch (e) {
        st.events.push(label + ' log threw: ' + e.message); render();
      }
    }
    document.addEventListener('DOMContentLoaded', function () {
      st.events.push('DOMContentLoaded ' + ms()); render(); attach();
    });
    window.addEventListener('load', function () {
      st.events.push('load ' + ms()); render(); attach();
      window.setTimeout(function () { report('after load'); }, 3000);
    });
    window.setTimeout(function () { report('20s snapshot'); }, 20000);
    render(); attach();
  }.toString() + ')(' + cfg + ');';
}

// The ?diag=1 page: server-side facts, plus two live calls from the
// browser. Everything past the signed-in address is owner-only.
function _lhDiagServerPage_(cfg, owner) {
  const viewer = Session.getActiveUser().getEmail();
  let scriptTable = '';
  const rows = [
    ['Time (server)', new Date().toISOString()],
    ['Signed in as', viewer || '(no address visible to this script)'],
    ['OWNER_EMAIL set', cfg.ownerEmail ? 'yes' : 'NO -- set it in Project Settings > Script Properties'],
    ['You are the owner', owner ? 'yes' : 'no'],
  ];
  if (owner) {
    try {
      const html = HtmlService.createHtmlOutputFromFile('student-leader-hub').getContent();
      const all = lhDiagScriptElements_(html);
      const blocks = all.filter(function (b) { return b.name; });
      const sizes = blocks.map(function (b) { return b.end - b.start; });
      rows.push(['App page size', html.length + ' characters']);
      rows.push(['Named script blocks', blocks.length + ' (largest ' + Math.max.apply(null, sizes) + ' characters)']);
      rows.push(['All script elements', String(all.length)]);
      rows.push(['sourceURL markers in raw text', String(lhDiagCountMarkers_(html))]);
      scriptTable = _lhDiagScriptTable_(html, all);
    } catch (err) {
      rows.push(['App page', 'could not be read: ' + err.message]);
    }
    rows.push(['Deploy marker', typeof LH_DEPLOY_VERSION_SHA === 'string' ? LH_DEPLOY_VERSION_SHA.slice(0, 7) : '(none)']);
  }
  const table = rows.map(function (r) {
    return '<tr><th>' + _lhDiagEsc_(r[0]) + '</th><td>' + _lhDiagEsc_(r[1]) + '</td></tr>';
  }).join('');

  const browser = owner ? (
    '<h2>From this browser</h2><table>' +
    '<tr><th>JavaScript runs</th><td id="js">NO -- scripts are blocked or failed to load</td></tr>' +
    '<tr><th>google.script.run</th><td id="gsr">not checked</td></tr>' +
    '<tr><th>Public server call (lhDiagPing)</th><td id="pub">waiting</td></tr>' +
    '<tr><th>Private server call (lhGetAllConfig_)</th><td id="priv">waiting</td></tr>' +
    '</table>' +
    '<p>The app loads and saves settings, data and SCR scores through private <code>_</code> ' +
    'functions. If the private call fails while the public one works, none of that ' +
    'is reaching the server.</p>' +
    scriptTable +
    '<p>Probe the full app: add <code>?diag=probe</code> to this URL (or ' +
    '<code>?diag=probe&amp;parts=8</code> to serve only the first 8 blocks).</p>' +
    '<script>(function(){' +
    'function set(id,t){document.getElementById(id).textContent=t;}' +
    'set("js","yes");' +
    'if(!(window.google&&google.script&&google.script.run)){set("gsr","NOT available");return;}' +
    'set("gsr","available");' +
    'google.script.run.withSuccessHandler(function(r){set("pub","OK -- "+JSON.stringify(r));})' +
    '.withFailureHandler(function(e){set("pub","FAILED -- "+((e&&e.message)||e));}).lhDiagPing();' +
    'google.script.run.withSuccessHandler(function(){set("priv","OK -- private functions are callable here");})' +
    '.withFailureHandler(function(e){set("priv","FAILED -- "+((e&&e.message)||e));}).lhGetAllConfig_();' +
    '})();</script>'
  ) : '';

  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#222}' +
    'th{text-align:left;padding:4px 14px 4px 0;vertical-align:top;white-space:nowrap}' +
    'td{padding:4px 0;font-family:monospace}h1{font-size:20px}h2{font-size:16px;margin-top:22px}' +
    'table.blocks td,table.blocks th{padding:2px 8px;font-size:11px;border-bottom:1px solid #ddd;word-break:break-all}' +
    '</style></head><body><h1>LeaderHub diagnostic</h1><table>' + table + '</table>' +
    browser + '</body></html>';
}

// Every script element in the page as Apps Script serves it: position,
// size, name, and how it starts and ends. Compare against the repo's built
// student-leader-hub.html, where no named block is over ~70,000
// characters. If what's served differs, the difference is on Google's side
// of the push, not in the build.
function _lhDiagScriptTable_(html, all) {
  const rows = all.map(function (b, i) {
    const el = html.slice(b.start, b.end);
    const flat = function (t) { return t.replace(/\s+/g, ' '); };
    return '<tr><td>' + (i + 1) + '</td><td>' + b.start + '</td><td>' + (b.end - b.start) + '</td><td>' +
      _lhDiagEsc_(b.name || '(unnamed)') + '</td><td>' + _lhDiagEsc_(flat(el.slice(0, 70))) + '</td><td>' +
      _lhDiagEsc_(flat(el.slice(-70))) + '</td></tr>';
  }).join('');
  return '<h2>Script elements as served</h2><table class="blocks"><tr><th>#</th><th>starts at</th>' +
    '<th>size</th><th>name</th><th>begins</th><th>ends</th></tr>' + rows + '</table>';
}

function _lhDiagEsc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Callable from the browser (no trailing underscore: google.script.run
// cannot call private functions) ─────────────────────────────────────────

// Round-trip check for ?diag=1. Returns only the caller's own address.
function lhDiagPing() {
  return { ok: true, server_time: new Date().toISOString(), you: Session.getActiveUser().getEmail() || '' };
}

// Probe mode's summary, logged so it shows in the editor's Executions view
// (open the lhDiagReport run). Capped so a flood of errors can't make a
// huge log entry. Returns nothing sensitive.
function lhDiagReport(summaryJson) {
  const text = String(summaryJson || '').slice(0, 20000);
  console.log('[LH-DIAG] ' + text);
  return true;
}
