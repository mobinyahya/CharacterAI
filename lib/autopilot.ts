import type {
  CharacterCard,
  Message,
  PromptPreset,
  Session,
  SessionPromptConfig,
  UserPersona,
} from "@/types";
import {
  buildCharacterRequestMessages,
  buildPersonaRequestMessages,
} from "./promptBuilder";
import { streamCompletion } from "./openrouter";
import { uid } from "./utils";

export interface AutopilotCallbacks {
  onTurnStart?: (turn: number, role: "user" | "assistant") => void;
  onChunk?: (
    turn: number,
    role: "user" | "assistant",
    delta: string,
    full: string,
  ) => void;
  onTurnComplete?: (
    turn: number,
    message: Message,
    transcript: Message[],
  ) => void;
  onComplete?: (transcript: Message[]) => void;
  onError?: (err: Error) => void;
}

export interface AutopilotSessionOptions {
  session: Session;
  character: CharacterCard;
  persona: UserPersona;
  apiKey: string;
  /** LLM that generates the USER side (driven by the persona prompt). */
  userModel: string;
  /** LLM that generates the CHARACTER side (driven by the card). */
  characterModel: string;
  turns: number;
  preset?: PromptPreset;
  promptConfig?: SessionPromptConfig;
  signal?: AbortSignal;
  delayBetweenTurnsMs?: number;
}

interface SingleTurnArgs {
  current: Message[];
  character: CharacterCard;
  persona: UserPersona;
  apiKey: string;
  userModel: string;
  characterModel: string;
  turnIndex: number;
  preset?: PromptPreset;
  promptConfig?: SessionPromptConfig;
  signal?: AbortSignal;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  });
}

/**
 * Runs a single auto-pilot exchange:
 *   1) the persona-LLM produces a USER message
 *   2) the character-LLM responds as the CHARACTER
 */
export async function runAutopilotTurn(
  args: SingleTurnArgs,
  cb: AutopilotCallbacks,
): Promise<Message[]> {
  const {
    current,
    character,
    persona,
    apiKey,
    userModel,
    characterModel,
    preset,
    promptConfig,
    signal,
    turnIndex,
  } = args;

  // Step 1: persona-LLM generates the USER turn.
  cb.onTurnStart?.(turnIndex, "user");
  const personaPayload = buildPersonaRequestMessages(persona, character, current);
  const userText = await streamCompletion({
    model: userModel,
    apiKey,
    messages: personaPayload,
    signal,
    onChunk: (delta, full) => cb.onChunk?.(turnIndex, "user", delta, full),
  });
  const userMessage: Message = {
    id: uid(),
    role: "user",
    content: userText.trim(),
    timestamp: Date.now(),
  };
  const afterUser = [...current, userMessage];
  cb.onTurnComplete?.(turnIndex, userMessage, afterUser);

  // Step 2: character-LLM responds.
  cb.onTurnStart?.(turnIndex, "assistant");
  const charPayload = buildCharacterRequestMessages(character, afterUser, {
    preset,
    promptConfig,
  });
  const charText = await streamCompletion({
    model: characterModel,
    apiKey,
    messages: charPayload,
    signal,
    onChunk: (delta, full) => cb.onChunk?.(turnIndex, "assistant", delta, full),
  });
  const charMessage: Message = {
    id: uid(),
    role: "assistant",
    content: charText.trim(),
    timestamp: Date.now(),
  };
  const afterChar = [...afterUser, charMessage];
  cb.onTurnComplete?.(turnIndex, charMessage, afterChar);

  return afterChar;
}

/**
 * Runs N auto-pilot turns in sequence.
 * Each "turn" = one user message + one character message.
 */
export async function runAutopilotSession(
  options: AutopilotSessionOptions,
  cb: AutopilotCallbacks,
): Promise<Message[]> {
  const {
    session,
    character,
    persona,
    apiKey,
    userModel,
    characterModel,
    turns,
    preset,
    promptConfig,
    signal,
    delayBetweenTurnsMs = 500,
  } = options;

  let transcript = [...session.messages];

  try {
    for (let i = 0; i < turns; i++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      transcript = await runAutopilotTurn(
        {
          current: transcript,
          character,
          persona,
          apiKey,
          userModel,
          characterModel,
          preset,
          promptConfig,
          turnIndex: i,
          signal,
        },
        cb,
      );
      if (i < turns - 1) {
        await delay(delayBetweenTurnsMs, signal);
      }
    }
    cb.onComplete?.(transcript);
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      cb.onError?.(err as Error);
    }
    throw err;
  }
  return transcript;
}
