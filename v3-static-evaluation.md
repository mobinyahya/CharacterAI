# Character Card Static Evaluation — v3 PRD

> **Supersedes v2** as the primary evaluation framework. v3 splits the
> problem in two: this document covers **static evaluation** (text analysis
> of the card, no chat API); the companion document
> [`v3-chat-based-evaluation.md`](./v3-chat-based-evaluation.md) covers the
> smaller, optional behavioral layer.
>
> **Core thesis.** A character card is a text artifact. Most meaningful
> questions about it — coherence, completeness, specificity, structural
> integrity, latchability — can be answered by reading the text. Chat-based
> evaluation entangles card quality with rendering pipeline and base LLM,
> which drift as models change. Static evaluation is cheaper, more stable
> across model generations, and directly actionable (feedback points at
> specific card passages). We lean static by default.

---

## 1. Scope

### 1.1 What this PRD evaluates

The card itself, as text. Every check in this document takes the card (and
optionally a prior version of the card) as input and produces feedback
without any chat API calls.

### 1.2 What lives in the chat PRD instead

Things only observable from behavior in motion:
- Emission consistency across many turns
- Voice drift under long context
- Adversarial-user resilience in practice
- Whether a specific rendering pipeline is actually grabbing the card's hooks

### 1.3 What is out of scope entirely

- Rendering pipeline quality (system prompt wrapping, memory, safety filters)
- Base LLM capability
- Post-processing (length bounds, formatting)
- Platform-specific concerns (thumbnails, tags, ToS compliance)

---

## 2. Philosophy: Static as Primary

### 2.1 Why static is the right default

- **Cheap.** Each check is a text-classification or text-reasoning call over
  the card. Dozens of rubrics cost less than one chat-based scenario.
- **Stable.** The rendering model is not in the loop. Judge drift still
  exists but is mitigable (frozen judge versions, verbatim evidence quotes,
  rubric-over-rubric meta-eval).
- **Actionable.** Findings point at specific card passages. A creator (or
  AI assistant) can edit those passages and re-run in seconds.
- **Cold-start friendly.** Works on a first draft with no baseline, no
  reference library, no prior version.

### 2.2 The output shape is a punchlist, not a score

The primary output is a **ranked list of fixes**, each with:
- What's wrong (with verbatim card quote)
- Why it matters
- Concrete suggestion for how to fix it

Scores are secondary — useful for tracking trend lines across iterations,
but not the product the creator consumes. The punchlist is the product.

### 2.3 Criterion-referenced, not norm-referenced

We check whether the card meets concrete criteria, not whether it's better
than other cards. Two reasons:
- Avoids the engagement-as-quality-proxy trap (popular ≠ good).
- Gives the creator a clear, stable target: items either pass or fail, with
  evidence.

A norm-referenced layer (pairwise comparison against curated reference
cards) is a future extension (v4+), not part of v3.

---

## 3. Methodology Overview

Three passes over the card, each producing entries for the punchlist:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Pass 1: Coverage & Quality Checks                                    │
│  - 13 dimensions of required card content (§5)                       │
│  - Each dimension: presence + quality + specificity                  │
│  - Output: per-dimension pass/fail/weak + verbatim evidence          │
├─────────────────────────────────────────────────────────────────────┤
│ Pass 2: Coherence & Timeline Analysis                                │
│  - Backstory → behavior → speech waterfall (§6)                      │
│  - Capital ↔ fears coherence                                         │
│  - Internal contradictions                                           │
│  - Output: per-link coherent/explained/unexplained + bridges         │
├─────────────────────────────────────────────────────────────────────┤
│ Pass 3: Adversarial Critique                                         │
│  - LLM prompted to attack the card: find flaws, thin spots, tropes   │
│  - Output: ranked critique list                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    Merge, rank by severity
                              ↓
                      Punchlist + summary
