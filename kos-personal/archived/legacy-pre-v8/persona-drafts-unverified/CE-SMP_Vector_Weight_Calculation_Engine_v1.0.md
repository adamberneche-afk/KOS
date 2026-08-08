# CE-SMP: Vector Weight Calculation Engine v1.0
## System Modification Proposal — [SMP-XXX]

**Date:** May 7, 2026
**Status:** DRAFT — Pending HITL Verification
**Relevant Personas:** Architect (Structure), Developer (Implementation), Auditor (Anti-Drift), Curator (Schema Impact)
**Supersedes:** SMP-001 (partial) — extends the Matrix Compiler architecture with a defined sentence-level measurement methodology

---

## 1. THE ORIGINAL ARCHITECTURE (What SMP-001 Established)

SMP-001 established the Math-Before-Muse Mandate and the VECTOR_MATRIX tab as the canonical ledger for session vector weights. It defined three scoring bands (Core ≥ 0.8, Context 0.5–0.7, Ghost 0.1–0.4) and introduced the Incubator with a 3.0 cumulative threshold and 14-day half-life decay.

**What SMP-001 left undefined:**
- The atomic unit of measurement (what gets scored)
- Who performs sentence-level classification (GAS vs inference)
- How sentence scores aggregate to session-level floats
- The exact Incubator promotion lifecycle and timing
- The CURATOR's role relative to Vector_Router.gs

These gaps produce inconsistent vector weight outputs — the failure mode observed in session log audit 2026-05-06, where PEDAGOGY received 0.1 despite zero session presence, UI received 0.5 for a single sub-exchange, and DOMAIN_COMPLIANCE received 0.9 for incidental activity.

---

## 2. THE SYSTEMIC VULNERABILITIES

**Vulnerability 1 — CURATOR as weight calculator (Bifurcation Violation):**
The CURATOR is a qualitative distillation engine. Assigning it responsibility for vector weight calculation violates the Math-Before-Muse Mandate. The CURATOR has been estimating weights by feel, producing idiosyncratic outputs that are not comparable across sessions.

**Vulnerability 2 — No atomic unit of measurement:**
Without a defined measurement unit, every session produces weights at a different granularity. A session with verbose exploratory discussion produces different weights than a terse decision-heavy session covering identical topics — not because the topics differed but because the measurement unit was undefined.

**Vulnerability 3 — Binary collapse of multi-theme sentences:**
Natural language sentences simultaneously carry multiple contextual weights. *"The script must never execute if the status is changed by an API"* carries SECURITY, GAS_DEVELOPMENT, and ARCHITECTURE signals simultaneously. A single-theme-per-unit classification destroys this multidimensionality — exactly the Ghost Vector problem SMP-001 identified.

**Vulnerability 4 — Undefined Incubator promotion lifecycle:**
SMP-001 defined the 3.0 threshold and half-life decay but left the promotion trigger timing, column creation process, data migration from Incubator to Matrix, and PRIMER generation unspecified. This creates implementation ambiguity.

---

## 3. THE REFACTORED ARCHITECTURE

### 3.1 The Bifurcation Boundary (Revised)

```
Sentence Classification:  INFERENCE FLOW (qualitative — assigns float vectors per sentence)
Aggregation & Math:        GAS — Vector_Router.gs (quantitative — sums, weights, normalizes)
Incubator Management:      GAS — Vector_Router.gs (quantitative — decay math, threshold checks)
Promotion Execution:       GAS — Vector_Router.gs (creates column, migrates data, triggers PRIMER)
CURATOR Role:              RECEIVES pre-calculated weights from VECTOR_MATRIX — does NOT calculate
```

The CURATOR's `vector_weights` field is populated by reading the session row from VECTOR_MATRIX after Vector_Router.gs has written it. The CURATOR performs zero weight calculation.

---

### 3.2 The Atomic Unit: Sentence-Level Classification

**The atomic unit of measurement is the individual sentence.**

