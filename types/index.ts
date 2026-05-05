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

export interface Session {
  id: string;
  characterId: string;
  personaId?: string;
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

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
