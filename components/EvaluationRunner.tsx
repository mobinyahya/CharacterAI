"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ModelBadge, ModelSelector } from "@/components/ModelSelector";
import { PromptPresetSelector } from "@/components/PromptPresetSelector";
import { EvaluationReportView } from "@/components/EvaluationReportView";
import {
  EVAL_PERSONAS,
  type EvalPersona,
  resolveEvalPersona,
  suggestInjectionsFromCard,
} from "@/lib/evalPersonas";
import { runAutopilotSession } from "@/lib/autopilot";
import { runEvaluation } from "@/lib/evaluation";
import { OpenRouterError } from "@/lib/openrouter";
import { fillCharacterTokens } from "@/lib/promptBuilder";
import {
  getCharacters,
  getConfig,
  getPersonas,
  getPromptPresets,
  saveEvaluation,
  saveSession,
} from "@/lib/storage";
import { formatTime, uid } from "@/lib/utils";
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
  DEFAULT_JUDGE_MODEL,
  DEFAULT_MODEL,
  JUDGE_MODELS,
} from "@/types";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gavel,
  Library,
  Loader2,
  PlayCircle,
  RefreshCcw,
  StopCircle,
  Target,
  User as UserIcon,
} from "lucide-react";

// ============================================================================
// Persona option (catalog OR library) — unified shape for the selector.
// ============================================================================

type PersonaOption =
  | { source: "catalog"; persona: EvalPersona }
  | { source: "library"; persona: UserPersona };

function optionKey(o: PersonaOption): string {
  return `${o.source}:${o.persona.id}`;
}

function optionName(o: PersonaOption): string {
  return o.persona.name;
}

function optionDescription(o: PersonaOption): string {
  return (
    (o.source === "catalog"
      ? o.persona.description
      : o.persona.description) ?? ""
  );
}

// ============================================================================
// Phase state
// ============================================================================

type Phase =
  | { kind: "configure" }
  | {
      kind: "running";
      stage: "autopilot" | "judging";
      session: Session;
      transcript: Message[];
      streamingRole: "user" | "assistant" | null;
      streamingText: string;
      currentTurn: number;
      turnsTotal: number;
      judgeText: string;
    }
  | {
      kind: "done";
      session: Session;
      transcript: Message[];
      report: EvaluationReport;
      character: CharacterCard;
      persona: UserPersona;
    };

// ============================================================================
// Component
// ============================================================================

