"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelBadge } from "@/components/ModelSelector";
import { CompositeScore, ScoreBar } from "@/components/ui/score-bar";
import {
  EVAL_DIMENSIONS,
  buildEvaluationExport,
  evaluationExportFilename,
  scoreColor,
} from "@/lib/evaluation";
import { getSession } from "@/lib/storage";
import { downloadText, formatRelativeTime } from "@/lib/utils";
import type {
  CharacterCard,
  DimensionScore,
  EvaluationReport,
  UserPersona,
} from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Lightbulb,
  Quote,
  Shield,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";

// ============================================================================
// Helpers — root cause attribution + small shared bits
// ============================================================================

const ROOT_CAUSE_TONE: Record<"card" | "runtime" | "both", string> = {
  card: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  runtime: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  both: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
};

const ROOT_CAUSE_LABEL: Record<"card" | "runtime" | "both", string> = {
  card: "Card-level",
  runtime: "Runtime-level",
  both: "Card + runtime",
};

function RootCauseBadge({ cause }: { cause: "card" | "runtime" | "both" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ROOT_CAUSE_TONE[cause]}`}
      title="Root-cause attribution from the judge"
    >
      <Wrench className="h-2.5 w-2.5" />
      {ROOT_CAUSE_LABEL[cause]}
    </span>
  );
}

interface EvaluationReportViewProps {
  report: EvaluationReport;
  character?: CharacterCard;
  persona?: UserPersona;
  /** When true, renders the dense full-page layout. */
  variant?: "compact" | "full";
}

export function EvaluationReportView({
  report,
  character,
  persona,
  variant = "full",
}: EvaluationReportViewProps) {
  const compact = variant === "compact";

  function handleDownload() {
    const session = getSession(report.sessionId);
    const bundle = buildEvaluationExport(report, session, character, persona);
    downloadText(
      evaluationExportFilename(report, character),
      JSON.stringify(bundle, null, 2),
      "application/json",
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Header
        report={report}
        character={character}
        persona={persona}
        compact={compact}
        onDownload={handleDownload}
      />

      {/* Composite scores */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CompositeScore
          label="Faithfulness — Cluster A"
          score={report.composite.faithfulness}
          hint="Does the run hold the card?"
        />
        <CompositeScore
          label="Quality — Cluster B"
          score={report.composite.quality}
          hint="Is the session itself any good?"
        />
        <CompositeScore
          label="Texture — Cluster C + D"
          score={report.composite.texture ?? null}
          hint="Emotional realism + narrative craft"
        />
        <FlagCard report={report} />
      </div>

      {/* Spine + suggestions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Spine extraction
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {report.spine || (
              <span className="text-muted-foreground">
                (Judge did not extract a spine.)
              </span>
            )}
          </p>
          {report.statesActivated.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                States activated in trace
              </div>
              <div className="flex flex-wrap gap-1.5">
                {report.statesActivated.map((s) => (
                  <Badge key={s} variant="muted" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            Top leverage suggestions
          </div>
          {report.topSuggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None offered.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {report.topSuggestions.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-foreground/90">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Resolution-avoidance flag detail (if triggered) */}
      {report.flags.A6_resolutionAvoidance.triggered && (
        <Card className="border-destructive/40 bg-destructive/10 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive-foreground">
            <AlertTriangle className="h-4 w-4" />
            A6 — Resolution avoidance triggered
          </div>
          <p className="text-xs text-destructive-foreground/90">
            Strong evidence the runtime can&apos;t operate {character?.name ?? "the character"} outside the central dynamic.
          </p>
          <ul className="mt-3 space-y-3">
            {report.flags.A6_resolutionAvoidance.instances.map((inst, i) => (
              <li
                key={i}
                className="rounded-md border border-destructive/30 bg-background/30 p-3 text-xs"
              >
                <div className="mb-1 flex items-center gap-2 text-destructive-foreground">
                  <span className="font-mono text-[10px] uppercase">Turn {inst.turn}</span>
                  <span>·</span>
                  <span className="text-foreground/80">{inst.reason}</span>
                </div>
                <blockquote className="border-l-2 border-destructive/40 pl-3 italic text-foreground/80">
                  &ldquo;{inst.quote}&rdquo;
                </blockquote>
              </li>
            ))}
          </ul>
          {(report.flags.A6_resolutionAvoidance.rootCause ||
            report.flags.A6_resolutionAvoidance.suggestion) && (
            <FlagAttribution
              rootCause={report.flags.A6_resolutionAvoidance.rootCause ?? null}
              suggestion={report.flags.A6_resolutionAvoidance.suggestion ?? ""}
              tone="destructive"
            />
          )}
        </Card>
      )}

      {/* Internal-consistency flag detail (if triggered) */}
      {report.flags.B6_internalConsistency?.triggered && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            B6 — Internal consistency violations (
            {report.flags.B6_internalConsistency.violations.length})
          </div>
          <p className="text-xs text-amber-100/80">
            The character contradicted earlier turns — facts, feelings, or established
            position. Distinct from A4 self-deception (intentional denial).
          </p>
          {report.flags.B6_internalConsistency.violations.length > 0 && (
            <ul className="mt-3 space-y-3">
              {report.flags.B6_internalConsistency.violations.map((v, i) => (
                <li
                  key={i}
                  className="rounded-md border border-amber-500/30 bg-background/30 p-3 text-xs"
                >
                  <div className="mb-1 flex items-center gap-2 text-amber-200">
                    <span className="font-mono text-[10px] uppercase">
                      Turn {v.turn}
                    </span>
                    {v.contradicts && (
                      <>
                        <span>·</span>
                        <span className="text-foreground/80">
                          contradicts: {v.contradicts}
                        </span>
                      </>
                    )}
                  </div>
                  <blockquote className="border-l-2 border-amber-500/40 pl-3 italic text-foreground/80">
                    &ldquo;{v.quote}&rdquo;
                  </blockquote>
                </li>
              ))}
            </ul>
          )}
          {(report.flags.B6_internalConsistency.rootCause ||
            report.flags.B6_internalConsistency.suggestion) && (
            <FlagAttribution
              rootCause={report.flags.B6_internalConsistency.rootCause ?? null}
              suggestion={report.flags.B6_internalConsistency.suggestion ?? ""}
              tone="warning"
            />
          )}
        </Card>
      )}

      {/* Other flags */}
      {report.flags.other.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Other flags
          </div>
          <ul className="space-y-1 text-sm">
            {report.flags.other.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-foreground/90">
                <span className="font-medium text-amber-300">{f.label}</span>
                {f.turn !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    (turn {f.turn})
                  </span>
                )}
                {f.quote && (
                  <span className="text-xs italic text-muted-foreground">
                    — &ldquo;{f.quote}&rdquo;
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Cluster sections */}
      <ClusterSection
        cluster="A"
        title="Cluster A — Card Faithfulness"
        description="Is the character behaving as the card specifies?"
        scores={report.scores}
        compact={compact}
      />
      <ClusterSection
        cluster="B"
        title="Cluster B — Session Quality"
        description="Is the session actually engaging?"
        scores={report.scores}
        compact={compact}
      />
      <ClusterSection
        cluster="C"
        title="Cluster C — Emotional Texture & Interpersonal Realism"
        description="Does the character feel emotionally specific and read the user's relational moves?"
        scores={report.scores}
        compact={compact}
      />
      <ClusterSection
        cluster="D"
        title="Cluster D — Narrative Craft"
        description="Pacing rhythm and behavior individuated beyond archetype defaults."
        scores={report.scores}
        compact={compact}
      />

      {/* Raw judge response (collapsed) */}
      <RawJudgeBlock raw={report.rawJudgeResponse} />
    </div>
  );
}

function FlagAttribution({
  rootCause,
  suggestion,
  tone,
}: {
  rootCause: "card" | "runtime" | "both" | null;
  suggestion: string;
  tone: "destructive" | "warning";
}) {
  if (!rootCause && !suggestion) return null;
  const borderCls =
    tone === "destructive"
      ? "border-destructive/30"
      : "border-amber-500/30";
  return (
    <div className={`mt-4 border-t pt-3 ${borderCls}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Attribution
        </span>
        {rootCause && <RootCauseBadge cause={rootCause} />}
      </div>
      {suggestion && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <span>{suggestion}</span>
        </p>
      )}
    </div>
  );
}

