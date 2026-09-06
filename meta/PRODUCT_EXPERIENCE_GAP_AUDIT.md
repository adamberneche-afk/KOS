# Product Experience Gap Audit

**What this is:** a final gap audit of the three systems as one *product
experience* — not the code architecture `meta/FLOW_DOCTRINE.md` and
`meta/FLOW_INVENTORY.md` already own, but what an actual student, operator,
or teacher perceives, feels friction from, or never notices at all. Scoped
to all three: `cas-ccps` (students, and a parent-disclosure surface),
`kos-personal` (a single operator), `leader-hub` (one teacher, plus one
co-advisor). Requested directly, in these terms: what's missing, what
hinders adoption, which parts of "world building" are decorative rather
than reactive to what a player actually does, and what a person would never
consciously notice but would feel the absence of.

**Method:** every finding below is read directly from the product's own
docs and front-end code (`8_WebApp_UI.html`, `student-leader-hub.html`'s
`src/*` fragments, the student-facing quick-start guides, the curriculum
pacing/lesson-card files), not inferred from the backend architecture. File
and line citations are given wherever the underlying investigation found
them; anything without one is a synthesis across several sources.

**Why this matters more than it looks like it should.** All three systems'
own philosophy documents converge on the same claim from different
angles — `KOS_WHITE_PAPER.md`'s "domesticated cognitive partner" vs.
"extractive" AI, the Economics of Depth paper's Soil/Water/Sun (automate
the predictable structure so relational bandwidth isn't the thing
sacrificed), `LEADERHUB_PRINCIPLES.md`'s "evidence is a byproduct of doing
the work, not a parallel track." The shared thesis: **real, human,
trust-based work is the scarce and valuable thing; software's job is to
remove friction around it, never to manufacture a synthetic substitute for
it.** That thesis is this audit's actual yardstick — see the guardrail
section below before reading any recommendation as "make it more
engaging."

---

## The finding that matters most

Across all three systems, **the parts of the product that are genuinely
reactive to what a player does are the least visible, and the parts that
look most like "a living world" are the least reactive.** This is not
three separate small findings — it is the same shape, independently, in
every system:

| System | Genuinely reactive, but nearly invisible | Looks alive, but is structurally inert |
|---|---|---|
| `cas-ccps` | The per-student, per-concept "shadow matrix" (`23_StudentProfileManager.js`) that actually adapts warm-up wording to what a student has and hasn't mastered — a student never sees any signal that this happened. | The "conglomerate" narrative (org chart, divisions, milestones) — carried entirely by offline artifacts and teacher judgment; every unit's `studio_flow_hooks` in `PacingGuide_CAS_Context.json` is `{}`, so the software has zero structural awareness of which stage or division a student is in. |
| `kos-personal` | The Shadow Matrix (confidence bars moving from grey→amber→green) and the Daily Primer (genuinely assembled from the prior day's real sessions) — the one part of the UI that visibly changes as a real function of behavior. | The six-persona Council — the product's headline differentiator in `KOS_WHITE_PAPER.md` — has **zero presence inside the app itself**: no persona-voiced text anywhere in `8_WebApp_UI.html`, just a tooltip naming them. The actual mechanism is manual: tap a button, get a Doc, paste it by hand into six separate external Gemini conversations, transcribe verdicts back into a plain form. |
| `leader-hub` | The Pulse row's real per-role percentages and Brag Board's real pulled activity — reactive by design, and the system deliberately *avoided* building a decorative alternative (Round 11: linked the real external PlayVS/VHSL bracket instead of an internal simulated one). | Comparatively little here is inert — this system is the one exception to the pattern, see below. |

The practical implication: the fastest, lowest-risk way to make each
product feel more alive to a "player" is **not** to add new mechanics — it
is to **surface state that is already computed and already true**, and to
be honest, in the moment, about the parts that are currently inert by
design rather than letting silence read as either "broken" or "nothing is
happening here."

---

## Guardrail: what "engaging" must not mean here

Before any recommendation below: all three systems have, independently,
already faced the temptation to manufacture engagement and **explicitly
rejected it**, on the record:

- `leader-hub`'s E-Sports Hub deliberately links the real external
  PlayVS/VHSL bracket instead of building an internal simulated league
  (`HISTORY.md` Round 11) — a real result, not a game-within-the-game.
- `kos-personal`'s Council once had a faster, more "alive"-feeling
  shortcut — one model role-playing all six personas in a single pass
  (`triggerCouncilSimulation()`) — and it was **deleted** for violating
  the system's own fidelity rule (`BRIDGE_FIDELITY_001`): a fast fake
  council is worse than a slow real one.
- `cas-ccps`'s feedback loop is explicitly coaching, not grading —
  unlimited free revisions, no visible score until a teacher confirms one,
  because a number invites gaming the number instead of doing the work.
- `KOS_WHITE_PAPER.md` §2 names the failure mode directly: "The
  Extraction Trap," products that "optimize for engagement... at the
  expense of human agency."

So, as a standing constraint on every recommendation below: **no badges,
streaks, points, leaderboards, or simulated economies/brackets for any
system.** Where a recommendation says "surface X," it means expose a real,
already-computed fact — never invent a reward loop around it. Any future
suggestion (from anyone, including a future audit) that proposes
gamification for its own sake should be read as contradicting the North
Star these three systems have already, independently, converged on — it
is not a style preference, it is the thing all three would be protecting
against.

---

## cas-ccps — students, and one parent-facing surface

### What's missing / hinders adoption

1. **A real, live contradiction about deployment status, now fixed by this
   audit** — `README.md`'s "Known gaps #1" read, until this pass, as if
   Flows 2-5 were still not live, while `DEPLOYMENT_HANDOFF.md`'s current
   banner says all five were built and verified. Not a hypothetical
   confusion: this is exactly the kind of drift that would mislead a
   future session (or a colleague) picking this up cold into believing
   the wrong one. Marked resolved in `README.md` in this pass, with the
   one caveat that's still true preserved: "verified" means against
   seeded fixture data, not yet a real student submission —
   `docs/IMPACT_DASHBOARD.html` currently shows zero recorded deployments.
   **This is the single most consequential open item for cas-ccps as a
   product**: the pipeline is proven end-to-end against synthetic data,
   and nobody has actually gone through it as a real student yet. Until
   that happens, "adoption" hasn't started — it's been engineered for.
2. **No live word counter for the 25-word evaluation minimum.** Named in
   the student quick-start's own FAQ as a real, anticipated point of
   confusion ("Check how many words you've written") with no in-doc
   counter to actually answer it. Cheap, concrete, and squarely in "the
   value is in the details people don't notice" territory.
3. **The shadow matrix's personalization is invisible to the one person
   it's for.** Warm-up wording genuinely adapts to a student's per-concept
   confidence, and a student has no way to know this is happening — it
   reads as generic, when it isn't.

### World-building not impacted by players

The "conglomerate" is a strong, well-designed *pedagogical* framing device
carried entirely by real offline artifacts (a real Business Model Canvas
doc, a real school store, real events) and teacher judgment — it is not a
simulated business with a market, inventory, or revenue engine that reads
student decisions and changes anything. Every unit's `studio_flow_hooks`
being `{}` across all 20 units confirms this structurally, not just by
absence of evidence. This is very likely the *correct* design given the
guardrail above (a fake simulated economy would be exactly the wrong fix)
— the gap is not "build a simulation," it's that nothing in the software
ever reflects back to a student that their real conglomerate milestones
(org chart finalized, budget drafted, marketing plan submitted) are being
tracked at all. Right now that tracking exists only in the teacher's head
and in offline documents.

### Details that matter

- The feedback zone's own copy is good (narrative assessment, ✓/⚠
  milestones, "what to do next") but the *why* — "this isn't a grade, most
  students revise 2-3 times" — currently lives only in a separate
  student-quick-start doc a student may never open, not inside the doc
  they're actually staring at when they see "REVISIONS REQUIRED" for the
  first time. That's the exact moment the reassurance is worth the most
  and currently isn't there.
- The parent report is deliberately one-way and narrow (a single teacher-
  triggered email, no portal, no reply channel) — this is a hard FERPA/
  design boundary, not a gap. A "portal" would violate the same guardrail
  above; don't recommend one.

---

## kos-personal — a single operator

### What's missing / hinders adoption

1. **The product's headline mechanism (Studio inference) cannot complete
   end-to-end on this account at all.** GCP is disabled org-wide, so
   every session sits at `PENDING_FLOW`/`STUDIO_ACTIVE` unless the
   operator manually runs `devSetFlowComplete()` from the Apps Script
   editor — not something a non-technical operator could ever discover or
   do. `DEPLOYMENT_GUIDE.md`'s own Troubleshooting section undersells the
   severity of this (reads like log noise, not "nothing can finish").
   This is the single largest adoption blocker of the three systems:
   `KOS_WHITE_PAPER.md`'s "Zero-Server Sovereignty" promise is not
   currently redeemable by anyone who isn't also this repo's own
   engineer.
