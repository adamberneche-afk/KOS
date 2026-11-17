# External Reference: "Digital Homesteading" (TAIS Platform)

**Status:** Reference material only. Not part of KOS. Filed at the user's
request as context for future development, not as a spec to implement.
**Update:** two of the ideas below have since been acted on — see each
bullet's own note on what actually landed and what's still just described.

## What this is

A whitepaper describing a *different, unrelated* product called the "TAIS
Platform" — filed here only because some of its architectural ideas may be
worth drawing on for KOS's own roadmap later. TAIS is not built, is not
referenced anywhere else in this repo, and shares no code or persona
lineage with KOS. The uploaded source PDF also contained several pages of
an unrelated public Discord chat log about a cryptocurrency token
relaunch — that content is not reproduced here; it has nothing to do with
either KOS or TAIS and was almost certainly bundled into the PDF by
accident.

## Ideas worth remembering for later

Summarizing only the parts that could plausibly inform future KOS work,
stripped of TAIS's own branding and economics:

- **Temporal memory maturity lifecycle** — TAIS distinguishes
  Working/Active memory (raw session logs) → Reflective/Immutable memory
  (nightly-synthesized insights) → Core memory (user-promoted, "untouchable"
  facts). **Landed, twice:** the explicit comparison is now written up in
  `KOS_WHITE_PAPER.md` §3 (mapped to real KOS components: the Blackboard/
  session log, the 06:00 Daily Primer, and `VECTOR_MATRIX` promotion), and
  the missing "user-promoted, untouchable" half of Core Memory — KOS's
  algorithmic promotion had no manual override — is now real code:
  `pinThemeToCore()` in `4_Vector_Router.gs`, a `PROMOTED_MANUAL` status
  distinct from the algorithmic `PROMOTED`.
- **Drift detection / mutual correction** — an agent that "respectfully
  challenges" the user when new behavior contradicts an established Core
  Memory. This is conceptually close to what KOS's ALIGNMENT persona
  already does at Closeout, but TAIS frames it as a standing, continuous
  check rather than an end-of-session one. **Landed.** This bullet
  previously read "still just described, not built" — that was written one
  commit before it was built. `PERSONA_ALIGNMENT_V5_1.md` §2.2 now defines
  **Threshold D, Value-Consistency Drift**, as a fourth hard threshold;
  `buildSessionContext()` (`9_UI_Diagnostics.gs`) injects a CORE FACTS
  block so the live persona can actually see pinned facts; and
  `CURATOR_PROMPT.md` / `PERSONA_CURATOR_V5_1.md` carry
  `D_VALUE_CONSISTENCY_DRIFT` end to end. TAIS's "standing, continuous
  check" framing is still the difference — KOS's fires at Closeout.
- **Local-first data custody** — TAIS's "RCRT" module keeps all memory on
  the user's device by default, with a server holding only non-sensitive
  metadata. KOS is already local/self-hosted by construction (a user's own
  Drive + Apps Script project, not a vendor server) — this isn't a new
  idea for KOS. **Landed:** `KOS_WHITE_PAPER.md` §3 now states this
  explicitly in TAIS's own "sovereignty" language (zero external server,
  no API keys, no vendor billing relationship), alongside the memory-
  lifecycle comparison above.
- **Cross-app session handoff** — carrying an agent's identity/context
  across separate tools (Slack → Notion, in TAIS's example). Not
  applicable to KOS's current single-surface (Drive + Studio) design, but
  worth a look if KOS ever needs to span multiple front-ends.

## Ideas explicitly NOT relevant to KOS

- TAIS's "Snapshot Staking" economics (USD-pegged capability tiers,
  on-chain-adjacent staking, a "Dust Protection Latch") is a monetization
  model for a different, commercial multi-tenant product. It directly
  contradicts KOS's Polyform Noncommercial licensing and Cold Engine
  Protocol (see `LICENSE`) and should not be treated as a direction for
  KOS, even the already-optional `kos-personal/inference-service/` hosted
  path.
- The Agent SDK / OAuth-style scoped third-party access model assumes a
  much larger integration surface than KOS currently has or needs.

Aside from the three "Landed" bullets above, nothing here is scheduled,
approved, or in progress — this file exists so the remaining ideas aren't
lost, not to commit KOS to any of them.
