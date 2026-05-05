import type { PromptPreset, PromptPresetModule } from "@/types";
// JSON imports are resolved at build time via resolveJsonModule.
// These two files live at the project root in /prompts.
import basePromptJson from "../prompts/base_prompt.json";
import nsfwSystemJson from "../prompts/nsfw_system.json";

interface RawModule {
  name: string;
  description?: string;
  content: string;
  isCore?: boolean;
}

interface RawPromptJson {
  title: string;
  description?: string;
  author?: string;
  category?: string;
  tags?: string[];
  modules: RawModule[];
  recommendations?: {
    temperature?: string | number;
    contextTokens?: string | number;
    models?: string[];
    custom?: string;
  };
  anyModel?: boolean;
  meta?: {
    source?: string;
    version?: string;
    exportedAt?: string;
  };
}

/**
 * Strip rudimentary HTML and entities from the description fields used by the
 * source JSONs. We only want plain text for in-app display.
 */
function plainText(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const noTags = s.replace(/<[^>]+>/g, " ");
  const decoded = noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\s+/g, " ").trim() || undefined;
}

function slugify(s: string, fallback: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function normalizeModules(raw: RawModule[]): PromptPresetModule[] {
  const seen = new Map<string, number>();
  return raw.map((m, idx) => {
    const baseId = slugify(m.name || `module-${idx + 1}`, `module-${idx + 1}`);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
    return {
      id,
      name: m.name?.trim() || `Module ${idx + 1}`,
      description: m.description?.trim() || undefined,
      content: m.content ?? "",
      isCore: !!m.isCore,
    };
  });
}

function toPreset(raw: RawPromptJson, presetId: string): PromptPreset {
  const now = Date.now();
  const tempStr = raw.recommendations?.temperature;
  const recommendedTemperature =
    tempStr === undefined || tempStr === ""
      ? undefined
      : typeof tempStr === "number"
        ? tempStr
        : Number.isFinite(parseFloat(tempStr))
          ? parseFloat(tempStr)
          : undefined;
  return {
    id: presetId,
    title: raw.title?.trim() || "Untitled preset",
    description: plainText(raw.description),
    author: raw.author?.trim() || undefined,
    category: raw.category?.trim() || undefined,
    tags: raw.tags?.length ? raw.tags : undefined,
    modules: normalizeModules(raw.modules ?? []),
    recommendedTemperature,
    recommendedModels:
      raw.recommendations?.models && raw.recommendations.models.length
        ? raw.recommendations.models
        : undefined,
    builtIn: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSeedPromptPresets(): PromptPreset[] {
  return [
    toPreset(basePromptJson as RawPromptJson, "preset-base-narrator"),
    toPreset(nsfwSystemJson as RawPromptJson, "preset-nsfw-system"),
  ];
}

/**
 * Parses a raw JSON object (typically pasted into the import dialog) into a
 * PromptPreset. Throws if the JSON does not look like a prompt preset.
 */
export function importPromptPresetFromRaw(
  raw: unknown,
  id: string,
): PromptPreset {
  if (!raw || typeof raw !== "object") {
    throw new Error("Pasted JSON must be an object.");
  }
  const obj = raw as Partial<RawPromptJson>;
  if (!Array.isArray(obj.modules) || obj.modules.length === 0) {
    throw new Error('JSON must include a non-empty "modules" array.');
  }
  for (const m of obj.modules) {
    if (typeof m?.content !== "string" || !m.content.trim()) {
      throw new Error('Every module needs a non-empty "content" string.');
    }
  }
  const preset = toPreset(obj as RawPromptJson, id);
  return { ...preset, builtIn: false };
}
