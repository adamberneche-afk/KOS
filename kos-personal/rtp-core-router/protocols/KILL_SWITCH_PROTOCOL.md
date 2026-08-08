# Kill Switch Protocol
Manual emergency-stop procedure for active, ongoing harm — distinct from
Developer's existing Bounce-Back Protocol, which handles a single failed
inference. This handles something actively wrong across a running system.

---

## 1. Relationship to Bounce-Back — the actual boundary

Bounce-Back fires automatically, per-inference, when a Landing Zone
output fails schema or DoD checks: log, notify, retry twice, then
`PERMANENT_FAILURE`. It is scoped to one flow's one output.

Kill Switch is broader and human-invoked, not automated: it fires when
something is actively causing harm *across a run*, whether or not any
automated gate ever caught it — including cases where output technically
passed every check but is still substantively wrong at volume (the same
risk already flagged for the Mirror Matrix's DoD proxies). Bounce-Back is
what happens when GAS catches a bad output. Kill Switch is what you invoke
when GAS didn't, or when the problem is bigger than any one output.

## 2. Named Trigger Conditions

Per direct instruction, these are named explicitly rather than left as
abstract "harm" — and this list is a living document, not a one-time
enumeration. **It must be reassessed every time a new automation or flow
is added to the system, and reviewed on the same cadence as the Rule
Conflict Resolution health checks.** A trigger list that goes stale is
worse than no list, since it creates false confidence that all real risks
are named.

Currently named:
- The 3am–6am nightly pipeline (warm-up generation, competency logging,
  artifact sync) producing repeated bad output or running beyond its
  intended scope.
- A Mirror Matrix–style flow writing incorrect or invented data to
  BRAIN_TRUST_INDEX or CURRENT_STATE repeatedly, including cases that
  pass DoD checks but are wrong in substance, not just structure.
- Any process with write access to real student data (competency records,
  artifacts) behaving unexpectedly — the highest-stakes case, since this
  is exactly what SMP-004's automation air gap exists to protect.
- A batch/auto-confirm process (per the Drive Steward calibration design)
  writing incorrect classifications at volume, undetected by the
  confidence-tier gate.

## 3. The Procedure — one procedure, multiple triggers

A single procedure, invoked manually regardless of which named trigger
applies. What "kill" means concretely differs by which side of the
automation air gap is involved, but the procedure itself is one:

1. **Identify which side.** Personal/sandbox account, or CCPS/production.
2. **Stop it manually:**
   - *Personal/sandbox:* delete or disable the relevant trigger directly
     in the Apps Script editor (Triggers panel). No automated kill script
     exists yet — this stays a manual action for the time being, by
     deliberate choice, not oversight. (An automated version remains a
     real future option, not rejected — just deferred until there's more
     production experience to justify it.)
   - *CCPS/production:* already entirely manual by construction, per
     SMP-004 — no clasp, no CLI. Stopping something here means logging in
     and deleting the trigger through the browser editor directly. This
     protocol doesn't add a new mechanism here; it just names what's
     already structurally true.
3. **Do not attempt to fix the underlying cause in the moment.** Stopping
   the harm and diagnosing it are separate steps — this procedure only
   covers the first.

## 4. Reactivation Gate

Nothing gets turned back on until a **root-cause note** is written and
logged — per the Rule Conflict Resolution protocol's existing recording
pattern, this goes into the context documents (PIVOTS_AND_LESSONS or
equivalent), sized the same way: a small, contained cause gets a note; if
the root cause reveals a structural gap, it should trigger an SMP the same
way a Large rule conflict would. Reactivating without this note is not
permitted, regardless of how obvious the cause seems in the moment.

---

*Item #1 on the Hereditary Watch List is resolved and superseded by this
document.*
