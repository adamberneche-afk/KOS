/**
 * 28_GeminiBrief.gs
 *
 * PURPOSE: KOS_GEMINI_BRIEF, a short doc of exactly what the thinking
 * partner's `start` reports, for a harness with a small working memory
 * (the Gemini harness, Stage 1; meta/PLAN_2026-11.md, G1).
 *
 * WHY: `start` reads seven live docs (~43,000 characters) to quote about a
 * dozen lines. Apps Script picks those lines out here, exactly, so the
 * harness quotes one short doc instead of searching seven. The full docs
 * stay where they are for deeper questions.
 *
 * THE CHECK WORDS: three plain words, picked at random once a day, sit at
 * the start, the middle and the end of the doc, and the doc ends with
 * "END KOS_GEMINI_BRIEF" and the stamp's time. A harness that repeats all
 * three read the whole of today's brief: it can't guess a random word the
 * way it can make up a plausible stamp. Missing end words mean the doc was
 * read in part; a missing start word, not read at all.
 *
 * TRIGGER: none of its own. generateDailyPrimer() (6) writes it after the
 * other briefing docs, from the same primer blocks; a failure is reported
 * and never holds back the primer.
 *
 * DATA: no student data. The primer's lines and the open decisions only;
 * the CAS and family signals stay in their own docs, named here.
 */

const GB_DOC_NAME = 'KOS_GEMINI_BRIEF';
const GB_MAX_CHARS = 4000;          // the brief's budget; over it, decisions are shortened
const GB_DECISION_CHARS = 160;      // a decision's text when the brief runs over
const GB_TOP_DECISIONS = 5;
const GB_WORDS_PROP = 'KOS_GEMINI_CHECK_WORDS';
// Plain, unrelated words: none is a KOS term, so none can be guessed from context.
const GB_WORDS = ('amber anchor apron atlas badge bamboo banjo barley beacon bison blanket bonnet ' +
  'bramble bridle bucket cabin cactus canoe canvas carrot cedar cello chalk cherry cider clover ' +
  'cobalt comet copper cotton crayon cricket dahlia denim dolphin domino donkey falcon fennel ' +
  'ferret fiddle flannel fossil garnet gazebo ginger glacier goblet granite hammock harbor hazel ' +
  'helmet heron hickory igloo indigo ivory jasper juniper kayak kettle kiwi ladder lagoon lantern ' +
  'lemon lilac linen lobster locket maple marble meadow melon mitten mosaic muffin nectar nickel ' +
  'nutmeg oatmeal octave olive orchid otter paddle pebble pepper pickle pigeon pillow pinecone ' +
  'plum pretzel puffin quarry quilt radish raven ribbon saddle saffron salmon satchel sequin ' +
  'shovel spruce squash teapot thimble thistle tulip tunnel turnip velvet violet walnut willow ' +
  'yarrow zephyr zinnia').split(' ');

/**
 * Today's three check words, picked once a day and kept for re-runs.
 * @returns {string[]}
 */
function geminiCheckWords_(props, dateStr) {
  try {
    const kept = JSON.parse(props.getProperty(GB_WORDS_PROP) || 'null');
    if (kept && kept.day === dateStr && kept.words && kept.words.length === 3) return kept.words;
  } catch (e) { /* picked fresh below */ }
  const pool = GB_WORDS.slice();
  const words = [];
  while (words.length < 3) words.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  props.setProperty(GB_WORDS_PROP, JSON.stringify({ day: dateStr, words: words }));
  return words;
}

/**
 * The brief's blocks, from the primer's blocks (6's _primerBlocks_ plus its
 * moral debt and fidelity lines) and the open decisions, oldest first.
 * Each line is copied as the primer has it; nothing is reworded.
 *
 * @param {Object[]} primerBlocks
 * @param {{id: string, owner: string, decision: string}[]} decisions
 * @param {string[]} words  the three check words
 * @param {string} stampTime "yyyy-MM-dd HH:mm"
 * @returns {Object[]}
 */
