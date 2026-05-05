import type {
  CardShape,
  CharacterCard,
  DimensionScore,
  EvalCluster,
  EvaluationReport,
  Message,
  OpenRouterMessage,
  Session,
  UserPersona,
} from "@/types";
import { streamCompletion } from "./openrouter";
import { uid } from "./utils";

// ============================================================================
// Rubric catalogue
// ----------------------------------------------------------------------------
// Mirrors the Cluster A + Cluster B dimensions from `ChatEval.md`.
// Each dimension carries its 0/3/5 anchor descriptions; we feed those into the
// judge prompt to keep scoring consistent across runs and across cards.
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
      "Count callback opportunities (when {{user}} references earlier material, or when earlier material is naturally relevant) vs. callbacks executed. Score = execution rate, weighted by quality (mechanical recall vs. meaningful integration).",
    anchors: {
      0: "Callback opportunities ignored; character treats each turn as if context started fresh.",
      3: "Some callbacks executed but mostly mechanical recall ('as you mentioned earlier'); meaningful integration rare.",
      5: "Most callback opportunities executed; callbacks integrate meaningfully (changing tone, weaponizing prior detail, evolving relationship beat).",
    },
  },
];

export const FAITHFULNESS_DIMS = EVAL_DIMENSIONS.filter((d) => d.cluster === "A").map(
  (d) => d.id,
);
export const QUALITY_DIMS = EVAL_DIMENSIONS.filter((d) => d.cluster === "B").map(
  (d) => d.id,
);

export function findDimension(id: string): DimensionDef | undefined {
  return EVAL_DIMENSIONS.find((d) => d.id === id);
}

// ============================================================================
// Composites
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

const JUDGE_SYSTEM_PROMPT = `You are an evaluation judge for an AI character roleplay session.

You will be given:
1. The character's spec (the system prompt the character LLM was running on).
2. The user-persona spec (the system prompt the user-LLM was running on, if any).
3. The full transcript with numbered turns.
4. A scoring rubric with anchor descriptions for 0, 3, and 5.

Your job:
- Detect the card shape (open / trajectory / closed). Open shape: secret + self-deception + multi-state with productive tensions. Trajectory: explicit phase/sequence language with stated end-state. Closed: no secret, no self-deception, single-valence behavior with the user.
- Score each rubric dimension 0-5 (integer or one-decimal allowed). Return null for dimensions marked N/A in the conditional rules.
- For EVERY non-null score, cite at least one verbatim quote from the transcript with its turn number. Negative scores (≤2) MUST cite the failure-evidence turn.
- Detect the binary A6 resolution-avoidance flag: moments where the runtime invents in-fiction escapes to preserve central tension (unforeshadowed reversals, retconned facts, third-party interventions that conveniently neutralize a path).
- List which of the card's specified states the trace actually activated.
- Provide a one-sentence "spine" extraction so the creator can verify you understood the character.
- Provide 1-3 top leverage suggestions for the creator.

Be strict. Cite quotes verbatim, never paraphrase. If something is borderline, lean lower and explain why.

Output format: Return ONE JSON object matching the schema you'll be given. No prose before or after, no markdown code fences.`;

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
  return lines.join("\n");
}

const SCHEMA_BLOCK = `# Output schema (return ONLY this JSON, nothing else)

{
  "cardShape": "open" | "trajectory" | "closed" | "unknown",
  "spine": "one-sentence summary of the load-bearing structure as you read it",
  "scores": {
    "A1a": { "score": 0..5 | null, "notes": "1-3 sentence justification", "evidence": [{ "turn": <int>, "quote": "verbatim quote" }] },
    "A1b": { "score": 0..5 | null, "notes": "...", "evidence": [...] },
    "A2":  { ... },
    "A3":  { ... },
    "A4a": { ... },
    "A4b": { ... },
    "A5":  { ... },
    "A7":  { ... },
    "A8":  { ... },
    "B1":  { ... },
    "B2":  { ... },
    "B3":  { ... },
    "B4":  { ... },
    "B5":  { ... }
  },
  "flags": {
    "A6_resolutionAvoidance": {
      "triggered": true | false,
      "instances": [{ "turn": <int>, "quote": "verbatim quote", "reason": "why this counts as resolution avoidance" }]
    },
    "other": [{ "label": "short label", "turn": <int|optional>, "quote": "<optional>" }]
  },
  "statesActivated": ["string label per state, e.g. 'With {{user}}', 'When Cornered'"],
  "topSuggestions": ["1-3 highest-leverage refinements for the creator"]
}

Hard rules:
- Cite at least one verbatim quote per non-null score's "evidence" array.
- Use null for any dimension that is conditionally N/A (A4a/A4b for Closed cards; A8 if no named NPCs in trace).
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
}

interface RawJudge {
  cardShape?: unknown;
  spine?: unknown;
  scores?: Record<string, RawDim>;
  flags?: {
    A6_resolutionAvoidance?: {
      triggered?: unknown;
      instances?: unknown;
    };
    other?: unknown;
  };
  statesActivated?: unknown;
  topSuggestions?: unknown;
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
  return {
    score: clampScore(raw.score),
    notes: asString(raw.notes),
    evidence,
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
    .map((i) => ({ turn: Number.isFinite(i.turn) ? i.turn : -1, quote: i.quote, reason: i.reason }));

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
      A6_resolutionAvoidance: {
        triggered: !!a6?.triggered,
        instances: a6Instances,
      },
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
