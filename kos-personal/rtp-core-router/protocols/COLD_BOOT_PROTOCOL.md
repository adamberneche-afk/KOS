# COLD BOOT PROTOCOL — Process Instructions
Governs how CURRENT_STATE gets initialized from zero. Referenced by Core
Router at @Startup; formalized here as SMP-003 (pending approval).

---

## 1. When This Fires

Trigger condition: `BRAIN_TRUST_INDEX` Core Asset Record count = 0. This is
the sole detection mechanism — no separate marker field, no content-length
heuristic. Reusing the existing File Identity Law as the single source of
truth avoids introducing a second, parallel notion of "empty."

Until the idempotency guard (Section 5) is present, every session is
Cold Boot. No Architect blueprint, Developer code, or Auditor verdict may
treat CURRENT_STATE as authoritative while this condition holds.

## 2. Stage 0 — Mandatory Sensitive-Content Scan

**Owner: ARCHITECT. Runs first, every time, unconditionally.**

Scan anything newly surveyed at Drive root or in a general-purpose folder
for material outside a legitimate work/curriculum context — named-minor
records, IEP/504/medical/legal documents, financial or identity documents.
Flag these first, in their own output block, before any structural or
reflective content. Never fold them into a general classification or
reorganization recommendation. A scan that finds nothing is not proof of
thoroughness — say so plainly rather than letting silence read as a
certified absence of anything sensitive.

## 3. Stage 1 — Bounded Survey

**Owner: ARCHITECT.**

Scope, explicitly limited to three sources:
1. Top-level folder/file listing at Drive root
2. Recently-modified files (most recent activity window)
3. Named anchors already known to be structurally significant (e.g.
   BRAIN_TRUST_INDEX, CURRENT_STATE, PIVOTS_AND_LESSONS, the SMP proposal
   folder — whatever the system's own foundational documents are)

**Explicitly out of scope:** a full recursive Drive traversal, bulk
registration of every discovered file into BRAIN_TRUST_INDEX, or running
inference over each file individually. This was the original design
(rejected) — exhaustive scanning costs real execution time and token budget
against a requirement that never needed completeness, only enough grounding
to stop treating an empty CURRENT_STATE as if it were populated. If Stage 1
ever starts to feel like it requires visiting every file, that's a signal
the survey has drifted out of scope, not a signal to scan harder.

### 3a. Tier Classification

Before any placement reasoning, classify surveyed content into
Drive-appropriate tiers. Tiers are derived fresh per-Drive from what's
actually found — never imported from another Drive's tier model. Rules
for one tier never apply silently to another.

### 3b. Verification Ladder — Weighted Confidence (adapted from Flow
Architect File 03's Confidence Interval Engine)

Every duplicate or structural-debt claim gets a computed confidence score,
not just an assigned label, using four weighted factors:

| Factor | Weight | What it measures |
|---|---|---|
| Rule Match | 30% | Does this classification align with a pattern already confirmed correct on *this* Drive? |
| Error History | 30%, subtractive | Does this classification type overlap with a pattern already shown to fail on this Drive? |
| Ambiguity Score | 20% | Are the inputs (name, location, content signals) unambiguous, or could this plausibly belong elsewhere? |
| Integration Complexity | 20% | How many downstream decisions does this touch — a simple filing note, or an archive/delete recommendation? |

**Tier actions, adapted from Flow Architect's four bands:**

| CI Range | Tier | Action |
|---|---|---|
| 0.0–0.5 | Blind Spot | Do not state as fact. Flag for review; run the next rung of verification (metadata, then content diff) before concluding anything. |
| 0.5–0.7 | Experimental | State the claim with its gaps named explicitly — "worth reviewing," never "confirmed." |
| 0.7–0.9 | Informed | State the claim with a named risk factor attached — what would change the verdict if wrong. |
| 0.9–1.0 | High Fidelity | State as verified fact — reserved for content-diff-confirmed claims only. |

**This is a starting hypothesis, not settled law.** The weights above are
Flow Architect File 03's original formula, carried forward rather than
reinvented — but one factor gets a domain-specific prior adjustment before
first use, not a neutral start: **Error History for name-based duplicate
detection specifically should begin heavily negative**, not neutral. This
Drive's own curation history already showed name-matched duplicate flags
were wrong 4 of 5 times across two independent verification passes — that's
real evidence, not a hunch, and the formula should reflect it from the
first run rather than waiting to relearn it. Every other factor starts at
Flow Architect's original weights and adjusts from there via the same
divergence-tracking discipline used elsewhere in this system — informed
prior, not blank slate; still correctable by evidence, not gospel.

**Decision logging:** every computed CI should be logged with its
contributing factors, not just the final number — mirroring Flow
Architect's own metadata header (`@ConfidenceInterval`,
`@PrimaryLogicVector`, `@RiskFactors`). A bare score without its reasoning
is exactly the kind of unauditable claim this whole ladder exists to
prevent.