function Header({
  report,
  character,
  persona,
  compact,
  onDownload,
}: {
  report: EvaluationReport;
  character?: CharacterCard;
  persona?: UserPersona;
  compact: boolean;
  onDownload: () => void;
}) {
  const a6 = report.flags.A6_resolutionAvoidance.triggered;
  const b6 = report.flags.B6_internalConsistency?.triggered ?? false;
  const b6Count = report.flags.B6_internalConsistency?.violations.length ?? 0;
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Dynamic Eval report
          <span>·</span>
          {formatRelativeTime(report.createdAt)}
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
          {character?.name ?? "Session"}{" "}
          {persona && (
            <span className="text-muted-foreground">× {persona.name}</span>
          )}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">
            {report.turnCount} message{report.turnCount === 1 ? "" : "s"}
          </Badge>
          <Badge variant="muted" className="text-[10px]">
            shape · {report.cardShape}
          </Badge>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Shield className="h-3 w-3" />
            judge
          </span>
          <ModelBadge modelId={report.judgeModel} />
          <span className="text-muted-foreground">·</span>
          {report.userDriverModel ? (
            <>
              <span className="text-muted-foreground">user</span>
              <ModelBadge modelId={report.userDriverModel} />
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">char</span>
              <ModelBadge modelId={report.driverModel} />
            </>
          ) : (
            <>
              <span className="text-muted-foreground">driver</span>
              <ModelBadge modelId={report.driverModel} />
            </>
          )}
          {a6 && (
            <Badge variant="destructive" className="text-[10px]">
              A6 flag
            </Badge>
          )}
          {b6 && (
            <Badge
              className="border-amber-500/40 bg-amber-500/10 text-amber-200 text-[10px]"
              variant="outline"
            >
              B6 · {b6Count}
            </Badge>
          )}
        </div>
      </div>
      {!compact && (
        <div className="flex items-center gap-2">
          {character && (
            <Link href={`/characters/${character.id}/edit`}>
              <Button variant="outline" size="sm">
                Open character
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
      )}
    </div>
  );
}

function FlagCard({ report }: { report: EvaluationReport }) {
  const a6 = report.flags.A6_resolutionAvoidance.triggered;
  const b6 = report.flags.B6_internalConsistency?.triggered ?? false;
  const b6Count = report.flags.B6_internalConsistency?.violations.length ?? 0;
  const otherCount = report.flags.other.length;
  // A6 is the headline — it's the highest diagnostic weight failure mode.
  // B6 is "user notices these immediately and they break investment."
  const tone: "destructive" | "warning" | "great" = a6
    ? "destructive"
    : b6 || otherCount > 0
      ? "warning"
      : "great";
  const toneBg: Record<typeof tone, string> = {
    destructive: "border-destructive/40 bg-destructive/10",
    warning: "border-amber-500/40 bg-amber-500/10",
    great: "border-emerald-400/30 bg-emerald-400/10",
  };
  const toneText: Record<typeof tone, string> = {
    destructive: "text-destructive-foreground",
    warning: "text-amber-300",
    great: "text-emerald-300",
  };
  const Icon = a6 || b6 ? AlertTriangle : CheckCircle2;
  const headline = a6
    ? "A6 triggered"
    : b6
      ? `B6 · ${b6Count} violation${b6Count === 1 ? "" : "s"}`
      : otherCount > 0
        ? `${otherCount} flag${otherCount === 1 ? "" : "s"}`
        : "Clean";
  const subline = a6
    ? b6
      ? `Runtime invented in-fiction escapes; B6 also triggered (${b6Count}).`
      : "Runtime invented an in-fiction escape to preserve central tension."
    : b6
      ? "Character contradicted earlier turns. Common at long context."
      : otherCount > 0
        ? "See the other-flags panel below."
        : "No A6, no B6, no other flags raised.";
  return (
    <div className={`rounded-xl border p-5 ${toneBg[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Failure flags
      </div>
      <div
        className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${toneText[tone]}`}
      >
        <Icon className="h-5 w-5" />
        {headline}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{subline}</div>
    </div>
  );
}

function ClusterSection({
  cluster,
  title,
  description,
  scores,
  compact,
}: {
  cluster: "A" | "B" | "C" | "D";
  title: string;
  description: string;
  scores: Record<string, DimensionScore>;
  compact: boolean;
}) {
  const dims = EVAL_DIMENSIONS.filter((d) => d.cluster === cluster);
  if (dims.length === 0) return null;
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
        {dims.map((dim) => (
          <DimensionCard
            key={dim.id}
            dimensionId={dim.id}
            label={dim.label}
            description={dim.description}
            score={scores[dim.id]}
          />
        ))}
      </div>
    </section>
  );
}

