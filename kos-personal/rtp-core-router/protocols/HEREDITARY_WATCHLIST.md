# Hereditary Documents Watch List
Candidates mined from prior design generations (Flow Architect, North Star,
Lobed KOS, and earlier), held here pending deliberate review — not merged
into any live protocol document until vetted.

## Governing Principle: Chesterton's Fence in Reverse

Ordinary Chesterton's Fence: don't remove something until you know why it
was built. The reverse, which governs this document specifically: **don't
re-adopt something old until you know why it was left behind.** Every
system generation here (Flow Architect/North Star → KOS v8.0 → RTP) was a
deliberate rebuild, not a random abandonment. Some things were dropped
because they were surpassed. Some were dropped only because the rebuild
moved on before reconciling them. Those are different situations, and
pulling an old idea back in without knowing which one it is risks quietly
reintroducing something that was correctly retired, or conflating two
generations' logic in a way that muddies rather than clarifies the current
system. Nothing here gets merged into a live document until that question
has an actual answer, not an assumed one.

**Entry format:** source, what it proposes, why it looks valuable, and the
open question that has to be answered before it's adopted.

---

## Candidates

### 1. Kill Switch Protocol
**Source:** Flow Architect File 10 (System Initialization & Disaster Recovery)
**Status: ADOPTED — see `KILL_SWITCH_PROTOCOL.md`.** Manual for now by
deliberate choice, one procedure covering both sides of the automation air
gap, named trigger conditions requiring periodic reassessment, root-cause
note required before reactivation. No longer a pending candidate.

### 2. Reset Protocol (Soft / Hard)
**Source:** Flow Architect File 10
**Proposes:** A deliberate, operator-initiated reset distinct from Cold
Boot's involuntary trigger. Soft: archive the current rule set, start
clean, retain access to the archive. Hard: full wipe to Day Zero.
**Why it looks valuable:** Cold Boot Protocol only ever specifies *one*
reset scenario — BRAIN_TRUST_INDEX at zero records, unconditionally. It
has no answer for "the operator wants to deliberately reset because the
current state has gone bad," which is a genuinely different case.
**Open question:** Does this conflict with the Idempotency Guard's "fires
exactly once" law, or complement it as a distinct, explicitly-invoked
path? Needs a real answer, not an assumption either way.

### 3. Legacy Export (quarterly Master Rulebook)
**Source:** Flow Architect File 10
**Proposes:** A periodic, human-readable export of all learned rules and
success metrics — durable even if the underlying system is deleted
entirely.
**Why it looks valuable:** Directly matches a real need already named
this session — the object-permanence point about needing things visibly
confirmed to exist, not just trusted to exist somewhere in Drive.
**Open question:** Where would this actually live, and does "quarterly"
match anything about how this system is actually used, or is that cadence
specific to Flow Architect's own context and worth re-deriving rather than
copying?

### 4. Initial CI Default = 0.4 at true cold start
**Source:** Flow Architect File 10
**Proposes:** A concrete numeric starting confidence (0.4, within its own
"Blind Spot" band) rather than an unstated qualitative "start tight."
**Why it looks valuable:** Gives Cold Boot's weighted CI formula (already
merged last turn — see retroactive flag below) an actual cold-start value
instead of leaving day-one behavior undefined.
**Open question:** None major — this is close to a direct, low-risk port.
Still logged here rather than merged immediately, on principle.

### 5. Weighted Error Taxonomy
**Source:** Flow Architect File 04 (Error Harvesting & Rule Synthesis)
**Proposes:** Errors aren't logged flat — they're weighted by severity:
Logic Error (1), Quota/Limit Error (2), Permission/Auth Error (3),
Structural Error (5). More granular than the single "Error History"
factor we ported from File 03 last turn.
**Why it looks valuable:** Our current Error History factor treats all
past mistakes as equally informative. This suggests a structural
violation should count for more than a minor logic slip — directly
relevant to how the calibration loop should actually weight corrections.
**Open question:** Does this taxonomy fit our domain (file/registry
classification) or is it specific to script-drafting errors? A wrong
duplicate flag and a wrong deletion recommendation probably deserve
different weights, but not necessarily *these* weights without adaptation.