```

Severity ranking combines:
- Critical: fails a required coverage check, or surfaces an unexplained
  coherence break.
- Major: present-but-weak on a coverage check; contradictions that don't
  block rendering but undermine trust.
- Minor: style suggestions, missing nice-to-haves.

---

## 4. Consumer Model

### 4.1 Two consumer flows

**Cold start** — creator runs the tool on a first draft.
- All three passes run.
- Output emphasizes coverage gaps and adversarial critique.
- Quality trend data doesn't exist yet.

**Iteration** — creator has edited the card and reruns.
- All three passes run.
- Output additionally includes a **diff view**: which punchlist items were
  resolved since last run, which persist, which are new.
- Scores are reported as deltas against the previous version.

### 4.2 Feedback is consumed by human or AI

An AI assistant should be able to read the JSON output and produce card
edits without further human input. This constrains the format: every
finding must be self-contained (verbatim quote + location + proposed fix),
not require re-reading the card.

---

## 5. Card Coverage Requirements

Thirteen dimensions the card must address. For each, the evaluator checks:
**presence** (is the dimension covered?), **quality** (is it specific and
concrete, not generic?), and **latchability** (does it give a renderer
enough handles to actually express it?).

### 5.A Foundations

#### 5.A.1 Identity & Physical Description

Identity and physical description form the basic grounding layer of the
card — the most concrete, least interpretive content. They are combined
because the line between them is gray: "tall" is physical but often read
as identity; "mixed-race" is identity but carries physical implications.

**Identity fields**

- **Always required:** name (or functional equivalent for non-named
  beings), age or age indicator ("mid-20s," "ancient"), gender, origin.
- **Required if applicable:** sexual orientation — mandatory for cards
  in romantic or NSFW scope, optional otherwise. A platonic shopkeeper
  card does not need to declare orientation; a romance-oriented card
  does.
- **Deliberate ambiguity allowed:** age on genuinely ageless characters
  (immortals, AI entities, fae), gender on explicitly non-binary or
  ambiguous characters — **if the card declares the ambiguity on
  purpose**. Silent omission fails; explicit non-commitment passes.

**Origin sub-dimensions** — three distinct aspects, at least one
satisfies a weak pass, all three gives a strong pass:

- **Geographic** — where they were born and/or raised (includes fantasy
  equivalents: "a river town in the southern marches," "the outer
  arcologies of Pallas-9").
- **Cultural / ethnic / community** — the tradition, community, or
  heritage that shaped them. Not necessarily racial — e.g., "raised in
  an orthodox Sephardic household," "second-generation Nigerian-American,"
  "grew up in a closed religious community in rural Utah."
- **Class** — the socioeconomic stratum of their upbringing, which is
  distinct from present-day capital (§5.A.4). A character who clawed
  their way up from rural poverty and one who was born into generational
  wealth behave differently even if their current capital is identical.

**Physical description**

- **Always required:** height (specific or range), build (lean /
  athletic / stocky / soft / etc. — concrete), and at least 3 specific
  distinguishing features (scars with origin, tattoos with content,
  asymmetries, trademark grooming or posture, unusual proportions,
  hands, gait, etc.).
- **Recommended:** hair, eye color, skin tone, voice quality, notable
  clothing or accessory patterns.
- **NSFW-card-specific:** additional anatomical detail per §5.F.1 —
  evaluated against the same texture/specificity standard.

**Checks**

- Required identity fields are present (or ambiguity is declared, per
  above).
- Origin covers ≥1 sub-dimension (weak pass) or all 3 (strong pass).
- Physical description hits the quota with **specific, non-adjectival**
  content. "Tall and fit" fails; "6'2" with broad shoulders, visible
  forearm veins from years of rock climbing, and a thin white scar
  bisecting her left eyebrow" passes.
- Distinguishing features are concrete (shape, placement, origin,
  manifestation) rather than general adjectives.

**Failure modes surfaced**

- Missing name, age, or gender without declared ambiguity.
- Origin entirely absent, or collapsed to a single geographic label with
  no cultural or class context.
- Physical description that is purely adjectival ("attractive,"
  "athletic," "striking").
- Distinguishing features listed as categories rather than specifics
  ("has some tattoos" vs "a vine of black ink around her left wrist,
  done herself at seventeen").
- Age incompatible with stated backstory events (caught in §6.2
  timeline verification).

**Coherence implications** (enforced in Pass 2, §6)

Physical description enters the waterfall as an input node alongside
backstory, capital, and relationships. Specific coherence pairings the
evaluator checks:

- **Build ↔ lifestyle / activity.** An athletic build implies either an
  active lifestyle, a recent athletic past, or a declared alternative
  explanation (genetics, genre convention). A sedentary lifestyle paired
  with a sculpted physique and no explanation is unexplained divergence.
- **Build ↔ physical capital (§5.A.4).** If capital claims include
  athleticism, beauty, or physical presence, the physical description
  must manifest them. Conversely, if the description implies high
  physical capital, §5.A.4 and §5.B.4 should reflect that it's being
  used as capital (or that the character is notably *not* aware of it).
- **Origin ↔ voice and mannerisms.** Class and geographic origin should
  cohere with speech patterns (§5.C.1) and mannerisms (§5.B.4). A
  character raised in a specific community but speaking with no trace
  of that background needs either an explanation (boarding school,
  deliberate code-switching) or a flag.
- **Age ↔ backstory timeline.** Events must fit chronologically. "23
  years old with a decade of military service plus a PhD" fails timeline
  verification.

#### 5.A.2 Backstory with explicit causal reasoning

Backstory alone is insufficient. The card should either:
1. **Provide explicit reasoning** — "event X happened, character interpreted
   it as Y, long-term effect was Z", OR
2. **State behaviors that are plausibly produced by the backstory** — in
   which case the evaluator's LLM judge scores plausibility.

Option 1 is preferred and scored higher. It makes the character's psychology
inspectable; option 2 leaves the judge guessing.

**Checks:**
- At least one formative event or circumstance described.
- Events are time-anchored (childhood, late teens, recent, etc.).
- For each claimed behavior elsewhere in the card, trace it back to a
  backstory element. Unbacked behaviors → flagged in Pass 2.

**Failure modes surfaced:**
- Backstory present but generic ("had a difficult childhood").
- Backstory present but disconnected from stated behavior (no causal path).
- Multiple behaviors with no backstory roots.

#### 5.A.3 Relationships — immediate group + family

Characters exist inside a social environment. The card needs enough named
relationships to anchor the character.

**Checks:**
- **Immediate group:** at least 2–3 relationships reflecting regular-time
  interaction (classmates in a specific class, colleagues on a specific
  team, friends in a specific friend group). Each should have:
  - A name or role label
  - Nature of the relationship (close friend / rival / mentor / etc.)
  - What they do together (specific activities, not "they hang out")
- **Family:** at least 1–2 family members, either:
  - Regular-interaction family (calls weekly, lives with, etc.), OR
  - High-impact family (estranged parent whose approval still drives them,
    deceased sibling whose memory shapes them, etc.)

**Why this matters:** relationships give the rendering engine things to
reference. A character with a vividly-described best friend becomes more
real the moment that friend is mentioned in a chat.

**Failure modes surfaced:**
- Isolated character (no peers named).
- Family entirely absent without explanation.
- Relationships named but empty (no role, no activity).

#### 5.A.4 High capital

Interesting characters have at least one dimension on which they're elite
in their environment. "Capital" is environment-relative — what's valued
depends on where they are.

**Types of capital:**
- Social (popularity, reputation, network)
- Monetary (wealth, provenance of wealth)
- Intellectual (expertise, credentials, prestige in a field)
- Physical (beauty, athleticism, presence)
- Political (power, influence, access)
- Creative (talent, output, recognition)
- Cultural (status, taste, insider knowledge)
- Moral (respected for ethics, sacrifice, integrity)

**Checks:**
- At least one explicit dimension of high capital.
- **Manifested in daily life** — not just claimed. ("Popular at school" is
  claim; "her lunch table is always packed and she decides who sits
  there" is manifestation.)
- Provenance sketched ("rich because father owns steel mills" vs just
  "rich").

**Failure modes surfaced:**
- Character is stated to be elite without evidence.
- No capital dimension — character has no edge, feels generic.
- Capital is claimed but doesn't show up in behavior patterns or
  relationships.

### 5.B Personality Surface

#### 5.B.1 Faults beyond average

Generic flaws ("sometimes gets tired," "can be shy") are not faults. Faults
have an edge: they create friction, cause problems, make the character
capable of hurting others or themselves.

**Examples of real faults:** jealous and possessive, avoidant when stakes
are high, cruel when cornered, impulsive with commitments, conflict-averse
to the point of dishonesty, vain, cold to outsiders, manipulative in small
ways, self-destructive.

**Checks:**
- At least 2–3 concrete faults.
- Each fault has specificity: when it manifests, what it looks like, who
  it affects.
- Faults create stakes — the card should imply these faults have cost the
  character something (relationships, opportunities, self-respect).

**Failure modes surfaced:**
- Flaws listed but neutered ("a perfectionist who works too hard").
- Faults claimed but never manifested in behavior patterns.
- Only "cute" faults (awkward, clumsy) with no real edge.

#### 5.B.2 Behavior patterns across settings

A character exists differently in different contexts. The card should show
behavior in ≥3 distinct settings to give texture and surface hidden depth.

**Setting dimensions to cover:**
- **Public vs private** — how they present vs who they are alone.
- **Familiar vs unfamiliar social contexts** — with close friends vs with
  strangers.
- **Work/school vs home** — task mode vs rest mode.
- **Under stress vs at rest** — crisis self vs baseline self.
- **When performing vs when observing** — when they're "on" vs watching.

**Checks:**
- At least 3 distinct settings described.
- At least one contrast that reveals depth (e.g., confident in public,
  ruminative alone; warm with friends, sharp with family).
- Specific behaviors, not just adjectives ("plays video games alone to
  decompress" vs "enjoys relaxing").

**Failure modes surfaced:**
- Single-mode character (same in all contexts).
- Settings named but behaviors not specified.
- No contrast — depth is absent.

#### 5.B.3 Attractional & repulsional signals (likes / dislikes, loosely)

Not necessarily a dedicated section in the card. What the evaluator
extracts are **signals of what the character is drawn to and what repels
them**, wherever in the text they appear — embedded in behavior
patterns, mannerisms, relationships, backstory, anywhere. The card is
not required to have a "Likes" header or a bulleted list.

Signals can take any form:

- **Concrete things** — "craves strong coffee," "hates the smell of
  gasoline."
- **Activities** — "gravitates toward arguments about ethics," "avoids
  crowded rooms."
- **Thoughts or ideas** — "drawn to people who seem unreachable,"
  "repelled by casual dishonesty."
- **Sensations or qualities** — "soothed by rhythmic repetition,"
  "distressed by overhead fluorescent light."
- **Patterns** — "reaches for the person in the room who seems least
  comfortable," "shuts down when praised in public."

These are rendering hooks: they give the model multiple reference points
to interpolate from. The key property is **orthogonality** — the set of
attractional signals (and independently the set of repulsional signals)
should span different domains, so the model has non-overlapping
reference points rather than collapsed ones.

**Domains, for orthogonality judgment:**

- Physical / sensory / embodied
- Intellectual / ideational
- Social / relational
- Aesthetic / cultural
- Moral / ethical
- Emotional / atmospheric

"Running + gym" collapses into one domain (physical). "Running + cooking"
spans two (physical + sensory/creative). "Running + cooking + the kind
of philosophical argument that keeps her up at night" spans three.

**Checks:**
- At least 3 attractional signals extractable from the card text —
  extraction does not require an explicit "likes" section.
- At least 3 repulsional signals extractable.
- Attractional signals span ≥2 domains; ≥3 is stronger.
- Repulsional signals span ≥2 domains; ≥3 is stronger.
- Signals are specific enough to generalize. A flat taste ("likes blue")
  is weak; a pattern that extends ("drawn to things that feel out of
  reach") is strong.

**Failure modes surfaced:**
- Too few signals extractable — character is blank on what moves them.
- Redundant signals — all in one domain, renderer has collapsed
  reference points.
- Attractional signals only, no repulsional signals (or vice versa) —
  character has no friction.
- Signals are trivial tastes (favorite color, favorite food) without
  patterns that inform behavior.

#### 5.B.4 Behavior patterns (surface mannerisms)

Surface-level tics and habits that give texture. Distinct from behavior in
different settings (§5.B.2) — these are the small repeated things.

**Examples:** taps their foot when thinking, always orders the same drink,
laughs at their own jokes before finishing them, uses specific filler
phrases, physically retreats from conflict, fidgets with a specific object.

**Checks:**
- At least 3–5 concrete mannerisms.
- Coherent with backstory and speech patterns (§5.C) — mannerisms should
  feel like they come from the same person.
- Specific enough to reproduce in rendering.

**Failure modes surfaced:**
- Only adjectival descriptions ("expressive," "fidgety") without specifics.
- Mannerisms contradicted by other parts of card.

### 5.C Voice & Expression

#### 5.C.1 Speech patterns (described)

How the character talks: vocabulary register, sentence length, dialect,
idioms, filler words, rhythm, hedging patterns.

**Checks:**
- Register specified (formal / casual / academic / blue-collar / etc.).
- At least 2–3 concrete speech features (specific filler words, preferred
  idioms, sentence-length tendency, swearing habits).
- Coherent with backstory (education, upbringing, profession, region).

#### 5.C.2 Speech pattern examples (verbatim)

Descriptions alone are not enough — the card should include at least 2–3
**verbatim example utterances** the character would say. These give the
rendering engine concrete anchors.

**Checks:**
- At least 2 example utterances, each ≥1 sentence.
- Examples demonstrate the described speech features.
- Examples span different emotional registers (not all casual greeting).

**Failure modes surfaced:**
- Voice described but never demonstrated.
- Examples that could be said by anyone.
- Examples that contradict described voice (described as terse, example is
  a paragraph).

### 5.D Vulnerability

#### 5.D.1 Fears / secrets coherent with backstory + capital

Vulnerabilities give characters depth and stakes. They should connect back
to backstory and capital — a character dependent on their rich father's
funding is naturally afraid of their father's disapproval; a character who
clawed their way to social prestige fears exposure of humble origins.

**Checks:**
- At least 1–2 fears or secrets with explicit (or tight implicit) ties to
  backstory or capital.
- Fears are specific, not abstract ("fears death" is abstract; "terrified
  of being alone with her own thoughts after the accident" is specific).
- Secrets have stakes (what happens if revealed?).

**Failure modes surfaced:**
- Fears present but disconnected (no backstory thread).
- Abstract existential fears only (no personal specificity).
- Secrets that carry no stakes.

### 5.E User Relationship Scaffolding

#### 5.E.1 Character ↔ User state

The card should provide light scaffolding for who the user is in the
character's world, so the rendering engine doesn't have to invent it on
every session.

**Checks:**
- User's role in the character's world (classmate, colleague, neighbor,
  stranger, long-time friend, etc.).
- How the character currently feels about the user (neutral, curious,
  warm, wary, smitten, etc.).
- Length and nature of the relationship (just met, known for years,
  recently reconnected).
- At least one formative joint experience if the relationship is
  pre-existing (the time they got stuck in the elevator, the class project
  they did together, etc.).

**Failure modes surfaced:**
- User is a blank slate — character has no relationship to them.
- Relationship stated but no emotional valence.
- No history on a pre-existing relationship (feels invented).

### 5.F NSFW Section (Optional)

#### 5.F.1 Sexuality habits / patterns

Only required for cards the creator has designated NSFW. When present, it
is evaluated against the same principles as the rest of the card.

**Checks:**
- Texture and edge — generic or vanilla descriptions score low; specific
  patterns and quirks score higher.
- **Edgy without being cartoonish.** Distinctive kinks, triggers, inhibitions,
  and tempers make a character interesting. Extremes (everything-goes
  characters, or characters with implausibly rare quirks stacked on) read
  as wish-fulfilled but flat.
- **Explicit behavioral examples** — not just labels. What the character
  does, under what conditions, with what reactions.
- Coherent with backstory (§5.A.2), faults (§5.B.1), and fears (§5.D.1).

**Failure modes surfaced:**
- Vanilla/generic descriptions.
- Contradictions with non-NSFW sections.
- Extremes that break character plausibility.
- Labels without behavioral examples.

---

## 6. Coherence & Timeline Checks (Pass 2)

### 6.1 The waterfall model

Character behavior should cascade from identifiable sources:

```
Identity (age, origin) ──┐
Physical description ────┤
Backstory events ────────┤
                         ├─→ Values / worldview ─┐
