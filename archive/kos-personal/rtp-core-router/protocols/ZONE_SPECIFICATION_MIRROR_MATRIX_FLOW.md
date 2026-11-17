> **⚠ Naming note (added filing this doc into the repo):** the "Mirror
> Matrix" this spec governs is a 25-variable design found elsewhere in an
> earlier draft (`5_Error_And_Utilities.gs`'s legacy variants) that
> occupies the same conceptual slot as, but is **not the same thing as**,
> the 5-question Shadow Matrix actually implemented in this repo (see
> `kos-personal/README.md` and `5_Error_And_Utilities.gs`'s
> `SHADOW_QUESTIONS`/`_classifyShadowStatus`). Treat this document as
> planning-methodology reference material, not as a spec for anything
> currently built — the live system uses the Shadow Matrix, not this.

# Zone Specification: Mirror Matrix Synthesis Flow
Governs the GAS ↔ Workspace Studio Flow integration for Cold Boot Stage 2,
Part B. Required under Architectural Law §3.4 before Developer may build
this flow. Three parts: planning methodology (reusable for any future
zone), the structured contract (specific to this flow), and deployment
operations (how it actually runs).

---

## PART 1 — Planning Methodology

*This section is deliberately written to be reusable for the next zone
contract, not just this one. Answer these questions, in this order,
before drafting a Zone Specification for anything.*

**1. What is the Flow actually being asked to do that GAS cannot do itself?**
Under Bifurcated Architecture, GAS handles routing, matrix math, schema
validation, quality gating. The Flow handles qualitative synthesis and
judgment calls. If the task can be done with conditional logic and string
formatting, it doesn't need a Flow — it needs a GAS function. Here: turning
verified structural facts into an inviting, corrigible reflection is a
judgment call about tone and framing. That's Flow work.

**2. What's the minimal, tightest input the Flow actually needs?**
Per Developer's Inference Payload Law, the payload must be minimal and
highly structured — not a full dump of everything GAS knows. Ask: what
would make the output worse if it were missing, and what's just noise?

**3. What does "done correctly" look like, concretely enough to check by code?**
This becomes the Definition of Done. A DoD criterion has to be something
GAS can actually verify — not "is this a good reflection," but checkable
proxies for that (see Part 2).

**4. What's the physical form, and where does it live?**
Every zone needs a Location Pointer registered in BRAIN_TRUST_INDEX before
Developer writes any code that touches it — per the File Identity Law, no
script may resolve a zone by name or path.

**5. What happens on failure, and who finds out?**
Every zone needs a timeout, a retry count, and a named place the failure
gets logged. Silent failure is not an option under the Bounce-Back
Protocol.

---

## PART 2 — Structured Flow Specification

```
[ZONE SPECIFICATION — Mirror_Matrix_Synthesis_Flow]:

Loading Zone:
  Physical form: JSON file in Drive (not a Sheet tab — the payload is
    nested/structured, not tabular).
  Location pointer: BRAIN_TRUST_INDEX key "MIRROR_MATRIX_LOADING_ZONE"
  Required input schema:
    {
      "survey_facts": {
        "tier_classified_items": [ {name, tier, confidence_verified} ],
        "named_anchors": [ {name, status} ],
        "structural_debt": [ string ]
      },
      "session_context": {
        "prior_mirror_responses": [ string ] | null,
        "known_operator_traits": [ string ] | null
      }
    }
  STATUS field values: READY_FOR_FLOW | BOUNCE_BACK_ISSUED
  Volatility rule: Overwrite only — never append. Each run's payload
    fully replaces the last; stale reflections must never be re-read.

Landing Zone:
  Physical form: JSON file in Drive, paired with the Loading Zone by a
    shared run_id.
  Location pointer: BRAIN_TRUST_INDEX key "MIRROR_MATRIX_LANDING_ZONE"
  Expected output schema:
    {
      "reflection_blocks": [
        {
          "observation": string,
          "held_loosely_check": string,        // e.g. "does that land?"
          "clarifying_question": string | null, // null if none earned
          "question_optional_framing_present": boolean
        }
      ],
      "structural_feasibility_category": "A" | "B" | "C",
      "total_questions_asked": integer          // hard cap: 3
    }
  STATUS field values: INFERENCE_COMPLETE | CONSUMED | BOUNCE_BACK_ISSUED
  Polling timeout: 90 seconds (default)
  Retry max: 2

Definition of Done (GAS-checkable proxies, not subjective quality):
  - total_questions_asked <= 3 (hard fail if exceeded)
  - Every clarifying_question, where present, has
    question_optional_framing_present = true (hard fail if any question
    lacks explicit optional language — this is the Anti-Camouflage
    check made mechanical, not just aspirational)
  - No reflection_block's "observation" field contains a declarative
    completion verb pattern without a held_loosely_check present
    (e.g. flags "this system's thesis is X" with no "does that sound
    right?" nearby — a structural proxy for declarative-vs-inviting tone,
    not a perfect semantic check, but a real one)
  - structural_feasibility_category is present and one of A/B/C
    (Muse's own required self-assessment, per its spec)
```

---

## PART 3 — Deployment & Operations

**Consequence analysis:**

**First-Order Fix:** gives Cold Boot Stage 2, Part B an actual mechanized path instead of running as an ad hoc chat exchange each time.

**Second-Order Consequence:** this is the first Flow zone contract in the whole system to have code-checkable DoD criteria tied directly to a *tone* requirement (optional framing, held-loosely language) rather than pure structural validity. That's a genuinely new pattern — worth registering as a Script Registry precedent, since future Flows involving human-facing reflection (not just data synthesis) will want the same kind of mechanized tone-check.

**Third-Order Emergence — flagged HIGH:** DoD checks here are proxies, not true comprehension. A Flow could satisfy every checkable criterion (three questions max, optional framing present, held-loosely phrase attached) while still producing something that *reads* clinical in practice — the checks catch missing scaffolding, not bad execution within the scaffolding. This needs a human spot-check built in, not just trust in the automated gate, at least until there's a real track record.

**Runtime sequence:**

1. GAS constructs the Loading Zone payload from Stage 1's bounded survey output. Writes it, sets `STATUS: READY_FOR_FLOW`.
2. Flow is invoked (Workspace Studio native trigger), reads the Loading Zone, produces the reflection.
3. Flow writes to Landing Zone, sets `STATUS: INFERENCE_COMPLETE`.
4. GAS polls Landing Zone on interval, ignoring anything not marked `INFERENCE_COMPLETE`.
5. On read: **Stage 1 — Schema Compliance Check** (all required fields present, correct types). Fail → Bounce-Back.
6. **Stage 2 — DoD Check** against the four criteria in Part 2. Any hard-fail → Bounce-Back. All this needs is real code, not a subjective read.
7. On full pass: GAS resets Landing Zone `STATUS: CONSUMED`, hands the reflection blocks to Cold Boot's Promotion Gate (already established in SMP-003) for human review — the DoD check clears it for *presentation*, not for *promotion*. Those remain separate gates.
8. **Bounce-Back Protocol** (on any hard-fail): write a structured error back to the Loading Zone naming which DoD criterion failed and why, log a plain-language alert to the operator log, halt downstream processing, reset for retry (max 2 attempts, then `PERMANENT_FAILURE` and human notification).

**Open risk, named rather than resolved:** Goodhart check on the DoD criteria — a Flow could learn to append a generic "does that sound right?" to every observation regardless of fit, satisfying the check without satisfying its purpose. The proxies above are a real improvement over no check at all, but they're not immune to being satisfied mechanically. A periodic human spot-check of *passing* outputs (not just failures) is recommended — the same instinct as the earlier calibration-loop discussion about auto-confirmed rows never being rechecked.