### 6. Rule Conflict Resolution (ask, don't silently pick)
**Source:** Flow Architect File 04
**Status: ADOPTED — see `RULE_CONFLICT_RESOLUTION_PROTOCOL.md`.** This
went through explicit review (seven questions asked, five resolved by
direct operator decision) rather than being merged on the strength of the
idea alone. No longer a pending candidate.

### 7. Periodic Health Audit (every N logged errors)
**Source:** Flow Architect File 04
**Proposes:** Every 10 logged errors, propose a system-wide refactor scan
— looking for one architectural change that would eliminate a whole
category of recurring mistakes, rather than patching each instance.
**Why it looks valuable:** Our weekly calibration cadence is time-based.
This is volume-based — worth considering whether ours should be triggered
by accumulated evidence rather than the calendar.
**Open question:** Time-based vs. volume-based cadence is a real design
choice, not obviously in favor of either — worth deciding deliberately.

### 8. The Verification Handshake's Four-Part Structure
**Source:** Flow Architect File 06
**Proposes:** Every proposal delivered as: (I) the pedagogical/practical
Why, (II) the technical What — scopes, file impact, trigger type, (III)
the Confidence Score with named risk factors, (IV) an explicit
**Reversibility Plan** — how to undo this if it goes wrong.
**Why it looks valuable:** Our SMP format has most of this implicitly, but
**nothing requires an explicit reversibility plan** — every SMP we've
filed states what changes and why, never how to undo it if it's wrong.
That's a real, missing requirement, not a nice-to-have.
**Open question:** Should this become a mandatory fifth field in the SMP
template itself, or is it specific to code-deploying proposals (which none
of our filed SMPs have been yet)?

