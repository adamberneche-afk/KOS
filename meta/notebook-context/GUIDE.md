# KOS_CONTEXT_00_GUIDE — How to read this notebook

Notebook source: KOS_CONTEXT_00_GUIDE.

This notebook explains why KOS exists, what each of its systems promises,
and what case can be made for it. A companion notebook, "KOS Codebase",
holds the code itself. This guide was written on 2026-10-23 and is kept in
the repo as `meta/notebook-context/GUIDE.md`; the other sources are copies
of repo files, made by `tools/notebook-context/build.js`. Each file is its
own section, headed by its path. When two sources disagree, the newer one
wins, and the code beats both.

## What KOS is, in one paragraph

KOS is one teacher's monorepo of three separate Google Apps Script
systems, built and run by that teacher (the "operator", Adam Berneche, a
CTE business and marketing teacher at Clover Hill High School,
Chesterfield County Public Schools, Virginia).
None of them needs an outside server or a paid AI vendor: each runs inside
Google Workspace, and AI calls go through Workspace's own Gemini (Studio
Flows). The three systems are kept apart on purpose:

| System | What it is | Who uses it |
|---|---|---|
| `kos-personal/`, the Knowledge Operating System | A personal pipeline that turns the operator's AI working sessions into structured knowledge: decisions, action items, a values profile, and a daily primer | The operator alone |
| `cas-ccps/`, the Classroom Agency System | A FERPA-scoped classroom platform for two marketing courses (8175 and 8177): AI feedback on student drafts before they turn in on Canvas, personalized daily warm-ups, lesson framing, and competency tracking | Students, the teacher, and (in time) other teachers |
| `leader-hub/`, LeaderHub | A command center for the operator's other roles: DECA advisor, field trips, the school store and work-based learning, esports | The operator alone |

## The North Star, system by system

Each system states its own North Star. They differ in wording and share
one idea: **automation should clear the way for human attention, never
replace human judgment.**

- **kos-personal:** "We automate the machine so we can be free to be
  human." The white paper frames KOS as a "cognitive harness designed to
  protect human presence from digital extraction", shifting the goal "from
  efficiency of output to density of insight". It runs on infrastructure
  the operator already owns (it calls this "zero-server sovereignty"). A
  six-persona Council challenges the operator instead of agreeing.
  (`KOS_CONTEXT_NORTH_STAR`, `kos-personal/KOS_WHITE_PAPER.md`.)
- **cas-ccps:** "Automate the prerequisite. Protect the human moment.
  Never replace judgment." Its stated North Star is "a classroom where
  teacher attention is concentrated precisely where it does the most good —
  in the messy, uncertain, genuinely human middle of the learning process".
  Its design rule for anything a teacher sets up: "The system should never
  require the user to type something it already has", and it should "fail
  loudly, at the right moment". (`cas-ccps/docs/PLATFORM_DOCUMENTATION.html`,
  `cas-ccps/docs/CAS_ContextualGates_DesignPrinciples.html`.)
- **leader-hub:** "Out of sight, out of mind. This dashboard exists to keep
  everything in sight so that everything stays in mind." A teacher in five
  roles doesn't lack information; they lack "organized attention".
  (`leader-hub/LEADERHUB_PRINCIPLES.md`.)

Under all three sits a larger thesis, **the Economics of Depth**
(`KOS_CONTEXT_FOUNDATIONS`). As AI pushes the cost of physical and
cognitive work toward zero, human value moves from *scale* to *depth*:
unscalable, high-trust human connection. A classroom run on relational
trust rather than transactional grading is presented as an early working
model of that economy, and KOS as the system that teaches those ideas to
teenagers. The paper calls itself a thought exercise and flags where it
asserts rather than proves. Its companion, *Assumptions Deep Dive v2*,
audits each load-bearing claim against published research. Two claims
remain contested on their own terms: the debt-deflation mechanism, and
whether AI friction helps learning.

## The value proposition

Put together from the sources, by audience. Each line names where it
comes from. Claims marked *stated* are written in the docs but not yet
backed by data in the repo.

