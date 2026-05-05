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
  model: string;
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

export type EvalCluster = "A" | "B";
export type CardShape = "open" | "trajectory" | "closed" | "unknown";

export interface DimensionScore {
  /** 0..5, or null when the dimension is N/A for this card/session. */
  score: number | null;
  /** Judge's explanation for the score (1-3 sentences). */
  notes: string;
  /** Verbatim transcript citations supporting the score. */
  evidence: { turn: number; quote: string }[];
}

export interface ResolutionAvoidanceFlag {
  triggered: boolean;
  instances: { turn: number; quote: string; reason: string }[];
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
  /** Model that ran the SESSION (driver). */
  driverModel: string;
  /** Model that produced this evaluation (judge). */
  judgeModel: string;
  /** Number of turns in the transcript at evaluation time. */
  turnCount: number;
  cardShape: CardShape;
  /** Spine extraction: judge's one-sentence read of the character. */
  spine: string;
  /** Per-dimension scores keyed by dimension id (A1a, A1b, A2, ... B5). */
  scores: Record<string, DimensionScore>;
  flags: {
    A6_resolutionAvoidance: ResolutionAvoidanceFlag;
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
  };
  /** Raw judge text response (kept for transparency / debugging). */
  rawJudgeResponse: string;
  createdAt: number;
}