### 9. Rejection Categorization
**Source:** Flow Architect File 06
**Proposes:** When a proposal is rejected, the system asks *why* — safety
concern, technical logic, or pedagogical/philosophical misalignment — and
logs that category to prevent similar future proposals.
**Why it looks valuable:** We've never actually had a proposal rejected
this session (everything's been revised-then-approved), so this gap has
been invisible. Worth having before the first real rejection happens
rather than after.
**Open question:** None significant — this seems like a clean, low-risk
addition whenever the SMP process handles its first actual rejection.

### 10. The Trinity of Cognition + Recurrence Weight
**Source:** Flow Architect File 02 (Drive-Based State & Memory)
**Proposes:** Three named memory files (Rules/Errors/Working-State), each
error entry carrying a `recurrence_weight` that increases on repeat
occurrence, triggering a "High Priority" rule update automatically. Also
confirms the CI cold-start math precisely: rules exist + no errors = 0.9;
no rules = 0.4 (matches candidate #4 above).
**Why it looks valuable:** `recurrence_weight` is a cleaner mechanism than
our divergence-interval math for the same purpose — a repeat offense
escalates automatically rather than waiting for a weekly rollup.
**Open question:** Does an automatic escalation trigger conflict with our
"no threshold changes without discussion" rule, or is it compatible since
it's escalating *attention*, not silently changing a live threshold?

### 11. Health Report + Proactive Flow Discovery
**Source:** Flow Architect File 05 (Proactive Discovery & Health Reporting)
**Proposes:** A periodic report with a System Stability Score, a "Friction
Heatmap" (which service/pattern produces the most errors), and CI Trend
over time — plus a proactive suggestion algorithm (redundancy detection,
bottleneck analysis, safety-gap identification) that surfaces automation
opportunities the operator hasn't asked for yet, each requiring its own
Reversibility Plan before being offered.
**Why it looks valuable:** This is a genuinely different capability than
anything we've designed — proactive suggestion, not just reactive
classification.
**Open question:** Given the object-permanence/dopamine conversation a few
turns back, would proactive suggestions help or just become more
unactioned material sitting in view? Worth deciding before building.

### 12. Namespace Hierarchy, Sharding, and Embedded Metadata
**Source:** Flow Architect File 07 (Drive Storage & Querying)
**Proposes:** A strict subfolder namespace (MEMORY/DRAFTS/HEALTH/RULES), a
sharding rule (archive error logs past 50KB), a lightweight MASTER_INDEX
mapping every system file's location, and an embedded metadata header
(`origin`, `tx_id`, `fidelity`, `verified`) on every file the system
creates — plus explicit CI degradation (to 0.2) on a failed file lookup.
**Why it looks valuable:** The embedded-metadata-header idea is directly
useful regardless of lineage questions — every SMP or draft filed this
session could carry a machine-readable fidelity/verified tag the same way.
The sharding threshold is a real, concrete answer to a scale question
raised much earlier this session and never resolved.
**Open question:** None major on the metadata header — low-risk, useful
independent of the rest. The namespace structure is more entangled with
Active_Brain_Trust_System's existing (mostly empty) folder scheme and
needs reconciling against that, not adopted fresh.

### 13. Friction Zones, LEHI Templates, and Student-Facing CI Dock
**Source:** Flow Architect File 08 (Classroom Management & Pedagogical Flows)
**Different in kind from the rest of this list** — this is CAS feature
material, not Cold Boot/calibration process material. Proposes three named
"Friction Zones" (Academic Momentum, Administrative Surface Area, Feedback
Fidelity) as a triage lens for where to build next, a menu of proven
low-effort/high-impact flow templates, and a hard rule: any flow touching
direct student communication automatically docks Initial CI by 0.1,
forcing explicit tone/clarity review before it ships. Independently
reconfirms North Star's "never automate mastery evaluation" constraint
from a completely different document.
**Why it looks valuable:** The automatic CI dock for student-facing
communication is a clean, adoptable safety rule regardless of any lineage
question.
**Open question:** This probably belongs in a CAS feature backlog, not
this watch list — flagging for a future move rather than a merge.

**Flow Architect series status: all 10 files now read (01–10 complete).**

---

### 14. The Lobed Architecture (data-domain organization, not agent organization)
**Source:** Whitepaper: The Lobed Knowledge Operating System, and Whitepaper:
The Active Lobed KOS (both April 16 — the earliest KOS generation on record)
**Proposes:** A fundamentally different organizing principle than anything
downstream of it. Five "Lobes" organized by *data domain*, not by *agent*:
Pedagogy (curriculum map), Operations (daily class log), Diagnostic
(student mastery data), Reflective (qualitative teaching notes), Resource
(lesson bank). This is not the Cog/Council model — no Architect, Auditor,
Developer, Curator, Muse, Alignment. It's organized around *what kind of
information this is*, not *which persona owns it*.
**Why it looks valuable:** The named problem — "Contextual Drift" — is the
exact same problem RTP's own Whitepaper later calls "Context Decay." This
is real evidence the core motivating problem survived across every
generation even when the solution architecture changed completely. Worth
knowing whether the switch from data-domain to agent-based organization was
a deliberate improvement or just a different designer's instinct on a
different day.
**Open question, the central one for this whole entry:** why did lobes
(organize by data type) get replaced by cogs (organize by persona)? That's
the actual reverse-Chesterton question, and it's not answered by anything
read so far.

### 15. Push Architecture, Student-Facing Chat Instances, and the FERPA Rationale
**Source:** Whitepaper: The Active Lobed KOS
**Proposes:** A "Push" model — the system proactively messages each
student via Google Chat at set trigger points, rather than waiting for
them to open a tool. Each of 30 students would run their own lightweight
autonomous instance, reporting into one teacher-facing "Heatmap
Spreadsheet." Explicitly grounded in FERPA compliance, operating entirely
inside "the District's Google Walled Garden."
**Why it looks valuable:** Two things stand out. First, nothing in CAS as
currently built is student-facing in this proactive, conversational way —
CAS generates warm-ups and tracks competency, but doesn't push messages to
students directly. This was a real, more ambitious vision that doesn't
appear to have survived into CAS's actual build. Second — **this predates
SMP-004's automation air-gap by exactly three months**, and grounds the
same "student data stays inside the district account" principle in FERPA
directly, rather than the Canvas incident. That's independent confirmation
from an earlier generation that this constraint was always the right one,
not something learned only after a real loss.
**Open question:** Was the student-facing "Push"/chat-bot vision
abandoned for a good reason (scope, complexity, a pedagogical concern like
the ones North Star raises about H2H connection), or did it just not
survive the rebuild? **Resolved:** the consolidated Arbitrator doc's
"Ghost in the Machine" rule — no feedback reaches a student without the
Teacher seeing it first — is a direct, principled veto of exactly this
Push model. Confirmed further by ALIGNMENT's own current, active rule
(draft communications go to chat UI first, never auto-sent). This wasn't
lost track of; it was deliberately rejected, and the rejection held.

---

## ⚠️ Urgent Flag, Not a Routine Candidate

### 16. Shadow Grading Veto vs. CAS's Actual "Shadow Matrix"
**Source:** North Star File 07 (Agency Safeguards & The Right to Wonder),
§5: *"The Arbitrator will veto any 'Shadow Grading' or 'Hidden Metrics'
that the student cannot access... if a Flow Architect uses a
Success_Probability score, that score must be visible and explainable to
the student, or it must be deleted."*

**This is not a historical curiosity — it names something CAS already
has.** Per this session's own memory, CAS's Module 2 build includes "a
per-student shadow matrix with decay factor and confidence threshold."
The name itself is the alarm: North Star explicitly vetoes exactly this
pattern under exactly this name, unless the score is made visible and
explainable to the student.

**Operator clarification received:** the intended design is that shadow
matrix output surfaces as observations to the teacher, verified by the
teacher, before ever being considered in inference. This resolves a real
question — is this data reliable enough to act on — using the same
propose-then-verify discipline already running through this whole session
(Math-Before-Muse, HITL Firewall, promotion gates).

**Resolved.** Full design as clarified: the shadow matrix generates
observations; the teacher verifies them before they're considered in
inference; verified observations eventually become visible to the student,
delivered *in context* rather than as a bare score. This satisfies North
Star's letter (eventual student visibility) and its spirit (nothing
sterile or extractive reaches a student unmediated) simultaneously — the
verification step functions as both an accuracy gate and a deliberate
human-connection point, not two separate concerns bolted together. No
further action needed on this item; worth carrying this exact framing
forward into whatever eventually documents CAS's actual shadow matrix
implementation.

### 17. Concrete Nuance: Moral Debt Remediation
**Source:** North Star File 05 (Adversarial Moral Reasoning)
The original file specifies debt is repaid via "a manual 'Agency-Building'
activity next week" — a concrete corrective action. The later consolidated
Arbitrator doc simplifies this to "archived and forgiven if older than 30
days." These are meaningfully different mechanisms (active repayment vs.
passive expiry) — worth knowing which one was the deliberate later
refinement before assuming the consolidation is simply a faithful summary.

