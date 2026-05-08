"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelBadge } from "@/components/ModelSelector";
import { CompositeScore, ScoreBar } from "@/components/ui/score-bar";
import {
  STATIC_EVAL_DIMENSIONS,
  buildStaticEvaluationExport,
  computeStaticGating,
  staticEvaluationExportFilename,
  staticScoreColor,
} from "@/lib/staticEvaluation";
import { downloadText, formatRelativeTime } from "@/lib/utils";
import type {
  CharacterCard,
  StaticDimensionScore,
  StaticEvaluationReport,
  StaticFlag,
  StaticFlagSeverity,
} from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Lightbulb,
  Quote,
  ScrollText,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";

interface StaticEvaluationReportViewProps {
  report: StaticEvaluationReport;
  character?: CharacterCard;
  variant?: "compact" | "full";
}

export function StaticEvaluationReportView({
  report,
  character,
  variant = "full",
}: StaticEvaluationReportViewProps) {
  const compact = variant === "compact";
  const gating = React.useMemo(
    () => computeStaticGating(report.cardShape, report.scores, report.flags),
    [report],
  );

  function handleDownload() {
    const bundle = buildStaticEvaluationExport(report, character);
    downloadText(
      staticEvaluationExportFilename(report, character),
      JSON.stringify(bundle, null, 2),
      "application/json",
    );
  }

  return (
    <div className="space-y-6">
      <Header
        report={report}
        character={character}
        compact={compact}
        gating={gating}
        onDownload={handleDownload}
      />

      {/* Top-line: composite + gating + shape */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CompositeScore
          label="Composite"
          score={report.composite}
          hint="Mean of non-null dimensions"
        />
        <CardShapeStat shape={report.cardShape} />
        <GatingStat gating={gating} />
        <FlagsStat flags={report.flags} />
      </div>

      {/* Spine + leverage suggestions */}
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

      {/* Gating detail when failed */}
      {!gating.passes && (
        <Card className="border-destructive/40 bg-destructive/10 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive-foreground">
            <ShieldAlert className="h-4 w-4" />
            Gate failed — card needs work before it&apos;s ready to ship
          </div>
          <ul className="mt-2 space-y-2 text-xs">
            {gating.failures.map((f, i) => (
              <li
                key={i}
                className="rounded-md border border-destructive/30 bg-background/30 p-3 text-foreground/85"
              >
                {f}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Flags by severity */}
      {report.flags.length > 0 && (
        <FlagsPanel flags={report.flags} />
      )}

      {/* Six dimensions */}
      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold tracking-tight">
            Six dimensions
          </h3>
          <p className="text-xs text-muted-foreground">
            Each dim scored 0–5 against anchor descriptions, with verbatim card-text evidence and a concrete fix when sub-4.
          </p>
        </div>
        <div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
          {STATIC_EVAL_DIMENSIONS.map((dim) => (
            <DimensionCard
              key={dim.id}
              numbered={`${dim.number}`}
              dimensionId={dim.id}
              label={dim.label}
              description={dim.description}
              score={report.scores[dim.id]}
              isClosedNa={dim.closedNa && report.cardShape === "closed"}
            />
          ))}
        </div>
      </section>

      <RawJudgeBlock raw={report.rawJudgeResponse} />
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================

function Header({
  report,
  character,
  compact,
  gating,
  onDownload,
}: {
  report: StaticEvaluationReport;
  character?: CharacterCard;
  compact: boolean;
  gating: { passes: boolean; failures: string[] };
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" />
          Static audit report
          <span>·</span>
          {formatRelativeTime(report.createdAt)}
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
          {character?.name ?? "Character"}{" "}
          <span className="text-muted-foreground">— card audit</span>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="muted" className="text-[10px]">
            shape · {report.cardShape}
          </Badge>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Shield className="h-3 w-3" />
            judge
          </span>
          <ModelBadge modelId={report.judgeModel} />
          {gating.passes ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
            >
              <ShieldCheck className="h-3 w-3" /> Gates passed
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              <ShieldAlert className="h-3 w-3" /> Gate failed
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

// ============================================================================
// Top stats
// ============================================================================

function CardShapeStat({ shape }: { shape: StaticEvaluationReport["cardShape"] }) {
  const tone =
    shape === "open"
      ? { bg: "border-fuchsia-500/30 bg-fuchsia-500/10", text: "text-fuchsia-300" }
      : shape === "trajectory"
        ? { bg: "border-sky-500/30 bg-sky-500/10", text: "text-sky-300" }
        : shape === "closed"
          ? { bg: "border-amber-500/30 bg-amber-500/10", text: "text-amber-300" }
          : { bg: "border-border bg-card/60", text: "text-muted-foreground" };
  const subline =
    shape === "open"
      ? "Self-deception markers + productive tensions present."
      : shape === "trajectory"
        ? "Sequence/phase language with a stated end-state."
        : shape === "closed"
          ? "Single-valence; no Secret, no self-gap. Voice + individuation gates apply."
          : "Could not determine shape from the card text.";
  return (
    <div className={`rounded-xl border p-5 ${tone.bg}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Card shape
      </div>
      <div className={`mt-1 text-2xl font-semibold capitalize ${tone.text}`}>
        {shape}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{subline}</div>
    </div>
  );
}

function GatingStat({
  gating,
}: {
  gating: { passes: boolean; failures: string[] };
}) {
  const tone = gating.passes
    ? {
        bg: "border-emerald-500/30 bg-emerald-500/10",
        text: "text-emerald-300",
        Icon: ShieldCheck,
      }
    : {
        bg: "border-destructive/40 bg-destructive/10",
        text: "text-destructive-foreground",
        Icon: ShieldAlert,
      };
  const Icon = tone.Icon;
  return (
    <div className={`rounded-xl border p-5 ${tone.bg}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Gating
      </div>
      <div className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${tone.text}`}>
        <Icon className="h-5 w-5" />
        {gating.passes ? "Pass" : `Fail · ${gating.failures.length}`}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {gating.passes
          ? "Card meets every gate for its shape."
          : "Address the failed gates first — they block everything else."}
      </div>
    </div>
  );
}

function FlagsStat({ flags }: { flags: StaticFlag[] }) {
  const errors = flags.filter((f) => f.severity === "error").length;
  const warnings = flags.filter((f) => f.severity === "warning").length;
  const infos = flags.filter((f) => f.severity === "info").length;
  const tone =
    errors > 0
      ? { bg: "border-destructive/40 bg-destructive/10", text: "text-destructive-foreground" }
      : warnings > 0
        ? { bg: "border-amber-500/40 bg-amber-500/10", text: "text-amber-300" }
        : flags.length === 0
          ? { bg: "border-emerald-400/30 bg-emerald-400/10", text: "text-emerald-300" }
          : { bg: "border-border bg-card/60", text: "text-foreground" };
  const Icon = errors > 0 || warnings > 0 ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-xl border p-5 ${tone.bg}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Flags
      </div>
      <div className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${tone.text}`}>
        <Icon className="h-5 w-5" />
        {flags.length === 0 ? "Clean" : flags.length}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {flags.length === 0
          ? "No flags raised by the judge."
          : `${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"} · ${infos} info`}
      </div>
    </div>
  );
}

// ============================================================================
// Flags panel
// ============================================================================

const SEVERITY_TONE: Record<StaticFlagSeverity, { card: string; chip: string; Icon: typeof AlertTriangle }> = {
  error: {
    card: "border-destructive/30",
    chip: "bg-destructive/15 text-destructive-foreground border-destructive/40",
    Icon: XCircle,
  },
  warning: {
    card: "border-amber-500/30",
    chip: "bg-amber-500/10 text-amber-200 border-amber-500/40",
    Icon: AlertTriangle,
  },
  info: {
    card: "border-border",
    chip: "bg-muted text-muted-foreground border-border",
    Icon: Info,
  },
};

function FlagsPanel({ flags }: { flags: StaticFlag[] }) {
  // Sort errors first, then warnings, then info; preserve order within each.
  const order: StaticFlagSeverity[] = ["error", "warning", "info"];
  const sorted = order.flatMap((sev) => flags.filter((f) => f.severity === sev));
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Flags ({flags.length})
      </div>
      <ul className="space-y-2">
        {sorted.map((f, i) => {
          const tone = SEVERITY_TONE[f.severity];
          const Icon = tone.Icon;
          return (
            <li
              key={i}
              className={`flex items-start gap-3 rounded-md border bg-background/30 p-3 text-sm ${tone.card}`}
            >
              <span
                className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone.chip}`}
              >
                <Icon className="h-2.5 w-2.5" />
                {f.severity}
              </span>
              <div className="min-w-0 flex-1 text-foreground/90">
                <span>{f.label}</span>
                {f.section && (
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    · {f.section}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ============================================================================
// Dimension card
// ============================================================================

function DimensionCard({
  numbered,
  dimensionId,
  label,
  description,
  score,
  isClosedNa,
}: {
  numbered: string;
  dimensionId: string;
  label: string;
  description: string;
  score: StaticDimensionScore | undefined;
  isClosedNa?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const s: StaticDimensionScore = score ?? { score: null, notes: "", evidence: [] };
  const tone = staticScoreColor(s.score);
  const isNa = s.score === null;
  const showSuggestion =
    typeof s.score === "number" && s.score < 4 && !!s.suggestion;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {numbered} · {dimensionId}
            </span>
            <span className="text-sm font-medium text-foreground">{label}</span>
            {isClosedNa && (
              <Badge variant="muted" className="text-[10px]" title="N/A — Closed-shape cards have no stated self-model gap">
                N/A · Closed shape
              </Badge>
            )}
            {isNa && !isClosedNa && (
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

      {/* Sub-axes — surface the structured counts the judge produced. */}
      {s.subAxes && s.subAxes.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {s.subAxes.map((ax, i) => (
            <div
              key={i}
              className="rounded-md border border-border/60 bg-card/30 px-2.5 py-1.5"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {ax.label}
              </div>
              <div className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
                {ax.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {(s.notes || s.evidence.length > 0 || showSuggestion) && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {s.notes && (
            <p className="text-xs leading-relaxed text-foreground/85">{s.notes}</p>
          )}

          {showSuggestion && (
            <div className="mt-3 space-y-1.5 rounded-md border border-border/60 bg-card/40 p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Suggested fix
                </span>
              </div>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span>{s.suggestion}</span>
              </p>
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
                {open ? "Hide" : "Show"} card-text evidence ({s.evidence.length})
              </button>
              {open && (
                <ul className="mt-2 space-y-2">
                  {s.evidence.map((q, i) => (
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
                      <blockquote className="mt-0.5 italic text-foreground/85">
                        &ldquo;{q}&rdquo;
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

// ============================================================================
// Raw judge block
// ============================================================================

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