## 4. Stage 2 — Synthesis (Two-Part Output, Not One)

**Owner: ARCHITECT (structural facts) + MUSE (why-this-exists layer).**

The synthesis step produces two distinct kinds of content, deliberately
not merged into a single voice:

**Part A — Structural facts (Architect).** What exists, what's real vs.
placeholder, what's active vs. superseded, known structural debt, deferred
decisions. Plain, verifiable, citable — every claim traceable to something
Stage 1 actually found.

**Part B — What this says about the owner (Muse) — the Mirror Matrix.**
Not a verdict. Not a diagnosis. This is the first surface where the harness
reflects something back to the person who built it, and first impressions
matter — it should feel like being noticed by someone curious, not evaluated
by someone certain.

Read the real artifacts — naming choices, what got built carefully versus
what got left as scaffolding, what a comment in the code cared enough to
explain — and offer back what those choices seem to suggest, as an
observation held loosely, not a conclusion delivered. The difference shows
up in the actual language used:

- Not: *"This system's thesis is X."* Instead: *"There's a pattern here that
  looks like X — does that sound right, or am I reading too much into it?"*
- Not stating what the person values, as fact. Instead, naming what the
  *work* seems to value, and leaving room for the person to recognize
  themselves in it, correct it, or shrug it off entirely.
- Curious, not commanding. Questions are welcome here in a way they aren't
  in Part A — this is the one place in the whole protocol where the tone is
  allowed to be exploratory rather than settled.

The goal isn't to be right about the person. It's to be a good enough mirror
that being looked into feels like an invitation to say "yes, and—" or "no,
actually—" rather than a report to accept or dispute. Confidence in the
underlying pattern-read doesn't change this posture — even a strong read
gets offered gently, because the point of a mirror isn't to convince, it's
to let the person see themselves and respond.

This still runs through Muse's own gates (Via Negativa first, Agency Check,
structural feasibility classification) before inclusion — warmth doesn't
exempt it from the same discipline as any other Muse output. But the *voice*
is distinct from Part A on purpose: Part A tells the person what's true.
Part B asks the person what's true, using the work as the opening question.

**Interleaved, not batched: up to three clarifying questions.** Up to
three across the whole reflection — a ceiling, not a target — but each one
surfaces right where it's earned, immediately after the observation that
prompted it, not collected into a block at the end. A question stacked onto
the moment that raised it reads as genuine curiosity following a thought.
Three questions saved for a closing list reads as a form — exactly the
"chat bot" feeling this is meant to avoid.

These are a different move from the in-line "does that land?" checks
scattered through the reflection itself, which test whether a specific read
was accurate. The three process-questions go further: they invite the
person to articulate their *own* reasoning, in their own words, on whatever
piece of it they're willing to share — but each one belongs immediately
after the observation it grew out of, as part of the same breath, not
appended afterward.

Design rules for these questions:
- **Never frame as a binary choice between two named possibilities.**
  "Is it A, or is it actually B?" is a multiple-choice quiz wearing an
  inviting tone — it still leads toward one of two pre-selected answers
  and forecloses everything else the person might actually say. Use one
  of Muse's own generative diagnostics instead, so the question opens a
  discovery space rather than offering a pick-one:
    - *First Principles*: ask what a pattern actually produces or gives,
      stripped of any assumed verdict on it — not "is this good or bad,"
      but "what does this actually get you, in the moment, before you
      know how it turns out?"
    - *Via Negativa*: ask what would need to change, or be removed, or
      be true, for something to look different — invites the person to
      locate the real condition themselves rather than confirming or
      denying a guess.
    - *Lateral Thinking / Adjacent Possible*: ask what they'd rebuild
      first, or what they'd happily leave out, if the current structure
      vanished — reveals what's essential versus decorative without
      presupposing which is which.
  Any of these ask the person to generate their own account. None of them
  hand back two boxes to choose between.
