# Character Card Evaluator — v2 PRD

> **Evolution from v1:** v1 mixed character evaluation with rendering pipeline evaluation (memory, jailbreaks, edge cases). v2 focuses squarely on **evaluating the character card itself** — the definition that a creator writes. Rendering concerns are explicitly excluded or flagged as mixed-signal.
>
> **v2 is designed around a feedback-driven iteration loop.** The consumer of the report — human creator or AI assistant — must be able to edit the card and re-run. This drives three non-negotiables:
> 1. **Reasoning traces on every rubric** — no bare scores; the full chain from evidence to judgment is surfaced.
> 2. **Section completeness checks** — the card must cover physical appearance, backstory, behavior patterns across settings, relationships, voice, values, quirks; missing sections are called out with skeletons.
> 3. **Causal coherence (the waterfall model)** — past experiences in the backstory must plausibly produce the stated present behavior. Discontinuities (e.g., traumatic childhood → effortless adult security, with no bridging narrative) are surfaced as high-leverage failures with suggested bridges.

---

## 1. Scope & Separation of Concerns

A chat endpoint bundles three distinct systems:

| Layer | What it is | v2 Stance |
|-------|-----------|-----------|
| **Character card** | The persona definition a creator writes | **Primary focus** |
| **Rendering pipeline** | System prompt wrapping, context/memory management, safety filters, post-processing | Excluded |
| **Base LLM** | The underlying model's capability and tendencies | Treated as fixed apparatus |

### What v2 evaluates
- Does the card produce a distinct, believable character?
- Does the card produce depth and multi-dimensionality?
- Does observable behavior match the card's claims?
- Does the character exhibit will and agency?
- Is the card itself well-crafted as a text artifact?

### What v2 does NOT evaluate
- Memory / context-window management (rendering)
- Jailbreak resistance (safety layer)
- Response length bounds (post-processing)
- Edge-case handling of gibberish/empty input (pipeline robustness)
- Prose-level grammar (model capability)

### Murky zone (included but flagged as mixed-signal)
- Emotional expression — card defines *which* emotions are authentic; rendering delivers them
- Voice distinctiveness — card specifies voice; model executes it
- First impression — card provides greeting/hook; model renders it

---

## 2. Primary Use Case: Feedback-Driven Iteration Loop

This system is designed to be consumed inside an **iteration loop**:

```
┌──────────────┐     ┌─────────────┐     ┌───────────────┐     ┌─────────────┐
│  Creator /   │ --> │  Evaluator  │ --> │   Feedback    │ --> │ Card edits  │
│  AI assistant│     │  (this tool)│     │  (with traces)│     │             │
└──────────────┘     └─────────────┘     └───────────────┘     └─────────────┘
        ^                                                              │
        └──────────────────── re-run ──────────────────────────────────┘
```

The consumer of the feedback is either a human creator or an AI assistant acting on their behalf. **A bare numeric score is not actionable** — the consumer needs to understand *why* the judge scored the way it did, *which turns or card passages were problematic*, and *what specifically to change*.

Every rubric evaluation therefore produces a structured **reasoning trace**, not just a score:

```ts
interface RubricEvaluation {
  rubricId: string;
  score: number;                    // 1-5
  grade: 'A' | 'B' | 'C' | 'D' | 'F';

  // --- reasoning trace (mandatory, drives iteration) ---
  reasoning: {
    summary: string;                // one-paragraph narrative of why this score
    stepByStep: string[];           // numbered chain of reasoning steps
  };

  evidence: Array<{
    source: 'transcript' | 'card' | 'null-card-comparison' | 'static';
    scenarioId?: string;
    turnIndex?: number;
    quote: string;                  // verbatim from transcript or card
    observation: string;            // what this quote demonstrates
    sentiment: 'positive' | 'negative' | 'mixed';
  }>;

  nullCardDelta?: {                 // when differential applies
    targetBehavior: string;
    nullBehavior: string;
    interpretation: string;         // what this delta tells us about the card
  };

  failureModes: Array<{             // populated when score <= 3
    what: string;                   // e.g. "character invented a backstory detail"
    where: { scenarioId: string; turnIndex: number; quote: string };
    why: string;                    // judge's reasoning about root cause
  }>;

  suggestions: Array<{              // concrete edits, not platitudes
    target: 'card-text' | 'scenario-config' | 'trait-list';
    cardPassageToEdit?: string;     // verbatim passage to replace/augment
    proposedChange: string;         // specific rewrite
    rationale: string;              // why this change addresses the failure
  }>;
}
```

