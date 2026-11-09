// =============================================================================
// FILE: 77_SlidesReader.js
// BOUND TO: Student Dashboard web app (cas-ccps:student-dashboard), where
//   Submit runs, as the deploying account (USER_DEPLOYING), an editor of
//   every student deck copy since Phase 4c (02's _intakeWorkFile_). The only
//   cas-ccps file in this project that calls SlidesApp; the project's
//   manifest has the presentations scope for it.
//
// Phase 4c (2026-11-09; meta/STUDENT_WORK_PLAN_2026-10.md §5): the Slides
// reader at Submit, built as 75 is for a form. For a Slides part, 13's
// Submit:
//   1. reads the deck's STRUCTURE (readSlidesStructure_): for each slide in
//      order, its title (either title placeholder), the lines of every other
//      text (text boxes, shapes, word art, table cells), its speaker notes,
//      and how many images, charts linked from Google Sheets and videos it
//      has. Never the deck's name (the copy is named after the student),
//      never an image's content, never a write. A test holds every SlidesApp
//      call here to a fixed list of getters.
//   2. runs the part's exact checks (slidesCheckReasons_, slideChecks in
//      PARTS.json, 00's normalizeSlideChecks_). A failure is a plain-words
//      "Not yet" on the card and goes nowhere else: no queue row, no Flow 2.
//   3. on a pass, rewrites the deck's snapshot doc (75's writeFormSnapshot_,
//      which rewrites any snapshot doc's response zone) with a plain-text
//      account of the deck (slidesSnapshotText_), which Flow 2 reads.
// What the probe found (2026-11-01): slide count, titles, body text, notes
// and images read back; getSheetsCharts counts linked charts only, and a
// chart pasted as a picture is an image. With a minContrast check (added
// 2026-11-09) the reader also reads each text run's color and what is
// behind it, where it can tell (00's normalizeSlideChecks_ lists the
// skips). What the reader can't judge: layout, an image's content, text
// over a picture. That stays with Flow 2's reading of the snapshot and with
// the teacher, who opens the deck.
// =============================================================================

// A snapshot longer than this is cut (a deck's text has no business being longer).
const SL_SNAPSHOT_MAX = 20000;

// The lines of a text: each paragraph or line break one line, empty ones dropped.
function _slLines_(text) {
  return String(text || "").split(/[\n\r\u000b]+/).map(function (l) { return l.replace(/\s+/g, " ").trim(); })
    .filter(function (l) { return l !== ""; });
}

// Words in a line: runs of non-space characters with a letter or digit in
// them (a lone dash or bullet character is not a word).
function _slWords_(line) {
  return String(line || "").split(/\s+/).filter(function (w) { return /[A-Za-z0-9À-ɏ]/.test(w); }).length;
}

// ── Colors, for minContrast ─────────────────────────────────────────────────

// "#rrggbb" for a Slides Color (an RGB one, or a theme color through the
// slide's color scheme), or "" when it can't be told.
function _slHex_(color, scheme) {
  if (!color) return "";
  const t = String(color.getColorType());
  if (t === String(SlidesApp.ColorType.RGB)) return String(color.asRgbColor().asHexString()).toLowerCase();
  if (t === String(SlidesApp.ColorType.THEME) && scheme) {
    return _slHex_(scheme.getConcreteColor(color.asThemeColor().getThemeColorType()), null);
  }
  return "";
}

// A fill of `alpha` over `under`, both "#rrggbb".
function _slOver_(hex, alpha, under) {
  const a = typeof alpha === "number" && alpha >= 0 && alpha <= 1 ? alpha : 1;
  if (a === 1 || !under) return hex;
  const ch = function (h, i) { return parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16); };
  let out = "#";
  for (let i = 0; i < 3; i++) {
    out += ("0" + Math.round(a * ch(hex, i) + (1 - a) * ch(under, i)).toString(16)).slice(-2);
  }
  return out;
}

// A page's solid background: "#rrggbb"; null when the page has none of its
// own (it inherits); "" when it is a picture or anything else that can't be
// told as one color.
function _slPageBg_(page, scheme) {
  const bg = page.getBackground();
  const t = String(bg.getType());
  if (t === String(SlidesApp.PageBackgroundType.NONE)) return null;
  if (t !== String(SlidesApp.PageBackgroundType.SOLID)) return "";
  const fill = bg.getSolidFill();
  const hex = _slHex_(fill.getColor(), scheme);
  return hex ? _slOver_(hex, fill.getAlpha(), "#ffffff") : "";
}

