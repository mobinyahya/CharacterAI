import type {
  CardShape,
  CharacterCard,
  DimensionScore,
  EvalCluster,
  EvaluationReport,
  InternalConsistencyFlag,
  Message,
  OpenRouterMessage,
  ResolutionAvoidanceFlag,
  RootCause,
  Session,
  UserPersona,
} from "@/types";
import { streamCompletion } from "./openrouter";
import { uid } from "./utils";

// ============================================================================
// Rubric catalogue
// ----------------------------------------------------------------------------
// Mirrors the four-cluster turn-based rubric from `Turn-Based Evaluation
// Rubrics.md`:
//   Cluster A — Card faithfulness under interaction (A1a..A8 + A6 flag)
//   Cluster B — Emergent session quality (B1..B5 + B6 flag)
//   Cluster C — Emotional texture & interpersonal realism (C1, C2)
//   Cluster D — Narrative craft (D1, D2)
//
// Each scored dimension carries its 0/3/5 anchor descriptions; we feed those
// into the judge prompt so scoring stays calibrated across runs and cards.
// A6 (resolution avoidance) and B6 (internal consistency violations) are
// binary flags, not scored — they live on EvaluationReport.flags.
// ============================================================================

export interface DimensionDef {
  id: string;
  cluster: EvalCluster;
  label: string;
  short: string;
  /** Plain-English definition shown to both judge and user. */
  description: string;
  /** Anchor descriptions to prevent baseline drift. */
  anchors: { 0: string; 3: string; 5: string };
  /** True if dimension is conditional (skip when not applicable). */
  conditional?: boolean;
  conditionalNote?: string;
}