### 18. The Cog Creation Protocol and Neural Anchor
**Source:** North Star File 09 (Governance of Mechanical Creep)
**Proposes:** Every new agent requires a Functional Justification before
creation (does this replace a connection the Teacher *should* keep; does
it fragment or cohere the student experience) and a mandatory "Neural
Anchor" embedded in its first instruction line: *"I am subordinate to the
North Star Arbitrator. My logic must defer to Pedagogical Resonance over
Technical Efficiency."*
**Why this matters immediately, not just historically:** this session has
added six cogs (Architect, Auditor, Developer, Curator, Muse, Alignment)
plus multiple new schema/zone proposals, and **not one of them carries
this anchor or went through this justification test.** This isn't a
lineage curiosity — it's a protocol that would apply directly, right now,
to everything built this session, if adopted.
**Open question:** Should this be applied retroactively to the existing
six cogs, or only prospectively to anything new from here forward?

### 19. Redundancy for Humanity
**Source:** North Star File 09
**Proposes:** A rule with no current equivalent: *"If an agent can do a
task 100% autonomously, but 10% human involvement would double the
student's sense of being seen, the Arbitrator mandates the 10% human
involvement."* Full autonomy in pedagogical spaces is vetoed on principle,
not evaluated case-by-case.
**Why it looks valuable:** ALIGNMENT currently protects *time*. This
protects *deliberate partial automation* as a value in itself, independent
of time cost — a stronger and more specific claim than anything currently
active.
**Open question:** Does this conflict with this session's own "keep me
out of the loop as much as feasible" design principle from early on, or
refine it? Worth resolving explicitly rather than letting both stand
unreconciled.