function geminiBriefBlocks_(primerBlocks, decisions, words, stampTime) {
  const text = (b) => String((b && b.text) || '');
  // The blocks under a heading, up to the next heading.
  const after = (heading) => {
    const i = primerBlocks.findIndex((b) => b.kind === 'h2' && text(b).indexOf(heading) === 0);
    if (i < 0) return [];
    const rest = primerBlocks.slice(i + 1);
    const j = rest.findIndex((b) => b.kind === 'h2');
    return j < 0 ? rest : rest.slice(0, j);
  };
  const find = (re) => primerBlocks.find((b) => re.test(text(b)));
  const vectorHeading = primerBlocks.find((b) => b.kind === 'h2' && /^Vector State/.test(text(b)));
  const quality = after('Data Quality').find((b) => /Status:/.test(text(b)));
  const engine = find(/^Engine mode:/);

  const out = [{ kind: 'p', text: 'Check word (start): ' + words[0] }];
  out.push({ kind: 'p', text: 'What start reports, copied from KOS_LATEST_PRIMER and KOS_OPEN_DECISIONS. Quote these lines as written.' });
  out.push({ kind: 'h2', text: '90-Day Vision' });
  after('90-Day Vision').forEach((b) => out.push({ kind: 'p', text: text(b) }));
  const onboarding = find(/^Onboarding Day/);
  if (onboarding) out.push({ kind: 'p', text: text(onboarding) });
  const debt = find(/^Moral debt:/);
  out.push({ kind: 'p', text: debt ? text(debt) : 'Moral debt: unknown (not in the primer).' });
  out.push({ kind: 'h2', text: vectorHeading ? text(vectorHeading) : 'Vector State (unknown)' });
  after('Vector State').forEach((b) => out.push({ kind: b.kind === 'li' ? 'li' : 'p', text: text(b) }));
  out.push({ kind: 'p', text: quality ? text(quality) : 'Data Quality Status: unknown (not in the primer).' });
  out.push({ kind: 'p', text: engine ? text(engine) : 'Engine mode: unknown (not in the primer).' });
  out.push({ kind: 'p', text: 'Check word (middle): ' + words[1] });
  out.push({ kind: 'h2', text: 'Open decisions: ' + decisions.length + ' (the first ' + Math.min(GB_TOP_DECISIONS, decisions.length) + ', oldest first)' });
  if (!decisions.length) out.push({ kind: 'p', text: 'None open.' });
  decisions.slice(0, GB_TOP_DECISIONS).forEach((d) => out.push({ kind: 'li', text: d.id + ' [' + d.owner + ']: ' + d.decision }));
  out.push({ kind: 'p', text: 'Not in this brief, each in its own doc: last night and CAS (KOS_CAS_SIGNAL), students and families (KOS_FAMILY_SIGNAL), Claude Code\'s reply (KOS_CODE_REPLY).' });
  out.push({ kind: 'p', text: 'Check word (end): ' + words[2] });
  out.push({ kind: 'p', text: 'END ' + GB_DOC_NAME + ' — generated ' + stampTime });
  return geminiBriefFit_(out);
}

/** Over GB_MAX_CHARS, each decision is cut to GB_DECISION_CHARS. */
function geminiBriefFit_(blocks) {
  const size = () => blocks.reduce((n, b) => n + String(b.text).length + 1, 0);
  if (size() <= GB_MAX_CHARS) return blocks;
  blocks.forEach((b) => {
    if (b.kind === 'li' && /^\S+ \[[^\]]*\]: /.test(b.text) && b.text.length > GB_DECISION_CHARS) {
      b.text = b.text.slice(0, GB_DECISION_CHARS - 1) + '…';
    }
  });
  if (size() > GB_MAX_CHARS) console.warn('[' + GB_DOC_NAME + '] ' + size() + ' characters, over ' + GB_MAX_CHARS);
  return blocks;
}

/**
 * Writes KOS_GEMINI_BRIEF into `folder` (a stable doc, 6's _writeStableDoc_).
 * @returns {string} the doc's ID
 */
function writeGeminiBrief_(folder, now, primerBlocks) {
  const props = PropertiesService.getScriptProperties();
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const blocks = geminiBriefBlocks_(primerBlocks, _bdOpenDecisions_(ss), geminiCheckWords_(props, dateStr),
    Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'));
  return _writeStableDoc_(folder, CFG.PROP.GEMINI_BRIEF_DOC_ID, GB_DOC_NAME, 'GEMINI BRIEF — ' + dateStr,
    _briefingStamp_(now, 'generateDailyPrimer'), blocks);
}