Every sentence in the session log is passed to the Inference Flow for classification. The Flow returns a weight vector for each sentence — a JSON object assigning a float 0.0–1.0 to each known vector column, plus any unmapped theme signals above a minimum detection threshold of 0.1.

**Inference Flow input per sentence:**
```json
{
  "sentence": "[exact sentence text]",
  "known_vectors": ["ARCHITECTURE", "GAS_DEVELOPMENT", "SECURITY", "PEDAGOGY", "UI", "DOMAIN_COMPLIANCE"],
  "instructions": "Assign a relevance float 0.0-1.0 to each known vector for this sentence. If this sentence carries signal for a theme not in known_vectors and the signal strength would be >= 0.1, include it as an unmapped_signal. Return only JSON. No preamble."
}
```

**Inference Flow output per sentence:**
```json
{
  "sentence_id": "[integer index]",
  "vectors": {
    "ARCHITECTURE": 0.3,
    "GAS_DEVELOPMENT": 0.8,
    "SECURITY": 0.5,
    "PEDAGOGY": 0.0,
    "UI": 0.0,
    "DOMAIN_COMPLIANCE": 0.0
  },
  "unmapped_signals": [
    { "theme": "ECONOMICS", "weight": 0.6 }
  ]
}
```

GAS receives this array of sentence vectors and performs all subsequent math.

---

### 3.3 The Exchange Classification Flag

Before GAS aggregates sentence scores, it must classify each exchange (human + AI turn pair) as one of two types:

| Exchange Type | Definition | Multiplier |
|--------------|------------|------------|
| `DECISION` | Exchange produced a binding decision, approved artifact, system law, or locked architectural direction | 1.5x |
| `EXPLORATORY` | Exchange was discussion, clarification, ideation, or Q&A that produced no binding output | 1.0x |

**Classification source:** The Inference Flow performs exchange-level classification in the same pass as sentence scoring. It returns an `exchange_type` flag per exchange alongside the sentence vectors.

**GAS applies the multiplier** to all sentence scores within that exchange before aggregation. This is pure arithmetic — GAS reads the flag and multiplies. No inference involved in the math step.

---

### 3.4 Aggregation Algorithm (Vector_Router.gs)

For each known vector column, GAS calculates the session weight as follows:

```
For each sentence S in the session:
  exchange_multiplier = 1.5 if S.exchange_type == DECISION else 1.0
  weighted_score[S] = sentence_vector[S][theme] × exchange_multiplier

raw_session_score[theme] = SUM of all weighted_score[S] for this theme
total_possible_score = SUM of (1.5 × count_of_DECISION_sentences) + (1.0 × count_of_EXPLORATORY_sentences)

normalized_weight[theme] = raw_session_score[theme] / total_possible_score
```

**Output:** A float 0.0–1.0 per known vector. This is the value written to VECTOR_MATRIX and read by the CURATOR.

**Key property:** This formula is deterministic. The same session log always produces the same weights regardless of who runs it or when.

---

### 3.5 The Incubator — Complete Lifecycle

#### Phase 1: Detection and Logging

When the Inference Flow returns `unmapped_signals` on any sentence, GAS logs them to a hidden `INCUBATOR` tab in BRAIN_TRUST_INDEX with this schema:

```
theme_name:        [string — normalized to UPPERCASE, trimmed]
first_detected:    [ISO 8601 timestamp of first appearance]
last_touched:      [ISO 8601 timestamp of most recent session with signal > 0]
session_count:     [integer — number of sessions where this theme appeared]
raw_score_log:     [JSON array of {session_id, raw_score} — one entry per session]
cumulative_score:  [float — sum of all raw scores after decay applied]
decay_applied:     [ISO 8601 timestamp of last decay calculation]
status:            [INCUBATING | PROMOTED | DECAYED]
```

#### Phase 2: Half-Life Decay Calculation

At every session closeout, before promotion is evaluated, GAS applies decay to all INCUBATING vectors:

