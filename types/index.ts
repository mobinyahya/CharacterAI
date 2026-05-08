export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  /**
   * True when the human user typed this message themselves (manual composer),
   * false / undefined when produced by the persona LLM during auto-pilot. Lets
   * the UI label persona-driven and human-typed user messages distinctly when
   * a session has been continued manually after auto-pilot.
   *
   * Optional in storage so legacy messages continue to load — they're
   * implicitly persona-authored when a persona is attached, "You" otherwise.
   */
  humanAuthored?: boolean;
}

export interface CharacterCard {
  id: string;
  name: string;
  description: string;
  firstMessage: string;
  systemPrompt: string;
  avatarUrl?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface UserPersona {
  id: string;
  name: string;
  systemPrompt: string;
  avatarUrl?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptPresetModule {
  /** Unique within the preset. Used as the key in enabledModuleIds. */
  id: string;
  name: string;
  description?: string;
  content: string;
  /** Core modules are always active when the preset is selected. */
  isCore: boolean;
}

export interface PromptPreset {
  id: string;
  title: string;
  description?: string;
  author?: string;
  category?: string;
  tags?: string[];
  modules: PromptPresetModule[];
  recommendedTemperature?: number;
  recommendedModels?: string[];
  /** True for built-in presets that came from the bundled JSON. */
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionPromptConfig {
  presetId: string;
  /** IDs of OPTIONAL (non-core) modules the user has enabled. */
  enabledModuleIds: string[];
}

/**
 * Snapshot of the persona that drove a session. Used when the persona was
 * synthesized from the eval catalog (`/evaluate`) and isn't in the persona
 * library — it preserves the resolved prompt + injections so the report
 * stays reconstructible long after the run.
 */
export interface SessionPersonaSnapshot {
  source: "eval-catalog" | "library";
  /** Catalog id (e.g. "bluff-caller") for source="eval-catalog". */
  catalogId?: string;
  /** Library persona id, when source="library". */
  libraryId?: string;
  name: string;
  /** The resolved systemPrompt that was actually sent to the persona LLM. */
  systemPrompt: string;
  /** Per-field injection values for eval-catalog personas. */
  injections?: Record<string, string>;
}

export interface Session {
  id: string;
  characterId: string;
  /**
   * Library persona id, when applicable. For eval-catalog runs this is left
   * undefined — see `personaSnapshot` instead.
   */
  personaId?: string;
  /** Resolved persona snapshot used to drive the user side, if any. */
  personaSnapshot?: SessionPersonaSnapshot;
  /**
   * Model that produces the CHARACTER's assistant messages. In manual chat
   * this is the only LLM in play. In auto-pilot it pairs with `userModel`.
   */
  model: string;
  /**
   * Model that produces the USER's messages on the auto-pilot side.
   * Undefined for manual chats. May equal `model` if the user picked the same
   * LLM for both sides.
   */
  userModel?: string;
  messages: Message[];
  promptConfig?: SessionPromptConfig;
  createdAt: number;
  updatedAt: number;
  title?: string;
}

export interface AppConfig {
  openRouterApiKey: string;
  defaultModel: string;
  hasSeeded: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  contextLength?: string;
  providerColor: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B A4B (free)",
    provider: "Google",
    contextLength: "256K",
    providerColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  {
    id: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    provider: "Google",
    contextLength: "1M",
    providerColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "Google",
    contextLength: "2M",
    providerColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3",
    provider: "DeepSeek",
    contextLength: "64K",
    providerColor: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    provider: "Anthropic",
    contextLength: "200K",
    providerColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    contextLength: "200K",
    providerColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    provider: "OpenAI",
    contextLength: "128K",
    providerColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "OpenAI",
    contextLength: "128K",
    providerColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    provider: "Meta",
    contextLength: "128K",
    providerColor: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  },
];

export const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";

/**
 * Models recommended for judge calls. The judge needs strong reading
 * comprehension + reliable JSON. Order = preference.
 */
export const JUDGE_MODELS: ModelOption[] = AVAILABLE_MODELS.filter((m) =>
  [
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "google/gemini-2.5-pro",
    "google/gemini-2.0-flash-001",
    "deepseek/deepseek-chat",
  ].includes(m.id),
);

export const DEFAULT_JUDGE_MODEL = "anthropic/claude-sonnet-4.5";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// ---------- Evaluation ----------

export type EvalCluster = "A" | "B" | "C" | "D";
export type CardShape = "open" | "trajectory" | "closed" | "unknown";

/**
 * Root-cause attribution for sub-4 scores and triggered binary flags. Per spec:
 *   - "card"    — the spec is missing the feature needed
 *   - "runtime" — the spec is fine; the model didn't execute on it
 *   - "both"    — both contribute, name both in the suggestion
 *   - null      — N/A (score >= 4, or insufficient trace)
 */
export type RootCause = "card" | "runtime" | "both" | null;

export interface DimensionScore {
  /** 0..5, or null when the dimension is N/A for this card/session, or trace is too short. */
  score: number | null;
  /** Judge's explanation for the score (1-3 sentences). */
  notes: string;
  /** Verbatim transcript citations supporting the score. */
  evidence: { turn: number; quote: string }[];
  /**
   * Required by the rubric for any score below 4. null when score >= 4,
   * dimension is N/A, or judge marked the trace as insufficient.
   */
  rootCause?: RootCause;
  /**
   * Concrete card-level fix or runtime/prompting note. Required for sub-4
   * scores. Empty string when not applicable.
   */
  suggestion?: string;
  /**
   * True when the judge declared the trace too short to evaluate this
   * dimension meaningfully (e.g. B3 story arc with only 5 turns). When set,
   * `score` should be null.
   */
  insufficientTrace?: boolean;
}

export interface ResolutionAvoidanceFlag {
  triggered: boolean;
  instances: { turn: number; quote: string; reason: string }[];
  /** Attribution when triggered. */
  rootCause?: RootCause;
  /** Improvement suggestion when triggered. */
  suggestion?: string;
}

export interface InternalConsistencyFlag {
  triggered: boolean;
  /**
   * Each violation: the offending turn + quote, and what earlier
   * fact / feeling / position it contradicts.
   */
  violations: { turn: number; quote: string; contradicts: string }[];
  rootCause?: RootCause;
  suggestion?: string;
}

export interface EvaluationReport {
  id: string;
  sessionId: string;
  characterId: string;
  /** Library persona id, when applicable. Undefined for eval-catalog or manual runs. */
  personaId?: string;
  /**
   * Display name of the persona that drove the user side. Snapshotted at run-time
   * so the dashboard can show it even when the persona is from the eval catalog
   * (and therefore not in the library).
   */
  personaName?: string;
  /**
   * Model that produced the CHARACTER turns in the session. Kept under the
   * legacy `driverModel` name for backward compatibility — older single-driver
   * reports also populate this field.
   */
  driverModel: string;
  /**
   * Model that produced the USER turns on the auto-pilot side. Undefined for
   * older single-driver reports and for manual-chat evaluations.
   */
  userDriverModel?: string;
  /** Model that produced this evaluation (judge). */
  judgeModel: string;
  /** Number of turns in the transcript at evaluation time. */
  turnCount: number;
  cardShape: CardShape;
  /** Spine extraction: judge's one-sentence read of the character. */
  spine: string;
  /** Per-dimension scores keyed by dimension id (A1a, A1b, A2, ... D2). */
  scores: Record<string, DimensionScore>;
  flags: {
    A6_resolutionAvoidance: ResolutionAvoidanceFlag;
    /**
     * Internal consistency violations (model losing track of facts/positions/
     * feelings). Distinct from A4 self-deception. Optional in storage so that
     * pre-rubric-v2 reports parse without migration.
     */
    B6_internalConsistency?: InternalConsistencyFlag;
    other: { label: string; turn?: number; quote?: string }[];
  };
  /** States from the card that the judge identified as activated in the trace. */
  statesActivated: string[];
  /** 1-3 leverage suggestions for the creator. */
  topSuggestions: string[];
  /** Composite means (skip nulls). */
  composite: {
    faithfulness: number | null;
    quality: number | null;
    /**
     * Mean of Cluster C + Cluster D scored dimensions. Optional in storage
     * so pre-rubric-v2 reports continue to parse.
     */
    texture?: number | null;
  };
  /** Raw judge text response (kept for transparency / debugging). */
  rawJudgeResponse: string;
  createdAt: number;
}

// ---------- Static Evaluation (card-only audit, no chat) ----------

/**
 * The six 0–5 scored dimensions of the static rubric (`Static Eval Rubrics.md`).
 * `selfGap` is N/A for Closed-shape cards. The vector is the natural reading
 * order from the spec: structure, states, voice, self-gap, worldview, individuation.
 */
export type StaticDimId =
  | "structure"
  | "states"
  | "voice"
  | "selfGap"
  | "worldview"
  | "individuation";

/**
 * Severity for static-eval flags. `error` = the card violates a hard rule
 * (e.g. an unresolved contradiction); `warning` = concrete weakness the judge
 * named (floating trait, missing trigger, undocumented limit provenance);
 * `info` = empty-field diagnostic — note, don't penalize.
 */
export type StaticFlagSeverity = "error" | "warning" | "info";

export interface StaticFlag {
  label: string;
  severity: StaticFlagSeverity;
  /** Optional pointer to the section of the card the flag is anchored to. */
  section?: string;
}

export interface StaticDimensionScore {
  /** 0..5, or null when N/A (e.g. self-gap on Closed cards). */
  score: number | null;
  /** Judge's 1–3 sentence justification. */
  notes: string;
  /**
   * Verbatim fragments lifted from the card text supporting the score. Quotes
   * — never paraphrases — exactly like the dynamic rubric's evidence rule.
   */
  evidence: string[];
  /**
   * Sub-axis breakdown the judge surfaces for this dim. Used heavily by Voice
   * (voluntary / involuntary / generative counts) and Individuation (load-bearing
   * vs. decorative), but supported uniformly so the UI can render any dim.
   */
  subAxes?: { label: string; value: string | number }[];
  /** Required for any score below 4. Empty string when score >= 4 or null. */
  suggestion?: string;
}

/**
 * Result of running the gating logic against a parsed report. Computed
 * client-side from `cardShape` + scores so it stays consistent.
 */
export interface StaticGatingResult {
  /** True when every gate appropriate to the card shape passed. */
  passes: boolean;
  /** Human-readable failure descriptions (one per failing gate). */
  failures: string[];
}

export interface StaticEvaluationReport {
  id: string;
  characterId: string;
  judgeModel: string;
  cardShape: CardShape;
  /** Spine extraction — judge's one-sentence read of the card's load-bearing structure. */
  spine: string;
  scores: Record<StaticDimId, StaticDimensionScore>;
  flags: StaticFlag[];
  /**
   * 1–2 highest-leverage refinements per the spec ("Top leverage suggestions").
   * Stored as a flat list for parity with the dynamic report.
   */
  topSuggestions: string[];
  /** Mean of non-null scores. Null only when nothing scored (judge failure). */
  composite: number | null;
  /** Raw judge response — kept verbatim for audit. */
  rawJudgeResponse: string;
  createdAt: number;

  // ---- v2/v3 layers (optional in storage so legacy reports continue to load) ----

  /** v3 §5 coverage map — 13 content surfaces the card should hit. */
  coverage?: StaticCoverageResult[];
  /** v3 §6 + v2 waterfall — backstory↔behavior, timeline, capital↔fears, etc. */
  coherence?: StaticCoherenceFinding[];
  /** v3 §7 adversarial critique — trope / thinness / evidence / unexplored lenses. */
  adversarial?: StaticAdversarialFinding[];
  /**
   * v2/v3 punchlist — unified, severity-ranked findings derived from sub-4
   * scores + coverage gaps + coherence breaks + adversarial critiques + flag
   * taxonomy. This is the primary creator-facing deliverable per v3.
   */
  findings?: PunchlistFinding[];
}

// ---------- v3 §5 Coverage layer ----------
// 13 content-surface dimensions, each scored on a 4-step presence ladder with
// verbatim card quotes and a latchability cross-cut (v3 §8).

export type CoverageDimId =
  | "identity-physical" //   5.A.1 — name/age/gender/origin + height/build/distinguishing
  | "backstory-causal" //    5.A.2 — formative events with explicit causal reasoning
  | "relationships" //       5.A.3 — immediate group + family with named roles
  | "capital" //             5.A.4 — at least one elite dimension, manifested
  | "faults" //              5.B.1 — concrete faults with stakes (not "perfectionist")
  | "behavior-settings" //   5.B.2 — behavior across ≥3 distinct settings
  | "signals" //             5.B.3 — attractional + repulsional signals (orthogonal)
  | "mannerisms" //          5.B.4 — surface tics & habits
  | "speech-described" //    5.C.1 — register, idioms, sentence-length tendency
  | "speech-examples" //     5.C.2 — ≥2 verbatim example utterances
  | "vulnerability" //       5.D.1 — fears/secrets coherent with backstory + capital
  | "user-relationship" //   5.E.1 — character↔user state + history
  | "sexuality"; //          5.F.1 — NSFW only, evaluated when card opts in

export type StaticCoveragePresence =
  | "rich"
  | "adequate"
  | "thin"
  | "missing"
  | "na"; // NSFW dim on non-NSFW cards.

export type StaticLatchability = "high" | "medium" | "low";

export interface StaticCoverageResult {
  id: CoverageDimId;
  presence: StaticCoveragePresence;
  /** Verbatim snippets from the card. Empty when missing. */
  evidence: string[];
  /** 1–2 sentence judge note explaining the presence rating. */
  notes: string;
  /**
   * Would a competent renderer have enough handles here for distinct rendering?
   * Low latchability ≠ absent — a card can check the box while being too thin.
   */
  latchability: StaticLatchability;
  /**
   * Architectural dim id this coverage check primarily supports, or null when
   * the surface is standalone (capital, relationships, signals, sexuality).
   * Lets the UI fold coverage into the right dim card.
   */
  mapsTo: StaticDimId | null;
}

// ---------- v3 §6 Coherence layer (the waterfall) ----------

export type StaticCoherenceLinkType =
  | "backstory-behavior" //    each present-state claim should reach a backstory event
  | "timeline" //              age vs. backstory event chronology
  | "capital-vulnerability" // §6.4 — fears reference capital position
  | "build-lifestyle" //       §6.3 — athletic build needs an active life
  | "build-capital" //         §6.3 — physical capital must be manifested
  | "origin-voice" //          §6.3 — class/region cohere with speech & mannerisms
  | "internal-contradiction"; // §6.5 — direct contradictions

export type StaticCoherenceClassification =
  | "coherent"
  | "explained_divergence"
  | "unexplained_divergence";

export interface StaticCoherenceFinding {
  type: StaticCoherenceLinkType;
  classification: StaticCoherenceClassification;
  /** What the link is about (1 sentence). */
  what: string;
  /**
   * The two card passages being linked (e.g. backstory event + present
   * behavior, or both sides of a contradiction). Verbatim only.
   */
  evidence: { label: string; quote: string }[];
  /**
   * Two options for unexplained divergences per v3 §6.2: add-bridge vs.
   * revise-claim. Empty for coherent; one entry for explained.
   */
  options?: string[];
}

// ---------- v3 §7 Adversarial layer ----------

export type StaticAdversarialLens =
  | "trope" //       stock-character shortcuts, unearned archetypes
  | "thinness" //    claims too abstract for a model to grab onto
  | "evidence" //    claims without anecdote / example / manifestation
  | "unexplored"; // dimensions of life the card never touches

export interface StaticAdversarialFinding {
  lens: StaticAdversarialLens;
  /** 1–2 sentence critique. */
  critique: string;
  /** Verbatim card passage, or empty when the critique is about absence. */
  quote: string;
  severity: PunchlistSeverity;
  /** Concrete fix. */
  suggestion: string;
}

// ---------- v2 + v3 Punchlist (primary deliverable) ----------

export type PunchlistSeverity = "critical" | "major" | "minor";
export type PunchlistSource =
  | "score" //        sub-4 architectural dim
  | "coverage" //     missing/thin coverage surface
  | "coherence" //    unexplained divergence or contradiction
  | "adversarial" // critic-pass critique
  | "flag"; //        rule-taxonomy flag (existing)
export type PunchlistSuggestionKind = "add" | "revise" | "remove";

export interface PunchlistSuggestion {
  kind: PunchlistSuggestionKind;
  /** Card section name or verbatim passage to edit. */
  target?: string;
  /** Concrete proposed text — never vague advice. */
  proposedChange: string;
}

export interface PunchlistFinding {
  /**
   * Stable id derived from (source, dimension, evidence-prefix). Survives
   * card edits that don't touch the offending passage, so iteration runs can
   * report resolved / persistent / new across re-runs.
   */
  id: string;
  source: PunchlistSource;
  severity: PunchlistSeverity;
  /**
   * Architectural dim id (`structure`/`states`/…) when relevant, or a
   * coverage / coherence / adversarial label otherwise.
   */
  dimension: string;
  /** What's wrong (1 sentence). */
  what: string;
  /** Verbatim card quotes, or "no such passage exists" sentinel. */
  evidence: { quote: string; location?: string }[];
  /** Why it matters (1–2 sentences). */
  why: string;
  suggestion: PunchlistSuggestion;
}