### 20. Systemic Immortality (the Legacy Clause) + Daily Alignment Handshake
**Source:** North Star File 10 (Second-in-Command & Emergency Restoration)
**Proposes:** *"If the KOS platform changes, the North Star Arbitrator is
the first item to be moved. The technical agents are replaceable; the
North Star alignment is the DNA of the classroom."* Plus a daily 8pm
ritual question: *"Did the automations today make your students feel more
seen by you, or more managed by me?"*
**Why it looks valuable:** This is the clearest statement anywhere in the
entire lineage of the actual reverse-Chesterton failure mode this whole
watch list exists to catch — the alignment layer was supposed to survive
every rebuild first, and demonstrably didn't. The daily handshake is a
small, concrete ritual with no current equivalent.
**Open question:** None structural — low-risk, high-value candidate for
direct adoption regardless of any lineage question.

### 21. The Dissenting Opinion (Teacher Override, Logged Not Blocked)
**Source:** North Star File 02 (Cross-Agent Communication Bus)
**Proposes:** The Teacher can always override a VETOED proposal — sovereign,
no exceptions — but doing so logs a permanent "Dissenting Opinion" in
HEALTH_REPORT.md stating exactly why the override risks pedagogical
degradation. Not a block; a permanent, honest record. This appears to be
the actual origin of what the consolidated doc later calls "Moral Debt
Logging."
**Why it looks valuable:** A clean pattern — never stop the human, always
remember the disagreement — that nothing in the current system does.

### 22. Dead Data Deletion Rule
**Source:** North Star File 08 (Value Addition vs. Extraction Logic)
**Proposes:** Any extracted data point unused for human connection or
student insight within 30 days gets proposed for deletion, on principle:
*"If we aren't using this to help the student, we are just hoarding their
digital shadow."*
**Why it looks valuable:** A concrete, principled retention policy —
something CAS's actual data practices don't appear to have anywhere yet.

---

## Dig Status — Complete

**Fully read:** Flow Architect (10/10), Lobed KOS whitepapers (2/2), North
Star (all 10/10 individual files, plus the consolidated Arbitrator doc).
TSO/crypto lineage set aside as a separate project, pattern-only relevance
confirmed.

**22 candidates logged. Three resolved** (Push/H2H, Moral Debt nuance,
Shadow Matrix design). **Nothing merged into any live document** — every
item here is awaiting deliberate, one-at-a-time review, per the governing
principle at the top of this list.

---

**The weighted CI formula from Flow Architect File 03 was merged directly
into `COLD_BOOT_PROTOCOL.md` in the prior turn, before this watch-list
process existed.** That merge did not go through a reverse-Chesterton
review — it was treated as a starting hypothesis, which is defensible, but
it did not ask "why did this specific formula not survive into KOS v8.0 or
RTP" before being adopted. Worth deciding whether to let that merge stand
as-is, or subject it to the same review the four candidates above are
waiting for, for consistency's sake.
