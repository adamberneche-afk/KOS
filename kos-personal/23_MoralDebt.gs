/**
 * ================================================================
 * 23_MoralDebt.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * SMP-019, the moral debt counter (decision #3, 2026-10-19). Each PROCEED
 * the operator gives at an ALIGNMENT mandatory pause adds 1; the total
 * halves every 7 days, so proceeding more than once in a week carries
 * into the next. The daily primer states the value, ALIGNMENT repeats it
 * whenever it flags a proposed action, and at MORAL_DEBT_MUSE_AT (3.0
 * unless set) MUSE suggests alternatives before the operator answers.
 * The Claude Project starts each session blank, so the counter lives here.
 *
 * Counting. sensor1_scanInboundSessions() (2_Ingestion_Sensors.gs) calls
 * recordMoralDebt_() once per new session log (its duplicate guard keeps a
 * log from counting twice). Only the CLOSEOUT's Alignment block is read,
 * and only the literal word PROCEED counts (SESSION_LOG_FORMAT.md), so an
 * exchange that merely discusses proceeding doesn't.
 *
 * Script Properties: MORAL_DEBT_VALUE and MORAL_DEBT_AS_OF (the value as
 * of that time, before decay); MORAL_DEBT_MUSE_AT and
 * MORAL_DEBT_HALF_LIFE_DAYS to adjust. previewMoralDebt() shows the
 * current value; resetMoralDebt() sets it to 0.
 */

const MORAL_DEBT_DEFAULT_MUSE_AT = 3;
const MORAL_DEBT_DEFAULT_HALF_LIFE_DAYS = 7;

/** PROCEED answers in a log's CLOSEOUT Alignment block. */
function _countProceeds_(rawText) {
  const text = String(rawText || '');
  const close = text.lastIndexOf('[🧠 RTP — CLOSEOUT]');
  if (close === -1) return 0;
  const after = text.slice(close);
  const start = after.search(/^\s*Alignment:\s*$/m);
  if (start === -1) return 0;
  // The block ends at the next unindented closeout heading or the end.
  const block = after.slice(start).split(/\r?\n/).slice(1);
  let n = 0;
  for (let i = 0; i < block.length; i++) {
    if (/^[^\s-].*:\s*$/.test(block[i])) break; // the next heading, not a "- " item
    const m = block[i].match(/\bPROCEED\b/g);
    if (m) n += m.length;
  }
  return n;
}

function _moralDebtSettings_(props) {
  const num = (k, d) => {
    const v = Number(props.getProperty(k));
    return isFinite(v) && v > 0 ? v : d;
  };
  return {
    museAt: num('MORAL_DEBT_MUSE_AT', MORAL_DEBT_DEFAULT_MUSE_AT),
    halfLife: num('MORAL_DEBT_HALF_LIFE_DAYS', MORAL_DEBT_DEFAULT_HALF_LIFE_DAYS),
  };
}

/** The counter's value at `now`, decayed from the stored value. */
function moralDebtValue_(props, now) {
  const stored = Number(props.getProperty('MORAL_DEBT_VALUE')) || 0;
  const asOf = new Date(props.getProperty('MORAL_DEBT_AS_OF') || 0).getTime();
  if (!stored || !asOf) return 0;
  const days = Math.max(0, ((now ? new Date(now) : new Date()).getTime() - asOf) / 86400000);
  return stored * Math.pow(0.5, days / _moralDebtSettings_(props).halfLife);
}

/** Adds a new session log's PROCEED count. Returns the count. */
function recordMoralDebt_(rawText, now) {
  const n = _countProceeds_(rawText);
  if (!n) return 0;
  const props = PropertiesService.getScriptProperties();
  const when = now ? new Date(now) : new Date();
  props.setProperty('MORAL_DEBT_VALUE', String(moralDebtValue_(props, when) + n));
  props.setProperty('MORAL_DEBT_AS_OF', when.toISOString());
  console.log('[MoralDebt] +' + n + ' PROCEED; now ' + moralDebtValue_(props, when).toFixed(1));
  return n;
}

/** The primer's line. */
function moralDebtLine_(props, now) {
  const s = _moralDebtSettings_(props);
  const v = moralDebtValue_(props, now);
  return 'Moral debt: ' + v.toFixed(1) + (v >= s.museAt
    ? ' (at or above ' + s.museAt.toFixed(1) + ': MUSE suggests alternatives at the next mandatory pause, before the operator answers).'
    : ' (MUSE suggests alternatives at ' + s.museAt.toFixed(1) + ').') +
    ' +1 per PROCEED at a mandatory pause; halves every ' + s.halfLife + ' days.';
}

/** Run from the editor: logs the current value. Changes nothing. */
function previewMoralDebt() {
  const line = moralDebtLine_(PropertiesService.getScriptProperties(), new Date());
  console.log('[MoralDebt] ' + line);
  return line;
}

/** Run from the editor: resets the counter to 0. */
function resetMoralDebt() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('MORAL_DEBT_VALUE', '0');
  props.setProperty('MORAL_DEBT_AS_OF', new Date().toISOString());
  return previewMoralDebt();
}