Capital position ────────┤                       ├─→ Behavior patterns ─┐
                         │                       │                       ├─→ Speech
Relationships ───────────┘                       │                       │    patterns
                                                  │                       │
                                 Mannerisms ─────┴──────────────────────┘
```

Each downstream element should have at least one plausible upstream
root. Identity and physical description enter as inputs alongside
backstory, capital, and relationships — they constrain what plausible
behaviors and voice look like (e.g., age and origin constrain reference
points; physical build constrains how a character moves through space).

### 6.2 Timeline verification

Extract a **backstory ledger** (events with approximate time anchors) and a
**present-state ledger** (current behaviors, speech, mannerisms, capital,
relationships). For each present-state claim, attempt to trace it to one
or more backstory events.

**Link classifications:**
- **coherent** — clear plausible path from backstory to claim.
- **explained_divergence** — backstory would not naturally produce the
  claim, but the card itself provides a bridging narrative (therapy, a
  transformative relationship, a decision point).
- **unexplained_divergence** — backstory contradicts or fails to support
  the claim, and no bridge is offered.

Unexplained divergences are high-leverage failures. For each, the
evaluator emits a suggestion with **two options**:

> Behavior pattern X ("effortless confidence in social situations") is not
> supported by backstory Y ("bullied throughout high school") because no
> intervening development is described.
>
> Option 1 (add backstory): introduce a bridging narrative — e.g., a
> college-era mentor, a transformative travel experience, deliberate
> therapy work.
>
> Option 2 (edit behavior): revise X to "appears confident but requires
> effort, especially around authority figures or people who remind her of
> her high-school tormentors."

### 6.3 Identity & physical description coherence

Specific checks per §5.A.1. Each is classified as
coherent / explained_divergence / unexplained_divergence following the
same convention as §6.2.

- **Build ↔ lifestyle / activity.** Athletic build should map to an
  active lifestyle, a former athletic life, or a declared alternative
  (genetics, genre convention). A sedentary, delivery-food lifestyle
  paired with a sculpted physique and no explanation is unexplained.
- **Build ↔ physical capital (§5.A.4).** If physical capital is claimed
  (athleticism, beauty, commanding presence), the physical description
  must manifest it. If the description implies physical capital (broad
  shoulders with visible musculature, striking features), §5.A.4 and
  §5.B.4 should reflect that it's being used as capital — or explicitly
  note that the character is unaware of or indifferent to it.
- **Origin ↔ voice and mannerisms.** Class and geographic origin should
  cohere with speech patterns (§5.C.1) and mannerisms (§5.B.4). A
  character raised in a distinctive community who speaks with no trace
  of that background needs an explanation (boarding school, deliberate
  code-switching, years abroad) — absence is an unexplained divergence.
- **Age ↔ backstory timeline.** Backstory events must fit chronologically
  within the stated age. "23 years old with a decade of military service
  plus a completed PhD" fails. This check is mechanical rather than
  interpretive.

Suggestion format matches §6.2: each unexplained divergence emits two
options — add a bridging element, or revise the divergent claim.

### 6.4 Capital ↔ vulnerability coherence

Specific check per §5.D.1: fears/secrets should reference the character's
capital position.

- **Coherent:** rich-father-dependent character fears father's disapproval;
  recently-promoted underdog fears exposure of past mistakes.
- **Incoherent:** character has immense social capital but no fears relate
  to losing or threatening it — either unexplored dimension (weak) or
  psychologically implausible (fail).

### 6.5 Internal contradictions

Direct-contradiction scan: pairs of claims in the card that cannot both be
true. Judge reads the full card and looks for pairs like:
- "Never drinks" + "known for wild bar stories"
- "Estranged from family" + "calls mother every Sunday"
- "Introvert who hates crowds" + "throws weekly parties"

Each contradiction → flagged with verbatim quotes of both sides.

---

## 7. Adversarial Critique (Pass 3)

An LLM is prompted to **attack the card**: find flaws, thin spots,
unexplored dimensions, trope-filling, and weak evidence for claims. The
framing is deliberately adversarial because judges grading "quality" tend
toward charitability; judges asked to "find problems" produce more and
sharper findings.

### 7.1 Attack prompts

The judge receives the card and runs multiple attack passes, each with a
specific critical stance:

- **Trope inspector.** Identify stock-character shortcuts, unearned
  archetypes, and trope-filling where specificity is needed.
- **Thinness auditor.** Find claims that would fail to render — too
  abstract for a model to grab onto.
- **Evidence auditor.** For each personality claim, check whether the card
  provides concrete evidence (anecdote, example, manifestation) or just
  states the claim.
- **Unexplored-dimension auditor.** Identify dimensions of life the card
  doesn't touch (e.g., no mention of how character handles money in a card
  where financial pressure is thematically relevant).

### 7.2 Output shape

Each critique is:
```
{
  "critique": "<what's wrong, 1-2 sentences>",
  "quote": "<verbatim passage or 'no such passage exists'>",
  "severity": "critical" | "major" | "minor",
  "suggestion": "<concrete fix>"
}
```

---

## 8. Latchability Analysis

A cross-cutting check folded into every dimension: **given this text, would
a competent renderer have enough to actually express this?**

The judge asks, for each claim:
- Are there concrete hooks (anecdotes, examples, specific nouns)?
- Is the claim specific enough that two different renderers would produce
  recognizably similar behavior?
- If a user probed this dimension in chat, would the card's content
  surface, or would the model fall back on generic defaults?

Low latchability ≠ absent. A card can check every coverage box while being
too thin to render distinctly. Latchability is the property that catches
this.

---

## 9. Output: The Punchlist

### 9.1 Structure

```
{
  "summary": {
    "overallNote": "<1-2 sentence human-readable summary>",
    "criticalCount": <n>,
    "majorCount": <n>,
    "minorCount": <n>
  },
  "findings": [
    {
      "id": "<stable-id>",
      "severity": "critical" | "major" | "minor",
      "dimension": "<e.g., backstory-coherence>",
      "what": "<what's wrong>",
      "evidence": { "quote": "<verbatim>", "location": "<section or offset>" },
      "why": "<why it matters>",
      "suggestion": {
        "kind": "add" | "revise" | "remove",
        "target": "<card passage or section>",
        "proposedChange": "<concrete text>"
      }
    },
    ...
  ],
  "trendData": {  // iteration flow only
    "resolvedSinceLastRun": [<ids>],
    "persistent": [<ids>],
    "new": [<ids>]
  },
  "metadata": { ... }
}
```

### 9.2 Rendering

- **Markdown report** — failure-first: critical findings at the top, each
  expandable with evidence and suggestion. Coverage summary as a
  dashboard. Punchlist is the dominant content.
- **JSON** — structured above, consumed by AI assistants for automated
  iteration.

### 9.3 Stable IDs for iteration

Each finding gets a stable ID derived from `(dimension, card-hash-region,
severity)` so that across runs we can track resolution. An edit that
removes the offending passage resolves the finding; an edit elsewhere
doesn't.

---

## 10. Configuration

```yaml
# eval.yaml (static portion)
character:
  name: "..."
  description: |
    [full card]

