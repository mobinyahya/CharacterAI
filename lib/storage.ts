import type {
  AppConfig,
  CharacterCard,
  Message,
  PromptPreset,
  Session,
  UserPersona,
} from "@/types";
import { DEFAULT_MODEL } from "@/types";
import { buildSeedCharacters } from "./seedData";
import { buildSeedPromptPresets } from "./seedPrompts";

const KEYS = {
  characters: "charai.characters.v1",
  personas: "charai.personas.v1",
  sessions: "charai.sessions.v1",
  config: "charai.config.v1",
  prompts: "charai.prompts.v1",
} as const;

const isBrowser = () => typeof window !== "undefined";

function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("Failed to persist", key, err);
  }
}

// ---------- Config ----------

export function getConfig(): AppConfig {
  return readJSON<AppConfig>(KEYS.config, {
    openRouterApiKey: "",
    defaultModel: DEFAULT_MODEL,
    hasSeeded: false,
  });
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig(), ...patch };
  writeJSON(KEYS.config, next);
  return next;
}

// ---------- Characters ----------

export function getCharacters(): CharacterCard[] {
  return readJSON<CharacterCard[]>(KEYS.characters, []);
}

export function getCharacter(id: string): CharacterCard | undefined {
  return getCharacters().find((c) => c.id === id);
}

export function saveCharacter(card: CharacterCard): CharacterCard {
  const all = getCharacters();
  const idx = all.findIndex((c) => c.id === card.id);
  const next = { ...card, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = next;
  } else {
    all.unshift(next);
  }
  writeJSON(KEYS.characters, all);
  return next;
}

export function deleteCharacter(id: string): void {
  const all = getCharacters().filter((c) => c.id !== id);
  writeJSON(KEYS.characters, all);
  const remainingSessions = getSessions().filter((s) => s.characterId !== id);
  writeJSON(KEYS.sessions, remainingSessions);
}

// ---------- Personas ----------

export function getPersonas(): UserPersona[] {
  return readJSON<UserPersona[]>(KEYS.personas, []);
}

export function getPersona(id: string): UserPersona | undefined {
  return getPersonas().find((p) => p.id === id);
}

export function savePersona(persona: UserPersona): UserPersona {
  const all = getPersonas();
  const idx = all.findIndex((p) => p.id === persona.id);
  const next = { ...persona, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = next;
  } else {
    all.unshift(next);
  }
  writeJSON(KEYS.personas, all);
  return next;
}

export function deletePersona(id: string): void {
  const all = getPersonas().filter((p) => p.id !== id);
  writeJSON(KEYS.personas, all);
}

// ---------- Sessions ----------

export function getSessions(): Session[] {
  return readJSON<Session[]>(KEYS.sessions, []).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

export function getSession(id: string): Session | undefined {
  return getSessions().find((s) => s.id === id);
}

export function saveSession(session: Session): Session {
  const all = readJSON<Session[]>(KEYS.sessions, []);
  const idx = all.findIndex((s) => s.id === session.id);
  const next = { ...session, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = next;
  } else {
    all.unshift(next);
  }
  writeJSON(KEYS.sessions, all);
  return next;
}

export function appendMessage(sessionId: string, message: Message): Session | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;
  const next: Session = {
    ...session,
    messages: [...session.messages, message],
    updatedAt: Date.now(),
  };
  return saveSession(next);
}

export function updateSessionMessages(
  sessionId: string,
  messages: Message[],
): Session | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;
  return saveSession({ ...session, messages, updatedAt: Date.now() });
}

export function deleteSession(id: string): void {
  const all = readJSON<Session[]>(KEYS.sessions, []).filter((s) => s.id !== id);
  writeJSON(KEYS.sessions, all);
}

// ---------- Prompt presets ----------

export function getPromptPresets(): PromptPreset[] {
  return readJSON<PromptPreset[]>(KEYS.prompts, []);
}

export function getPromptPreset(id: string): PromptPreset | undefined {
  return getPromptPresets().find((p) => p.id === id);
}

export function savePromptPreset(preset: PromptPreset): PromptPreset {
  const all = getPromptPresets();
  const idx = all.findIndex((p) => p.id === preset.id);
  const next = { ...preset, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = next;
  } else {
    all.unshift(next);
  }
  writeJSON(KEYS.prompts, all);
  return next;
}

export function deletePromptPreset(id: string): void {
  const all = getPromptPresets().filter((p) => p.id !== id);
  writeJSON(KEYS.prompts, all);
}

// ---------- Bulk ----------

export function clearAllData(): void {
  if (!isBrowser()) return;
  Object.values(KEYS).forEach((k) => window.localStorage.removeItem(k));
}

// ---------- Seeding ----------

export function ensureSeeded(): void {
  if (!isBrowser()) return;
  const config = getConfig();
  if (config.hasSeeded) return;
  const existingChars = getCharacters();
  if (existingChars.length === 0) {
    writeJSON(KEYS.characters, buildSeedCharacters());
  }
  const existingPresets = getPromptPresets();
  if (existingPresets.length === 0) {
    writeJSON(KEYS.prompts, buildSeedPromptPresets());
  }
  saveConfig({ hasSeeded: true });
}