2. **The Cold Engine wall is discovered too late, and too abruptly.**
   Ingest submission is soft-gated (TIER_1), so an operator can queue many
   sessions before ever hitting the hard TIER_2 gate on
   `processInferenceQueue`/`triggerSevenBridgesReview` — meaning the
   product lets you build up a pile of stuck work before telling you why
   nothing is finishing. The fix is sequencing, not removal: surface
   "personalize your advisor to let anything finish processing"
   *proactively*, at or before the first Ingest submission, not reactively
   after a Tier-2 call happens to fail.
3. **Write-once, read-never wizard fields.** Role, Audience, and
   DeployType are captured in the onboarding wizard, used exactly once to
   compute calibration weights and seed `CORE_THESIS`, and then never
   surfaced anywhere in the visible 3-tab UI again — unlike 90-Day Vision
   and Relational Targets, which genuinely resurface daily in the Primer.
   This makes two-fifths of a reflective ritual feel like it went nowhere,
   which erodes trust in the other three-fifths that actually do pay off.
4. **Governance signals with zero in-app trace.** The auto-council check
   (every 2 hours, once 5 sessions accumulate) silently drops a stimulus
   doc into a Drive folder with — per the system's own docs — "nothing
   reviews it for you." The Blackboard (governance mutation proposals) is
   a raw sheet tab with no presence in `8_WebApp_UI.html` at all. Both are
   real, working mechanisms that are currently invisible unless the
   operator happens to go looking in Drive/Sheets directly.

### World-building not impacted by players

The **Council of six personas is the product's most-marketed idea and its
least-present one.** `KOS_WHITE_PAPER.md` centers it as the core
differentiator; inside the actual app it is a tooltip. The real mechanism
— assemble a stimulus doc, paste it by hand into six separate external
Gemini "Gem" conversations, transcribe verdicts back via a plain form — is
candidly documented as resting entirely on "operator discipline, not...
code" (`rtp-core-router/README.md`). This is not a gap to close by faking
liveliness (see the guardrail — the fully-automated version was tried and
reverted for exactly that reason); it's a gap in **making the real,
effortful ritual feel worth its cost inside the product**, since right now
none of it is visible from the 3-tab UI except the button that kicks it
off and the form that records the result.

### Details that matter

- The Queue tab is already unusually honest about the Studio-blocked
  state (a dedicated "Still waiting on Studio" tile, a 15-minute stall
  notice) — this is a genuine strength worth preserving as the template
  for how the other silent gaps above (governance, Blackboard) should be
  surfaced: not hidden, not alarmed, just honestly named.
- The raw `COLD_ENGINE_TIER_2` error is already translated into plain
  language in one place (`8_WebApp_UI.html:2760-2766`) specifically to
  avoid leaking internal jargon like "Socratic Onboarding" — a real,
  already-applied lesson worth applying everywhere else an internal term
  could otherwise leak to the operator.

---

## leader-hub — one teacher, plus one co-advisor

This system is the healthiest of the three by this audit's own standard:
its "engagement mechanics" (Pulse row, Brag Board, Recent Wins) are
uniformly real arithmetic over real logged activity, and the one place a
decorative alternative was on the table (an internal esports bracket), it
was explicitly rejected in favor of linking the real external one. The
gaps here are narrower and mostly already tracked internally.

### What's missing / hinders adoption

1. **`FLOW_INVENTORY.md` described all six AI Flows as still hypothetical
   ("may not be built yet"), when `HISTORY.md`'s own 2026-09-05 entry
   records all six built and verified live.** Fixed in this pass — the
   same doc-currency drift class found in cas-ccps above, just smaller in
   consequence since leader-hub's own in-app AI Flow Health panel already
   reports the true state honestly regardless of what this doc says.
2. **No first-run tour for the one real secondary audience** (a
   co-advisor pulling a shared roster). Low priority for Adam himself
   (he built it), but the only person who isn't Adam and might actually
   open this cold has nothing but README prose to orient them across 7
   sidebar sections and ~14 fragments.

### World-building not impacted by players

Genuinely little to flag — by design. The one soft spot: the journal's
mood scale ("🔥 On Fire," "⚡ Peak") is the single most playful surface in
the app, and it's just a self-reported input with no reactive payoff
anywhere else (it doesn't feed the Pulse row, Brag Board, or anything
else) — small, low-stakes, and arguably fine as-is, but worth naming since
it's the one place tone and function diverge slightly from the rest of the
product.

### Details that matter