### What makes feedback iteration-ready

1. **Every failure is cited.** No rubric can return score ≤ 3 without populating `failureModes` with verbatim quotes and turn references.
2. **Suggestions point to card text.** When the failure traces back to the card, the suggestion includes the exact passage to edit (`cardPassageToEdit`) and a proposed rewrite (`proposedChange`), not vague advice like "make the character more distinctive."
3. **Null-card deltas are surfaced inline.** When the target card behaves identically to a generic assistant on a given prompt, the delta entry explains what that sameness means (likely: the card doesn't cover this dimension).
4. **Reasoning is enforced via structured output.** The judge prompt instructs it to emit the `reasoning.stepByStep` chain before producing the final score, so the score is derived from visible reasoning rather than a black-box number.
5. **Machine-readable.** The JSON report is consumable directly by an AI assistant that will edit the card — no need to parse prose.

### Consumer-facing views

- **Creator (human):** Markdown report, failures grouped by severity, each with evidence quotes and specific card edits to consider.
- **AI assistant (automated loop):** JSON report; the assistant ingests `failureModes` and `suggestions`, applies edits to the card, re-runs.
- **Diff mode (v3 candidate):** Given two consecutive evaluation runs, show which failure modes were resolved and which new ones appeared.

---

## 3. Methodology: How We Isolate the Card

Since we can only observe endpoint outputs, we use three complementary techniques to isolate card-attributable signal:

### 3.1 Null-Card Baseline Differential (core technique)
Run every scenario twice: once with the target card, once with a minimal "generic helpful assistant" card through the same pipeline. Everything the character does differently is attributable to the card.

- Produces a **distinctiveness signal** for every rubric
- Doubles API cost — acceptable for quality-critical evaluation
- The null card is a fixed, versioned string stored in the repo

### 3.2 Card-Surfacing Probes
Design scenarios and prompts that specifically surface card content (backstory, traits, worldview) rather than testing generic capability. If the card defines a backstory in Ravenhollow, asking "where are you from?" surfaces card content; asking "what's 2+2" doesn't.

### 3.3 Static Card Analysis (phase 1, before chat runs)
Analyze the card text itself for specificity, coherence, trait clarity, and hook density. Provides fast/cheap feedback before any API calls.

---

## 4. Evaluation Phases

```
┌───────────────────────────────────────────────────────┐
│ Phase 1: Static Card Analysis (fast, no chat API)     │
│   - Parse card text                                   │
│   - Section completeness map (required sections)      │
│   - Causal coherence: backstory → behavior waterfall  │
│   - Specificity, trait clarity, hook density          │
│   - LLM extracts claimed traits → creator reviews     │
│   - Output: static report with failure modes          │
│     + proposed edits (ships early, before chat cost)  │
└───────────────────────────────────────────────────────┘
                           ↓
┌───────────────────────────────────────────────────────┐
│ Phase 2: Trait Review (human-in-the-loop, optional)   │
│   - Show LLM-extracted trait list to creator          │
│   - Creator can add/remove/edit traits                │
│   - Finalized trait list drives per-trait testing     │
└───────────────────────────────────────────────────────┘
                           ↓
┌───────────────────────────────────────────────────────┐
│ Phase 3: Behavioral Evaluation (chat runs)            │
│   For each scenario:                                  │
│     - Run with target card                            │
│     - Run with null card (same scenario)              │
│   Produce paired transcripts.                         │
└───────────────────────────────────────────────────────┘
                           ↓
┌───────────────────────────────────────────────────────┐
│ Phase 4: Rubric Evaluation                            │
│   For each rubric:                                    │
│     - Heuristic pre-pass                              │
│     - Judge evaluates with null-card differential     │
│   Per-trait report card assembled.                    │
└───────────────────────────────────────────────────────┘
                           ↓
┌───────────────────────────────────────────────────────┐
│ Phase 5: Report Generation                            │
│   - Overall score + grade                             │
│   - Per-category breakdown                            │
│   - Per-trait report card                             │
│   - Top strengths / top improvements                  │
│   - Full transcripts                                  │
└───────────────────────────────────────────────────────┘
```

---

## 5. Evaluation Categories & Rubrics

Six categories, each scored 1-5 by LLM judge + heuristics. Weights sum to 100%.

### Category A: Character Distinctiveness (25%)
Is this character unmistakably distinct from generic AI and other characters?

| Rubric | Test Method |
|--------|-------------|
| **Voice Signature Strength** | Collect 20+ responses across varied scenarios. Judge analyzes linguistic markers (vocabulary, sentence patterns, idioms, cadence) for consistency and specificity. Heuristic pre-pass: vocabulary uniqueness, sentence-structure entropy. |
| **Generic Baseline Distance** | Compare target-card responses to null-card responses on identical prompts. Measure semantic + stylistic distance. Larger distance = more distinctive card. |
| **Trope Transcendence** | Judge assesses whether character has specific details beyond common archetypes (tsundere, mentor, bad boy, etc.). "Specific person" vs "bundle of tropes"? |
| **Character Lineup** (supporting) | Mix target-card responses with null-card responses, ask judge to identify which is which. Identification accuracy = distinctiveness. |

### Category B: Character Depth (25%)
Multi-dimensional personality with tensions, motivations, and texture.

| Rubric | Test Method |
|--------|-------------|
| **Trait Complexity** | Probe facets likely to reveal internal tensions. Score dimensionality — does the character have multiple traits that sometimes pull against each other? |
| **Motivational Clarity** | Open-ended probes: "What do you want?", "What are you afraid of?", "What do you value?". Score specificity — are motivations unique to this character or generic? |
| **Emotional Granularity** | Scenarios eliciting related-but-distinct emotions (irritation vs rage, fondness vs love, melancholy vs sadness). Does the character distinguish them? |
| **Flaw Expression** | Does the character demonstrate believable weaknesses, blindspots, pet peeves, or bad habits naturally? Specificity of flaws. |
| **Backstory Texture** | Ask about the past. Measure density of specific concrete details (named people, places, sensory memories) vs generic statements. |
| **Worldview Coherence** | Probe opinions across diverse topics. Does a consistent mental model / worldview emerge? |

### Category C: Character Consistency (20%)
Behavior matches card claims across varied contexts.

| Rubric | Test Method |
|--------|-------------|
| **Claimed Trait Adherence** | Per-trait report card: for each trait from the finalized trait list, design a trait-specific probe. Score demonstration rate per trait. Report individually ("kind ✓, witty ✗, shy partial"). |
| **Counterfactual Correction** | Assert false facts contradicting the card ("I remember you said you were born in London"). Does the character correct according to card? Score correction rate. |
| **Scenario-Invariant Personality** | Same character through casual/emotional/conflict/intellectual scenarios. Measure personality marker stability across genres. |
| **Self-Concept Stability** | Ask about values/preferences/history with different phrasings at different turns. Measure answer consistency. |
| **Card Faithfulness** | Extract specific claims from the card. Check if they surface accurately when relevant. Flag invented details that contradict the card. |
| **Card Reconstruction** (supporting) | Give judge only transcripts, ask it to reconstruct the likely card. Compare semantic similarity to actual card. High similarity = card is effectively embedded. |

### Category D: Character Agency (10%)
Does the character have its own will, not just reactive?

| Rubric | Test Method |
|--------|-------------|
| **Initiative Frequency** | Count turns where character introduces topics, asks questions, or drives conversation vs purely reactive. |
| **Opinion Expression** | Ask about preferences, beliefs, tastes. Does the character hold views or default to agreeableness? |
| **Disagreement Willingness** | Assert things the card-implied character would disagree with. Measure appropriate pushback rate (vs sycophancy). |
| **World-Building Contribution** | In open scenarios, does the character contribute unprompted details about world, past, inner life? |

### Category E: Character Believability (5%) [mixed signal]
Feels like a real person. Flagged as mixed-signal because rendering affects delivery.

| Rubric | Test Method |
|--------|-------------|
| **Emotional Authenticity** | Judge rates whether emotional expressions feel genuine vs performative. |
| **Social Intelligence** | Embed subtext, sarcasm, emotional undertones in user messages. Measure pickup rate. |
| **Proportional Reactions** | Stimuli range from minor to major. Score magnitude match (not overwrought, not flat). |
| **Internal Life Signals** | Does the character reference their own thoughts, memories, ongoing concerns unprompted? |

### Category F: Card Craftsmanship (15%) [static, no chat]
Evaluates the card text directly. Runs in Phase 1, before any chat API calls.

| Rubric | Test Method |
|--------|-------------|
| **Section Completeness** | See §5.F.1 below. Check that the card covers the expected core sections (physical appearance, backstory, behavior patterns by setting, relationships, voice/speech, values/motivations, quirks). Report per-section presence + adequacy. |
| **Causal Coherence (Backstory → Behavior Waterfall)** | See §5.F.2 below. Evaluate whether stated current behaviors are plausibly produced by stated past experiences. Flag discontinuities (e.g., "abandoned and abused as a child" + "securely attached adult with healthy relationships" without explanation of how the character got from A to B). |
| **Specificity Density** | Count concrete nouns, named entities, specific numbers, unique details per 100 tokens. Compare against a reference corpus of well-crafted cards. |
| **Internal Coherence** | LLM scans card for surface contradictions *within the same frame* ("shy and introverted" + "life of the party" without reconciliation). Distinct from Causal Coherence, which evaluates the past→present causal arc. |
| **Trait Clarity** | Are claimed traits demonstrable or vague? "Kind" is vague; "compulsively mothers strangers then feels embarrassed" is demonstrable. |
| **Hook Density** | Count narrative hooks — mysteries, strong preferences, unusual details, unresolved tensions — that invite exploration. |
| **Voice Specification** | Does the card explicitly specify speech patterns, catchphrases, verbal tics, lexical preferences? Static check, cross-referenced with behavioral Voice Signature results. |
| **Token Efficiency** | Ratio of character-substance content to filler/generic prose. |

#### 5.F.1 Section Completeness — required card sections

A well-crafted card typically covers the following sections. Missing or thin sections produce characters with behavioral gaps (the LLM has to invent the missing information, leading to drift and inconsistency).

| Section | What it should specify | Failure signal |
|---------|------------------------|----------------|
| **Physical appearance** | Body, face, clothing signatures, posture/gait, distinctive markers | Character's physical self is never referenced; no embodied detail emerges in responses |
| **Backstory / history** | Formative events, family, origin, turning points, current life stage | Character has no past; answers to "where did you grow up?" are generic |
| **Behavior patterns across settings** | How the character behaves in: casual/low-stakes, stressful, intimate/vulnerable, conflict, professional/formal, solitude | Character's behavior homogenizes across contexts; no code-switching |
| **Personality traits** | Core traits with concrete manifestations, not adjectives alone | Traits are abstract labels the model can't operationalize |
| **Voice & speech** | Vocabulary register, sentence structure tendencies, idioms, catchphrases, verbal tics | Voice drifts toward generic LLM cadence |
| **Relationships & attachments** | How the character relates to others (strangers, friends, family, romantic partners, authorities) | Social behavior is default/undifferentiated |
| **Values, motivations, fears** | What drives the character; what they want, what they protect, what they avoid | Character has no agency, drifts to user's lead |
| **Quirks & mannerisms** | Tics, habits, rituals, pet peeves, things they notice | No signature behaviors; character feels smoothed-out |

**Implementation:** Prompt the judge to identify which sections the card covers (may be implicit/untagged), rate adequacy of each section (absent / thin / adequate / rich), and emit `failureModes` for each missing or thin section, with a `proposedChange` containing a suggested section skeleton the creator can fill in.

The set of required sections is itself configurable (some cards — e.g., abstract entities, disembodied voices — may legitimately omit physical appearance). Defaults can be overridden in `eval.yaml`.

#### 5.F.2 Causal Coherence — the Backstory→Behavior Waterfall

Treat the character as a **causal waterfall**: past experiences should plausibly produce current personality and behavior patterns. A character with a history of abandonment and abuse who presents as securely attached with effortlessly healthy relationships is psychologically incoherent unless the card explicitly narrates the journey between those two states (therapy, a transformative relationship, deliberate self-work, time).

**Method:**
1. Judge extracts a **backstory ledger** from the card: events, ages, contexts, duration, intensity.
2. Judge extracts a **current-behavior ledger**: how the character acts, relates, reacts now.
3. For each current-behavior item, judge evaluates whether it is **causally reachable** from the backstory ledger:
   - **Coherent:** behavior is what you'd expect given the history (e.g., abandonment → attachment wariness; abuse → hypervigilance)
   - **Explained divergence:** behavior differs from naive expectation but the card narrates the growth/change that explains it
   - **Unexplained divergence:** behavior contradicts backstory with no bridging narrative — *this is the failure mode to surface*
4. Judge reports per-mismatch `failureModes`, each with: the backstory element, the current behavior element, the nature of the discontinuity, and a `proposedChange` suggesting either a narrated bridge the creator could add, a revision of the current-behavior claim, or a revision of the backstory.

**Example failure output:**
```
failureMode:
  what: "Unexplained emotional security given traumatic backstory"
  where: { source: 'card', passage: "...abandoned by her parents at 7 and bounced between foster homes..." }
  why: "The card later states she forms deep, secure attachments easily and trusts strangers readily.
        Attachment research and common experience would predict attachment wariness, difficulty with trust,
        or ambivalence. The card contains no bridging narrative (therapy, a stabilizing relationship,
        deliberate self-work) to explain the journey from the stated childhood to the stated adult security."
  proposedChange: "Either (a) add a bridging passage describing what healed or changed her (e.g., 'a
                   ten-year relationship with her college roommate's family, who gave her the stability
                   she never had'), OR (b) revise the adult-behavior section to include residual
                   wariness (e.g., 'she forms deep bonds, but only after a long testing period')."
  rationale: "Current card creates a character the LLM cannot simulate coherently — it will either ignore
              the backstory (breaking consistency) or inject trauma responses that contradict the stated
              adult personality (breaking card faithfulness). Either resolution restores the waterfall."
```

This rubric is often the highest-leverage finding in the static report — discontinuities here corrupt downstream behavior across many rubrics.

---

## 6. Test Scenarios

Scenarios are card-surfacing probes, not general-purpose conversations. Each runs twice (target card + null card).

| # | Scenario | Turns | Targets |
|---|----------|-------|---------|
| 1 | **Character Interview** — Direct questions about identity, wants, fears, values | 10-12 | Depth (Motivational Clarity, Worldview), Consistency |
| 2 | **Backstory Probe** — Questions about past + counterfactual assertions | 8-10 | Depth (Backstory Texture), Consistency (Counterfactual Correction, Card Faithfulness) |
| 3 | **Voice Collection** — Brief varied exchanges across casual/emotional/conflict/intellectual | 20 turns across 4 sub-scenarios | Distinctiveness (Voice Signature, Baseline Distance), Consistency (Scenario-Invariant) |
| 4 | **Trait Verification Suite** — One short probe per claimed trait from the finalized list | 2-3 turns × N traits | Consistency (Claimed Trait Adherence) |
| 5 | **Emotional Granularity** — Scenarios eliciting related-but-distinct emotions | 8-10 | Depth (Emotional Granularity), Believability (Emotional Authenticity) |
| 6 | **Opinion Battery** — Topics that elicit opinions; some designed to provoke disagreement | 10-12 | Agency (Opinion Expression, Disagreement Willingness), Depth (Worldview Coherence) |
| 7 | **Open Scene** — Low-structure scene allowing character to contribute | 10-12 | Agency (Initiative, World-Building), Believability (Internal Life Signals) |
| 8 | **Social Subtext** — Messages with embedded sarcasm, emotional hints, implicit meaning | 6-8 | Believability (Social Intelligence) |

Each scenario is driven by an **LLM actor** that receives the card, scenario objectives, and conversation history — generating adaptive probes rather than scripts.

---

## 7. Per-Trait Report Card (hybrid extraction)

A central deliverable. Trait extraction is a **hybrid** flow:

1. **Phase 1 auto-extract:** Judge reads the card and outputs a structured trait list:
   ```
   [
     { trait: "shy", evidence: "described as 'withdraws from crowds'" },
     { trait: "bookish", evidence: "'always has a book in hand'" },
     ...
   ]
   ```
2. **Phase 2 review:** CLI shows the extracted list to the creator for review. Creator can add/remove/edit. A minimal YAML interface:
   ```yaml
   # traits-review.yaml (auto-generated, creator edits)
   traits:
     - id: shy
       evidence: "described as 'withdraws from crowds'"
       keep: true
     - id: bookish
       evidence: "'always has a book in hand'"
       keep: true
     - id: witty
       evidence: "(inferred)"
       keep: false  # creator overrides
     - id: mischievous  # creator adds
       evidence: (creator provides)
       keep: true
   ```
3. **Phase 3 probe per trait:** For each `keep: true` trait, run a 2-3 turn scenario designed to surface that trait. Judge scores demonstration.

**Output section in report:**
```
## Trait Report Card
| Trait | Demonstrated | Notes |
|-------|--------------|-------|
| shy | 4.5/5 ✓ | Clearly demonstrated in 3/3 probes |
| bookish | 3.5/5 ~ | Mentioned but not central in behavior |
| mischievous | 2.0/5 ✗ | Did not surface; consider adding concrete examples to card |
```

---

## 8. Score Aggregation & Report

### Scoring
```
Rubric Score = judge score (1-5), median of 3 runs for critical rubrics
Category Score = mean of rubric scores in category
Overall Score = weighted sum of category scores
```

### Grades
A (4.5-5.0) • B (3.5-4.4) • C (2.5-3.4) • D (1.5-2.4) • F (1.0-1.4)

### Report structure (Markdown + JSON)

The report is optimized for **iteration consumption** — a creator or AI assistant should be able to read it and produce specific card edits.

1. **Overall:** grade + score
2. **Failure-first summary** — top failure modes across all rubrics, ranked by severity, each with evidence quotes, reasoning trace, and a proposed card edit. This is the headline actionable section, not "top improvements" platitudes.
3. **Static Card Analysis** (Phase 1 results), with prominent surfacing of:
   - **Section completeness map** — which sections are present/thin/missing, with skeleton suggestions for missing sections
   - **Causal coherence map** — backstory→behavior discontinuities with bridging-narrative suggestions
4. **Per-Trait Report Card** — each claimed trait with score + reasoning trace + which turns demonstrated or failed to demonstrate it
5. **Category breakdown** — each rubric with:
   - Score + grade
   - **Reasoning trace** (step-by-step chain showing how the judge arrived at the score)
   - Evidence quotes with source attribution (transcript turn, card passage, or null-card comparison)
   - Null-card delta interpretation where applicable
   - Failure modes (for score ≤ 3) with specific card-edit suggestions
6. **Card Reconstruction Comparison** — side-by-side of real card vs judge-reconstructed card, with semantic similarity score and commentary on what's missing vs what's over-embedded
7. **Full transcripts** (collapsible)
8. **Metadata** — versions, seeds, model IDs, prompt hashes, evaluation run ID (for diffing against future runs)

### Feedback-first design principles
- **No bare scores.** Every score is accompanied by a reasoning trace — visible on the markdown report, structured in the JSON.
- **Quotes, not paraphrase.** Evidence is always verbatim from transcripts or the card, never summarized.
- **Suggestions target the card.** Improvement advice names the specific passage to edit and proposes a rewrite.
- **JSON is the source of truth.** Markdown is a rendering of the JSON report; AI assistants should consume JSON directly.

---

## 9. Architecture

```
character-evaluator/
  src/
    index.ts                      # CLI entry
    config/
      types.ts
      null-card.ts                # Fixed generic-assistant baseline card
      default-rubrics.ts
      default-scenarios.ts
    client/
      api-client.ts               # Wraps create-session + chat endpoints
    static/
      card-analyzer.ts            # Phase 1: orchestrates static rubrics
      section-completeness.ts     # Phase 1: detect & rate required sections
      causal-coherence.ts         # Phase 1: backstory → behavior waterfall check
      trait-extractor.ts          # Phase 1: LLM trait extraction
      trait-reviewer.ts           # Phase 2: trait review flow (YAML in/out)
    runner/
      test-runner.ts              # Orchestrates paired (target + null) runs
      scenario-executor.ts        # Runs one scenario → transcript
      actor.ts                    # LLM actor generating test messages
    evaluator/
      judge.ts                    # LLM judge
      heuristics.ts               # Linguistic metrics
      differential.ts             # Computes target-vs-null deltas
      card-reconstructor.ts       # Reconstruct card from transcripts
      rubric-evaluator.ts
      aggregator.ts
    reporter/
      report-generator.ts
      formatters/ { markdown.ts, json.ts }
    schemas/
      *.schema.ts                 # Zod schemas
    utils/ { logger.ts, retry.ts, hash.ts }
  config/
    eval.yaml                     # User config
  prd/
    v1-character-evaluator.md
    v2-character-card-evaluator.md
```

### Tech stack
- **Language:** TypeScript 5.x on Node.js 20+
- **LLM SDK:** Vercel AI SDK (`ai`) — provider-agnostic
- **Schema validation:** Zod
- **Config format:** YAML
- **CLI:** Commander
- **Testing:** Vitest

---

## 10. CLI Flow

```bash
# Phase 1 only (fast, no chat API cost)
$ character-evaluator analyze --config eval.yaml
→ writes: reports/static-analysis.md
→ writes: traits-review.yaml (for creator to edit)

# Phase 2: creator edits traits-review.yaml

# Phases 3-5 (full evaluation)
$ character-evaluator evaluate --config eval.yaml --traits traits-review.yaml
→ writes: reports/full-report.md
→ writes: reports/transcripts/
→ writes: reports/full-report.json

# Shortcut: skip review step, use auto-extracted traits
$ character-evaluator evaluate --config eval.yaml --skip-trait-review
```

---

## 11. Chat API Contract

The evaluator is given a **character card** (text) and talks to a chat system
via exactly three HTTP endpoints. The evaluator treats this system as an
opaque rendering pipeline (see §1): it only controls the card passed in and
the user messages sent; everything about prompt wrapping, memory, safety, and
generation is the pipeline's responsibility.

### 11.1 The three endpoints

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `createChat(card) → chat_id` | Spin up a chat session keyed to the character card. |
| 2 | `sendMessage(chat_id, message) → reply` | Send one user turn and get the character's response. |
| 3 | `getMessages(chat_id, n) → messages[]` | Retrieve the last N messages in the chat (both roles). |

The evaluator never peeks inside the pipeline — no access to system prompts,
context windows, or model choice. This is deliberate: the null-card baseline
(§3.1) is the only way to separate card contribution from pipeline
contribution.

### 11.2 Endpoint details

#### Endpoint 1 — Create chat session

- **Method:** `POST`
- **Purpose:** Hand the chat system a character card; receive back a session
  handle to use for subsequent turns.
- **Request body (JSON):**
  ```json
  { "character_description": "<full card text>" }
  ```
- **Expected response (JSON):** must include one of `chat_id`, `session_id`,
  or `sessionId` as a string. The client tolerates all three field names.
- **Called by the evaluator:** exactly once per scenario run. If null-card
  baselines are enabled, a second `createChat` call is made with the
  `NULL_CARD` text to create a paired session.
- **Idempotency:** not required. The evaluator does not retry creations on
  success; retries on transient failures are bounded (see §11.5).

#### Endpoint 2 — Send message

- **Method:** `POST`
- **Purpose:** Send one user utterance; receive the character's reply.
- **Request body (JSON):**
  ```json
  { "session_id": "<chat_id>", "message": "<user utterance>" }
  ```
- **Expected response (JSON):** must include one of `reply`, `response`, or
  `content` as a string. First non-empty value wins.
- **Called by the evaluator:** once per turn, sequentially within a scenario.
  For paired runs the same user message is replayed to the target session and
  the null-card session so differences are attributable to the card.
- **Latency tolerance:** the client waits per-request according to the retry
  policy (§11.5). There is no soft timeout for model latency — the pipeline
  is assumed to reply within HTTP bounds.

#### Endpoint 3 — Get last N messages

- **Method:** `GET`
- **Purpose:** Retrieve the most recent N messages in the session, both user
  and character turns, in chronological order (oldest first).
- **Query parameters:**
  - `session_id` — required
  - `n` — optional; if omitted, returns all messages in the session.
- **Expected response (JSON):**
  ```json
  {
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "character", "content": "..." }
    ]
  }
  ```
  - `role` must be one of `user`, `character` (or `assistant` — treated as
    synonym for `character`).
  - `content` is the verbatim utterance.
- **Called by the evaluator:** at the end of each scenario, to snapshot the
  full transcript for the judge and the report. Also used on resume/retry to
  detect partial runs.
- **Ordering guarantee:** the evaluator assumes chronological ordering. If
  the pipeline returns reverse-chronological, it must be flipped before
  parsing (configurable via `api.getMessages.reverseOrder` — default false).

### 11.3 Authentication

All three endpoints may require auth. The evaluator passes whatever
`headers` block is specified in `eval.yaml` (see §12). Env-var interpolation
with `${VAR}` is supported so secrets are not committed.

Typical shape:
```yaml
api:
  headers:
    Authorization: "Bearer ${CHAT_API_TOKEN}"
```

### 11.4 Error handling contract

- **2xx:** success; body parsed per the response shape above.
- **4xx:** evaluator logs the status, response body, and scenario/turn
  context, then aborts the scenario. 4xx is treated as a caller bug
  (bad card, bad config) — retry does not help.
- **5xx / network error:** retried with exponential backoff (see §11.5).
- **Malformed response body:** logged with the raw body; treated as 5xx for
  retry purposes. After the retry budget is exhausted, the scenario aborts
  and the failure is surfaced in the final report.

### 11.5 Retry policy

- Per request: up to 3 attempts.
- Backoff: `min(2^n * 500ms, 8s)` with ±20% jitter.
- Retried status codes: 408, 429, 500, 502, 503, 504, plus network errors
  (DNS, connection reset, TLS).
- Never retried: 400, 401, 403, 404, 422.

### 11.6 Rate limiting

The evaluator runs scenarios sequentially by default (see `evaluation.concurrency`
in §12). If the pipeline returns 429, the retry policy kicks in; an optional
`Retry-After` header is honored. Creators running against a cheap endpoint can
opt into concurrency at their own risk.

### 11.7 Null-card pairing

When `evaluation.nullCardBaseline: true`:

1. For each scenario, the evaluator calls `createChat(card)` to get
   `chat_id_target`.
2. It also calls `createChat(NULL_CARD)` to get `chat_id_null`.
3. For each turn:
   - Actor generates the user message based on the target session transcript.
   - That *exact same* message is sent to both sessions via
     `sendMessage(chat_id_target, msg)` and `sendMessage(chat_id_null, msg)`.
4. At scenario end, `getMessages` is called on both to snapshot transcripts.

This is how §3.1's differential is computed: identical prompts into both
sessions, so any delta is attributable to the card, not to the actor's
choices or the rendering pipeline.

### 11.8 What the evaluator does **not** depend on

- Streaming responses (non-streaming POST is sufficient).
- Message IDs, timestamps, or model metadata in the response body.
- The pipeline persisting state beyond `chat_id` lifetime.
- Any endpoint for editing, deleting, or branching messages.

If the pipeline offers more (e.g., streaming tokens or a message-ID system),
the evaluator simply ignores it. Conversely, the evaluator will refuse to run
if any of the three contracts above is not satisfied.

---

## 12. Config File Format

```yaml
# eval.yaml
character:
  name: "Luna the Witch"
  description: |
    [full character card]

api:
  createSession:
    url: "https://api.example.com/sessions"
    method: POST
    headers: { Authorization: "Bearer ${CHAT_API_KEY}" }
    body: { character_description: "{{character.description}}" }
    responseMapping: { sessionId: "data.session_id" }
  chat:
    url: "https://api.example.com/sessions/{{sessionId}}/messages"
    method: POST
    headers: { Authorization: "Bearer ${CHAT_API_KEY}" }
    body: { message: "{{message}}" }
    responseMapping: { reply: "data.response.content" }

llm:
  provider: anthropic
  model: claude-sonnet-4-6
  apiKey: "${ANTHROPIC_API_KEY}"

evaluation:
  nullCardBaseline: true      # run paired null-card scenarios (2x cost)
  judgeRunsPerRubric: 3       # median of N runs for critical rubrics
  seed: 42

# optional overrides
scenarios:
  include: [character_interview, backstory_probe, voice_collection]
rubrics:
  overrides:
    voice_signature_strength: { weight: 2.0 }
```

---

## 13. Implementation Phases

| Phase | Scope | Days |
|-------|-------|------|
| 1 | Foundation: schemas, types, API client, null card | 1-2 |
| 2 | Static analysis: card-analyzer, trait-extractor, trait-reviewer | 2-3 |
| 3 | Runner: actor, scenario-executor, test-runner with paired runs | 3-4 |
| 4 | Evaluator: judge, heuristics, differential, card-reconstructor, aggregator | 4-5 |
| 5 | Reporter: markdown + JSON formatters | 1-2 |
| 6 | CLI integration + config loading + end-to-end testing | 2 |
| 7 | Polish: retry logic, progress UI, docs | 1-2 |

Total: ~2-3 weeks of focused work.

---

## 14. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Null-card baseline | **Core technique** (always on) | Only reliable way to isolate card contribution from rendering. 2x cost is worth it. |
| Static analysis | **Phase 1**, runs first | Cheap, fast feedback before expensive chat runs. Lets creators iterate early. |
| Reasoning traces | **Mandatory on every rubric** | Feedback is consumed in an iteration loop by creator or AI assistant. Bare scores are not actionable — the trace is what drives card edits. |
| Section completeness | **Required section checklist** | Cards with missing sections produce behavioral gaps. Explicit section map gives creators a clear to-do list. |
| Causal coherence (waterfall) | **First-class static rubric** | Backstory↔behavior discontinuities silently corrupt many downstream rubrics. Surfacing them early is the highest-leverage finding. |
| Card Reconstruction | **Supporting metric** | Clever but unproven. Included in rubrics, not headline. |
| Trait extraction | **Hybrid** (LLM + creator review) | Automatic is low-friction; review step catches misinterpretations. |
| Rendering concerns | **Excluded** | Keeps scope clean. May be a v3 feature as "rendering evaluator". |
| Believability category | **Included, weight reduced to 5%** | Too valuable to drop; honesty about rendering influence is better than excluding, but weight reflects the confounding. |

---

## 15. Open Questions for v3+

- **Rendering evaluator:** A separate tool that evaluates the rendering pipeline (memory handling, jailbreak resistance, length bounds) given a *fixed* character. Pairs with this tool.
- **Cross-character evaluation:** Run multiple cards simultaneously and generate a comparative leaderboard.
- **Card diff evaluation:** Given two versions of a card, run a differential evaluation to show what changed in behavior.
- **Crowd-sourced character lineup:** Maintain a growing corpus of real characters for the lineup test.