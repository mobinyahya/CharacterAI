export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
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