```
days_since_touched = (current_timestamp - last_touched) / 86400
decay_factor = 0.5 ^ (days_since_touched / 14)
cumulative_score = cumulative_score × decay_factor
```

If `cumulative_score` drops below 0.1 after decay: set `status = DECAYED`. Decayed vectors are retained in the Incubator log for audit purposes but no longer accumulate score.

#### Phase 3: Promotion Evaluation (Batched at Closeout)

After decay is applied, GAS evaluates each INCUBATING vector:

**Promotion condition:** `cumulative_score >= 3.0`

If met, GAS executes the promotion sequence:

**Step 1 — New Column Creation:**
Add a new column to the VECTOR_MATRIX tab with the promoted theme name. Initialize with null values for all prior sessions (do not backfill — prior sessions were measured without this vector).

**Step 2 — Score Migration:**
Read `raw_score_log` from the Incubator. For each session in the log, write the raw score to the new VECTOR_MATRIX column for that session_id. These are the historical incubated scores — they transfer as-is, not re-normalized.

**Step 3 — Incubator Record Update:**
Set `status = PROMOTED`. Record `promoted_at` timestamp. Retain the full Incubator record for audit.

**Step 4 — Add to Known Vectors:**
Write the new theme name to the `known_vectors` configuration array that the Inference Flow reads at the start of each session. From this point forward, the theme is scored as a known vector in the sentence classification pass — not trapped in unmapped_signals.

**Step 5 — PRIMER Generation Trigger:**
Write a row to CE-LOG with:
```
Mutation_Type: CREATE_NEW
Document/Component: [THEME]_PRIMER.gdoc
Modification Description: New vector promoted from Incubator — PRIMER generation required
Deploy_Trigger: [checkbox — awaits human HITL approval]
```

The PRIMER document is not auto-created. It stages in CE-LOG for human approval per the Governance Engine pipeline.

**Step 6 — Human Notification:**
Append an alert to the operator log:
```
🧬 VECTOR PROMOTED: [THEME_NAME]
Cumulative score at promotion: [score]
Sessions incubated: [count]
First detected: [date]
Action required: Review CE-LOG — PRIMER generation staged for your approval.
```

---

### 3.6 CURATOR Schema Impact

The CURATOR's `vector_weights` field extraction rule is **replaced entirely**:

**Old rule (Section 4.2):**
> Analyze the session against core project themes. Assign float values 0.0–1.0.

**New rule:**
> `vector_weights` is not calculated by the CURATOR. It is read directly from the VECTOR_MATRIX tab of the BRAIN_TRUST_INDEX, row matching `session_id`. Vector_Router.gs writes this row at session closeout before the CURATOR fires. The CURATOR reads and transcribes the values verbatim — no rounding, no adjustment, no interpretation.
>
> If the VECTOR_MATRIX row for this session_id is absent (Vector_Router.gs failed or was not run), the CURATOR must:
> 1. Flag `"vector_weights": "UNAVAILABLE — Vector_Router.gs output missing"`
> 2. Do not substitute estimated weights
> 3. Log in `dynamic_state.pivots_and_lessons`: `"Mistake: vector_weights not available | Correction: Run Vector_Router.gs before CURATOR closeout"`

---

### 3.7 Execution Order at @Closeout

The @Closeout sequence must be updated to enforce correct ordering:

```
1. ALIGNMENT Closeout Scan
2. Vector_Router.gs execution:
   a. Inference Flow sentence classification pass
   b. GAS aggregation + normalization
   c. GAS writes session row to VECTOR_MATRIX
   d. GAS applies Incubator decay
   e. GAS evaluates promotion conditions
   f. If promotion: execute Steps 1–6 above
3. CURATOR fires — reads VECTOR_MATRIX, produces canonical JSON
4. RTP outputs canonical JSON as session record
```

Vector_Router.gs must complete before the CURATOR fires. This is a hard sequencing dependency.

---

## 4. SECOND AND THIRD ORDER CONSEQUENCES

