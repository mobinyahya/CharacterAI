import type {
  CharacterCard,
  Message,
  OpenRouterMessage,
  PromptPreset,
  SessionPromptConfig,
  UserPersona,
} from "@/types";

const USER_TOKEN = "{{user}}";
const CHAR_TOKEN = "{{char}}";

const USER_DEFAULT = "You";

function fillTokens(
  text: string,
  characterName: string,
  userName: string,
): string {
  return text
    .replaceAll(USER_TOKEN, userName)
    .replaceAll(CHAR_TOKEN, characterName);
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

/**
 * Returns the active modules for a preset given the user's session-level
 * selection of optional modules. Core modules are always active.
 */
export function activeModules(
  preset: PromptPreset,
  enabledOptionalIds: string[] | undefined,
) {
  const enabled = new Set(enabledOptionalIds ?? []);
  return preset.modules.filter((m) => m.isCore || enabled.has(m.id));
}

/**
 * Composes the text for a prompt preset given the user's enabled optional
 * modules. Returns an empty string if no modules are active.
 */
export function composePresetText(
  preset: PromptPreset | undefined,
  config: SessionPromptConfig | undefined,
  characterName: string,
  userName: string = USER_DEFAULT,
): string {
  if (!preset) return "";
  const modules = activeModules(
    preset,
    config?.presetId === preset.id ? config.enabledModuleIds : undefined,
  );
  if (modules.length === 0) return "";
  const parts = modules.map((m) =>
    fillTokens(m.content.trim(), characterName, userName),
  );
  return parts.join("\n\n");
}

export function buildCharacterSystemPrompt(
  card: CharacterCard,
  options: {
    preset?: PromptPreset;
    promptConfig?: SessionPromptConfig;
    userName?: string;
  } = {},
): string {
  const userName = options.userName ?? USER_DEFAULT;
  const filledCard = fillTokens(card.systemPrompt.trim(), card.name, userName);

  const presetText = composePresetText(
    options.preset,
    options.promptConfig,
    card.name,
    userName,
  );

  const sections: string[] = [];
  if (presetText) {
    sections.push(`# Narrator system prompt\n${presetText}`);
  }
  sections.push(`# Character\n${filledCard}`);
  sections.push(CHARACTER_FORMATTING_RULES);
  return sections.join("\n\n---\n\n");
}

export function buildPersonaSystemPrompt(
  persona: UserPersona,
  characterName: string,
  userName: string = USER_DEFAULT,
): string {
  const filled = fillTokens(persona.systemPrompt.trim(), characterName, userName);
  return `You are roleplaying as the USER in a chat with ${characterName}.\n\n${filled}\n\n${PERSONA_FORMATTING_RULES}`;
}

export function buildMessageHistory(
  messages: Message[],
  characterName: string,
  userName: string = USER_DEFAULT,
): OpenRouterMessage[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: fillTokens(m.content, characterName, userName),
    }));
}

/**
 * Some providers (notably Anthropic via OpenRouter) require the first
 * non-system message to be from the user. Character chats often start with
 * the character's first message (assistant), which trips that constraint.
 * If we detect a leading assistant message, prepend a tiny synthetic user
 * message to satisfy the contract without polluting the visible transcript.
 */
function ensureLeadingUserMessage(
  messages: OpenRouterMessage[],
): OpenRouterMessage[] {
  if (messages.length === 0) return messages;
  if (messages[0].role !== "assistant") return messages;
  return [{ role: "user", content: "[Scene begins.]" }, ...messages];
}

/**
 * Builds the request payload for the CHARACTER LLM call.
 * The character is the "assistant" in the OpenRouter request.
 */
export function buildCharacterRequestMessages(
  card: CharacterCard,
  messages: Message[],
  options: {
    preset?: PromptPreset;
    promptConfig?: SessionPromptConfig;
    userName?: string;
  } = {},
): OpenRouterMessage[] {
  const userName = options.userName ?? USER_DEFAULT;
  return [
    {
      role: "system",
      content: buildCharacterSystemPrompt(card, options),
    },
    ...ensureLeadingUserMessage(buildMessageHistory(messages, card.name, userName)),
  ];
}

/**
 * Builds the request payload for the USER-PERSONA LLM call.
 * In the persona's perspective the CHARACTER is the "assistant" they're chatting with,
 * and the persona itself is the "user". So we flip the roles in the history.
 *
 * The narrator/preset prompt is intentionally NOT included here — it governs
 * how the *character* narrates, not how the user-persona behaves.
 */
export function buildPersonaRequestMessages(
  persona: UserPersona,
  card: CharacterCard,
  messages: Message[],
  userName: string = USER_DEFAULT,
): OpenRouterMessage[] {
  const flipped: OpenRouterMessage[] = messages
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

export function fillCharacterTokens(
  text: string,
  characterName: string,
  userName: string = USER_DEFAULT,
): string {
  return fillTokens(text, characterName, userName);
}
