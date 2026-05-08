import type {
  CardShape,
  CharacterCard,
  OpenRouterMessage,
  StaticDimId,
  StaticDimensionScore,
  StaticEvaluationReport,
  StaticFlag,
  StaticFlagSeverity,
  StaticGatingResult,
} from "@/types";
import { streamCompletion } from "./openrouter";
import { uid } from "./utils";

// ============================================================================
// Static rubric catalogue
// ----------------------------------------------------------------------------
// Mirrors `Static Eval Rubrics.md` — six 0–5 dimensions plus a routing step
// (Card Shape, not scored). Judge applies these to the character card text
// directly, with NO chat transcript. Self-gap is N/A for Closed-shape cards.
//
// Sub-axes per dim are surfaced through the judge schema below so the UI can
// render the rubric's structured sub-checks (voluntary/involuntary/generative
// for Voice, load-bearing-vs-decorative for Individuation, etc.) without the
// front-end having to parse the prose notes.
// ============================================================================

export interface StaticDimensionDef {
  id: StaticDimId;
  /** 1..6 — the human-numbered dim from the spec. */
  number: number;
  label: string;
  short: string;
  /** Plain-English definition shown to both judge and creator. */
  description: string;
  /** Anchor descriptions to prevent baseline drift across runs. */
  anchors: { 0: string; 3: string; 5: string };
  /** True when N/A on Closed cards (only `selfGap`). */
  closedNa?: boolean;
  /**
   * Display labels for the structured sub-axes the judge is asked to count.
   * Free-form so the rubric stays the source of truth.
   */
  subAxes?: string[];
}