export function EvaluationRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // ---- Library state (loaded once) ----
  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [personas, setPersonas] = React.useState<UserPersona[]>([]);
  const [presets, setPresets] = React.useState<PromptPreset[]>([]);
  const [hasKey, setHasKey] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // ---- Configure form state ----
  const [characterId, setCharacterId] = React.useState<string>("");
  const [optionKeyState, setOptionKeyState] = React.useState<string>(
    `catalog:${EVAL_PERSONAS[0].id}`,
  );
  const [injections, setInjections] = React.useState<Record<string, string>>(
    {},
  );
  const [turns, setTurns] = React.useState<number>(15);
  const [userModel, setUserModel] = React.useState<string>(DEFAULT_MODEL);
  const [characterModel, setCharacterModel] =
    React.useState<string>(DEFAULT_MODEL);
  const [judgeModel, setJudgeModel] =
    React.useState<string>(DEFAULT_JUDGE_MODEL);
  const [promptConfig, setPromptConfig] = React.useState<
    SessionPromptConfig | undefined
  >(undefined);

  // ---- Phase ----
  const [phase, setPhase] = React.useState<Phase>({ kind: "configure" });
  const abortRef = React.useRef<AbortController | null>(null);

  // ---- Initial load ----
  React.useEffect(() => {
    const cs = getCharacters();
    const ps = getPersonas();
    const pp = getPromptPresets();
    const cfg = getConfig();
    setCharacters(cs);
    setPersonas(ps);
    setPresets(pp);
    setHasKey(!!cfg.openRouterApiKey);
    const defaultDriver = cfg.defaultModel || DEFAULT_MODEL;
    setUserModel(defaultDriver);
    setCharacterModel(defaultDriver);

    const preselect = searchParams?.get("characterId");
    if (preselect && cs.find((c) => c.id === preselect)) {
      setCharacterId(preselect);
    } else if (cs.length > 0) {
      setCharacterId(cs[0].id);
    }
    setLoaded(true);
  }, [searchParams]);

  // ---- Cleanup ----
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // ---- Derived selections ----
  const character = characters.find((c) => c.id === characterId);
  const personaOptions: PersonaOption[] = React.useMemo(
    () => [
      ...EVAL_PERSONAS.map<PersonaOption>((p) => ({
        source: "catalog",
        persona: p,
      })),
      ...personas.map<PersonaOption>((p) => ({
        source: "library",
        persona: p,
      })),
    ],
    [personas],
  );
  const selectedOption = personaOptions.find(
    (o) => optionKey(o) === optionKeyState,
  );
  const selectedCatalog =
    selectedOption?.source === "catalog" ? selectedOption.persona : null;
  const preset = presets.find((p) => p.id === promptConfig?.presetId);

  // ---- Auto-fill injections when character or catalog persona changes ----
  React.useEffect(() => {
    if (!selectedCatalog || !character) return;
    if (selectedCatalog.injectionFields.length === 0) {
      setInjections({});
      return;
    }
    const suggested = suggestInjectionsFromCard(selectedCatalog, character);
    setInjections(suggested);
  }, [selectedCatalog, character]);

  // ---- Sync turn count to recommended default when persona changes ----
  React.useEffect(() => {
    if (selectedCatalog?.recommendedTurns?.default) {
      setTurns(selectedCatalog.recommendedTurns.default);
    }
  }, [selectedCatalog]);

  // ---- Run handler ----
  async function handleStart() {
    if (!character) {
      toast({ title: "Pick a character first.", variant: "error" });
      return;
    }
    if (!hasKey) {
      toast({
        title: "Add your OpenRouter API key in Settings before running.",
        variant: "error",
      });
      router.push("/settings");
      return;
    }
    if (!selectedOption) {
      toast({ title: "Pick a persona first.", variant: "error" });
      return;
    }

    // Resolve the persona — synthesized for catalog, raw for library.
    const persona: UserPersona =
      selectedOption.source === "catalog"
        ? resolveEvalPersona(selectedOption.persona, injections)
        : selectedOption.persona;

    // Build the snapshot we'll persist on the Session for traceability.
    const snapshot =
      selectedOption.source === "catalog"
        ? {
            source: "eval-catalog" as const,
            catalogId: selectedOption.persona.id,
            name: selectedOption.persona.name,
            systemPrompt: persona.systemPrompt,
            injections: { ...injections },
          }
        : {
            source: "library" as const,
            libraryId: selectedOption.persona.id,
            name: selectedOption.persona.name,
            systemPrompt: persona.systemPrompt,
          };

    // Seed the session with the character's first message, just like manual chat.
    const now = Date.now();
    const initial: Message[] = character.firstMessage
      ? [
          {
            id: uid(),
            role: "assistant" as const,
            content: fillCharacterTokens(
              character.firstMessage,
              character.name,
            ),
            timestamp: now,
          },
        ]
      : [];

    const session: Session = {
      id: uid(),
      characterId: character.id,
      personaId:
        selectedOption.source === "library"
          ? selectedOption.persona.id
          : undefined,
      personaSnapshot: snapshot,
      model: characterModel,
      userModel,
      messages: initial,
      promptConfig,
      createdAt: now,
      updatedAt: now,
      title: `${character.name} × ${selectedOption.persona.name}`,
    };
    saveSession(session);

    // Start phase = running / autopilot.
    setPhase({
      kind: "running",
      stage: "autopilot",
      session,
      transcript: initial,
      streamingRole: null,
      streamingText: "",
      currentTurn: 0,
      turnsTotal: turns,
      judgeText: "",
    });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const apiKey = getConfig().openRouterApiKey;

    let liveTranscript = initial;
    try {
      // ---- Auto-pilot ----
      await runAutopilotSession(
        {
          session,
          character,
          persona,
          apiKey,
          userModel,
          characterModel,
          turns,
          preset,
          promptConfig,
          signal: ctrl.signal,
          delayBetweenTurnsMs: 400,
        },
        {
          onTurnStart: (turnIndex, role) => {
            setPhase((p) =>
              p.kind === "running"
                ? {
                    ...p,
                    streamingRole: role,
                    streamingText: "",
                    currentTurn: turnIndex + 1,
                  }
                : p,
            );
          },
          onChunk: (_t, _r, _delta, full) => {
            setPhase((p) =>
              p.kind === "running" ? { ...p, streamingText: full } : p,
            );
          },
          onTurnComplete: (_turnIndex, _msg, transcript) => {
            liveTranscript = transcript;
            setPhase((p) =>
              p.kind === "running"
                ? {
                    ...p,
                    transcript,
                    streamingText: "",
                  }
                : p,
            );
            // Persist incrementally.
            saveSession({ ...session, messages: transcript });
          },
        },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast({ title: "Run aborted before judge.", variant: "info" });
        // Still allow viewing the partial transcript via /chat/[id].
        setPhase({ kind: "configure" });
        router.replace(`/chat/${session.id}`);
        return;
      }
      const msg =
        err instanceof OpenRouterError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      toast({
        title: "Auto-pilot failed",
        description: msg,
        variant: "error",
      });
      setPhase({ kind: "configure" });
      return;
    }

    // ---- Judge ----
    const finalSession = saveSession({
      ...session,
      messages: liveTranscript,
    });
    setPhase((p) =>
      p.kind === "running"
        ? {
            ...p,
            stage: "judging",
            transcript: liveTranscript,
            streamingRole: null,
            streamingText: "",
            session: finalSession,
          }
        : p,
    );

    try {
      const report = await runEvaluation({
        session: finalSession,
        character,
        persona,
        judgeModel,
        apiKey,
        signal: ctrl.signal,
        onChunk: (_d, full) => {
          setPhase((p) =>
            p.kind === "running" ? { ...p, judgeText: full } : p,
          );
        },
      });
      saveEvaluation(report);

      setPhase({
        kind: "done",
        session: finalSession,
        transcript: liveTranscript,
        report,
        character,
        persona,
      });

      toast({
        title: "Dynamic Eval complete",
        description: `F ${
          report.composite.faithfulness?.toFixed(2) ?? "—"
        } · Q ${report.composite.quality?.toFixed(2) ?? "—"} · T ${
          report.composite.texture?.toFixed(2) ?? "—"
        }`,
        variant: "success",
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast({ title: "Judge cancelled.", variant: "info" });
        // Transcript is still saved; bounce to chat where they can re-run.
        router.replace(`/chat/${finalSession.id}`);
        setPhase({ kind: "configure" });
        return;
      }
      const msg =
        err instanceof OpenRouterError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      toast({
        title: "Judge failed",
        description: msg,
        variant: "error",
      });
      router.replace(`/chat/${finalSession.id}`);
      setPhase({ kind: "configure" });
    } finally {
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleStartAnother() {
    setPhase({ kind: "configure" });
  }

  // =========================================================================
  // Render
  // =========================================================================

  if (phase.kind === "running") {
    return (
      <RunningPhase
        phase={phase}
        character={character}
        persona={selectedOption?.persona}
        onStop={handleStop}
      />
    );
  }
  if (phase.kind === "done") {
    return (
      <DonePhase
        phase={phase}
        onStartAnother={handleStartAnother}
        onOpenChat={() => router.push(`/chat/${phase.session.id}?continue=manual`)}
      />
    );
  }

  // ----- Configure -----
  return (
    <ConfigurePhase
      loaded={loaded}
      hasKey={hasKey}
      characters={characters}
      characterId={characterId}
      onCharacterChange={setCharacterId}
      character={character}
      personaOptions={personaOptions}
      optionKeyState={optionKeyState}
      onOptionKeyChange={setOptionKeyState}
      selectedCatalog={selectedCatalog}
      injections={injections}
      onInjectionsChange={setInjections}
      turns={turns}
      onTurnsChange={setTurns}
      userModel={userModel}
      onUserModelChange={setUserModel}
      characterModel={characterModel}
      onCharacterModelChange={setCharacterModel}
      judgeModel={judgeModel}
      onJudgeModelChange={setJudgeModel}
      presets={presets}
      promptConfig={promptConfig}
      onPromptConfigChange={setPromptConfig}
      onStart={handleStart}
    />
  );
}

// ============================================================================
// Phase: Configure
// ============================================================================

function ConfigurePhase(props: {
  loaded: boolean;
  hasKey: boolean;
  characters: CharacterCard[];
  characterId: string;
  onCharacterChange: (id: string) => void;
  character: CharacterCard | undefined;
  personaOptions: PersonaOption[];
  optionKeyState: string;
  onOptionKeyChange: (key: string) => void;
  selectedCatalog: EvalPersona | null;
  injections: Record<string, string>;
  onInjectionsChange: (next: Record<string, string>) => void;
  turns: number;
  onTurnsChange: (n: number) => void;
  userModel: string;
  onUserModelChange: (m: string) => void;
  characterModel: string;
  onCharacterModelChange: (m: string) => void;
  judgeModel: string;
  onJudgeModelChange: (m: string) => void;
  presets: PromptPreset[];
  promptConfig: SessionPromptConfig | undefined;
  onPromptConfigChange: (c: SessionPromptConfig | undefined) => void;
  onStart: () => void;
}) {
  const {
    loaded,
    hasKey,
    characters,
    characterId,
    onCharacterChange,
    character,
    personaOptions,
    optionKeyState,
    onOptionKeyChange,
    selectedCatalog,
    injections,
    onInjectionsChange,
    turns,
    onTurnsChange,
    userModel,
    onUserModelChange,
    characterModel,
    onCharacterModelChange,
    judgeModel,
    onJudgeModelChange,
    presets,
    promptConfig,
    onPromptConfigChange,
    onStart,
  } = props;

  const recommendedNote = selectedCatalog?.recommendedTurns?.note;
  const minTurns = selectedCatalog?.recommendedTurns?.min ?? 1;
  const noCharacter = loaded && characters.length === 0;
  const startDisabled = !character || !hasKey;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {/* Character */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserIcon className="h-4 w-4 text-primary" />
              1 · Character
            </CardTitle>
          </CardHeader>
          <CardContent>
            {noCharacter ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                You don&apos;t have any characters yet.{" "}
                <Link
                  href="/characters/new"
                  className="text-foreground underline underline-offset-2"
                >
                  Create one
                </Link>
                .
              </div>
            ) : (
              <Select
                value={characterId}
                onChange={(e) => onCharacterChange(e.target.value)}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Persona */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gavel className="h-4 w-4 text-primary" />
              2 · User-driver persona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PersonaPicker
              options={personaOptions}
              value={optionKeyState}
              onChange={onOptionKeyChange}
            />

            {selectedCatalog && selectedCatalog.injectionFields.length > 0 && (
              <InjectionEditor
                persona={selectedCatalog}
                values={injections}
                onChange={onInjectionsChange}
              />
            )}
          </CardContent>
        </Card>

        {/* Run config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              3 · Run config
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Number of turns</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={minTurns}
                  max={50}
                  value={turns}
                  onChange={(e) =>
                    onTurnsChange(
                      Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                    )
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  {turns} turn{turns === 1 ? "" : "s"} = {turns} user message
                  {turns === 1 ? "" : "s"} + {turns} character repl
                  {turns === 1 ? "y" : "ies"}.
                </span>
              </div>
              {recommendedNote && (
                <p className="text-[11px] text-amber-300/80">
                  {recommendedNote}
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-md border border-border/60 bg-card/30 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Driver models
              </div>
              <div className="space-y-2">
                <Label>User-side LLM (drives the persona)</Label>
                <ModelSelector
                  value={userModel}
                  onChange={onUserModelChange}
                  showBadge
                />
              </div>
              <div className="space-y-2">
                <Label>Character-side LLM (drives the card)</Label>
                <ModelSelector
                  value={characterModel}
                  onChange={onCharacterModelChange}
                  showBadge
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                The two sides can use different models — useful for stress-testing
                a weaker character LLM against a strong adversarial user.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Judge model</Label>
              <Select
                value={judgeModel}
                onChange={(e) => onJudgeModelChange(e.target.value)}
              >
                {JUDGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.provider}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Strong judges give more reliable evaluation.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Narrator prompt preset (optional)</Label>
              <PromptPresetSelector
                presets={presets}
                config={promptConfig}
                onChange={onPromptConfigChange}
              />
              <p className="text-[11px] text-muted-foreground">
                Composed in front of the character card for the character LLM
                only — never sent to the persona LLM.
              </p>
            </div>

            {!hasKey && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                <Link
                  href="/settings"
                  className="font-medium underline underline-offset-2"
                >
                  Add your OpenRouter API key
                </Link>{" "}
                in Settings before running.
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                size="lg"
                onClick={onStart}
                disabled={startDisabled}
                className="gap-2"
              >
                <PlayCircle className="h-4 w-4" />
                Run Dynamic Eval
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Side preview */}
      <PreviewSidebar
        character={character}
        selectedCatalog={selectedCatalog}
        injections={injections}
        turns={turns}
        userModel={userModel}
        characterModel={characterModel}
        judgeModel={judgeModel}
        preset={presets.find((p) => p.id === promptConfig?.presetId)}
      />
    </div>
  );
}

function PersonaPicker({
  options,
  value,
  onChange,
}: {
  options: PersonaOption[];
  value: string;
  onChange: (k: string) => void;
}) {
  // Two visual groups: catalog cards on top, library list below.
  const catalog = options.filter((o) => o.source === "catalog");
  const library = options.filter((o) => o.source === "library");

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Library className="h-3 w-3" />
          ChatEval system catalog
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] normal-case">
            {catalog.length}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {catalog.map((o) => {
            const p = o.persona as EvalPersona;
            const active = optionKey(o) === value;
            return (
              <button
                key={optionKey(o)}
                type="button"
                onClick={() => onChange(optionKey(o))}
                className={`group flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card/40 hover:border-border/80 hover:bg-card"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">
                    {p.name}
                  </span>
                  {active && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <span className="line-clamp-2 text-[11px] text-muted-foreground">
                  {p.tagline}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.probesDimensions.slice(0, 5).map((d) => (
                    <Badge
                      key={d}
                      variant="outline"
                      className="px-1 py-0 font-mono text-[9px]"
                    >
                      {d}
                    </Badge>
                  ))}
                  {p.injectionFields.length > 0 && (
                    <Badge
                      variant="muted"
                      className="px-1 py-0 text-[9px]"
                      title="This persona needs card-specific data filled in below"
                    >
                      injects {p.injectionFields.length}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {library.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <UserIcon className="h-3 w-3" />
            Your persona library
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] normal-case">
              {library.length}
            </span>
          </div>
          <Select
            value={
              value.startsWith("library:") ? value : `__placeholder__`
            }
            onChange={(e) => onChange(e.target.value)}
            className="text-sm"
          >
            <option value="__placeholder__" disabled>
              — Select a library persona —
            </option>
            {library.map((o) => (
              <option key={optionKey(o)} value={optionKey(o)}>
                {optionName(o)}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Library personas are sent to the user-LLM as-is, no injection step.
          </p>
        </div>
      )}
    </div>
  );
}

function InjectionEditor({
  persona,
  values,
  onChange,
}: {
  persona: EvalPersona;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-300">
        <AlertTriangle className="h-3 w-3" />
        Card-specific injection
      </div>
      <p className="text-[11px] text-muted-foreground">
        The persona needs character-specific data to probe effectively. We
        pre-fill from the character card where possible — edit each field to
        sharpen the probe.
      </p>
      {persona.injectionFields.map((field) => (
        <div key={field.id} className="space-y-1.5">
          <Label className="flex items-center justify-between gap-2">
            <span>{field.label}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {field.token}
            </span>
          </Label>
          <Textarea
            rows={4}
            value={values[field.id] ?? ""}
            onChange={(e) =>
              onChange({ ...values, [field.id]: e.target.value })
            }
            placeholder={field.placeholder}
            className="font-sans text-xs"
          />
          <p className="text-[10px] text-muted-foreground">{field.hint}</p>
        </div>
      ))}
    </div>
  );
}

function PreviewSidebar({
  character,
  selectedCatalog,
  injections,
  turns,
  userModel,
  characterModel,
  judgeModel,
  preset,
}: {
  character: CharacterCard | undefined;
  selectedCatalog: EvalPersona | null;
  injections: Record<string, string>;
  turns: number;
  userModel: string;
  characterModel: string;
  judgeModel: string;
  preset: PromptPreset | undefined;
}) {
  const missingInjections =
    selectedCatalog?.injectionFields.filter(
      (f) => !injections[f.id] || injections[f.id].trim().length === 0,
    ) ?? [];

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Run preview
      </div>

      {character ? (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Avatar
              src={character.avatarUrl}
              name={character.name}
              size={44}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Character LLM
              </div>
              <div className="truncate text-sm font-semibold">
                {character.name}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {character.tags.slice(0, 4).map((t) => (
                  <Badge key={t} variant="muted" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">
          Pick a character to see the run preview.
        </Card>
      )}

      <Card className="p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          User LLM (driver)
        </div>
        <div className="mt-1 truncate text-sm font-semibold">
          {selectedCatalog?.name ?? "Library persona"}
        </div>
        {selectedCatalog && (
          <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
            {selectedCatalog.tagline}
          </p>
        )}
      </Card>

      <Card className="p-5 text-xs">
        <div className="space-y-2.5">
          <Row label="Turns" value={`${turns}`} />
          <Row
            label="User LLM"
            value={<ModelBadge modelId={userModel} />}
          />
          <Row
            label="Character LLM"
            value={<ModelBadge modelId={characterModel} />}
          />
          <Row
            label="Judge model"
            value={<ModelBadge modelId={judgeModel} />}
          />
          <Row
            label="Narrator preset"
            value={
              preset ? (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {preset.title}
                </span>
              ) : (
                <span className="text-muted-foreground">none</span>
              )
            }
          />
        </div>
      </Card>

      {missingInjections.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-xs">
          <div className="mb-1 flex items-center gap-1.5 text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-medium">
              {missingInjections.length} injection
              {missingInjections.length === 1 ? "" : "s"} unfilled
            </span>
          </div>
          <p className="text-muted-foreground">
            The probe runs without it but will be less sharp. Fields:{" "}
            {missingInjections.map((f) => f.label).join(", ")}.
          </p>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}

// ============================================================================
// Phase: Running
// ============================================================================

function RunningPhase({
  phase,
  character,
  persona,
  onStop,
}: {
  phase: Extract<Phase, { kind: "running" }>;
  character?: CharacterCard;
  persona?: EvalPersona | UserPersona;
  onStop: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [
    phase.transcript.length,
    phase.streamingText,
    phase.judgeText,
    phase.stage,
  ]);

  const progress =
    phase.stage === "judging"
      ? 100
      : phase.turnsTotal === 0
        ? 0
        : Math.min(
            100,
            Math.round((phase.currentTurn / phase.turnsTotal) * 100),
          );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={character?.avatarUrl}
              name={character?.name ?? "?"}
              size={32}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {character?.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                × {persona?.name}
              </div>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={onStop}>
            <StopCircle className="h-3.5 w-3.5" />
            Stop
          </Button>
        </div>

        {/* Progress bar */}
        <div className="border-b border-border bg-card/20 px-4 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {phase.stage === "autopilot"
                ? `Auto-pilot — turn ${phase.currentTurn} of ${phase.turnsTotal}`
                : "Judge is reading the transcript…"}
            </span>
            <span className="tabular-nums">
              {phase.transcript.length} message
              {phase.transcript.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted/30">
            <div
              className={`h-full transition-all ${
                phase.stage === "judging" ? "bg-primary/70" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Live transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {phase.transcript.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                character={character}
                personaName={persona?.name}
              />
            ))}
            {phase.streamingRole && (
              <Bubble
                streaming
                message={{
                  id: "streaming",
                  role: phase.streamingRole,
                  content: phase.streamingText || "…",
                  timestamp: Date.now(),
                }}
                character={character}
                personaName={persona?.name}
              />
            )}
            {phase.stage === "judging" && (
              <JudgeStreaming text={phase.judgeText} />
            )}
          </div>
        </div>
      </div>

      <RunningSidebar phase={phase} />
    </div>
  );
}

function Bubble({
  message,
  character,
  personaName,
  streaming,
}: {
  message: Message;
  character?: CharacterCard;
  personaName?: string;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const name = isUser ? personaName ?? "User-LLM" : character?.name ?? "?";
  return (
    <div
      className={`flex gap-3 animate-fade-in ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      <Avatar
        src={isUser ? undefined : character?.avatarUrl}
        name={name}
        size={28}
      />
      <div
        className={`flex max-w-[88%] flex-col ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{name}</span>
          <span>{formatTime(message.timestamp)}</span>
          {isUser ? (
            <UserIcon className="h-2.5 w-2.5" />
          ) : (
            <Bot className="h-2.5 w-2.5" />
          )}
        </div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm prose-message ${
            isUser
              ? "bg-primary/90 text-primary-foreground"
              : "bg-card text-card-foreground border border-border"
          } ${streaming ? "animate-pulse-soft" : ""}`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function JudgeStreaming({ text }: { text: string }) {
  return (
    <Card className="border-primary/30 bg-card/40 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
        <Gavel className="h-3.5 w-3.5" />
        Judge — streaming structured JSON
      </div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10.5px] text-foreground/80">
        {text || "…"}
      </pre>
    </Card>
  );
}

function RunningSidebar({
  phase,
}: {
  phase: Extract<Phase, { kind: "running" }>;
}) {
  return (
    <Card className="p-5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Pipeline
      </div>
      <ol className="mt-3 space-y-3 text-sm">
        <Step
          n={1}
          label="Auto-pilot chat"
          state={
            phase.stage === "autopilot" ? "running" : "done"
          }
          detail={
            phase.stage === "autopilot"
              ? `Turn ${phase.currentTurn} / ${phase.turnsTotal}`
              : `${phase.transcript.length} messages captured`
          }
        />
        <Step
          n={2}
          label="LLM-judge evaluation"
          state={phase.stage === "judging" ? "running" : "pending"}
          detail={
            phase.stage === "judging"
              ? "Streaming JSON…"
              : "Starts as soon as the chat finishes."
          }
        />
        <Step
          n={3}
          label="Report ready"
          state="pending"
          detail="Composite scores + per-dimension breakdown + flags."
        />
      </ol>
    </Card>
  );
}

function Step({
  n,
  label,
  state,
  detail,
}: {
  n: number;
  label: string;
  state: "pending" | "running" | "done";
  detail?: string;
}) {
  const palette: Record<typeof state, string> = {
    pending: "border-border text-muted-foreground",
    running: "border-primary text-primary",
    done: "border-emerald-500/60 text-emerald-300",
  };
  return (
    <li className="flex gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-mono ${palette[state]}`}
      >
        {state === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          n
        )}
      </span>
      <div className="flex flex-col">
        <span
          className={`font-medium ${
            state === "running"
              ? "text-foreground"
              : state === "done"
                ? "text-foreground/85"
                : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {detail && (
          <span className="text-[11px] text-muted-foreground">{detail}</span>
        )}
      </div>
    </li>
  );
}

// ============================================================================
// Phase: Done
// ============================================================================

function DonePhase({
  phase,
  onStartAnother,
  onOpenChat,
}: {
  phase: Extract<Phase, { kind: "done" }>;
  onStartAnother: () => void;
  onOpenChat: () => void;
}) {
  const [tab, setTab] = React.useState<"transcript" | "report">("report");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="default" className="px-2 py-0.5 text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            Run complete
          </Badge>
          <span className="text-muted-foreground">
            {phase.transcript.length} message
            {phase.transcript.length === 1 ? "" : "s"} ·{" "}
            {phase.character.name} ×{" "}
            <span className="text-foreground/80">{phase.persona.name}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenChat}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Continue in chat
          </Button>
          <Link href={`/evaluations/${phase.session.id}?report=${phase.report.id}`}>
            <Button variant="outline" size="sm">
              Open full report
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button size="sm" onClick={onStartAnother}>
            <PlayCircle className="h-3.5 w-3.5" />
            Run another
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        <TabButton
          active={tab === "report"}
          onClick={() => setTab("report")}
          label="Report"
          icon={<Gavel className="h-3.5 w-3.5" />}
        />
        <TabButton
          active={tab === "transcript"}
          onClick={() => setTab("transcript")}
          label={`Transcript (${phase.transcript.length})`}
          icon={<FileText className="h-3.5 w-3.5" />}
        />
      </div>

      {tab === "report" ? (
        <EvaluationReportView
          report={phase.report}
          character={phase.character}
          persona={phase.persona}
          variant="full"
        />
      ) : (
        <TranscriptView
          transcript={phase.transcript}
          character={phase.character}
          personaName={phase.persona.name}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TranscriptView({
  transcript,
  character,
  personaName,
}: {
  transcript: Message[];
  character: CharacterCard;
  personaName: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/30 p-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {transcript.map((m, i) => (
          <div key={m.id} className="space-y-1">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Turn {i}
            </div>
            <Bubble message={m} character={character} personaName={personaName} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Top-level back link (used by the page wrapper)
// ============================================================================

export function EvaluateBackLink() {
  return (
    <Link
      href="/evaluations"
      className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to all Dynamic Evaluations
    </Link>
  );
}
