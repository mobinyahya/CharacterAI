import type { OpenRouterMessage } from "@/types";
import { DEFAULT_MODEL } from "@/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "OpenRouterError";
  }
}

export interface StreamCompletionArgs {
  model: string;
  messages: OpenRouterMessage[];
  apiKey: string;
  signal?: AbortSignal;
  temperature?: number;
  onChunk?: (delta: string, full: string) => void;
  onDone?: (full: string) => void;
}

function classifyHttpError(status: number, body: unknown): OpenRouterError {
  const msg = extractMessage(body);
  if (status === 401)
    return new OpenRouterError(
      msg || "Invalid OpenRouter API key. Check Settings.",
      401,
      "invalid_key",
    );
  if (status === 402)
    return new OpenRouterError(
      msg || "Insufficient credits on this OpenRouter key.",
      402,
      "insufficient_credits",
    );
  if (status === 404)
    return new OpenRouterError(
      msg || "Model not found on OpenRouter.",
      404,
      "model_not_found",
    );
  if (status === 429)
    return new OpenRouterError(
      msg || "Rate limited by the upstream provider. Try again shortly.",
      429,
      "rate_limited",
    );
  return new OpenRouterError(
    msg || `OpenRouter error (status ${status}).`,
    status,
  );
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { error?: { message?: string }; message?: string };
  return b.error?.message ?? b.message;
}

export async function streamCompletion({
  model,
  messages,
  apiKey,
  signal,
  temperature,
  onChunk,
  onDone,
}: StreamCompletionArgs): Promise<string> {
  if (!apiKey) {
    throw new OpenRouterError(
      "Missing OpenRouter API key. Add one in Settings.",
      0,
      "no_key",
    );
  }

  const referer =
    typeof window !== "undefined" ? window.location.origin : "https://localhost";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": referer,
      "X-Title": "CharacterAI",
    },
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(temperature !== undefined ? { temperature } : {}),
    }),
  });

  if (!res.ok) {
    let payload: unknown = undefined;
    try {
      payload = await res.json();
    } catch {
      try {
        payload = { message: await res.text() };
      } catch {
        /* noop */
      }
    }
    throw classifyHttpError(res.status, payload);
  }

  if (!res.body) {
    throw new OpenRouterError("Streaming not supported by response.", 0);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: events separated by \n\n. Each event has lines like "data: {...}".
    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const eventStr = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const lines = eventStr.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta: string =
            json?.choices?.[0]?.delta?.content ??
            json?.choices?.[0]?.message?.content ??
            "";
          if (delta) {
            full += delta;
            onChunk?.(delta, full);
          }
        } catch {
          // Sometimes OpenRouter sends keep-alive comments; ignore parse errors.
        }
      }

      sepIdx = buffer.indexOf("\n\n");
    }
  }

  onDone?.(full);
  return full;
}

export async function testApiKey(
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await streamCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: "Reply with the single word: pong." },
        { role: "user", content: "ping" },
      ],
    });
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error contacting OpenRouter";
    return { ok: false, error: message };
  }
}