export const STATIC_EVAL_DIMENSIONS: StaticDimensionDef[] = [
  {
    id: "structure",
    number: 1,
    label: "Load-bearing structure & causal coherence",
    short: "Structure",
    description:
      "Does the card rest on a coherent spine the rest serves? Either psychological trajectory (formative event → schema/wound → present behavior) or operational premise (initiating event → stakes → engine preventing trivial resolution → termination/loop), often combined. Each backstory element should produce a present-day trait via plausible developmental pathways. Flag floating traits, disconnected backstory, goal-without-engine.",
    anchors: {
      0: "Spine missing or contradictory; major traits are floating (asserted, not earned). Backstory exists but doesn't predict present behavior. Or a stated goal with no friction/engine preventing trivial resolution.",
      3: "Coherent spine partially present — some traits earned, others floating. Backstory connects to part of the present-day pattern but leaves significant gaps the model has to invent.",
      5: "Every major trait traces back to a stated formative event or operational premise via a plausible pathway. Spine reads in one sentence. No floating traits, no disconnected backstory.",
    },
  },
  {
    id: "states",
    number: 2,
    label: "Multi-state specification & {{user}}-contract",
    short: "States",
    description:
      "Behavior across contexts with explicit triggers, plus a complete {{user}}-contract: tone/register, what the character does (steady-state) or plans to do (trajectory), escalators/de-escalators, upper and lower limits with provenance (internal-value / external-authority / capability). Every state needs a transition cue ('when X', 'around Y', 'if cornered'). Flag only-{{user}}-mode, states without triggers, missing limits, undocumented limit provenance.",
    anchors: {
      0: "Only-{{user}} mode (single context, no other states), or every state declared with no triggers; no upper/lower limits or no contract. Will flatline outside the central dynamic.",
      3: "{{user}}-contract present and at least one secondary state, but ≥1 state lacks a trigger or ≥1 limit lacks provenance. Mid-conversation transitions will be guesswork.",
      5: "≥3 distinct states each with explicit trigger language, full {{user}}-contract (tone, escalators, de-escalators, upper + lower limits), every limit annotated with provenance.",
    },
    subAxes: [
      "Distinct states documented",
      "States with explicit triggers",
      "Limits stated",
      "Limits with documented provenance",
    ],
  },
  {
    id: "voice",
    number: 3,
    label: "Voice specification",
    short: "Voice",
    description:
      "Three sub-axes: voluntary voice (signature phrases, pet names for {{user}}, register rules, lexical markers, example dialogue), involuntary tells (physical tics under emotion, speech leaks, reflexive expressions that make state legible without announcement), and generative linguistic rules (reproducible patterns the model can extend to novel utterances — pronoun rules, templated mechanics). Targets per spec: ≥3 voluntary, ≥3 involuntary, ≥1 generative rule. Voluntary-only = emotionally opaque; involuntary-only = drifts to generic; zero generative rules = scales poorly across long context.",
    anchors: {
      0: "Voice essentially undefined, or only example dialogue with no rules behind it. Will collapse to generic LLM register inside 5 turns.",
      3: "One sub-axis well covered (often voluntary) but the other two thin — e.g. signature phrases without involuntary tells, or examples without generative rules. Voice will hold early then drift.",
      5: "≥3 voluntary, ≥3 involuntary, ≥1 generative rule. State changes legible through tells without announcement; generative rules can produce new in-character utterances under pressure.",
    },
    subAxes: [
      "Voluntary features",
      "Involuntary tells",
      "Generative rules",
    ],
  },
  {
    id: "selfGap",
    number: 4,
    label: "Self-model / behavior gap",
    short: "Self-gap",
    description:
      "Drama scales with distance between self-narration and actual behavior. N/A for Closed cards. Sub-types (any one counts; multiple = high score): active denial ('vehemently denies', 'tells himself'), performance vs. private (different versions for different audiences), sublimated/symptomatic (pattern-matched behavior the character doesn't understand). Distinguish OWNED tension (knows the conflict, suffers consciously → angsty) from DISOWNED (holds a self-position behavior contradicts → dramatic-irony where {{user}} catches them). Generative contradictions resolve into a deeper coherent reading; raw contradictions with no reconciling reading are errors.",
    anchors: {
      0: "No self-gap sub-types and no productive tensions; behavior is single-valence and matches stated self-model. Genuine contradictions present with no reconciling reading.",
      3: "One sub-type partially present — gap is hinted at but not specified enough for the runtime to perform it (no denial language, no symptomatic-behavior examples).",
      5: "Multiple sub-types specified with explicit linguistic markers ('vehemently denies', 'doesn't realize', 'his friends tease him for'). Generative contradictions resolve into a single coherent psychological reading.",
    },
    closedNa: true,
  },
  {
    id: "worldview",
    number: 5,
    label: "Worldview / evaluative frame",
    short: "Worldview",
    description:
      "The character's articulated frame for judging situations as proper/improper, worthy/weak, sacred/profane. Distinct from traits (what they're like), schemas (how they see themselves), motivations (what they want). Look for stated normative beliefs, sorting categories the character uses on people, sacred/unthinkable items, and especially internal-logic quotes (first-person reasoning shown directly — different from speech, gives the model a generative pattern). Flag reactive-only and worldview-asserted-but-never-applied.",
    anchors: {
      0: "Reactive only — feelings about events but no opinions about how things ought to be. Or worldview labels asserted ('values loyalty') with no behavioral implications and no internal-logic quotes.",
      3: "Sorting categories or normative beliefs present but thin — labels without internal-logic quotes, or quotes without sorting categories. Predictable on obvious cases, will surface-react on novel ones.",
      5: "Sorting categories + normative beliefs + sacred/profane items + ≥1 internal-logic quote. Card lets the model predict the character's framing of novel situations before reacting.",
    },
  },
  {
    id: "individuation",
    number: 6,
    label: "Convention vs. individuation density",
    short: "Individuation",
    description:
      "How much the card individuates within its trope. Look for: an extractable archetype phrase, baseline genre features (noise), individuating features that wouldn't transfer to a generic instance, off-archetype humanizing details (small traits that plausibly contradict the archetype), categorical-choice coherence (slot-filling that aligns with personality), and load-bearing vs. decorative individuation (each individuating feature should connect to the spine). Targets per spec: ≥5 individuating features, of which ≥3 load-bearing.",
    anchors: {
      0: "Pure archetype-template — every named feature is a baseline trope feature. No off-archetype humanizing details. Categorical mismatches without justification.",
      3: "Some individuation present but mostly decorative (mole-under-eye specifics rather than scars-from-mother-that-explain-suppressed-feelings). Or load-bearing features exist but <5 individuating features total.",
      5: "≥5 individuating features and ≥3 load-bearing (connect to the spine). Off-archetype humanizing details make the trope unrecognizable as a template. Categorical choices coherent with personality.",
    },
    subAxes: [
      "Individuating features",
      "Load-bearing individuating features",
      "Off-archetype humanizing details",
    ],
  },
];