- `lh_inventory_transactions` is read (by the deposit reminder) but never
  written — dormant today, silent-failure-in-waiting for whenever a
  transaction-history view is eventually built to read it.
- 6115's curriculum content genuinely doesn't exist yet (the import
  *pipeline* does) — a teacher opening that course's Pacing Calendar today
  sees a legacy even-distribution guess, not real dates.

---

## Cross-cutting

**Documentation-currency drift keeps recurring at exactly the same
question: "is this actually live?"** This audit found and fixed three
instances this session alone (kos-personal's preflight cell in two
separate tables, plus the two above) — the same failure class
`meta/FLOW_DOCTRINE.md` rule 7 already names for code (two lists
describing one fact will drift), just showing up in prose about
deployment status instead of in a column map. There is no single
per-system "is this actually live, right now" banner that everything else
is required to point to rather than restate — worth doing the same thing
for deployment-status prose that Check H already does for column maps:
one authoritative statement per system, everything else a pointer.

**The North Star is well-articulated in three separate philosophy
documents, and none of the three products ever hands a sentence of it back
to the person using it at the moment it would matter most.** A student
seeing "REVISIONS REQUIRED" for the first time, an operator hitting the
Cold Engine wall for the first time, a teacher opening AI Flow Health and
seeing "Flow may not be built yet" — each of these is a real moment where
one honest, brief sentence of *why this is designed this way* would turn a
confusing wall into a legible, trust-building one. This is not a
recommendation to add a marketing splash screen (that would itself be the
kind of decorative surface the guardrail warns against) — it's a
recommendation to move the *why*, one sentence at a time, from a separate
doc into the exact UI moment where its absence currently reads as friction
instead of intention.

---

## Recommendations, prioritized

**Cheap, concrete, do next (all "surface an existing true fact," none
invent new mechanics):**
- cas-ccps: a live word counter against the 25-word minimum in the
  feedback zone; one sentence of "why revisions, not a grade" inside the
  doc itself, not only in a separate quick-start guide.
- kos-personal: surface Role/Audience somewhere in Diagnostics so the
  onboarding wizard's answers all visibly pay off, not just three of
  five; move the "personalize your advisor" prompt earlier — at first
  Ingest submission, not after a Tier-2 failure; a Diagnostics tile for
  the auto-council check's pending stimulus doc, matching the Incubator
  tile's existing pattern.
- leader-hub: nothing urgent — the `lh_inventory_transactions` dormant
  key is worth a one-line TODO comment at its read site so it isn't
  rediscovered cold later.

**Structural, needs your judgment before anyone builds anything:**
- cas-ccps: what would it look like to reflect the conglomerate's real,
  tracked milestones back to a student — a read-only status view keyed to
  the pacing guide's own stage/unit data — without crossing into
  simulating a business that doesn't exist? This is a design question,
  not an engineering one; the guardrail says "don't fake a market," it
  doesn't say "don't show real state."
- kos-personal: what, short of automating it (already tried and reverted),
  would make the Council's real cost feel proportionate to its real value
  inside the product itself — a Diagnostics view of council history and
  outstanding verdicts, at minimum, so the ritual has a visible home even
  though its actual execution stays external by design.

**Explicitly not recommended, and why:** any gamification (badges,
streaks, points, leaderboards) for any system; a simulated market/economy
engine for cas-ccps's conglomerate; an automated or single-model
"simulated council" shortcut for kos-personal; a two-way parent portal for
cas-ccps. Each would trade the thing all three systems are actually built
to protect — real, earned, human trust — for the appearance of engagement.
That trade is the specific failure mode the North Star exists to name.

---

## Open questions

- **Which "is actually live" banner is authoritative per system, going
  forward** — worth deciding once, in the same spirit as
  `meta/FLOW_DOCTRINE.md` rule 7, rather than re-deriving it the next time
  two docs disagree.
- **Is a first real student cohort actually scheduled for cas-ccps**, or
  is `IMPACT_DASHBOARD.html`'s empty state the honest current answer for
  the foreseeable future? That answer changes whether "get a real student
  through the pipeline" belongs at the top of the list or is simply
  waiting on the school calendar.
- **How much of kos-personal's Council ritual is meant to stay
  effortful-by-design** (the "21-Day Moat" is explicitly a *feature*, per
  the white paper's own ROI table) versus how much of its current
  invisibility is accidental UX debt rather than intentional friction?
  The Cold Engine wall is clearly the former; the Council's total absence
  from the UI reads more like the latter, but that's a judgment call only
  you can make about your own design intent.