**Second-Order:**
- Inference Flow token cost increases proportionally with session length — long sessions with many sentences will consume more inference budget than short sessions. This is the known cost of sentence-level fidelity.
- The `known_vectors` configuration array becomes a system dependency. Any session where this array is stale (promoted vector not yet added) will misclassify that vector as unmapped. The Incubator promotion Step 4 must be atomic with Step 1.
- CURATOR schema validation must be updated to accept `"UNAVAILABLE"` as a valid `vector_weights` value without triggering a Major Error halt.

**Third-Order:**
- Over time, the VECTOR_MATRIX becomes the system's navigational memory. Its integrity is the integrity of the entire knowledge graph. Any corruption of the matrix (wrong session_id, duplicate rows, decimal precision errors) propagates silently into every future Context_Compiler.gs retrieval. The matrix needs a row-level checksum or hash field to detect corruption.
- The half-life decay creates a mathematical pressure toward recency. A theme that dominated the system two years ago and has been dormant will decay to near-zero in the Incubator — but its VECTOR_MATRIX history still shows high historical weights. The Context_Compiler.gs must be aware of this asymmetry when constructing memory retrievals: historical matrix weights are not subject to decay, only Incubator accumulation is.
- **HIGH RISK:** The Inference Flow sentence classification pass is the single point of failure for the entire weight calculation pipeline. If the Flow produces inconsistent output formats (schema drift, missing fields, extra keys), GAS aggregation will produce garbage weights silently. The Inference Flow output schema must be strictly validated by GAS before aggregation proceeds. Any sentence response that fails schema validation must be logged and skipped — not estimated.

---

## 5. NEW ARCHITECTURAL LAWS ESTABLISHED

**Law 1 — CURATOR Does Not Calculate Weights:**
The CURATOR is forbidden from estimating, calculating, or adjusting vector weights. It reads from VECTOR_MATRIX verbatim or flags UNAVAILABLE. No exceptions.

**Law 2 — Sentence Is the Atomic Unit:**
Vector weight calculation always operates at sentence granularity. Exchange-level or session-level shortcuts are prohibited. The Inference Flow must receive individual sentences.

**Law 3 — Decision Multiplier Is GAS Math:**
The 1.5x decision multiplier is applied by GAS using the exchange_type flag from the Inference Flow. The Inference Flow classifies; GAS multiplies. These responsibilities do not cross.

**Law 4 — Promotion Is Batched at Closeout:**
The Incubator promotion trigger evaluates once per session at closeout only. No mid-session promotion. No retroactive re-promotion of a decayed vector without human authorization.

**Law 5 — Matrix Row Integrity:**
Every session must produce exactly one row in VECTOR_MATRIX. Duplicate session_id rows are a critical failure. Vector_Router.gs must check for existing session_id before writing — `_getOrCreate` pattern applies to matrix rows.

---

## 6. OPEN QUESTIONS FOR HUMAN OPERATOR

These items require your decision before implementation begins:

1. **Known vector taxonomy:** What are the canonical starting columns for VECTOR_MATRIX? The audit session used ARCHITECTURE, GAS_DEVELOPMENT, SECURITY, PEDAGOGY, UI, DOMAIN_COMPLIANCE — but this was never formally ratified. A locked starting taxonomy is required before Vector_Router.gs can be written.

2. **Inference Flow token budget:** Sentence-level classification at scale will consume inference budget proportional to session length. Do you want a maximum sentence count per session (truncate oldest sentences if exceeded) or an unlimited pass?

3. **Matrix row checksum:** What hashing approach should GAS use for row integrity validation? MD5 of the concatenated float values is simple and fast. SHA-256 is more robust. Or defer this to a future SMP.

4. **PRIMER auto-generation vs staged:** Step 5 currently stages PRIMER generation in CE-LOG for human approval. Do you want the option to auto-approve PRIMER generation for promoted vectors, or always require manual HITL approval?