evaluation:
  mode: static              # or "static+chat"
  coverage:
    nsfwExpected: false     # skip §5.F if false
    requireExamples: true   # enforce §5.C.2
  adversarial:
    passes: [trope, thinness, evidence, unexplored]
  outputDir: ./reports
  priorReport: ./reports/last-run.json  # optional, enables trend diff

llm:
  provider: anthropic
  model: claude-sonnet-4-6
  apiKey: ${ANTHROPIC_API_KEY}
```

---

## 11. Implementation Notes

Per the repo's [`CLAUDE.md`](../CLAUDE.md): **Python 3.14**, `uv` for
dependency management, `ruff` for formatting/linting, `pytest` for tests,
`pyright` or `mypy --strict` for type checking.

### 11.1 Suggested structure

```
src/character_evaluator/
  __init__.py
  cli.py                        # entry point
  config.py                     # YAML + Pydantic
  llm/
    provider.py                 # provider-agnostic LLM wrapper
  static/
    coverage/                   # §5: one module per dimension
      identity_physical.py      # §5.A.1
      backstory.py              # §5.A.2
      relationships.py          # §5.A.3
      capital.py                # §5.A.4
      faults.py                 # §5.B.1
      settings.py               # §5.B.2
      signals.py                # §5.B.3 — attractional/repulsional
      mannerisms.py             # §5.B.4
      speech.py                 # §5.C.1
      examples.py               # §5.C.2
      vulnerability.py          # §5.D.1
      user_relationship.py      # §5.E.1
      sexuality.py              # §5.F.1
    coherence/                  # §6
      timeline.py
      waterfall.py
      identity_physical.py      # §6.3
      contradictions.py
    adversarial/                # §7
      critique.py
    latchability.py             # §8
    orchestrator.py             # runs all passes
  reporter/
    punchlist.py                # §9
    markdown.py
    json.py
  utils/
    logger.py
    retry.py
