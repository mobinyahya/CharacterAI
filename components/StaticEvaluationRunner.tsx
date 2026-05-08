"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ModelBadge } from "@/components/ModelSelector";
import { StaticEvaluationReportView } from "@/components/StaticEvaluationReportView";
import {
  computeStaticGating,
  runStaticEvaluation,
} from "@/lib/staticEvaluation";
import { OpenRouterError } from "@/lib/openrouter";
import {
  getCharacters,
  getConfig,
  saveStaticEvaluation,
} from "@/lib/storage";
import type { CharacterCard, StaticEvaluationReport } from "@/types";
import { DEFAULT_JUDGE_MODEL, JUDGE_MODELS } from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gavel,
  Library,
  Loader2,
  PlayCircle,
  ScrollText,
  Shield,
  StopCircle,
  User as UserIcon,
} from "lucide-react";

// ============================================================================
// Phase state
// ============================================================================

type Phase =
  | { kind: "configure" }
  | {
      kind: "running";
      character: CharacterCard;
      judgeText: string;
    }
  | {
      kind: "done";
      character: CharacterCard;
      report: StaticEvaluationReport;
    };

// ============================================================================
// Component
// ============================================================================

export function StaticEvaluationRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // ---- Library state ----
  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [hasKey, setHasKey] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // ---- Configure form state ----
  const [characterId, setCharacterId] = React.useState<string>("");
  const [judgeModel, setJudgeModel] =
    React.useState<string>(DEFAULT_JUDGE_MODEL);

  // ---- Phase ----
  const [phase, setPhase] = React.useState<Phase>({ kind: "configure" });
  const abortRef = React.useRef<AbortController | null>(null);

  // ---- Initial load ----
  React.useEffect(() => {
    const cs = getCharacters();
    const cfg = getConfig();
    setCharacters(cs);
    setHasKey(!!cfg.openRouterApiKey);

    const preselect = searchParams?.get("characterId");
    if (preselect && cs.find((c) => c.id === preselect)) {
      setCharacterId(preselect);
    } else if (cs.length > 0) {
      setCharacterId(cs[0].id);
    }
    setLoaded(true);
  }, [searchParams]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const character = characters.find((c) => c.id === characterId);

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

    setPhase({ kind: "running", character, judgeText: "" });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const apiKey = getConfig().openRouterApiKey;

    try {
      const report = await runStaticEvaluation({
        character,
        judgeModel,
        apiKey,
        signal: ctrl.signal,
        onChunk: (_d, full) => {
          setPhase((p) =>
            p.kind === "running" ? { ...p, judgeText: full } : p,
          );
        },
      });
      saveStaticEvaluation(report);

      setPhase({ kind: "done", character, report });

      toast({
        title: "Static audit complete",
        description: `${character.name} · ${report.composite?.toFixed(2) ?? "—"} / 5 · shape: ${report.cardShape}`,
        variant: "success",
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast({ title: "Static audit cancelled.", variant: "info" });
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
        title: "Static audit failed",
        description: msg,
        variant: "error",
      });
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
        character={phase.character}
        judgeText={phase.judgeText}
        judgeModel={judgeModel}
        onStop={handleStop}
      />
    );
  }
  if (phase.kind === "done") {
    return (
      <DonePhase
        character={phase.character}
        report={phase.report}
        onStartAnother={handleStartAnother}
      />
    );
  }

  return (
    <ConfigurePhase
      loaded={loaded}
      hasKey={hasKey}
      characters={characters}
      characterId={characterId}
      onCharacterChange={setCharacterId}
      character={character}
      judgeModel={judgeModel}
      onJudgeModelChange={setJudgeModel}
      onStart={handleStart}
    />
  );
}

// ============================================================================
// Configure phase
// ============================================================================

function ConfigurePhase({
  loaded,
  hasKey,
  characters,
  characterId,
  onCharacterChange,
  character,
  judgeModel,
  onJudgeModelChange,
  onStart,
}: {
  loaded: boolean;
  hasKey: boolean;
  characters: CharacterCard[];
  characterId: string;
  onCharacterChange: (id: string) => void;
  character: CharacterCard | undefined;
  judgeModel: string;
  onJudgeModelChange: (id: string) => void;
  onStart: () => void;
}) {
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

        {/* Judge */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gavel className="h-4 w-4 text-primary" />
              2 · Judge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                Stronger judges read the rubric more carefully and cite the card text more reliably.
              </p>
            </div>

            <div className="rounded-md border border-border/60 bg-card/40 p-3 text-[11px] text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground/80">
                <ScrollText className="h-3 w-3" />
                What the audit produces
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-foreground/80 font-medium">
                    Architecture · 6 dims (0–5):
                  </span>
                  <ul className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <li>1. Structure</li>
                    <li>2. States &amp; contract</li>
                    <li>3. Voice</li>
                    <li>4. Self-gap (Open only)</li>
                    <li>5. Worldview</li>
                    <li>6. Individuation</li>
                  </ul>
                </div>
                <div>
                  <span className="text-foreground/80 font-medium">
                    Coverage · 13 surfaces:
                  </span>{" "}
                  identity, backstory, relationships, capital, faults,
                  behavior settings, signals, mannerisms, speech, examples,
                  vulnerability, user-relationship, sexuality (NSFW only).
                  Each as presence + verbatim evidence + latchability.
                </div>
                <div>
                  <span className="text-foreground/80 font-medium">
                    Coherence:
                  </span>{" "}
                  backstory ↔ behavior waterfall, age timeline, capital ↔
                  fears, build / origin / voice cross-checks, internal
                  contradictions.
                </div>
                <div>
                  <span className="text-foreground/80 font-medium">
                    Adversarial:
                  </span>{" "}
                  trope inspector, thinness auditor, evidence auditor,
                  unexplored-dimension auditor.
                </div>
                <div>
                  <span className="text-foreground/80 font-medium">
                    Plus:
                  </span>{" "}
                  card shape (Open / Trajectory / Closed), spine, gating
                  verdict, rule-taxonomy flags, and a severity-ranked
                  punchlist with stable IDs for diff-across-runs.
                </div>
              </div>
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

            <div className="flex justify-end pt-1">
              <Button
                size="lg"
                onClick={onStart}
                disabled={startDisabled}
                className="gap-2"
              >
                <PlayCircle className="h-4 w-4" />
                Run Static Audit
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Side preview */}
      <PreviewSidebar character={character} judgeModel={judgeModel} />
    </div>
  );
}