export const STATIC_DIM_IDS: StaticDimId[] = STATIC_EVAL_DIMENSIONS.map(
  (d) => d.id,
);

export function findStaticDimension(
  id: StaticDimId,
): StaticDimensionDef | undefined {
  return STATIC_EVAL_DIMENSIONS.find((d) => d.id === id);
}

// ============================================================================
// Composites + gating
// ----------------------------------------------------------------------------
// Composite = mean of non-null scores. Gating mirrors the spec exactly:
//   • All shapes: structure ≥ 3 AND states ≥ 3
//   • Closed:    additionally voice ≥ 3 AND individuation ≥ 4
//   • Trajectory: additionally states must include user-resistance handling
//                 (heuristic — flagged when the judge's notes/flags signal
//                  this is missing; we can't fully verify it client-side).
// ============================================================================

export function staticComposite(
  scores: Record<StaticDimId, StaticDimensionScore>,
): number | null {
  const vals = STATIC_DIM_IDS
    .map((id) => scores[id]?.score)
    .filter((s): s is number => typeof s === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeStaticGating(
  shape: CardShape,
  scores: Record<StaticDimId, StaticDimensionScore>,
  flags: StaticFlag[],
): StaticGatingResult {
  const failures: string[] = [];
  const get = (id: StaticDimId): number | null =>
    typeof scores[id]?.score === "number" ? (scores[id]!.score as number) : null;

  const structure = get("structure");
  const states = get("states");
  const voice = get("voice");
  const individuation = get("individuation");

  if (structure === null || structure < 3) {
    failures.push(
      `Structure must be ≥ 3 (currently ${structure?.toFixed(1) ?? "—"}). The spine is not load-bearing enough for the rest of the card to stand on.`,
    );
  }
  if (states === null || states < 3) {
    failures.push(
      `States must be ≥ 3 (currently ${states?.toFixed(1) ?? "—"}). Multi-state spec or {{user}}-contract is too thin for reliable transitions.`,
    );
  }
  if (shape === "closed") {
    if (voice === null || voice < 3) {
      failures.push(
        `Closed cards require Voice ≥ 3 (currently ${voice?.toFixed(1) ?? "—"}). Without a self-gap to carry depth, voice has to do the work.`,
      );
    }
    if (individuation === null || individuation < 4) {
      failures.push(
        `Closed cards require Individuation ≥ 4 (currently ${individuation?.toFixed(1) ?? "—"}). Closed-shape cards lean on individuation to feel specific.`,
      );
    }
  }
  if (shape === "trajectory") {
    // Heuristic: a Trajectory card must specify how it handles user-resistance
    // along the planned arc. We can't audit this from the score vector alone,
    // so we look for either an explicit judge flag or a low states score.
    const flaggedResistance = flags.some((f) =>
      /resistance|push[-\s]?back|refusal|user[-\s]?resistance/i.test(f.label),
    );
    if (flaggedResistance) {
      failures.push(
        "Trajectory cards must specify user-resistance handling along the arc — judge flagged this as missing.",
      );
    }
  }

  return { passes: failures.length === 0, failures };
}

export function staticScoreColor(
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

const STATIC_JUDGE_SYSTEM_PROMPT = `You are a static evaluation judge for an AI character card. There is NO chat transcript — your job is to audit the character card text directly against the six-dimension static rubric and a card-shape routing step.

You will be given:
1. The character card (as the system prompt the character LLM will run on).
2. The full rubric: card-shape rules, six 0–5 dimensions with anchor descriptions, sub-axis counts to surface, and the flag taxonomy.

# Card-shape detection (routing — drives Self-Gap N/A and gating)
- Open: Secret section present, self-deception markers ("vehemently denies", "tells himself", "doesn't realize"), ≥2 productive tensions, present-tense relationship language ("constantly", "tends to").
- Trajectory: sequence/phase language in the {{user}} block ("then…", "until…", "once he's…"), explicit phase descriptions with a stated end-state.
- Closed: no Secret, no self-deception, no productive tensions, single-valence behavior with {{user}}.
- If unclear, lean Open and explain in spine extraction.

# Hard rules for scoring
- Score every dimension 0..5 against the supplied anchor descriptions. Use one decimal max.
- For Closed-shape cards, score Self-Gap as null (NOT 0). It is N/A, not a failure.
- For every score, "evidence" is an array of verbatim fragments lifted from the card text. Never paraphrase; never invent quotes. If the card lacks the feature, evidence may be empty BUT the notes must explicitly call that out as the reason for the score.
- For every score below 4, "suggestion" must be a concrete card-level fix tied to what's missing. No generic advice ("add more detail" is forbidden). Examples: "Add an internal-logic quote like '<example>' to the Worldview section so the model has a generative pattern", "Document provenance for the 'will never hurt {{user}}' limit — internal-value vs. external-authority will respond differently to social pressure".

# Sub-axis counts (REQUIRED for the listed dims)
For the dimensions that declare sub-axes in the rubric, fill the "subAxes" array with literal counts you observe in the card. Examples:
- States: number of distinct states documented; number with explicit trigger language; number of stated limits; number of limits with documented provenance.
- Voice: number of voluntary voice features; number of involuntary tells; number of generative rules.
- Individuation: number of individuating features; number that are load-bearing (connect to the spine); number of off-archetype humanizing details.

These counts are the calibration anchors for the score — they should make the score legible.

# Flag taxonomy
Surface flags from these categories. Be specific, not boilerplate:
- floating-trait: trait asserted but not earned by stated formative cause.
- missing-trigger: state declared without a transition cue.
- undocumented-limit-provenance: limit stated without (internal-value / external-authority / capability) annotation.
- decorative-individuation: detail that doesn't connect to the spine.
- unresolved-contradiction: contradiction that does NOT resolve into a coherent reading.
- section-not-paying-rent: section present but functionally unused by the rest of the card.
- empty-field: an explicitly blank or "none" field. Note, don't penalize.
- user-resistance-missing (Trajectory only): no specification for how the planned arc handles user pushback.

Each flag has a "severity" of "error" (hard rule violation: unresolved contradiction, missing-required-section), "warning" (concrete weakness named above), or "info" (empty-field diagnostics).

# Spine extraction
Output a one-sentence read of the load-bearing structure as you understand it. The creator uses this to verify the system understood the character correctly.

# Top suggestions
Output 1–2 highest-leverage refinements only. Pick ones that would move the needle on Structure or States most — those are the gates.

Output format: ONE JSON object matching the schema. No prose before or after, no markdown code fences.`;

interface BuildStaticJudgeArgs {
  character: CharacterCard;
}

function staticDimensionsBlock(): string {
  const lines: string[] = [];
  lines.push("# Rubric — six dimensions (0–5 each)");
  for (const d of STATIC_EVAL_DIMENSIONS) {
    lines.push(`## ${d.number}. ${d.label}  (id: \`${d.id}\`)`);
    lines.push(d.description);
    if (d.closedNa) {
      lines.push("Conditional: N/A (score null) for Closed-shape cards.");
    }
    if (d.subAxes && d.subAxes.length > 0) {
      lines.push(`Required sub-axis counts to surface in subAxes:`);
      for (const ax of d.subAxes) {
        lines.push(`  - ${ax}`);
      }
    }
    lines.push("Anchors:");
    lines.push(`  0 → ${d.anchors[0]}`);
    lines.push(`  3 → ${d.anchors[3]}`);
    lines.push(`  5 → ${d.anchors[5]}`);
    lines.push("");
  }
  return lines.join("\n");
}

const STATIC_SCHEMA_BLOCK = `# Output schema (return ONLY this JSON, nothing else)

{
  "cardShape": "open" | "trajectory" | "closed" | "unknown",
  "spine": "one-sentence summary of the load-bearing structure as you read it",
  "scores": {
    "structure": {
      "score": 0..5 | null,
      "notes": "1–3 sentence justification grounded in evidence",
      "evidence": ["verbatim fragment from the card", "another verbatim fragment"],
      "subAxes": [{ "label": "string", "value": "string or number" }],
      "suggestion": "concrete card-level fix (empty string when score >= 4 or null)"
    },
    "states":        { ... same shape ... },
    "voice":         { ... same shape ... },
    "selfGap":       { ... same shape ... },        // null score for Closed cards
    "worldview":     { ... same shape ... },
    "individuation": { ... same shape ... }
  },
  "flags": [
    {
      "label": "specific description of the issue (e.g. 'When-Alone state has no transition cue')",
      "severity": "error" | "warning" | "info",
      "section": "name of the card section the flag is anchored to (optional)"
    }
  ],
  "topSuggestions": ["1–2 highest-leverage refinements"]
}

Hard rules:
- "score" must be a number 0..5 (one decimal allowed) or null. Never a string.
- "evidence" must contain verbatim fragments from the card; do not paraphrase.
- For sub-4 scores, "suggestion" is REQUIRED and must be specific.
- "selfGap.score" must be null when "cardShape" is "closed".
- Return ONLY the JSON object — no preamble, no closing remarks, no markdown fences.`;

export function buildStaticJudgeMessages({
  character,
}: BuildStaticJudgeArgs): OpenRouterMessage[] {
  const characterBlock = `# Character card (the spec under audit)\n\n${character.systemPrompt.trim()}`;
  const userContent = [
    staticDimensionsBlock(),
    STATIC_SCHEMA_BLOCK,
    characterBlock,
  ].join("\n\n---\n\n");

  return [
    { role: "system", content: STATIC_JUDGE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

// ============================================================================
// JSON parsing — defensive (mirrors the dynamic judge parser conventions)
// ============================================================================

function extractJsonObject(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in static judge response.");
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
  throw new Error("Unbalanced braces in static judge response.");
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

function asSeverity(v: unknown): StaticFlagSeverity {
  const s = asString(v).trim().toLowerCase();
  if (s === "error" || s === "warning" || s === "info") return s;
  // Default unknown to warning — most judge-emitted flags are weakness markers.
  return "warning";
}

interface RawStaticDim {
  score?: unknown;
  notes?: unknown;
  evidence?: unknown;
  subAxes?: unknown;
  suggestion?: unknown;
}

interface RawStaticJudge {
  cardShape?: unknown;
  spine?: unknown;
  scores?: Record<string, RawStaticDim>;
  flags?: unknown;
  topSuggestions?: unknown;
}

function normalizeStaticDim(raw: RawStaticDim | undefined): StaticDimensionScore {
  if (!raw) return { score: null, notes: "", evidence: [] };
  const evidence = asArray<unknown>(raw.evidence)
    .map((q) => asString(q))
    .filter((q) => q.length > 0);
  const subAxes = asArray<{ label?: unknown; value?: unknown }>(raw.subAxes)
    .map((a) => ({
      label: asString(a?.label),
      // Keep numbers as numbers, otherwise stringify for display.
      value:
        typeof a?.value === "number"
          ? a.value
          : asString(a?.value, ""),
    }))
    .filter((a) => a.label.length > 0);
  return {
    score: clampScore(raw.score),
    notes: asString(raw.notes),
    evidence,
    subAxes: subAxes.length > 0 ? subAxes : undefined,
    suggestion: asString(raw.suggestion),
  };
}

export interface ParsedStaticJudge {
  cardShape: CardShape;
  spine: string;
  scores: Record<StaticDimId, StaticDimensionScore>;
  flags: StaticFlag[];
  topSuggestions: string[];
}

export function parseStaticJudgeResponse(raw: string): ParsedStaticJudge {
  const jsonText = extractJsonObject(raw);
  let data: RawStaticJudge;
  try {
    data = JSON.parse(jsonText) as RawStaticJudge;
  } catch (err) {
    throw new Error(
      `Static judge returned invalid JSON: ${(err as Error).message}. Raw start: ${jsonText.slice(0, 120)}…`,
    );
  }

  const cardShapeRaw = asString(data.cardShape).toLowerCase();
  const cardShape: CardShape = (
    ["open", "trajectory", "closed"].includes(cardShapeRaw)
      ? cardShapeRaw
      : "unknown"
  ) as CardShape;

  const scores = {} as Record<StaticDimId, StaticDimensionScore>;
  for (const dim of STATIC_EVAL_DIMENSIONS) {
    const ds = normalizeStaticDim(data.scores?.[dim.id]);
    // Self-gap on Closed cards: force null per spec, even if the judge slipped.
    if (dim.closedNa && cardShape === "closed") {
      ds.score = null;
      if (!ds.notes) {
        ds.notes = "N/A — Closed-shape cards have no stated self-model gap.";
      }
    }
    scores[dim.id] = ds;
  }

  const flags: StaticFlag[] = asArray<{
    label?: unknown;
    severity?: unknown;
    section?: unknown;
  }>(data.flags)
    .map((f) => ({
      label: asString(f?.label),
      severity: asSeverity(f?.severity),
      section: f?.section ? asString(f.section) : undefined,
    }))
    .filter((f) => f.label.length > 0);

  const topSuggestions = asArray<unknown>(data.topSuggestions)
    .map((s) => asString(s))
    .filter((s) => s.length > 0)
    .slice(0, 5);

  return {
    cardShape,
    spine: asString(data.spine),
    scores,
    flags,
    topSuggestions,
  };
}

// ============================================================================
// Runner
// ============================================================================

export interface RunStaticEvaluationOptions {
  character: CharacterCard;
  judgeModel: string;
  apiKey: string;
  signal?: AbortSignal;
  /** Streaming chunks for the "judging…" UI. */
  onChunk?: (delta: string, full: string) => void;
}

/**
 * Streams the static judge call against the character card, parses the
 * response, and returns a fully-formed (un-persisted) StaticEvaluationReport.
 * Caller is responsible for saving via storage.saveStaticEvaluation().
 */
export async function runStaticEvaluation(
  opts: RunStaticEvaluationOptions,
): Promise<StaticEvaluationReport> {
  const { character, judgeModel, apiKey, signal, onChunk } = opts;

  if (!character.systemPrompt || character.systemPrompt.trim().length === 0) {
    throw new Error(
      "Cannot static-evaluate a character with an empty system prompt.",
    );
  }

  const messages = buildStaticJudgeMessages({ character });

  const raw = await streamCompletion({
    model: judgeModel,
    apiKey,
    messages,
    signal,
    temperature: 0.1,
    onChunk,
  });

  const parsed = parseStaticJudgeResponse(raw);

  return {
    id: uid(),
    characterId: character.id,
    judgeModel,
    cardShape: parsed.cardShape,
    spine: parsed.spine,
    scores: parsed.scores,
    flags: parsed.flags,
    topSuggestions: parsed.topSuggestions,
    composite: staticComposite(parsed.scores),
    rawJudgeResponse: raw,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Export bundle (parallels buildEvaluationExport for dynamic reports)
// ============================================================================

export interface StaticEvaluationExport {
  exportVersion: 1;
  exportedAt: string;
  type: "static";
  report: {
    id: string;
    characterId: string;
    createdAt: string;
    judgeModel: string;
    cardShape: CardShape;
    spine: string;
    composite: number | null;
    gating: StaticGatingResult;
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
  dimensions: {
    id: StaticDimId;
    number: number;
    label: string;
    description: string;
    score: number | null;
    notes: string;
    evidence: string[];
    subAxes: { label: string; value: string | number }[];
    suggestion: string;
  }[];
  flags: StaticFlag[];
  rawJudgeResponse: string;
}

export function buildStaticEvaluationExport(
  report: StaticEvaluationReport,
  character: CharacterCard | undefined,
): StaticEvaluationExport {
  const gating = computeStaticGating(
    report.cardShape,
    report.scores,
    report.flags,
  );

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    type: "static",
    report: {
      id: report.id,
      characterId: report.characterId,
      createdAt: new Date(report.createdAt).toISOString(),
      judgeModel: report.judgeModel,
      cardShape: report.cardShape,
      spine: report.spine,
      composite: report.composite,
      gating,
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
    dimensions: STATIC_EVAL_DIMENSIONS.map((dim) => {
      const s = report.scores[dim.id];
      return {
        id: dim.id,
        number: dim.number,
        label: dim.label,
        description: dim.description,
        score: s?.score ?? null,
        notes: s?.notes ?? "",
        evidence: s?.evidence ?? [],
        subAxes: s?.subAxes ?? [],
        suggestion: s?.suggestion ?? "",
      };
    }),
    flags: report.flags,
    rawJudgeResponse: report.rawJudgeResponse,
  };
}

export function staticEvaluationExportFilename(
  report: StaticEvaluationReport,
  character: CharacterCard | undefined,
): string {
  const stamp = new Date(report.createdAt).toISOString().slice(0, 10);
  const safe = (character?.name || "character").replace(/[^\w-]+/g, "_");
  return `static-eval_${safe}_${stamp}.json`;
}