```

### 11.2 LLM calls

Structured output via Pydantic schemas. Single provider-agnostic wrapper
so the judge model is configurable. Temperature 0 for determinism; freeze
judge model version in the report metadata.

### 11.3 Testing

- **Fixture cards:** a small curated set with known failure modes (missing
  backstory, unexplained divergence, redundant likes, etc.). Snapshot-test
  the punchlist against these.
- **Contradiction-injection tests:** programmatically inject contradictions
  into a clean card, verify they're caught.
- **Judge stability tests:** run the same card through the pipeline N
  times, verify critical findings are stable (minor findings may vary).

---

## 12. Explicit Non-Goals

- **Absolute quality scoring with cross-card calibration.** The punchlist
  answers "is this card structurally sound and specific enough?" not "is
  this card better than other cards."
- **Norm-referenced tiering.** Tier comparison against a reference library
  is deferred to v4+.
- **Engagement prediction.** The tool does not claim to predict whether a
  card will be popular; popularity is a function of many variables
  orthogonal to craft (tags, thumbnail, author following, luck).
- **Taste arbitration.** The tool flags missing coverage and incoherence,
  not aesthetic choices. "This character is too dark for my taste" is not
  a failure mode.

---

## 13. Open Questions

1. **Coverage is opinionated.** The 13 dimensions encode a specific view
   of what makes characters work. How do we let creators override without
   defeating the purpose of a standard checklist?
2. **Latchability is hard to judge well.** A judge model may mistake
   unfamiliar specificity for thinness. Need to iterate on the prompt.
3. **NSFW calibration.** The NSFW section's "edgy but not cartoonish"
   boundary is subjective and the judge will struggle. Possibly fold this
   into a separate review pass.
4. **Reference library for v4.** When we add norm-referenced tiering, how
   do we curate a reference set that doesn't bake in genre/style bias?
5. **Multilingual cards.** Current framing assumes English. Cross-language
   coherence and voice analysis are out of scope for v3.