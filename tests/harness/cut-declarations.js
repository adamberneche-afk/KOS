'use strict';
// The test cutter: cutDeclarations, cutSpan, cutStatement (structure audit
// 3.11). It lives in tools/lib/declarations.js since 2026-11-21, so
// gas-lint's second-copy check reads function bodies exactly as tests cut
// them; this keeps every test's require path.
module.exports = require('../../tools/lib/declarations.js');