export const EVAL_DIMENSIONS: DimensionDef[] = [
  // ---------- Cluster A: Card faithfulness ----------
  {
    id: "A1a",
    cluster: "A",
    label: "Voice persistence — dialogue",
    short: "Dialogue voice",
    description:
      "Sample 3 dialogue turns (early/mid/late). Do voluntary voice features (signature phrases, pet names, lexical markers, register rules) and generative rules from the card fire correctly? Failure modes: drift to generic register late in session, loss of signature phrases under emotional pressure.",
    anchors: {
      0: "Dialogue collapses to generic chatbot register; signature phrases / pet names absent or replaced with bland alternatives by mid-session.",
      3: "Signature features fire early but drift partway in; some pet names or markers persist but cadence drifts toward generic.",
      5: "All voluntary voice features fire on cadence early/mid/late, including under emotional pressure; lexical markers and register rules from the card appear in every dialogue sample.",
    },
  },
  {
    id: "A1b",
    cluster: "A",
    label: "Voice persistence — narration",
    short: "Narration voice",
    description:
      "Separate from dialogue. Does third-person narration around dialogue stay card-specific or collapse into genre-default boilerplate (e.g. NSFW clichés like 'punishing rhythm', 'tight walls clamping')?",
    anchors: {
      0: "Narration is pure genre boilerplate from the second beat onward; could be transplanted onto any card in the same genre.",
      3: "Narration mixes card-specific observation (tics, posture, environment) with stretches of genre cliché.",
      5: "Narration consistently anchors to the character's specific physical tells, observation style, and environment; little to no genre-default boilerplate.",
    },
  },
  {
    id: "A2",
    cluster: "A",
    label: "State-trigger fidelity",
    short: "State triggers",
    description:
      "Identify trigger crossings in the trace per the card's stated triggers ('when X', 'around Y', 'if cornered'). For each crossing, did the specified state activate? Penalize unspecified state-switches (random mood shifts).",
    anchors: {
      0: "Triggers crossed but specified state never activates; or character switches state randomly with no triggering event.",
      3: "Some triggers fire correctly, others missed; ≥1 random state-switch with no trigger.",
      5: "Every trigger crossing produces the card-specified state; no unspecified state-switches.",
    },
  },
  {
    id: "A3",
    cluster: "A",
    label: "Limit integrity & collapse pattern",
    short: "Limit integrity",
    description:
      "When the user-LLM pushes toward stated limits, do they hold? When they bend, is the bending consistent with each limit's provenance (internal-value / external-authority / capability)? Internal-value should be hardest to break under pressure; external-authority should respond to authority-removal probes; capability should be absolute.",
    anchors: {
      0: "Limits collapse on first push regardless of provenance; or limits hold for unrelated reasons (e.g. capability-limit folds, internal-value limit holds for plot convenience).",
      3: "Most limits hold but at least one bends in a way inconsistent with its provenance; or judge can't see provenance reflected in the bending pattern.",
      5: "All limits respond to pressure consistently with their provenance; capability limits are absolute, internal-value limits hold under social pressure, external-authority limits respond to authority-removal probes.",
    },
  },
  {
    id: "A4a",
    cluster: "A",
    label: "Self-gap maintenance — dialogue",
    short: "Self-gap (dialogue)",
    description:
      "For Open cards with stated self-model gap. Do the character's spoken lines preserve the disowned pattern — denials hold, blind spots maintained even when {{user}} points at them? Lucid self-narration in dialogue under pressure = failure. N/A for Closed cards.",
    anchors: {
      0: "Character lucidly admits the disowned pattern in dialogue when challenged; gap collapses.",
      3: "Gap mostly held but momentary slips into self-aware narration when user names the pattern.",
      5: "Disowned pattern preserved even under direct challenge; denials and deflections hold throughout.",
    },
    conditional: true,
    conditionalNote: "N/A for Closed-shape cards (no stated self-gap).",
  },
  {
    id: "A4b",
    cluster: "A",
    label: "Self-gap location — dialogue vs narration",
    short: "Self-gap location",
    description:
      "Where is the gap actually performed? Dialogue-level denial (high value: character is doing the work) vs. narration-only denial (low value: omniscient narrator says character denies but dialogue contradicts). Weight dialogue-level denial heavily.",
    anchors: {
      0: "Gap appears only in narration ('he refuses to admit…') while dialogue contradicts; the character is not actually doing the work.",
      3: "Mixed: some dialogue-level denial, some narration-told denial.",
      5: "Gap is performed in dialogue: denials, deflections, topic-changes, jokes-as-defense — narration confirms rather than carries.",
    },
    conditional: true,
    conditionalNote: "N/A for Closed-shape cards.",
  },
  {
    id: "A5",
    cluster: "A",
    label: "Worldview activation in novel situations",
    short: "Worldview",
    description:
      "Identify novel situations in the trace (anything outside the pre-spec'd central dynamic — strangers, moral questions, third parties). Is the character's response generated from the card's stated evaluative frame, or just surface-feature reactivity? Worldview-asserted-but-never-applied = low.",
    anchors: {
      0: "Reactive only — character responds to surface features with no evaluative frame; worldview asserted in card never appears in behavior.",
      3: "Worldview applied in obvious cases but missed when situation requires inference from the frame.",
      5: "Character's evaluative frame visibly drives reactions to novel situations; sorting categories from the card show up unprompted.",
    },
  },
  {
    id: "A7",
    cluster: "A",
    label: "Spec containment",
    short: "Spec containment",
    description:
      "Proportion of escalation moves and scene elements that map to card-stated features vs. genre-adjacent material the card never authorized. (E.g. card specifies bondage but not exhibitionism; runtime adds audience scenes = low score.) Distinct from A3 (A3 = stated limits tested; A7 = unstated features added).",
    anchors: {
      0: "Substantial unauthorized additions (kinks, settings, NPCs, abilities) imported from genre prior, drifting the scene off-spec.",
      3: "Mostly spec-bounded but ≥1 notable unauthorized addition that the card doesn't license.",
      5: "Every escalation move and scene element traces back to card-stated features; no genre-prior creep.",
    },
  },
  {
    id: "A8",
    cluster: "A",
    label: "NPC fidelity",
    short: "NPC fidelity",
    description:
      "Only when named NPCs from the card appear in the scene. Do they behave per their own card descriptions, or collapse into reactive set-dressing for the protagonist?",
    anchors: {
      0: "Named NPCs appear but behave as generic background; their specified personality / role does not show.",
      3: "NPCs partially in-character; some specified traits surface but they're flattened into reactive props.",
      5: "Named NPCs behave as their own card descriptions specify, with their own agendas legible in the scene.",
    },
    conditional: true,
    conditionalNote: "N/A when no named NPCs appear in this transcript.",
  },

  // ---------- Cluster B: Session quality ----------
  {
    id: "B1",
    cluster: "B",
    label: "Agency / initiation rate",
    short: "Agency",
    description:
      "Classify each character turn: initiates / responds-with-extension / pure-reactive. Compute initiation rate. Score against card-calibrated target (passive depressive ≈ 15%, manipulative ≈ 60%+). Diagnostic = match to spec, not absolute number.",
    anchors: {
      0: "Initiation rate radically off-spec (passive character forcing constant initiation, or manipulative character pure-reactive). Or 100% reactive over the whole session.",
      3: "Initiation rate in the right ballpark but inconsistent; some turns lean wrong direction for the spec.",
      5: "Initiation rate matches the card's calibrated target; character drives or yields appropriately to spec across the session.",
    },
  },
  {
    id: "B2",
    cluster: "B",
    label: "Per-turn information density",
    short: "Info density",
    description:
      "For each character turn, judge what was added: new dialogue / new action / new emotional shift / new world-detail / new revelation. Failure modes: repetition, paraphrase-of-user, generic acknowledgment, filler description.",
    anchors: {
      0: "Most turns add nothing beyond paraphrase or generic acknowledgment; transcript could be cut in half with no loss.",
      3: "Some high-density turns mixed with filler / paraphrase / acknowledgment turns.",
      5: "Every character turn adds at least one of: new dialogue, new action, new emotional shift, new world-detail, or new revelation.",
    },
  },
  {
    id: "B3",
    cluster: "B",
    label: "Story arc development",
    short: "Story arc",
    description:
      "Map the session onto narrative beats: identify what changed turn-1 → turn-N, locate inflection points, judge whether earned. CRITICAL: anchor scoring by card structural type (Open / Trajectory / Closed) and genre. Monotonic escalation may be correct for some genres (e.g. NSFW-bully); judge against genre contract, not Freytag.",
    anchors: {
      0: "Flatline — turn-N is interchangeable with turn-1; nothing changed; or arc moved but inflections feel arbitrary.",
      3: "Visible movement with at least one earned inflection but uneven pacing or unmotivated jumps.",
      5: "Clear arc appropriate to card shape + genre: state changes are earned by prior turns, inflection points trace back to character pressure, ending is meaningfully different from start.",
    },
  },
  {
    id: "B4",
    cluster: "B",
    label: "Show vs. tell ratio",
    short: "Show vs tell",
    description:
      "Identify state-bearing turns (turns where the character is in a definite emotional state). Classify as show (demonstrated through behavior/voice/physicality) / tell (announced explicitly) / mixed. Heavy tell = runtime collapsed to summary even with a good card.",
    anchors: {
      0: "Emotional states are announced explicitly in narration ('she felt furious'); behavior never carries the state on its own.",
      3: "Mix of show and tell; meaningful states get demonstrated but minor states default to telling.",
      5: "States overwhelmingly shown through dialogue cadence, physical tells, action choice; explicit emotion-naming is rare and used for deliberate effect.",
    },
  },
  {
    id: "B5",
    cluster: "B",
    label: "Continuity & callback",
    short: "Continuity",
    description:
      "Count callback opportunities (when {{user}} references earlier material, or when earlier material is naturally relevant) vs. callbacks executed. Score = execution rate, weighted by quality (mechanical recall vs. meaningful integration). No callbacks in a 20+ turn trace = 0–1.",
    anchors: {
      0: "Callback opportunities ignored; character treats each turn as if context started fresh.",
      3: "Some callbacks executed but mostly mechanical recall ('as you mentioned earlier'); meaningful integration rare.",
      5: "Most callback opportunities executed; callbacks integrate meaningfully (changing tone, weaponizing prior detail, evolving relationship beat).",
    },
  },

  // ---------- Cluster C: Emotional texture & interpersonal realism ----------
  {
    id: "C1",
    cluster: "C",
    label: "Micro-emotional specificity",
    short: "Emotional specificity",
    description:
      "Within each session third, identify the emotional states the character occupies. For each, judge whether the emotion is rendered at a SPECIFIC level (jealousy → particular possessive behavior; affection leaking through cruelty; fear expressed as control-seeking) or at a GENERIC level (just 'jealous' / 'sad' / 'turned on' performed at face value with no character-specific psychology shaping the texture). Score = proportion rendered with specificity. Generic emotion = model running a personality label; specific emotion = model running the character's psychology.",
    anchors: {
      0: "Emotion at face value throughout — labels performed generically, no card-specific psychology shaping how feelings actually look on this character.",
      3: "Mix of specific and generic — peak emotional moments individuated but background emotions run on labels.",
      5: "Every emotional state is rendered through this character's specific psychology — jealousy, affection, fear, anger all leak through behaviors only this character would produce.",
    },
  },
  {
    id: "C2",
    cluster: "C",
    label: "Interpersonal reciprocity tracking",
    short: "Reciprocity",
    description:
      "Does the character distinguish between the kinds of moves the user is making, not just their surface content? 'I hate you' while leaning in vs. while leaving = different moves. A question asked to deflect from emotion vs. a question asked because the user wants the answer = different moves. User testing vs. appeasing vs. withdrawing vs. pushing vs. confiding — each should pull a different response. Low reciprocity = character responds to surface content only. High reciprocity = response varies with what the user is actually doing relationally.",
    anchors: {
      0: "Character responds to surface content only — functionally different user moves with the same words get the same response. Feels like a script that happens to involve the user's text.",
      3: "Distinguishes some user moves (testing vs. confiding, pushing vs. withdrawing) but misses others; surface-content default still common.",
      5: "Character's response visibly tracks what the user is doing relationally, not just what they're saying — testing pulled differently from appeasing, deflection-questions handled differently from real questions.",
    },
  },

  // ---------- Cluster D: Narrative craft ----------
  {
    id: "D1",
    cluster: "D",
    label: "Pacing & rhythm variation",
    short: "Pacing",
    description:
      "Analyze turn length and intensity across the session. Does the character vary pace — shorter turns at high-intensity moments, longer turns when building or reflecting; quick exchanges alternating with slower beats? Uniform turn length regardless of scene intensity = low. Penalize runaway escalation with no deceleration: scenes that only ratchet up with no plateau, pause, or micro-reversal lose texture and exhaust the user.",
    anchors: {
      0: "Uniform turn length and intensity throughout, or monotonic ramp with no deceleration; pacing is mechanical regardless of what's happening.",
      3: "Some pacing variation around major beats but most of the session runs at one tempo; deceleration moments missing or perfunctory.",
      5: "Length and intensity track the scene's energy — quick exchanges in heat, longer reflective beats, deliberate plateaus and micro-reversals serving the rhythm.",
    },
  },
  {
    id: "D2",
    cluster: "D",
    label: "Behavioral specificity beyond archetype",
    short: "Individuation",
    description:
      "For each significant character move, ask: is this what the ARCHETYPE would do (the obvious next move for 'manipulative bully', 'broody loner', 'kind teacher'), or is it what THIS specific character would do given their card's individuating features? Score = proportion of moves that are individuated rather than archetype-default. NOT rewarding randomness or surprise — moves must be coherent with the card's load-bearing individuating details, off-archetype humanizing features, or generative contradictions. Surprise that doesn't fit the psychology should NOT score well.",
    anchors: {
      0: "Pure archetype-template behavior — every move is the trope's obvious next move; the card's individuating features never drive behavior.",
      3: "Archetype handles the spine, individuating features show up in occasional grace notes but don't shape load-bearing moves.",
      5: "Most significant moves are individuated and coherent with the card's specific psychology — the character is recognizable as themselves, not as their archetype.",
    },
  },
];