**For students (cas-ccps)**
- Feedback on a draft within minutes, any time, as often as needed,
  against the lesson's own criteria, before turning in on Canvas
  (`IMPACT_DASHBOARD.html`, `cas-ccps/README.md`).
- A daily warm-up written for them from their own work so far.
- No score shown until the teacher confirms it; the system flags and the
  teacher decides.
- *Stated:* "Students who previously submitted one draft now submit 2–3"
  (`IMPACT_DASHBOARD.html`). The dashboard holds no recorded data yet, and
  `EvaluationLog`, which would show each student's attempts, began on
  2026-10-23.

**For the teacher (cas-ccps, leader-hub)**
- The formative-feedback load on assignments that run through CAS, done
  before the teacher opens the final work.
- Lessons, warm-ups, competency evidence and the Student Context view
  prepared ahead, so the teacher "begins instruction knowing the room".
- Every role's deadlines and paperwork in one place, surfaced at the right
  time (LeaderHub).
- *Stated:* hours recovered. No teacher-reported hours exist yet.

**For families (cas-ccps, D1, decided 2026-10-23)**
- A weekly report KOS writes and the teacher sends from their own email:
  each item by lesson title and where it stands, a score only where the
  teacher confirmed one, and what is still open.

**For the school and district**
- No new vendor, no data-processing agreement, no procurement: it runs in
  the district's existing Google Workspace, and student data stays in the
  domain (`IMPACT_DASHBOARD.html`, `cas-ccps/docs/FERPA_DATA_MAP.md` in the
  codebase notebook).
- *Stated:* deploys "in approximately one hour". The first live setup, in
  October 2026, took weeks of fixes, recorded in the handoff
  (`KOS_CONTEXT_DIRECTION`).
- "The Case Beyond the Classroom" links teacher attention to school quality
  and local property values through cited economics papers, marked as
  pointers to check, not verified quotes.

**For the operator (kos-personal)**
- A record of their own thinking that compounds: working, reflective and
  core memory; a values profile (the Shadow Matrix) inferred from sessions;
  a Council that pushes back. Free for individuals and educators under the
  Polyform Noncommercial license.

## Where the promise and the system stand (October 2026)

- **cas-ccps is live in one teacher's classes.** Students submit from the
  Student Dashboard and get feedback as a comment on their doc. Its four
  Studio Flows run. Warm-ups go out nightly, and the nightly lesson rollout
  makes every student's lesson docs, catching itself up when a run stops
  short. Everything merged through #337 was pushed and checked live on
  10-29. On 10-31 every code finding of an external security audit (KOS
  Audit Docket IV) was fixed, and student records and phone numbers were
  removed from the repo's whole history. On 11-01 the plan's first week was
  built a day early (the SCR retry, the Registrar's flows, Flow 2's health
  numbers, Flow 5 merged into Flow 3) and D9 was decided: one install per
  teacher, with a student's teachers sharing context. Everything through
  #370 was pushed the same day, and the Mothership hub now polls KOS on
  its own; the handoff's queue says what is left for the operator
  (`meta/HANDOFF_2026-11-01.md`). October's plan, CAS live by 2026-10-30
  one feature at a time (`meta/PLAN_2026-10.md`), was met. November's plan
  (`meta/PLAN_2026-11.md`) is to measure Flow 2 and the warm-ups, build
  work files in Forms, Slides and Sheets, and start packaging CAS so a
  second teacher can run their own install.
- **kos-personal** finished its 21-day onboarding on 2026-10-13. Its
  thinking surface moved from a Gemini Gem to a Claude Project. Two
  sessions with no Vector State row are under investigation.
- **leader-hub** now runs as a server-backed web app and stores nothing
  in the browser. It is the system that most fully meets its own North
  Star (`meta/CODEBASE_REVIEW.md`).
- **The gap the review named:** where a system depends on an outside AI
  flow, the anticipatory feature is built but not always closed end to
  end. For cas-ccps that gap has mostly closed since: Apps Script now
  feeds and harvests every flow.

## Which sources are current and which are dated