// The slide's background as shown: its own, else its layout's, else its
// master's; none at all shows white. "" when it isn't one color.
function _slSlideBg_(slide, scheme) {
  let bg = _slPageBg_(slide, scheme);
  if (bg !== null) return bg;
  const layout = slide.getLayout();
  if (layout) {
    bg = _slPageBg_(layout, scheme);
    if (bg !== null) return bg;
    const master = layout.getMaster();
    if (master) {
      bg = _slPageBg_(master, scheme);
      if (bg !== null) return bg;
    }
  }
  return "#ffffff";
}

// WCAG 2.x contrast ratio of two "#rrggbb" colors, 1 to 21.
function slContrastRatio_(a, b) {
  const lum = function (hex) {
    const v = [0, 1, 2].map(function (i) {
      const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function _slRect_(el) {
  return { left: Number(el.getLeft()) || 0, top: Number(el.getTop()) || 0,
    width: Number(el.getWidth()) || 0, height: Number(el.getHeight()) || 0 };
}
function _slOverlaps_(a, b) {
  return a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
    a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

// The deck's structure, as plain data. Throws if the deck can't be opened.
// { slides: [{ title, titleLines, lines, notes, images, charts, videos,
//   contrast? }] }
// lines: the slide's body text, one string per line, in the order the slide
// lists its elements (titles excluded); titleLines: the title's lines.
// checks (a part's slideChecks, or its JSON): with minContrast set, each
// slide also gets contrast: { background: "#rrggbb" or "" (not one color),
// pairs: [{ fg, bg, ratio }], skipped: n } — every text run whose color
// and background could be told, and how many couldn't. Without it, no
// color is read.
function readSlidesStructure_(presentationId, checks) {
  const deck = SlidesApp.openById(presentationId);
  const T = SlidesApp.PageElementType;
  const P = SlidesApp.PlaceholderType;
  const tryRead = function (fn, fallback) { try { return fn(); } catch (e) { return fallback; } };
  const colors = !!normalizeSlideChecks_(checks).minContrast;
  const out = { slides: [] };
  deck.getSlides().forEach(function (slide) {
    const s = { title: "", titleLines: [], lines: [], notes: "", images: 0, charts: 0, videos: 0 };
    let scheme = null, pageBg = "", imagesBelow = [];
    if (colors) {
      scheme = tryRead(function () { return slide.getColorScheme(); }, null);
      pageBg = tryRead(function () { return _slSlideBg_(slide, scheme); }, "");
      s.contrast = { background: pageBg, pairs: [], skipped: 0 };
    }
    // A text box's runs against what is behind them: its own solid fill
    // (over the page), else the page; skipped over a picture or anything
    // that isn't one color.
    const readColors = function (el, shape) {
      const runs = tryRead(function () { return shape.getText().getRuns(); }, []);
      const shown = runs.filter(function (r) { return /\S/.test(String(tryRead(function () { return r.asString(); }, ""))); });
      if (!shown.length) return;
      let bg = pageBg;
      const fill = tryRead(function () { return shape.getFill(); }, null);
      const ft = fill ? String(tryRead(function () { return fill.getType(); }, "")) : "";
      if (ft === String(SlidesApp.FillType.SOLID)) {
        const sf = fill.getSolidFill();
        const hex = tryRead(function () { return _slHex_(sf.getColor(), scheme); }, "");
        bg = hex && pageBg ? _slOver_(hex, tryRead(function () { return sf.getAlpha(); }, 1), pageBg)
          : hex && tryRead(function () { return sf.getAlpha(); }, 1) === 1 ? hex : "";
      } else if (ft && ft !== String(SlidesApp.FillType.NONE)) {
        bg = "";
      } else {
        const box = tryRead(function () { return _slRect_(el); }, null);
        if (!box || imagesBelow.some(function (r) { return _slOverlaps_(r, box); })) bg = "";
      }
      shown.forEach(function (run) {
        const fg = bg ? tryRead(function () { return _slHex_(run.getTextStyle().getForegroundColor(), scheme); }, "") : "";
        if (!bg || !fg) { s.contrast.skipped++; return; }
        s.contrast.pairs.push({ fg: fg, bg: bg, ratio: Math.round(slContrastRatio_(fg, bg) * 100) / 100 });
      });
    };
    const visit = function (el) {
      const type = String(el.getPageElementType());
      if (type === String(T.GROUP)) { el.asGroup().getChildren().forEach(visit); return; }
      if (type === String(T.IMAGE)) {
        s.images++;
        if (colors) imagesBelow.push(tryRead(function () { return _slRect_(el); }, { left: 0, top: 0, width: 0, height: 0 }));
        return;
      }
      if (type === String(T.SHEETS_CHART)) { s.charts++; return; }
      if (type === String(T.VIDEO)) { s.videos++; return; }
      if (type === String(T.SHAPE)) {
        const shape = el.asShape();
        const text = tryRead(function () { return String(shape.getText().asString()); }, "");
        const ph = String(tryRead(function () { return shape.getPlaceholderType(); }, ""));
        if ((ph === String(P.TITLE) || ph === String(P.CENTERED_TITLE)) && !s.titleLines.length) {
          s.titleLines = _slLines_(text);
          s.title = s.titleLines.join(" ");
        } else {
          _slLines_(text).forEach(function (l) { s.lines.push(l); });
        }
        if (colors) readColors(el, shape);
        return;
      }
      if (type === String(T.TABLE)) {
        const table = el.asTable();
        const rows = table.getNumRows(), cols = table.getNumColumns();
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const t = tryRead(function () { return String(table.getCell(r, c).getText().asString()); }, "");
            _slLines_(t).forEach(function (l) { s.lines.push(l); });
          }
        }
        return;
      }
      if (type === String(T.WORD_ART)) {
        _slLines_(tryRead(function () { return el.asWordArt().getRenderedText(); }, "")).forEach(function (l) { s.lines.push(l); });
      }
      // Lines (connectors) and anything else: nothing a check or Flow 2 reads.
    };
    slide.getPageElements().forEach(visit);
    s.notes = tryRead(function () {
      return String(slide.getNotesPage().getSpeakerNotesShape().getText().asString()).trim();
    }, "");
    out.slides.push(s);
  });
  return out;
}

function _slPlural_(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

// "2", "2 and 4", "2, 4 and 5".
function _slList_(nums) {
  return nums.length < 2 ? String(nums[0]) : nums.slice(0, -1).join(", ") + " and " + nums[nums.length - 1];
}

// The exact checks: [] on a pass, else one plain-words reason per failure,
// each naming the slide and what to change.
function slidesCheckReasons_(structure, checks) {
  const c = normalizeSlideChecks_(checks);
  const slides = structure.slides || [];
  const n = slides.length;
  const reasons = [];
  if (n < c.minSlides) {
    reasons.push("Your deck has " + _slPlural_(n, "slide") + ". It needs at least " + c.minSlides + ".");
  }
  if (c.maxSlides && n > c.maxSlides) {
    reasons.push("Your deck has " + _slPlural_(n, "slide") + ". This part asks for at most " + c.maxSlides + ".");
  }
  const blank = !slides.some(function (s) {
    return s.title || s.lines.length || s.images || s.charts || s.videos;
  });
  if (n && blank) reasons.push("Your slides are still empty. Add your words and pictures, then submit again.");
  if (c.titleSlide && n && !slides[0].title) reasons.push("Slide 1 needs a title.");
  if (c.notesOnEverySlide) {
    const missing = [];
    slides.forEach(function (s, i) { if (!String(s.notes || "").trim()) missing.push(i + 1); });
    if (missing.length) {
      reasons.push((missing.length === 1 ? "Slide " + missing[0] + " has" : "Slides " + _slList_(missing) + " have") +
        " no speaker notes. Every slide needs its notes (the box under the slide, \"Click to add speaker notes\").");
    }
  }
  if (c.minImages) {
    const images = slides.reduce(function (t, s) { return t + s.images; }, 0);
    if (images < c.minImages) {
      reasons.push("Your deck has " + _slPlural_(images, "image") + ". It needs at least " + c.minImages + ".");
    }
  }
  slides.forEach(function (s, i) {
    const at = "Slide " + (i + 1);
    if (c.maxImagesPerSlide && s.images > c.maxImagesPerSlide) {
      reasons.push(at + " has " + s.images + " images; this part allows " + c.maxImagesPerSlide + " a slide. Remove " +
        (s.images - c.maxImagesPerSlide) + ".");
    }
    if (c.maxLinesPerSlide && s.lines.length > c.maxLinesPerSlide) {
      reasons.push(at + " has " + s.lines.length + " lines of text, not counting its title; this part allows " +
        c.maxLinesPerSlide + ". Cut " + (s.lines.length - c.maxLinesPerSlide) + ".");
    }
    if (c.maxWordsPerLine) {
      const long = (s.titleLines || []).concat(s.lines).filter(function (l) { return _slWords_(l) > c.maxWordsPerLine; });
      if (long.length) {
        const worst = long.reduce(function (a, b) { return _slWords_(b) > _slWords_(a) ? b : a; });
        reasons.push(at + " has " + (long.length === 1 ? "a line" : long.length + " lines") + " longer than " +
          c.maxWordsPerLine + " words" + (long.length === 1 ? "" : ", the longest") + " " + _slWords_(worst) +
          " words (" + _frQuote_(worst.length > 60 ? worst.slice(0, 60) + "…" : worst) + "). Shorten " +
          (long.length === 1 ? "it" : "them") + " to " + c.maxWordsPerLine + " words or fewer.");
      }
    }
  });
  if (c.minContrast) {
    slides.forEach(function (s, i) {
      const low = ((s.contrast && s.contrast.pairs) || []).filter(function (p) { return p.ratio < c.minContrast; });
      if (!low.length) return;
      const worst = low.reduce(function (a, b) { return b.ratio < a.ratio ? b : a; });
      reasons.push("Slide " + (i + 1) + ": some text is hard to read against the background (contrast " +
        worst.ratio.toFixed(1) + " to 1; this part asks for at least " + c.minContrast + " to 1). " +
        "Pick colors with more contrast: dark text on a light background, or light text on a dark one.");
    });
  }
  if (c.requireChart && !slides.some(function (s) { return s.charts > 0; })) {
    reasons.push("Your deck needs a chart from Google Sheets: Insert, then Chart, then From Sheets. " +
      "A chart pasted as a picture counts as an image.");
  }
  return reasons;
}

// Every string the student wrote into the deck.
function _slStudentStrings_(st) {
  const out = [];
  (st.slides || []).forEach(function (s) { out.push(s.title, s.notes); (s.lines || []).forEach(function (l) { out.push(l); }); });
  return out;
}

// The first system-text token in the student's deck ("[SYSTEM:", say), or
// "": refused at Submit as a doc's is (00's findSystemText_).
function slidesSystemText_(structure) {
  const all = _slStudentStrings_(structure);
  for (let i = 0; i < all.length; i++) {
    const found = findSystemText_(all[i]);
    if (found) return found;
  }
  return "";
}

// The plain-text account of the deck Flow 2 reads and the teacher sees:
// totals, then each slide in order with its title, each line of its text,
// what else is on it, and its speaker notes. Student text is quoted and made
// safe (75's _frQuote_). Stable layout, one fact per line.
function slidesSnapshotText_(structure) {
  const slides = structure.slides || [];
  const sum = function (k) { return slides.reduce(function (t, s) { return t + (s[k] || 0); }, 0); };
  const lines = [
    "GOOGLE SLIDES, as the deck was when the student pressed Submit",
    "Slides: " + slides.length + " · images: " + sum("images") + " · charts from Google Sheets: " + sum("charts") +
      (sum("videos") ? " · videos: " + sum("videos") : ""),
    "Images, charts and videos are counted, not described; how the slides look is not in this copy.",
    ""
  ];
  slides.forEach(function (s, i) {
    lines.push("Slide " + (i + 1));
    lines.push("  Title: " + (s.title ? _frQuote_(s.title) : "(none)"));
    if (s.lines.length) {
      lines.push("  Text (" + _slPlural_(s.lines.length, "line") + "):");
      s.lines.forEach(function (l) { lines.push("    " + _frQuote_(l)); });
    } else {
      lines.push("  Text: (none)");
    }
    const has = [];
    if (s.images) has.push(_slPlural_(s.images, "image"));
    if (s.charts) has.push(_slPlural_(s.charts, "chart") + " from Google Sheets");
    if (s.videos) has.push(_slPlural_(s.videos, "video"));
    if (has.length) lines.push("  Also on the slide: " + has.join(", "));
    if (s.contrast) {
      const pairs = s.contrast.pairs || [];
      const low = pairs.length ? pairs.reduce(function (a, b) { return b.ratio < a.ratio ? b : a; }) : null;
      lines.push("  Text contrast: " + (low ? "lowest " + low.ratio.toFixed(1) + " to 1" : "not measured") +
        (s.contrast.skipped ? " (" + _slPlural_(s.contrast.skipped, "piece") + " of text not measured)" : "") +
        (s.contrast.background ? "" : "; the background is not one color"));
    }
    lines.push("  Speaker notes: " + (String(s.notes || "").trim() ? _frQuote_(s.notes) : "(none)"));
  });
  let text = lines.join("\n").trim();
  if (text.length > SL_SNAPSHOT_MAX) text = text.slice(0, SL_SNAPSHOT_MAX) + " […]";
  return text;
}
