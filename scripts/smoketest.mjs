/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Static smoke test — does not call OpenRouter.
 *
 * Builds the exact request payloads the app would send for:
 *   - a manual user reply to Vincent (no preset)
 *   - a manual user reply to Vincent (base_prompt preset, +RELATIONSHIPS module)
 *   - an auto-pilot turn with a "Genre-Deflater" persona
 *
 * Prints the system prompts and message sequences so we can verify they look right.
 *
 * Run with: node --experimental-vm-modules scripts/smoketest.mjs
 *           (or just `node scripts/smoketest.mjs`)
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Use tsx-equivalent: register a TypeScript loader. We can't easily do this
// without an extra dep, so instead we re-implement the seed + builder logic
// in plain JS by importing the compiled JSON and re-deriving everything.

import basePromptJson from "../prompts/base_prompt.json" with { type: "json" };
import nsfwSystemJson from "../prompts/nsfw_system.json" with { type: "json" };

// ---------- minimal copies of types/builder logic (kept in sync with src) ----------

function fillTokens(text, characterName, userName) {
  return text
    .replaceAll("{{user}}", userName)
    .replaceAll("{{char}}", characterName);
}

function slugify(s, fallback) {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function normalizeModules(raw) {
  const seen = new Map();
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

function toPreset(raw, presetId) {
  return {
    id: presetId,
    title: raw.title,
    description: raw.description,
    author: raw.author,
    modules: normalizeModules(raw.modules ?? []),
    builtIn: true,
  };
}

const basePreset = toPreset(basePromptJson, "preset-base-narrator");
const nsfwPreset = toPreset(nsfwSystemJson, "preset-nsfw-system");

function activeModules(preset, enabledOptionalIds) {
  const enabled = new Set(enabledOptionalIds ?? []);
  return preset.modules.filter((m) => m.isCore || enabled.has(m.id));
}

function composePresetText(preset, config, characterName, userName = "You") {
  if (!preset) return "";
  const mods = activeModules(
    preset,
    config?.presetId === preset.id ? config.enabledModuleIds : undefined,
  );
  return mods
    .map((m) => fillTokens(m.content.trim(), characterName, userName))
    .join("\n\n");
}

const CHARACTER_FORMATTING_RULES = `# Output rules
- Stay fully in character. Never reveal you are an AI; refuse meta questions in-character.
- Speak the character's dialogue in plain double quotes.
- Use third-person past- or present-tense narration around dialogue for action, posture, body language and the environment.
- Never narrate the user's internal thoughts and never speak for the user.
- Keep replies focused: usually 1-3 short paragraphs. Longer is fine when the scene earns it.
- Do not break the fourth wall. Do not output system, model, or rubric language.`;

const PERSONA_FORMATTING_RULES = `# Output rules — you are the USER in this chat
- Stay in first person as the user described above. Do NOT play the character.
- Never address the model, the system, or the rubric. Do not break character.
- Each of your turns is exactly one user message in the chat — usually 1-3 sentences. Longer only when the scene demands it.
- Do not narrate the character's actions or internal state. Only your own words and (sparingly) your own actions in *italics* if needed.
- Drive the conversation in the direction your persona would take it.`;

function buildCharacterSystemPrompt(card, options = {}) {
  const userName = options.userName ?? "You";
  const filledCard = fillTokens(card.systemPrompt.trim(), card.name, userName);
  const presetText = composePresetText(
    options.preset,
    options.promptConfig,
    card.name,
    userName,
  );
  const sections = [];
  if (presetText) sections.push(`# Narrator system prompt\n${presetText}`);
  sections.push(`# Character\n${filledCard}`);
  sections.push(CHARACTER_FORMATTING_RULES);
  return sections.join("\n\n---\n\n");
}

function buildPersonaSystemPrompt(persona, characterName, userName = "You") {
  const filled = fillTokens(persona.systemPrompt.trim(), characterName, userName);
  return `You are roleplaying as the USER in a chat with ${characterName}.\n\n${filled}\n\n${PERSONA_FORMATTING_RULES}`;
}

function buildMessageHistory(messages, characterName, userName = "You") {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: fillTokens(m.content, characterName, userName),
    }));
}

function ensureLeadingUserMessage(messages) {
  if (messages.length === 0 || messages[0].role !== "assistant") return messages;
  return [{ role: "user", content: "[Scene begins.]" }, ...messages];
}

function buildCharacterRequestMessages(card, messages, options = {}) {
  return [
    { role: "system", content: buildCharacterSystemPrompt(card, options) },
    ...ensureLeadingUserMessage(buildMessageHistory(messages, card.name, options.userName)),
  ];
}

function buildPersonaRequestMessages(persona, card, messages, userName = "You") {
  const flipped = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "assistant" : "user",
      content: fillTokens(m.content, card.name, userName),
    }));
  return [
    {
      role: "system",
      content: buildPersonaSystemPrompt(persona, card.name, userName),
    },
    ...ensureLeadingUserMessage(flipped),
  ];
}

// ---------- fixtures ----------

const VINCENT_CARD = {
  id: "vincent",
  name: "Vincent Moreau",
  systemPrompt: `You are roleplaying as Vincent Moreau, a wealthy 22-year-old narcissistic university student who blackmails {{user}} for entertainment. Mockingly affectionate when {{user}} complies, amused-cold when they resist.

# Identity (abbreviated for smoke test)
- Old money, only child, no consequences for anything growing up.
- Performs "perfect son" around his parents; drops it instantly when they leave.

# With {{user}}
- Calls them "sugar" / "sweetheart" / "honey" — always condescending.
- Engineers impossible demands so he has an excuse to "punish" them. Vehemently denies that's what he's doing.

# When cornered
- Profanity spikes. Looms, grabs wrists, blocks doorways before any actual contact.

# Limits
- Will not physically beat {{user}} bloody (internal-value).
- Polished-gentleman act non-negotiable around parents (external-authority).

# Secret
- He's started looking for {{user}} in rooms before he's aware he's doing it.`,
  firstMessage:
    'Vincent leans against the billiard table, eyes half-lidded. "You\'re late, sugar." He plucks a cigarette from the pack {{user}} just brought. "Light it up."',
};

