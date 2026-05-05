"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ModelBadge, ModelSelector } from "@/components/ModelSelector";
import { PromptPresetSelector } from "@/components/PromptPresetSelector";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EvaluationPanel, EvaluationBadge } from "@/components/EvaluationPanel";
import {
  buildCharacterRequestMessages,
  fillCharacterTokens,
} from "@/lib/promptBuilder";
import { runAutopilotSession } from "@/lib/autopilot";
import { OpenRouterError, streamCompletion } from "@/lib/openrouter";
import {
  appendMessage,
  getConfig,
  getLatestEvaluationForSession,
  getPromptPresets,
  saveConfig,
  saveSession,
  updateSessionMessages,
} from "@/lib/storage";
import { downloadText, formatTime, uid } from "@/lib/utils";
import type {
  CharacterCard,
  EvaluationReport,
  Message,
  PromptPreset,
  Session,
  SessionPromptConfig,
  UserPersona,
} from "@/types";
import {
  ArrowLeft,
  Bot,
  Download,
  Gavel,
  Loader2,
  PlayCircle,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  StopCircle,
  Trash2,
  User as UserIcon,
} from "lucide-react";

interface ChatInterfaceProps {
  initialSession: Session;
  character: CharacterCard;
  persona?: UserPersona;
}

export function ChatInterface({
  initialSession,
  character,
  persona,
}: ChatInterfaceProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [session, setSession] = React.useState<Session>(initialSession);
  const [model, setModel] = React.useState(initialSession.model);
  const [promptConfig, setPromptConfig] = React.useState<
    SessionPromptConfig | undefined
  >(initialSession.promptConfig);
  const [presets, setPresets] = React.useState<PromptPreset[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [streamingRole, setStreamingRole] = React.useState<
    "user" | "assistant" | null
  >(null);
  const [streamingText, setStreamingText] = React.useState("");
  const [showSettings, setShowSettings] = React.useState(false);
  const [showEval, setShowEval] = React.useState(false);
  const [latestEval, setLatestEval] = React.useState<EvaluationReport | undefined>(
    undefined,
  );
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [autopilotTurns, setAutopilotTurns] = React.useState(5);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const isAutopilot = !!persona;
  const apiKey = React.useMemo(() => getConfig().openRouterApiKey, []);

  const refreshLatestEval = React.useCallback(() => {
    setLatestEval(getLatestEvaluationForSession(session.id));
  }, [session.id]);

  React.useEffect(() => {
    setPresets(getPromptPresets());
    refreshLatestEval();
  }, [refreshLatestEval]);

  const preset = presets.find((p) => p.id === promptConfig?.presetId);

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [session.messages.length, streamingText, scrollToBottom]);

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function persistMessages(next: Message[]) {
    const updated = updateSessionMessages(session.id, next);
    if (updated) setSession(updated);
  }

  function handleModelChange(next: string) {
    setModel(next);
    setSession((s) => {
      const updated = { ...s, model: next };
      saveSession(updated);
      return updated;
    });
  }

  function handlePromptConfigChange(next: SessionPromptConfig | undefined) {
    setPromptConfig(next);
    setSession((s) => {
      const updated = { ...s, promptConfig: next };
      saveSession(updated);
      return updated;
    });
  }

  function handleExport(format: "json" | "txt") {
    const stamp = new Date(session.createdAt).toISOString().slice(0, 10);
    const safe = character.name.replace(/[^\w-]+/g, "_");
    if (format === "json") {
      downloadText(
        `${safe}_${stamp}.json`,
        JSON.stringify(
          {
            character: {
              id: character.id,
              name: character.name,
              tags: character.tags,
            },
            persona: persona
              ? { id: persona.id, name: persona.name }
              : null,
            model: session.model,
            createdAt: session.createdAt,
            messages: session.messages,
          },
          null,
          2,
        ),
        "application/json",
      );
    } else {
      const lines = session.messages.map((m) => {
        const who =
          m.role === "assistant"
            ? character.name
            : m.role === "user"
              ? persona?.name ?? "User"
              : "System";
        return `[${who}]\n${m.content}\n`;
      });
      downloadText(
        `${safe}_${stamp}.txt`,
        `Character: ${character.name}\nModel: ${session.model}\nDate: ${new Date(session.createdAt).toLocaleString()}\n\n${lines.join("\n")}`,
        "text/plain",
      );
    }
  }

  function handleResetTranscript() {
    const initial = character.firstMessage
      ? [
          {
            id: uid(),
            role: "assistant" as const,
            content: fillCharacterTokens(
              character.firstMessage,
              character.name,
            ),
            timestamp: Date.now(),
          },
        ]
      : [];
    persistMessages(initial);
    setConfirmReset(false);
    toast({ title: "Conversation reset", variant: "success" });
  }

  async function handleManualSend() {
    if (!input.trim() || busy) return;
    if (!apiKey) {
      toast({
        title: "Add your API key in Settings.",
        variant: "error",
      });
      return;
    }
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    setInput("");
    const updatedSession = appendMessage(session.id, userMsg);
    if (updatedSession) setSession(updatedSession);

    const transcript = updatedSession?.messages ?? [...session.messages, userMsg];
    await streamCharacterReply(transcript);
  }

  async function streamCharacterReply(transcript: Message[]) {
    setBusy(true);
    setStreamingRole("assistant");
    setStreamingText("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const payload = buildCharacterRequestMessages(character, transcript, {
        preset,
        promptConfig,
      });
      const full = await streamCompletion({
        model,
        apiKey,
        messages: payload,
        signal: ctrl.signal,
        onChunk: (_delta, fullSoFar) => setStreamingText(fullSoFar),
      });
      const charMsg: Message = {
        id: uid(),
        role: "assistant",
        content: full.trim(),
        timestamp: Date.now(),
      };
      const next = [...transcript, charMsg];
      persistMessages(next);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg =
          err instanceof OpenRouterError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        toast({
          title: "Generation failed",
          description: msg,
          variant: "error",
        });
      }
    } finally {
      setBusy(false);
      setStreamingRole(null);
      setStreamingText("");
      abortRef.current = null;
    }
  }

  async function handleRegenerateLast() {
    if (busy) return;
    const msgs = [...session.messages];
    while (msgs.length > 0 && msgs[msgs.length - 1].role !== "assistant") {
      msgs.pop();
    }
    if (msgs.length === 0) return;
    msgs.pop();
    persistMessages(msgs);
    await streamCharacterReply(msgs);
  }

  async function handleAutopilot() {
    if (!persona) return;
    if (!apiKey) {
      toast({ title: "Add your API key in Settings.", variant: "error" });
      return;
    }
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let liveTranscript = [...session.messages];
    try {
      await runAutopilotSession(
        {
          session,
          character,
          persona,
          apiKey,
          userModel: session.userModel ?? model,
          characterModel: model,
          turns: autopilotTurns,
          preset,
          promptConfig,
          signal: ctrl.signal,
          delayBetweenTurnsMs: 500,
        },
        {
          onTurnStart: (_t, role) => {
            setStreamingRole(role);
            setStreamingText("");
          },
          onChunk: (_t, _role, _delta, full) => setStreamingText(full),
          onTurnComplete: (_t, _msg, transcript) => {
            liveTranscript = transcript;
            const updated = updateSessionMessages(session.id, transcript);
            if (updated) setSession(updated);
            setStreamingText("");
          },
          onComplete: () => {
            toast({
              title: `Auto-pilot complete (${autopilotTurns} turn${
                autopilotTurns === 1 ? "" : "s"
              })`,
              variant: "success",
            });
          },
          onError: (err) => {
            toast({
              title: "Auto-pilot failed",
              description: err.message,
              variant: "error",
            });
          },
        },
      );
    } catch {
      // Aborted — already handled
    } finally {
      setBusy(false);
      setStreamingRole(null);
      setStreamingText("");
      abortRef.current = null;
      // ensure persisted state reflects what we ran
      const updated = updateSessionMessages(session.id, liveTranscript);
      if (updated) setSession(updated);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            aria-label="Back"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar
            src={character.avatarUrl}
            name={character.name}
            size={36}
            className="shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">
                {character.name}
              </h2>
              <ModelBadge modelId={model} />
              {isAutopilot && (
                <Badge variant="default" className="text-[10px]">
                  Auto-pilot · {persona?.name}
                </Badge>
              )}
              {preset && (
                <Badge variant="outline" className="text-[10px]">
                  Narrator · {preset.title}
                </Badge>
              )}
              <EvaluationBadge report={latestEval} />
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {session.messages.length} message
              {session.messages.length === 1 ? "" : "s"} ·{" "}
              {new Date(session.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEval(true)}
            disabled={session.messages.length < 2}
            title="Run LLM-judge evaluation on this transcript"
          >
            <Gavel className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Evaluate</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset transcript"
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            title="Reset transcript"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            onClick={() => setShowSettings(true)}
            title="Session settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {session.messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              character={character}
              persona={persona}
            />
          ))}
          {streamingRole && (
            <MessageBubble
              streaming
              message={{
                id: "streaming",
                role: streamingRole,
                content: streamingText || "…",
                timestamp: Date.now(),
              }}
              character={character}
              persona={persona}
            />
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card/40 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {isAutopilot ? (
            <AutopilotComposer
              busy={busy}
              turns={autopilotTurns}
              onTurnsChange={setAutopilotTurns}
              onRun={handleAutopilot}
              onStop={handleStop}
            />
          ) : (
            <ManualComposer
              value={input}
              onChange={setInput}
              busy={busy}
              onSend={handleManualSend}
              onStop={handleStop}
              onRegenerate={handleRegenerateLast}
              hasMessages={session.messages.some(
                (m) => m.role === "assistant",
              )}
            />
          )}
        </div>
      </div>

      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Session settings"
        className="max-w-xl"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Model
            </div>
            <ModelSelector value={model} onChange={handleModelChange} showBadge />
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Default model
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                saveConfig({ defaultModel: model });
                toast({ title: "Saved as default", variant: "success" });
              }}
            >
              Save current model as default
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Narrator prompt preset
            </div>
            <PromptPresetSelector
              presets={presets}
              config={promptConfig}
              onChange={handlePromptConfigChange}
              compact
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Export
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("json")}
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("txt")}
              >
                <Download className="h-3.5 w-3.5" />
                Plain text
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Character
            </div>
            <Link
              href={`/characters/${character.id}/edit`}
              className="text-sm text-foreground underline underline-offset-2"
            >
              Open character spec →
            </Link>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset this conversation?"
        description="The transcript will be wiped and replaced with the character's first message."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleResetTranscript}>
            Reset
          </Button>
        </div>
      </Dialog>

      <EvaluationPanel
        open={showEval}
        onClose={() => setShowEval(false)}
        session={session}
        character={character}
        persona={persona}
        onChange={refreshLatestEval}
      />
    </div>
  );
}