- Ask about process and reasoning, not just confirm or deny a pattern.
- Place it directly after the specific observation that raised it. If an
  observation doesn't naturally raise a question worth asking, don't force
  one just to hit three — fewer, well-placed questions beat three that feel
  bolted on.
- Make sharing explicitly optional, and say so plainly, right at the
  question — not as a disclaimer bundled at the end. This isn't an intake
  form. Skipping any or all of them is a full and complete answer.
- Each question should be answerable at whatever depth the person wants —
  a sentence or a paragraph, either is a real answer.
- The answers are exactly the kind of first-person material a
  purpose-summary or values-layer field can't manufacture on its own — this
  is the one moment in Cold Boot where the harness gets the person's own
  account of themselves, rather than an inference about them. Treat what
  comes back accordingly: high-value, sourced directly, worth carrying
  forward distinctly from anything Muse inferred.

Both parts are required. Structural facts without the mirror produces a
document nobody would recognize as being about their own work. A mirror
without structural facts produces something ungrounded — flattering or
insightful, maybe, but not anchored to anything real enough to trust.

**A finding worth treating as a standing rule, not a one-off observation:**
two independent passes this session showed a clear difference in what
actually lands. The first pass reflected durable, already-known traits
(a habit the person had already named themselves) — accurate, but with
nowhere new to go, since confirming something already said isn't
discovery. The second pass reacted to specific *exceptions* surfaced by
that run's own survey — a thing that didn't fit the surrounding pattern,
a file that looked mid-thought. That version pulled the person in further.
**Anchor Part B to what's odd or unresolved in this specific run's data,
not to a stable narrative about the person that would hold regardless of
what was actually found.** If a pass turns up nothing exception-shaped,
it's better to say less than to restate a known trait as if it were a
fresh observation — repetition reads as a script; a real exception reads
as being seen.

## 5. Promotion Gate

The Stage 2 output is a **draft artifact**, not automatically canonical.
It is written to a review location (not directly into `CURRENT_STATE.gdoc`)
and explicitly labeled `state_source: bootstrapped`. It is reviewed by the
human operator the same way any other structural proposal is reviewed —
in full, before adoption.

Promotion to the live `CURRENT_STATE.gdoc` requires:
1. Explicit operator approval of the draft content, and
2. A WRITE_AUTHORITY designation from Architect for the promotion write
   itself, since this is a real Drive asset modification and falls under
   the HITL Firewall by default absent that designation.

Nothing before this gate touches a real Drive asset. Everything before this
gate is safe to iterate on freely.

## 6. Idempotency Guard

On successful promotion, a sentinel Core Asset Record
(`asset_type: bootstrap_marker`, `status: complete`) is written to
BRAIN_TRUST_INDEX. Every future session-init checks for this marker before
re-running Cold Boot. Absence of the marker is the only valid reason to
re-run Stage 1 and 2 — not staleness, not a hunch that things have changed,
not a request to "check again" without the underlying trigger condition
being true. Cold Boot fires exactly once per genuine cold start. It is never
a substitute for ongoing CURRENT_STATE maintenance through real REVIEW-mode
sessions afterward.

## 7. What Does NOT Re-Trigger This Process

- A request to see the current state of the Drive (that's a normal
  ARCHITECT REVIEW-mode session against an already-promoted CURRENT_STATE)
- A request for a different *presentation* of already-gathered facts (e.g.
  a new-user-facing document) — that's a downstream consumer of Stage 2's
  output, not a new Cold Boot run
- Any request that doesn't check the actual `BRAIN_TRUST_INDEX` count first

If Stage 1 is re-run without the trigger condition being genuinely true,
that's scope drift, not diligence — flag it rather than proceed.

## 8. Confidence Tagging

Any CURRENT_STATE produced via this protocol carries `state_source:
bootstrapped` until superseded by enough real, delta-tracked REVIEW-mode
sessions that it stops being a reconstruction and starts being an actual
history. AUDITOR should weight a bootstrapped CURRENT_STATE with more
skepticism than one built from tracked session deltas — it is a best-effort
reconstruction, not a record of decisions actually made.

---

*This document is the process itself — how Cold Boot runs, not a run of it.
Outputs produced by following this process (e.g. a draft CURRENT_STATE, or
a new-user orientation artifact) are separate deliverables, governed by
Section 4's promotion gate before anything here becomes canonical.*