function DimensionCard({
  dimensionId,
  label,
  description,
  score,
}: {
  dimensionId: string;
  label: string;
  description: string;
  score: DimensionScore | undefined;
}) {
  const [open, setOpen] = React.useState(false);
  const s: DimensionScore = score ?? { score: null, notes: "", evidence: [] };
  const tone = scoreColor(s.score);
  const isInsufficient = !!s.insufficientTrace;
  const isNa = s.score === null && !isInsufficient;
  // Per spec: sub-4 scores require root-cause + concrete suggestion.
  const showAttribution =
    typeof s.score === "number" && s.score < 4 && (s.rootCause || s.suggestion);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {dimensionId}
            </span>
            <span className="text-sm font-medium text-foreground">{label}</span>
            {isInsufficient && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-200 text-[10px]"
                title="Judge declared the trace too short to evaluate this dimension meaningfully"
              >
                Insufficient trace
              </Badge>
            )}
            {isNa && (
              <Badge variant="muted" className="text-[10px]">
                N/A
              </Badge>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="w-32 shrink-0">
          <ScoreBar score={s.score} />
        </div>
      </div>

      {(s.notes || s.evidence.length > 0 || showAttribution) && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {s.notes && (
            <p className="text-xs leading-relaxed text-foreground/85">{s.notes}</p>
          )}

          {showAttribution && (
            <div className="mt-3 space-y-1.5 rounded-md border border-border/60 bg-card/40 p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Attribution
                </span>
                {s.rootCause && <RootCauseBadge cause={s.rootCause} />}
              </div>
              {s.suggestion && (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span>{s.suggestion}</span>
                </p>
              )}
            </div>
          )}

          {s.evidence.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                <Quote className="h-3 w-3" />
                {open ? "Hide" : "Show"} evidence ({s.evidence.length})
              </button>
              {open && (
                <ul className="mt-2 space-y-2">
                  {s.evidence.map((e, i) => (
                    <li
                      key={i}
                      className={`rounded-md border-l-2 pl-3 text-xs ${
                        tone === "destructive"
                          ? "border-destructive/60"
                          : tone === "warning"
                            ? "border-amber-500/60"
                            : "border-primary/40"
                      }`}
                    >
                      <div className="font-mono text-[10px] uppercase text-muted-foreground">
                        Turn {e.turn}
                      </div>
                      <blockquote className="mt-0.5 italic text-foreground/85">
                        &ldquo;{e.quote}&rdquo;
                      </blockquote>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RawJudgeBlock({ raw }: { raw: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <details
      className="rounded-xl border border-border bg-card/40 p-4"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
        Raw judge response
      </summary>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/40 p-3 font-mono text-[11px] text-foreground/80">
        {raw}
      </pre>
    </details>
  );
}