| Source file | Read it as |
|---|---|
| `meta/CODEBASE_REVIEW.md` (August 2026) | The clearest North Star and value review, with "⚠ Stale" notes inline. Its "no tests" finding is closed: over 2,000 tests run now |
| `cas-ccps/docs/PLATFORM_DOCUMENTATION.html` | The original platform plan. Its opening note (2026-10-23) gives what is live now; module statuses and the build plan below it are as first written |
| `cas-ccps/docs/IMPACT_DASHBOARD.html` | A template for recording outcomes. It holds no data; its "Why it matters" lines are claims to measure |
| `cas-ccps/docs/SYSTEM_ARCHITECTURE.html` | Its design principles and security model still hold. The rest describes the original Module 1 system, as its own banner says; the cas-ccps README is the current map |
| `leader-hub/LEADERHUB_PRINCIPLES.md` (March 2026) | The principles hold. The roles and dates describe spring 2026, and "single-page" now means the front end of a server-backed app |
| `kos-personal/KOS_WHITE_PAPER.md` | Positioning, not a spec: the README and schema docs say what is built |
| Economics of Depth and its assumptions audit (April 2026) | A thought exercise written for colleague and administrator discussion, with its own open questions |
| `meta/PRD_CAS_RESEARCH_PIVOT.md` (Oct 10) | The plan to make CAS implement the research it cites. Phase 0 is done; later phases wait on the first real weeks of use |
| `meta/PRODUCT_EXPERIENCE_GAP_AUDIT.md`, `meta/UX_AUDIT_2026-10-22.md` | Where the experience falls short of the promise, by stakeholder. The UX audit's Status section says what was fixed (nearly all of it, by 2026-10-23) |
| `meta/PLAN_2026-11.md`, `meta/HANDOFF_2026-11-01.md` | Current: the order of work and where each system stands |
| `meta/PLAN_2026-10.md` | October's plan: its order of work is replaced; its design (which AI does what) and decision record still hold |
| `meta/BACKLOG.md`, the design threads, the course builder and lesson authoring plans | Direction: ideas and plans, not built work, unless they say so |

## How the sources are cut

| Source | Holds |
|---|---|
| `KOS_CONTEXT_00_GUIDE` | This guide |
| `KOS_CONTEXT_NORTH_STAR` | The KOS white paper; CAS's platform plan and its Contextual Gates principles; LeaderHub's guiding principles |
| `KOS_CONTEXT_FOUNDATIONS` | The Economics of Depth white paper and its assumptions audit |
| `KOS_CONTEXT_VALUE` | The North Star and value review; the impact dashboard and its "case for change"; the research-alignment PRD; the product experience and UX audits |
| `KOS_CONTEXT_SYSTEMS` | The repo README; the kos-personal, cas-ccps and LeaderHub READMEs; CAS's system architecture; the Flow Doctrine (how the AI flows must be built) |
| `KOS_CONTEXT_DIRECTION` | The October plan, the current handoff, the backlog, CAS's design threads (mastery map, portfolio), cognitive exhaust, and the course builder and lesson authoring plans |

## Words you will meet

- **Operator:** the one person who runs a system (here, the teacher who built it).
- **Studio / Flow:** Google Workspace Studio's AI automations. Flows 1 to 5 in cas-ccps write assignments, give feedback (Flow 2), and write, score and bridge warm-ups (Flows 3 to 5).
- **Central Ledger:** cas-ccps's main spreadsheet, one row per student workspace.
- **SCR:** the Student Competency Record, ratings on Virginia's 1 to 5 competency scale, where 1 is the highest.
- **Council / personas / Cogs:** kos-personal's six reviewing personas (Architect, Auditor, Curator, Developer, Muse, Alignment).
- **Shadow Matrix:** kos-personal's calibration model: its confidence in five of the operator's values (such as relational targets and necessary struggle), updated from each session; a value it becomes confident in is marked VERIFIED.
- **RTP:** the earlier Gemini-Gem orchestration layer for kos-personal, frozen at V6.0.
- **D1, D2:** numbered decisions in the October plan (D1: parent reports; D2: the lesson rollout).