function PreviewSidebar({
  character,
  judgeModel,
}: {
  character: CharacterCard | undefined;
  judgeModel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Audit preview
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
                Card under audit
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
              <div className="mt-3 text-[11px] text-muted-foreground">
                <Library className="mr-1 inline h-3 w-3" />
                {character.systemPrompt.length.toLocaleString()} chars in card
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">
          Pick a character to see the audit preview.
        </Card>
      )}

      <Card className="p-5 text-xs">
        <div className="space-y-2.5">
          <Row label="Type" value="Static (no chat)" />
          <Row label="Judge" value={<ModelBadge modelId={judgeModel} />} />
          <Row label="Persona" value={<span className="text-muted-foreground">none — N/A</span>} />
          <Row label="Turns" value={<span className="text-muted-foreground">none — N/A</span>} />
        </div>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-xs">
        <div className="mb-1 flex items-center gap-1.5 text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-medium">Static, not Dynamic</span>
        </div>
        <p className="text-muted-foreground">
          A static audit reads the card alone — it can&apos;t catch behaviors that only emerge under
          interactive pressure (drift, resolution avoidance, A4 self-gap collapse). Use a Dynamic Eval to
          probe those.
        </p>
      </Card>
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
// Running phase
// ============================================================================

function RunningPhase({
  character,
  judgeText,
  judgeModel,
  onStop,
}: {
  character: CharacterCard;
  judgeText: string;
  judgeModel: string;
  onStop: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={character.avatarUrl}
              name={character.name}
              size={32}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {character.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                static audit · judge running
              </div>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={onStop}>
            <StopCircle className="h-3.5 w-3.5" />
            Stop
          </Button>
        </div>

        <div className="border-b border-border bg-card/20 px-4 py-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Judge is reading the card and emitting structured JSON…
            </span>
            <ModelBadge modelId={judgeModel} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <Card className="border-primary/30 bg-card/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
              <Gavel className="h-3.5 w-3.5" />
              Judge — streaming JSON
            </div>
            <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
              {judgeText || "…"}
            </pre>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Pipeline
        </div>
        <ol className="mt-3 space-y-3 text-sm">
          <Step n={1} label="Auto-pilot chat" state="skipped" detail="Static audit — no chat." />
          <Step n={2} label="LLM-judge audit" state="running" detail="Streaming JSON…" />
          <Step n={3} label="Report ready" state="pending" detail="Score vector + gating + flags." />
        </ol>
      </Card>
    </div>
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
  state: "pending" | "running" | "done" | "skipped";
  detail?: string;
}) {
  const palette: Record<typeof state, string> = {
    pending: "border-border text-muted-foreground",
    running: "border-primary text-primary",
    done: "border-emerald-500/60 text-emerald-300",
    skipped: "border-border/50 text-muted-foreground/60",
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
        ) : state === "skipped" ? (
          "—"
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
          } ${state === "skipped" ? "line-through" : ""}`}
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
// Done phase
// ============================================================================

function DonePhase({
  character,
  report,
  onStartAnother,
}: {
  character: CharacterCard;
  report: StaticEvaluationReport;
  onStartAnother: () => void;
}) {
  const gating = computeStaticGating(
    report.cardShape,
    report.scores,
    report.flags,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="default" className="px-2 py-0.5 text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            Audit complete
          </Badge>
          <span className="text-muted-foreground">
            {character.name} · shape: <span className="text-foreground/80">{report.cardShape}</span>
          </span>
          {gating.passes ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
            >
              <Shield className="h-3 w-3" /> Gates passed
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-3 w-3" /> Gate failed
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/characters/${character.id}/edit`}>
            <Button variant="outline" size="sm">
              <FileText className="h-3.5 w-3.5" />
              Edit character
            </Button>
          </Link>
          <Link href={`/evaluations/static/${report.id}`}>
            <Button variant="outline" size="sm">
              Open full report
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button size="sm" onClick={onStartAnother}>
            <PlayCircle className="h-3.5 w-3.5" />
            Audit another
          </Button>
        </div>
      </div>

      <StaticEvaluationReportView
        report={report}
        character={character}
        variant="full"
      />
    </div>
  );
}