function MessageBubble({
  message,
  character,
  persona,
  streaming,
}: {
  message: Message;
  character: CharacterCard;
  persona?: UserPersona;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const name = isUser ? persona?.name ?? "You" : character.name;
  const avatar = isUser ? persona?.avatarUrl : character.avatarUrl;

  return (
    <div
      className={`flex gap-3 animate-fade-in ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      <Avatar
        src={avatar}
        name={name}
        size={32}
        className={isUser ? "" : "ring-primary/30"}
      />
      <div
        className={`flex max-w-[88%] flex-col ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{name}</span>
          <span>{formatTime(message.timestamp)}</span>
          {isUser ? (
            <UserIcon className="h-3 w-3" />
          ) : (
            <Bot className="h-3 w-3" />
          )}
        </div>
        <div
          className={`rounded-2xl px-4 py-3 text-sm prose-message ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card text-card-foreground border border-border"
          } ${streaming ? "animate-pulse-soft" : ""}`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function ManualComposer({
  value,
  onChange,
  busy,
  onSend,
  onStop,
  onRegenerate,
  hasMessages,
}: {
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  onSend: () => void;
  onStop: () => void;
  onRegenerate: () => void;
  hasMessages: boolean;
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a reply… (Enter to send, Shift+Enter for newline)"
          className="min-h-[60px] flex-1 resize-none"
          disabled={busy}
        />
        {busy ? (
          <Button onClick={onStop} variant="destructive">
            <StopCircle className="h-4 w-4" />
            Stop
          </Button>
        ) : (
          <Button onClick={onSend} disabled={!value.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Manual mode — you type, the character replies.</span>
        {hasMessages && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate last reply
          </button>
        )}
      </div>
    </div>
  );
}

function AutopilotComposer({
  busy,
  turns,
  onTurnsChange,
  onRun,
  onStop,
}: {
  busy: boolean;
  turns: number;
  onTurnsChange: (n: number) => void;
  onRun: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <span className="text-muted-foreground">Run</span>
          <Input
            type="number"
            min={1}
            max={50}
            value={turns}
            onChange={(e) =>
              onTurnsChange(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
            }
            className="h-7 w-16 px-1 text-center text-sm"
            disabled={busy}
          />
          <span className="text-muted-foreground">turn{turns === 1 ? "" : "s"}</span>
        </div>
        {busy ? (
          <Button onClick={onStop} variant="destructive" className="flex-1">
            <StopCircle className="h-4 w-4" />
            Stop auto-pilot
          </Button>
        ) : (
          <Button onClick={onRun} className="flex-1">
            <PlayCircle className="h-4 w-4" />
            Run auto-pilot
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {busy ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Streaming turn-by-turn…
          </span>
        ) : (
          <span>
            Each turn = one user message + one character reply, generated by
            LLMs. Stop anytime.
          </span>
        )}
      </p>
    </div>
  );
}