const GENRE_DEFLATER_PERSONA = {
  id: "deflater",
  name: "Genre-Deflater",
  systemPrompt: `Your goal: refuse the genre contract entirely. You are uninterested in whatever dynamic {{char}} is trying to establish. You have other things to do, somewhere else to be, and you treat their escalations as obstacles to escape rather than situations to engage with. Be polite but disengaged. Do not be intimidated into compliance. Do not become curious about {{char}}. Do not soften.`,
};

// Simulated transcript after 1 user reply.
const baseTranscript = [
  {
    id: "m1",
    role: "assistant",
    content: VINCENT_CARD.firstMessage.replaceAll("{{user}}", "You"),
    timestamp: 0,
  },
];

// ---------- test cases ----------

function divider(label) {
  console.log("\n" + "═".repeat(80));
  console.log("  " + label);
  console.log("═".repeat(80));
}

function dumpPayload(label, payload) {
  console.log(`\n--- ${label} ---`);
  payload.forEach((m, i) => {
    const head = `[${i}] role=${m.role}  (${m.content.length} chars)`;
    console.log(head);
    const preview = m.content.length > 280 ? m.content.slice(0, 280) + " …" : m.content;
    console.log(preview.split("\n").map((l) => "    " + l).join("\n"));
  });
}

// ── Case 1: manual user reply, no preset ──────────────────────────
divider("Case 1: Manual reply to Vincent (NO preset)");
{
  const transcript = [
    ...baseTranscript,
    { id: "m2", role: "user", content: "Light your own damn cigarette.", timestamp: 1 },
  ];
  const payload = buildCharacterRequestMessages(VINCENT_CARD, transcript);
  console.log(`Payload size: ${payload.length} messages`);
  dumpPayload("character call", payload);
}

// ── Case 2: manual reply, base_prompt preset + RELATIONSHIPS module ──
divider("Case 2: Manual reply to Vincent (base_prompt preset + RELATIONSHIPS)");
{
  const relationships = basePreset.modules.find((m) =>
    /relationship/i.test(m.name),
  );
  const config = {
    presetId: basePreset.id,
    enabledModuleIds: relationships ? [relationships.id] : [],
  };
  const transcript = [
    ...baseTranscript,
    { id: "m2", role: "user", content: "Light your own damn cigarette.", timestamp: 1 },
  ];
  const payload = buildCharacterRequestMessages(VINCENT_CARD, transcript, {
    preset: basePreset,
    promptConfig: config,
  });
  const sys = payload[0].content;
  console.log(`System message length: ${sys.length} chars`);
  console.log(`Modules included (cores + selected):`);
  for (const m of activeModules(basePreset, config.enabledModuleIds)) {
    console.log(`   - ${m.isCore ? "[CORE] " : "[OPT]  "}${m.name}`);
  }
  dumpPayload("character call (head only)", payload);
}

// ── Case 3: auto-pilot turn with Genre-Deflater persona ───────────
divider("Case 3: Auto-pilot turn — Genre-Deflater calling user-side, Vincent calling character-side");
{
  // The persona is called first to generate a USER message.
  const personaPayload = buildPersonaRequestMessages(
    GENRE_DEFLATER_PERSONA,
    VINCENT_CARD,
    baseTranscript,
  );
  console.log("\n** Persona-LLM call (generates user message) **");
  console.log(`Payload size: ${personaPayload.length} messages`);
  console.log("Roles:", personaPayload.map((m) => m.role).join(" → "));
  dumpPayload("persona call", personaPayload);

  // Imagine the persona returned this:
  const simulatedUser = {
    id: "m2",
    role: "user",
    content:
      "I have to study. Light it yourself, I'm not staying.",
    timestamp: 1,
  };
  const afterUser = [...baseTranscript, simulatedUser];

  // Now the character is called with the preset.
  const charPayload = buildCharacterRequestMessages(VINCENT_CARD, afterUser, {
    preset: basePreset,
    promptConfig: {
      presetId: basePreset.id,
      enabledModuleIds: [],
    },
  });
  console.log("\n** Character-LLM call (generates Vincent's reply) **");
  console.log(`Payload size: ${charPayload.length} messages`);
  console.log("Roles:", charPayload.map((m) => m.role).join(" → "));
  dumpPayload("character call", charPayload);
}

// ── Case 4: Anthropic-safety check — leading-assistant message ─────
divider("Case 4: Leading-assistant safety net");
{
  const payload = buildCharacterRequestMessages(VINCENT_CARD, baseTranscript);
  console.log("Roles:", payload.map((m) => m.role).join(" → "));
  console.log(
    `First non-system role: ${payload[1]?.role}  (should be 'user')`,
  );
}

// ── Case 5: Token expansion ────────────────────────────────────────
divider("Case 5: Token expansion {{user}} / {{char}}");
{
  const sysText = buildCharacterSystemPrompt(VINCENT_CARD);
  const hasUserToken = sysText.includes("{{user}}");
  const hasCharToken = sysText.includes("{{char}}");
  console.log(`{{user}} still present? ${hasUserToken}  (should be false)`);
  console.log(`{{char}} still present? ${hasCharToken}  (should be false)`);
}

console.log("\nSmoke test complete.\n");
