"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ModelBadge } from "@/components/ModelSelector";
import { useToast } from "@/components/ui/toast";
import { EvaluationReportView } from "@/components/EvaluationReportView";
import { runEvaluation } from "@/lib/evaluation";
import { OpenRouterError } from "@/lib/openrouter";
import {
  getEvaluationsForSession,
  saveEvaluation,
  deleteEvaluation,
  getConfig,
} from "@/lib/storage";
import { formatRelativeTime } from "@/lib/utils";
import type {
  CharacterCard,
  EvaluationReport,
  Session,
  UserPersona,
} from "@/types";
import { JUDGE_MODELS, DEFAULT_JUDGE_MODEL } from "@/types";
import {
  ArrowRight,
  Gavel,
  Loader2,
  PlayCircle,
  StopCircle,
  Trash2,
  X,
} from "lucide-react";

interface EvaluationPanelProps {
  open: boolean;
  onClose: () => void;
  session: Session;
  character: CharacterCard;
  persona?: UserPersona;
  /** Notifies parent when an evaluation is created/deleted (badge counts etc.) */
  onChange?: () => void;
}

export function EvaluationPanel({
  open,
  onClose,
  session,
  character,
  persona,
  onChange,
}: EvaluationPanelProps) {
  const { toast } = useToast();
  const [judgeModel, setJudgeModel] = React.useState<string>(DEFAULT_JUDGE_MODEL);
  const [history, setHistory] = React.useState<EvaluationReport[]>([]);
  const [active, setActive] = React.useState<EvaluationReport | null>(null);
  const [running, setRunning] = React.useState(false);
  const [streamPreview, setStreamPreview] = React.useState("");
  const abortRef = React.useRef<AbortController | null>(null);

  const refresh = React.useCallback(() => {
    const all = getEvaluationsForSession(session.id);
    setHistory(all);
    setActive((curr) => {
      if (curr && all.find((r) => r.id === curr.id)) return curr;
      return all[0] ?? null;
    });
  }, [session.id]);

  React.useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const apiKey = React.useMemo(() => getConfig().openRouterApiKey, []);
  const messageCount = session.messages.filter((m) => m.role !== "system").length;
  const tooShort = messageCount < 2;

  async function handleRun() {
    if (!apiKey) {
      toast({
        title: "Add your OpenRouter API key in Settings.",
        variant: "error",
      });
      return;
    }
    if (tooShort) {
      toast({
        title: "Need at least one user turn to evaluate.",
        variant: "error",
      });
      return;
    }
    setRunning(true);
    setStreamPreview("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const report = await runEvaluation({
        session,
        character,
        persona,
        judgeModel,
        apiKey,
        signal: ctrl.signal,
        onChunk: (_d, full) => setStreamPreview(full),
      });
      saveEvaluation(report);
      setActive(report);
      refresh();
      onChange?.();
      toast({
        title: "Evaluation complete",
        description: `Faithfulness ${
          report.composite.faithfulness?.toFixed(2) ?? "—"
        } · Quality ${report.composite.quality?.toFixed(2) ?? "—"}`,
        variant: "success",
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast({ title: "Evaluation cancelled", variant: "info" });
      } else {
        const msg =
          err instanceof OpenRouterError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        toast({
          title: "Evaluation failed",
          description: msg,
          variant: "error",
        });
      }
    } finally {
      setRunning(false);
      setStreamPreview("");
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleDelete(id: string) {
    deleteEvaluation(id);
    refresh();
    onChange?.();
    toast({ title: "Evaluation deleted", variant: "success" });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-5xl"
      title="Turn-based evaluation"
      description="Score this transcript against the Card-Faithfulness + Session-Quality rubric using a strong judge model."
    >
      <div className="grid max-h-[80vh] gap-5 overflow-hidden md:grid-cols-[260px_1fr]">
        {/* Sidebar: controls + history */}
        <aside className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto pr-2">
          <RunPanel
            judgeModel={judgeModel}
            setJudgeModel={setJudgeModel}
            running={running}
            onRun={handleRun}
            onStop={handleStop}
            tooShort={tooShort}
            messageCount={messageCount}
            hasKey={!!apiKey}
            existingCount={history.length}
          />
          {history.length > 0 && (
            <HistoryList
              history={history}
              activeId={active?.id ?? null}
              onSelect={(r) => setActive(r)}
              onDelete={handleDelete}
            />
          )}
        </aside>

        {/* Main: report or empty / streaming state */}
        <main className="max-h-[80vh] overflow-y-auto pr-1">
          {running ? (
            <StreamingState preview={streamPreview} />
          ) : active ? (
            <EvaluationReportView
              report={active}
              character={character}
              persona={persona}
              variant="compact"
            />
          ) : (
            <EmptyState
              tooShort={tooShort}
              onRun={handleRun}
              hasKey={!!apiKey}
            />
          )}
        </main>
      </div>

      {active && !running && (
        <div className="mt-4 flex justify-between border-t border-border pt-4">
          <Link
            href={`/evaluations/${session.id}`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Open full-page report →
          </Link>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function RunPanel({
  judgeModel,
  setJudgeModel,
  running,
  onRun,
  onStop,
  tooShort,
  messageCount,
  hasKey,
  existingCount,
}: {
  judgeModel: string;
  setJudgeModel: (m: string) => void;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  tooShort: boolean;
  messageCount: number;
  hasKey: boolean;
  existingCount: number;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
      <div>
        <Label className="text-xs">Judge model</Label>
        <Select
          value={judgeModel}
          onChange={(e) => setJudgeModel(e.target.value)}
          className="mt-1.5 h-8 text-xs"
          disabled={running}
        >
          {JUDGE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.provider}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Strong judge models give more reliable JSON. Default: Claude Sonnet 4.5.
        </p>
      </div>

      {running ? (
        <Button
          onClick={onStop}
          variant="destructive"
          size="sm"
          className="w-full"
        >
          <StopCircle className="h-3.5 w-3.5" />
          Stop
        </Button>
      ) : (
        <Button
          onClick={onRun}
          disabled={tooShort || !hasKey}
          size="sm"
          className="w-full"
        >
          <Gavel className="h-3.5 w-3.5" />
          {existingCount > 0 ? "Re-evaluate" : "Run evaluation"}
        </Button>
      )}

      <div className="space-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Messages</span>
          <span className="tabular-nums">{messageCount}</span>
        </div>
        {tooShort && (
          <div className="text-amber-300">
            Need at least one user turn to evaluate.
          </div>
        )}
        {!hasKey && (
          <div className="text-destructive-foreground">
            <Link href="/settings" className="underline underline-offset-2">
              Add API key →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryList({
  history,
  activeId,
  onSelect,
  onDelete,
}: {
  history: EvaluationReport[];
  activeId: string | null;
  onSelect: (r: EvaluationReport) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        History ({history.length})
      </div>
      <ul className="space-y-1.5">
        {history.map((r) => {
          const active = r.id === activeId;
          return (
            <li
              key={r.id}
              className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-card/40 hover:border-border/80 hover:bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
              >
                <div className="flex items-center gap-1.5 text-foreground">
                  <ModelBadge modelId={r.judgeModel} />
                  {r.flags.A6_resolutionAvoidance.triggered && (
                    <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                      A6
                    </Badge>
                  )}
                </div>
                <div className="flex w-full items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>
                    F{r.composite.faithfulness?.toFixed(1) ?? "—"} · Q
                    {r.composite.quality?.toFixed(1) ?? "—"}
                  </span>
                  <span>{formatRelativeTime(r.createdAt)}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.id);
                }}
                className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                aria-label="Delete report"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StreamingState({ preview }: { preview: string }) {
  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3 p-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div>
          <div className="text-sm font-medium">Judge is reading the transcript…</div>
          <div className="text-xs text-muted-foreground">
            Streaming structured JSON. This usually takes 15–60s.
          </div>
        </div>
      </Card>
      {preview && (
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card/40 p-3 font-mono text-[11px] text-muted-foreground">
          {preview}
        </pre>
      )}
    </div>
  );
}

function EmptyState({
  tooShort,
  onRun,
  hasKey,
}: {
  tooShort: boolean;
  onRun: () => void;
  hasKey: boolean;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Gavel className="h-4 w-4" />
      </div>
      <div>
        <h4 className="text-sm font-semibold">No evaluations yet for this session</h4>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Run the judge to score this transcript on Card-Faithfulness (Cluster A) and Session-Quality (Cluster B). The judge cites verbatim quotes per dimension.
        </p>
      </div>
      {!tooShort && hasKey && (
        <Button size="sm" onClick={onRun}>
          <PlayCircle className="h-3.5 w-3.5" />
          Run first evaluation
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </Card>
  );
}

/**
 * Tiny banner used in the chat top-bar to indicate whether the current session
 * has an evaluation. Kept stateless — parent fetches and passes in.
 */
export function EvaluationBadge({
  report,
}: {
  report: EvaluationReport | undefined;
}) {
  if (!report) return null;
  return (
    <Badge
      variant={report.flags.A6_resolutionAvoidance.triggered ? "destructive" : "outline"}
      className="text-[10px]"
    >
      F{report.composite.faithfulness?.toFixed(1) ?? "—"} · Q
      {report.composite.quality?.toFixed(1) ?? "—"}
    </Badge>
  );
}