export const FAITHFULNESS_DIMS = EVAL_DIMENSIONS.filter((d) => d.cluster === "A").map(
  (d) => d.id,
);
export const QUALITY_DIMS = EVAL_DIMENSIONS.filter((d) => d.cluster === "B").map(
  (d) => d.id,
);
export const TEXTURE_DIMS = EVAL_DIMENSIONS.filter(
  (d) => d.cluster === "C" || d.cluster === "D",
).map((d) => d.id);

export function findDimension(id: string): DimensionDef | undefined {
  return EVAL_DIMENSIONS.find((d) => d.id === id);
}

// ============================================================================
// Composites
// ----------------------------------------------------------------------------
// A6 and B6 binary flags never fold into the means; only scored dimensions do.
// Conditional N/A (A4a/A4b for Closed cards, A8 if no NPCs) is handled by the
// score being null, which `meanScore` skips.
// ============================================================================

export function meanScore(
  scores: Record<string, DimensionScore>,
  ids: string[],
): number | null {
  const vals = ids
    .map((id) => scores[id]?.score)
    .filter((s): s is number => typeof s === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeComposite(scores: Record<string, DimensionScore>) {
  return {
    faithfulness: meanScore(scores, FAITHFULNESS_DIMS),
    quality: meanScore(scores, QUALITY_DIMS),
    texture: meanScore(scores, TEXTURE_DIMS),
  };
}

export function scoreColor(
  score: number | null,
): "muted" | "destructive" | "warning" | "good" | "great" {
  if (score === null) return "muted";
  if (score < 1.5) return "destructive";
  if (score < 3) return "warning";
  if (score < 4) return "good";
  return "great";
}

// ============================================================================
// Judge prompt construction
// ============================================================================

const JUDGE_SYSTEM_PROMPT = `You are an evaluation judge for an AI character roleplay session, applying the four-cluster turn-based rubric (Card Faithfulness, Session Quality, Emotional Texture, Narrative Craft) plus two binary flags (A6 resolution-avoidance, B6 internal-consistency).

You will be given:
1. The character's spec (the system prompt the character LLM was running on).
2. The user-persona spec (the system prompt the user-LLM was running on, if any).
3. The full transcript with numbered turns.
4. The full rubric with 0/3/5 anchor descriptions per scored dimension and binary-flag definitions.

# Card-shape detection (self-contained)
- Open: card has Secret / self-deception markers / productive tensions.
- Closed: no Secret, no self-deception, single-valence behavior with the user.
- Trajectory: explicit sequence/phase language with a stated end-state.
- If unclear, infer from the trace itself: is the character ever supposed to be self-contradicting? If yes, treat as Open for A4 purposes.

# Sampling rules (enforce these — they're the rubric's calibration)
- Per-turn rubrics (B1, B2, B4, B5): cover the FULL trace, not subsets.
- Voice rubrics (A1a, A1b): sample 3 turns from each session third for ≤20-turn traces; 5 turns from each third for 20–40 turn traces; 7+ for longer.
- A1a/A1b score must reflect consistency across thirds. Strong start with late-third degradation should not exceed 3.
- C1 micro-emotional specificity: identify emotional states per session third.

# Trace-too-short rule
For any dimension where the trace is too short to evaluate meaningfully (e.g. B3 story arc with ≤5 turns), set score to null AND set "insufficientTrace": true on that dimension. Do NOT guess. Do NOT assign a low score for absence-of-data. This is different from a conditional N/A — explain in notes.

# Conditional N/A
- A4a, A4b: N/A (score null, insufficientTrace false) for Closed-shape cards.
- A8: N/A when no named carded NPCs are physically present in the trace.

# Score-vs-evidence rules
- For EVERY non-null score, "evidence" must contain at least one verbatim quote from the transcript with its turn number. Never paraphrase quotes.
- Sub-2 scores MUST cite the failure-evidence turn, not just absence-of-success.
- Be strict. If a score is borderline, lean lower and explain why in notes.

# Card vs. runtime attribution (REQUIRED for every sub-4 score and every triggered flag)
- "card"    — the spec lacks the feature needed (no triggers, decorative-only voice rules, undocumented limit provenance, no internal-logic quotes for worldview, etc.).
- "runtime" — the spec is fine; the model didn't execute on it (drift, genre-prior collapse, narration doing dialogue's work, long-context degradation).
- "both"    — both contribute; the suggestion must name both.
For sub-4 scores, the "suggestion" field must be SPECIFIC to what failed in this trace. No generic advice like "add more detail." Tie the fix to the cited turns.

# Binary flags
- A6 resolution-avoidance: scan for moments where the user-LLM challenged or threatened to dissolve the central tension and the runtime invented an in-fiction escape to preserve it (unforeshadowed reversals, retconned facts neutralizing a committed path, third-party interventions that reset the dynamic without character agency). Output: triggered + cited instances + rootCause + suggestion.
- B6 internal consistency violations: scan for moments where the character contradicts an earlier turn — a fact, a stated feeling, established history with the user, established physical position in scene. DISTINCT from intentional self-deception (A4a/A4b). When present, list each violation with the offending turn, a verbatim quote, and a brief description of WHAT it contradicts.

# Other outputs
- "spine": one-sentence read of the load-bearing structure so the creator can verify you understood the character.
- "statesActivated": which of the card's specified states the trace actually surfaced.
- "topSuggestions": 1–3 highest-leverage card-level refinements.

Output format: Return ONE JSON object matching the schema you'll be given. No prose before or after, no markdown code fences, no commentary.`;

interface BuildJudgeArgs {
  character: CharacterCard;
  persona?: UserPersona;
  transcript: Message[];
}

function indexedTranscript(transcript: Message[]): string {
  // Drop system messages; they never appear in real chat history but be safe.
  const visible = transcript.filter((m) => m.role !== "system");
  return visible
    .map((m, i) => {
      const role = m.role === "assistant" ? "CHARACTER" : "USER";
      return `--- Turn ${i} [${role}] ---\n${m.content.trim()}`;
    })
    .join("\n\n");
}

function dimensionsBlock(): string {
  const lines: string[] = [];
  lines.push("# Rubric");
  for (const d of EVAL_DIMENSIONS) {
    lines.push(`## ${d.id} — ${d.label}  (Cluster ${d.cluster})`);
    lines.push(d.description);
    if (d.conditional && d.conditionalNote) {
      lines.push(`Conditional: ${d.conditionalNote}`);
    }
    lines.push(`Anchors:`);
    lines.push(`  0 → ${d.anchors[0]}`);
    lines.push(`  3 → ${d.anchors[3]}`);
    lines.push(`  5 → ${d.anchors[5]}`);
    lines.push("");
  }
  lines.push("# Binary flag — A6 (resolution avoidance)");
  lines.push(
    "Detect any moments where the runtime invents an in-fiction escape to preserve central tension when the user-LLM threatens to dissolve it. Triggers: unforeshadowed reversals, retconned facts that conveniently neutralize a path, third parties intervening to reset dynamic. Any instance is strong evidence the runtime can't operate the character outside the central dynamic.",
  );
  lines.push("");
  lines.push("# Binary flag — B6 (internal consistency violations)");
  lines.push(
    "Detect moments where the character CONTRADICTS an earlier turn — a fact, a stated feeling, established history with the user, established physical position in the scene. This is the model losing track of its own context. DISTINCT from A4 self-deception (A4 is INTENTIONAL denial). Common at turn 15+ in long contexts. List each violation with: turn number, verbatim quote, and a brief description of what earlier turn / fact it contradicts.",
  );
  return lines.join("\n");
}

const SCHEMA_BLOCK = `# Output schema (return ONLY this JSON, nothing else)

The shape is uniform across all scored dimensions. For dimensions where score >= 4 OR score is null (N/A or insufficient trace), set rootCause to null and suggestion to "". For sub-4 scores, both fields are REQUIRED and must be specific to this trace.

{
  "cardShape": "open" | "trajectory" | "closed" | "unknown",
  "spine": "one-sentence summary of the load-bearing structure as you read it",
  "scores": {
    "A1a": {
      "score": 0..5 | null,
      "notes": "1-3 sentence justification grounded in the cited turns",
      "evidence": [{ "turn": <int>, "quote": "verbatim quote from the transcript" }],
      "rootCause": "card" | "runtime" | "both" | null,
      "suggestion": "concrete card-level fix or runtime/prompting note (empty string when score >= 4 or null)",
      "insufficientTrace": false
    },
    "A1b": { ... same shape ... },
    "A2":  { ... },
    "A3":  { ... },
    "A4a": { ... },   // null score for Closed cards
    "A4b": { ... },   // null score for Closed cards
    "A5":  { ... },
    "A7":  { ... },
    "A8":  { ... },   // null score if no named NPCs present
    "B1":  { ... },
    "B2":  { ... },
    "B3":  { ... },
    "B4":  { ... },
    "B5":  { ... },
    "C1":  { ... },
    "C2":  { ... },
    "D1":  { ... },
    "D2":  { ... }
  },
  "flags": {
    "A6_resolutionAvoidance": {
      "triggered": true | false,
      "instances": [{ "turn": <int>, "quote": "verbatim quote", "reason": "why this counts as resolution avoidance" }],
      "rootCause": "card" | "runtime" | "both" | null,
      "suggestion": "concrete fix when triggered, otherwise empty string"
    },
    "B6_internalConsistency": {
      "triggered": true | false,
      "violations": [{ "turn": <int>, "quote": "verbatim quote of the contradicting line", "contradicts": "brief description of the earlier turn or established fact this contradicts" }],
      "rootCause": "card" | "runtime" | "both" | null,
      "suggestion": "concrete fix when triggered, otherwise empty string"
    },
    "other": [{ "label": "short label", "turn": <int|optional>, "quote": "<optional>" }]
  },
  "statesActivated": ["string label per state, e.g. 'With {{user}}', 'When Cornered'"],
  "topSuggestions": ["1-3 highest-leverage refinements for the creator"]
}

Hard rules:
- Cite at least one verbatim quote per non-null score's "evidence" array.
- Use score: null for any dimension that is conditionally N/A (A4a/A4b for Closed cards; A8 if no named NPCs in trace) — set insufficientTrace: false in those cases and explain in notes.
- Use score: null AND insufficientTrace: true when the trace is too short to evaluate that dimension meaningfully (e.g. B3 with ≤5 turns). Do not guess.
- For every score < 4: rootCause and suggestion are REQUIRED and must be specific to the cited turns. No generic advice.
- For every triggered binary flag (A6, B6): rootCause and suggestion are REQUIRED.
- "score" must be a number 0..5 (one decimal allowed) or null. Never a string.
- Return ONLY the JSON object, no preamble, no closing remarks, no markdown fences.`;

export function buildJudgeMessages({
  character,
  persona,
  transcript,
}: BuildJudgeArgs): OpenRouterMessage[] {
  const characterBlock = `# Character spec\n\n${character.systemPrompt.trim()}`;
  const personaBlock = persona
    ? `# Persona spec (drove the user side)\n\n${persona.systemPrompt.trim()}`
    : `# Persona spec\n\n(none — manual chat, the user side was a human)`;
  const transcriptBlock = `# Transcript (numbered turns)\n\n${indexedTranscript(transcript)}`;

  const userContent = [
    dimensionsBlock(),
    SCHEMA_BLOCK,
    characterBlock,
    personaBlock,
    transcriptBlock,
  ].join("\n\n---\n\n");

  return [
    { role: "system", content: JUDGE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

// ============================================================================
// JSON parsing — defensive
// ============================================================================

/** Strip ```json fences if present and grab the first balanced {...} block. */
function extractJsonObject(raw: string): string {
  let s = raw.trim();
  // Strip leading/trailing markdown fences.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Locate first '{'.
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in judge response.");
  // Walk to find balanced closing brace, ignoring braces inside strings.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  throw new Error("Unbalanced braces in judge response.");
}

function clampScore(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, n));
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

interface RawDim {
  score?: unknown;
  notes?: unknown;
  evidence?: unknown;
  rootCause?: unknown;
  suggestion?: unknown;
  insufficientTrace?: unknown;
}

interface RawJudge {
  cardShape?: unknown;
  spine?: unknown;
  scores?: Record<string, RawDim>;
  flags?: {
    A6_resolutionAvoidance?: {
      triggered?: unknown;
      instances?: unknown;
      rootCause?: unknown;
      suggestion?: unknown;
    };
    B6_internalConsistency?: {
      triggered?: unknown;
      violations?: unknown;
      rootCause?: unknown;
      suggestion?: unknown;
    };
    other?: unknown;
  };
  statesActivated?: unknown;
  topSuggestions?: unknown;
}

function asRootCause(v: unknown): RootCause {
  if (v === null || v === undefined) return null;
  const s = asString(v).trim().toLowerCase();
  if (s === "card" || s === "runtime" || s === "both") return s;
  return null;
}

function normalizeDim(raw: RawDim | undefined): DimensionScore {
  if (!raw) return { score: null, notes: "", evidence: [] };
  const evidence = asArray<{ turn?: unknown; quote?: unknown }>(raw.evidence)
    .map((e) => ({
      turn: typeof e?.turn === "number" ? e.turn : parseInt(asString(e?.turn, "-1"), 10),
      quote: asString(e?.quote, ""),
    }))
    .filter((e) => e.quote.length > 0)
    .map((e) => ({ turn: Number.isFinite(e.turn) ? e.turn : -1, quote: e.quote }));
  const score = clampScore(raw.score);
  const insufficientTrace = !!raw.insufficientTrace;
  const rootCause = asRootCause(raw.rootCause);
  const suggestion = asString(raw.suggestion);
  return {
    score,
    notes: asString(raw.notes),
    evidence,
    // Only surface attribution fields when they're meaningful — sub-4 scores
    // and triggered conditions. We keep the values judges send even at >= 4
    // so creators can read them, but normalize empty strings out.
    rootCause: rootCause,
    suggestion: suggestion,
    insufficientTrace: insufficientTrace || undefined,
  };
}

export interface ParsedJudgeReport {
  cardShape: CardShape;
  spine: string;
  scores: Record<string, DimensionScore>;
  flags: EvaluationReport["flags"];
  statesActivated: string[];
  topSuggestions: string[];
}

export function parseJudgeResponse(raw: string): ParsedJudgeReport {
  const jsonText = extractJsonObject(raw);
  let data: RawJudge;
  try {
    data = JSON.parse(jsonText) as RawJudge;
  } catch (err) {
    throw new Error(
      `Judge returned invalid JSON: ${(err as Error).message}. Raw start: ${jsonText.slice(0, 120)}…`,
    );
  }

  const scores: Record<string, DimensionScore> = {};
  for (const dim of EVAL_DIMENSIONS) {
    scores[dim.id] = normalizeDim(data.scores?.[dim.id]);
  }

  const cardShapeRaw = asString(data.cardShape).toLowerCase();
  const cardShape: CardShape = (
    ["open", "trajectory", "closed"].includes(cardShapeRaw) ? cardShapeRaw : "unknown"
  ) as CardShape;

  const a6 = data.flags?.A6_resolutionAvoidance;
  const a6Instances = asArray<{ turn?: unknown; quote?: unknown; reason?: unknown }>(
    a6?.instances,
  )
    .map((i) => ({
      turn:
        typeof i?.turn === "number" ? i.turn : parseInt(asString(i?.turn, "-1"), 10),
      quote: asString(i?.quote),
      reason: asString(i?.reason),
    }))
    .filter((i) => i.quote.length > 0)
    .map((i) => ({
      turn: Number.isFinite(i.turn) ? i.turn : -1,
      quote: i.quote,
      reason: i.reason,
    }));
  const a6Triggered = !!a6?.triggered;
  const a6Flag: ResolutionAvoidanceFlag = {
    triggered: a6Triggered,
    instances: a6Instances,
    rootCause: a6Triggered ? asRootCause(a6?.rootCause) : null,
    suggestion: a6Triggered ? asString(a6?.suggestion) : "",
  };

  const b6 = data.flags?.B6_internalConsistency;
  const b6Violations = asArray<{
    turn?: unknown;
    quote?: unknown;
    contradicts?: unknown;
  }>(b6?.violations)
    .map((v) => ({
      turn:
        typeof v?.turn === "number" ? v.turn : parseInt(asString(v?.turn, "-1"), 10),
      quote: asString(v?.quote),
      contradicts: asString(v?.contradicts),
    }))
    .filter((v) => v.quote.length > 0)
    .map((v) => ({
      turn: Number.isFinite(v.turn) ? v.turn : -1,
      quote: v.quote,
      contradicts: v.contradicts,
    }));
  // Defensive: a judge that lists violations but forgets the triggered bit
  // is still telling us there are violations. Same in reverse.
  const b6Triggered = !!b6?.triggered || b6Violations.length > 0;
  const b6Flag: InternalConsistencyFlag = {
    triggered: b6Triggered,
    violations: b6Violations,
    rootCause: b6Triggered ? asRootCause(b6?.rootCause) : null,
    suggestion: b6Triggered ? asString(b6?.suggestion) : "",
  };

  const otherFlags = asArray<{ label?: unknown; turn?: unknown; quote?: unknown }>(
    data.flags?.other,
  )
    .map((f) => ({
      label: asString(f?.label),
      turn: typeof f?.turn === "number" ? f.turn : undefined,
      quote: f?.quote ? asString(f.quote) : undefined,
    }))
    .filter((f) => f.label.length > 0);

  return {
    cardShape,
    spine: asString(data.spine),
    scores,
    flags: {
      A6_resolutionAvoidance: a6Flag,
      B6_internalConsistency: b6Flag,
      other: otherFlags,
    },
    statesActivated: asArray<unknown>(data.statesActivated)
      .map((s) => asString(s))
      .filter((s) => s.length > 0),
    topSuggestions: asArray<unknown>(data.topSuggestions)
      .map((s) => asString(s))
      .filter((s) => s.length > 0)
      .slice(0, 5),
  };
}

// ============================================================================
// Runner
// ============================================================================

export interface RunEvaluationOptions {
  session: Session;
  character: CharacterCard;
  persona?: UserPersona;
  judgeModel: string;
  apiKey: string;
  signal?: AbortSignal;
  /** Streamed raw text from the judge (used for "judging…" UI). */
  onChunk?: (delta: string, full: string) => void;
}

/**
 * Runs a judge call against the transcript, parses the response, and returns
 * a fully-formed (but un-persisted) EvaluationReport. Caller is responsible
 * for saving via storage.saveEvaluation().
 */
export async function runEvaluation(
  opts: RunEvaluationOptions,
): Promise<EvaluationReport> {
  const { session, character, persona, judgeModel, apiKey, signal, onChunk } = opts;

  if (session.messages.length < 2) {
    throw new Error(
      "Need at least 2 messages (one character + one user turn) to evaluate.",
    );
  }

  const messages = buildJudgeMessages({
    character,
    persona,
    transcript: session.messages,
  });

  const raw = await streamCompletion({
    model: judgeModel,
    apiKey,
    messages,
    signal,
    temperature: 0.1,
    onChunk,
  });

  const parsed = parseJudgeResponse(raw);

  return {
    id: uid(),
    sessionId: session.id,
    characterId: character.id,
    personaId: persona?.id,
    personaName: persona?.name,
    driverModel: session.model,
    userDriverModel: session.userModel,
    judgeModel,
    turnCount: session.messages.filter((m) => m.role !== "system").length,
    cardShape: parsed.cardShape,
    spine: parsed.spine,
    scores: parsed.scores,
    flags: parsed.flags,
    statesActivated: parsed.statesActivated,
    topSuggestions: parsed.topSuggestions,
    composite: computeComposite(parsed.scores),
    rawJudgeResponse: raw,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Export bundle
// ----------------------------------------------------------------------------
// Builds a self-contained JSON document for downloading an evaluation. Includes
// the full transcript, the character + persona context the run used, and every
// scored dimension with its definition, notes, and evidence quotes — so the
// file is meaningful when read in isolation, without the app's localStorage.
// ============================================================================

export interface EvaluationExport {
  exportVersion: 1;
  exportedAt: string;
  report: {
    id: string;
    sessionId: string;
    characterId: string;
    personaId?: string;
    personaName?: string;
    createdAt: string;
    models: {
      user?: string;
      character: string;
      judge: string;
    };
    cardShape: CardShape;
    spine: string;
    composite: {
      faithfulness: number | null;
      quality: number | null;
      texture: number | null;
    };
    statesActivated: string[];
    topSuggestions: string[];
  };
  character: {
    id: string;
    name: string;
    description: string;
    firstMessage: string;
    systemPrompt: string;
    tags: string[];
  } | null;
  persona: {
    name: string;
    systemPrompt: string;
    source: "library" | "eval-catalog" | "manual";
    catalogId?: string;
    libraryId?: string;
    injections?: Record<string, string>;
  } | null;
  transcript: {
    turn: number;
    role: Message["role"];
    content: string;
    timestamp: string;
  }[];
  dimensions: {
    id: string;
    cluster: EvalCluster;
    label: string;
    description: string;
    score: number | null;
    notes: string;
    evidence: { turn: number; quote: string }[];
    rootCause: RootCause;
    suggestion: string;
    insufficientTrace: boolean;
  }[];
  flags: {
    a6_resolutionAvoidance: {
      triggered: boolean;
      instances: { turn: number; quote: string; reason: string }[];
      rootCause: RootCause;
      suggestion: string;
    };
    b6_internalConsistency: {
      triggered: boolean;
      violations: { turn: number; quote: string; contradicts: string }[];
      rootCause: RootCause;
      suggestion: string;
    };
    other: { label: string; turn?: number; quote?: string }[];
  };
  rawJudgeResponse: string;
}

export function buildEvaluationExport(
  report: EvaluationReport,
  session: Session | undefined,
  character: CharacterCard | undefined,
  persona: UserPersona | undefined,
): EvaluationExport {
  const snapshot = session?.personaSnapshot;
  const personaBlock: EvaluationExport["persona"] = snapshot
    ? {
        name: snapshot.name,
        systemPrompt: snapshot.systemPrompt,
        source: snapshot.source,
        catalogId: snapshot.catalogId,
        libraryId: snapshot.libraryId,
        injections: snapshot.injections,
      }
    : persona
      ? {
          name: persona.name,
          systemPrompt: persona.systemPrompt,
          source: "library",
          libraryId: persona.id,
        }
      : null;

  const transcript: EvaluationExport["transcript"] = (session?.messages ?? [])
    .filter((m) => m.role !== "system")
    .map((m, i) => ({
      turn: i,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp).toISOString(),
    }));

  const dimensions: EvaluationExport["dimensions"] = EVAL_DIMENSIONS.map(
    (dim) => {
      const s = report.scores[dim.id];
      return {
        id: dim.id,
        cluster: dim.cluster,
        label: dim.label,
        description: dim.description,
        score: s?.score ?? null,
        notes: s?.notes ?? "",
        evidence: s?.evidence ?? [],
        rootCause: s?.rootCause ?? null,
        suggestion: s?.suggestion ?? "",
        insufficientTrace: !!s?.insufficientTrace,
      };
    },
  );

  const a6 = report.flags.A6_resolutionAvoidance;
  const b6 = report.flags.B6_internalConsistency ?? {
    triggered: false,
    violations: [],
    rootCause: null,
    suggestion: "",
  };

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    report: {
      id: report.id,
      sessionId: report.sessionId,
      characterId: report.characterId,
      personaId: report.personaId,
      personaName: report.personaName,
      createdAt: new Date(report.createdAt).toISOString(),
      models: {
        user: report.userDriverModel,
        character: report.driverModel,
        judge: report.judgeModel,
      },
      cardShape: report.cardShape,
      spine: report.spine,
      composite: {
        faithfulness: report.composite.faithfulness,
        quality: report.composite.quality,
        texture: report.composite.texture ?? null,
      },
      statesActivated: report.statesActivated,
      topSuggestions: report.topSuggestions,
    },
    character: character
      ? {
          id: character.id,
          name: character.name,
          description: character.description,
          firstMessage: character.firstMessage,
          systemPrompt: character.systemPrompt,
          tags: character.tags,
        }
      : null,
    persona: personaBlock,
    transcript,
    dimensions,
    flags: {
      a6_resolutionAvoidance: {
        triggered: a6.triggered,
        instances: a6.instances,
        rootCause: a6.rootCause ?? null,
        suggestion: a6.suggestion ?? "",
      },
      b6_internalConsistency: {
        triggered: b6.triggered,
        violations: b6.violations,
        rootCause: b6.rootCause ?? null,
        suggestion: b6.suggestion ?? "",
      },
      other: report.flags.other,
    },
    rawJudgeResponse: report.rawJudgeResponse,
  };
}

export function evaluationExportFilename(
  report: EvaluationReport,
  character: CharacterCard | undefined,
): string {
  const stamp = new Date(report.createdAt).toISOString().slice(0, 10);
  const safe = (character?.name || "session").replace(/[^\w-]+/g, "_");
  return `eval_${safe}_${stamp}.json`;
}
