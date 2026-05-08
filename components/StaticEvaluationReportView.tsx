"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelBadge } from "@/components/ModelSelector";
import { CompositeScore, ScoreBar } from "@/components/ui/score-bar";
import {
  ADVERSARIAL_LENSES,
  COHERENCE_LINKS,
  STATIC_COVERAGE_DIMENSIONS,
  STATIC_EVAL_DIMENSIONS,
  buildStaticEvaluationExport,
  computeStaticGating,
  ensurePunchlist,
  findCoverageDim,
  punchlistSeverityCounts,
  staticEvaluationExportFilename,
  staticScoreColor,
} from "@/lib/staticEvaluation";
import { downloadText, formatRelativeTime } from "@/lib/utils";
import type {
  CharacterCard,
  PunchlistFinding,
  PunchlistSeverity,
  PunchlistSource,
  StaticAdversarialFinding,
  StaticAdversarialLens,
  StaticCoherenceFinding,
  StaticCoherenceLinkType,
  StaticCoveragePresence,
  StaticCoverageResult,
  StaticDimensionScore,
  StaticEvaluationReport,
  StaticFlag,
  StaticFlagSeverity,
  StaticLatchability,
} from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  CircleDashed,
  Crosshair,
  Download,
  GitBranch,
  Info,
  Lightbulb,
  Link2,
  ListChecks,
  Quote,
  ScrollText,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
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
  const findings = React.useMemo(() => ensurePunchlist(report), [report]);
  const severityCounts = React.useMemo(
    () => punchlistSeverityCounts(findings),
    [findings],
  );
  const gating = React.useMemo(
    () =>
      computeStaticGating(
        report.cardShape,
        report.scores,
        report.flags,
        report.coverage ?? [],
      ),
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

      {/* Top-line: composite + shape + gating + severity counts (replaces flag-only stat) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CompositeScore
          label="Composite"
          score={report.composite}
          hint="Mean of non-null architectural dims"
        />
        <CardShapeStat shape={report.cardShape} />
        <GatingStat gating={gating} />
        <PunchlistStat counts={severityCounts} />
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

      {/* Punchlist — failure-first, the v3 primary deliverable */}
      <PunchlistPanel findings={findings} />

      {/* Coverage matrix — 13 v3 surfaces with presence + latchability */}
      {report.coverage && report.coverage.length > 0 && (
        <CoveragePanel coverage={report.coverage} />
      )}

      {/* Coherence — the waterfall */}
      {report.coherence && report.coherence.length > 0 && (
        <CoherencePanel coherence={report.coherence} />
      )}

      {/* Adversarial critique */}
      {report.adversarial && report.adversarial.length > 0 && (
        <AdversarialPanel adversarial={report.adversarial} />
      )}

      {/* Flags by severity (rule taxonomy) */}
      {report.flags.length > 0 && <FlagsPanel flags={report.flags} />}

      {/* Six architectural dimensions */}
      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold tracking-tight">
            Architectural dimensions
          </h3>
          <p className="text-xs text-muted-foreground">
            Six dims scored 0–5 against anchor descriptions, with verbatim card-text evidence and a concrete fix when sub-4. These calibrate the spine; coverage / coherence / adversarial layers above point at content gaps.
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

function PunchlistStat({
  counts,
}: {
  counts: { critical: number; major: number; minor: number; total: number };
}) {
  const tone =
    counts.critical > 0
      ? {
          bg: "border-destructive/40 bg-destructive/10",
          text: "text-destructive-foreground",
        }
      : counts.major > 0
        ? { bg: "border-amber-500/40 bg-amber-500/10", text: "text-amber-300" }
        : counts.total === 0
          ? {
              bg: "border-emerald-400/30 bg-emerald-400/10",
              text: "text-emerald-300",
            }
          : { bg: "border-border bg-card/60", text: "text-foreground" };
  const Icon =
    counts.critical > 0 || counts.major > 0 ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-xl border p-5 ${tone.bg}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Punchlist
      </div>
      <div
        className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${tone.text}`}
      >
        <Icon className="h-5 w-5" />
        {counts.total === 0 ? "Clean" : counts.total}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {counts.total === 0
          ? "No findings — coverage / coherence / adversarial all clean."
          : `${counts.critical} critical · ${counts.major} major · ${counts.minor} minor`}
      </div>
    </div>
  );
}

// ============================================================================
// Punchlist panel — primary creator-facing deliverable (v3 §9)
// ============================================================================

const PUNCHLIST_SEVERITY_TONE: Record<
  PunchlistSeverity,
  { card: string; chip: string; Icon: typeof AlertTriangle; label: string }
> = {
  critical: {
    card: "border-destructive/40 bg-destructive/5",
    chip: "bg-destructive/15 text-destructive-foreground border-destructive/40",
    Icon: XCircle,
    label: "critical",
  },
  major: {
    card: "border-amber-500/40 bg-amber-500/5",
    chip: "bg-amber-500/10 text-amber-200 border-amber-500/40",
    Icon: AlertTriangle,
    label: "major",
  },
  minor: {
    card: "border-border bg-card/40",
    chip: "bg-muted text-muted-foreground border-border",
    Icon: Info,
    label: "minor",
  },
};

const PUNCHLIST_SOURCE_LABEL: Record<PunchlistSource, string> = {
  score: "architecture",
  coverage: "coverage",
  coherence: "coherence",
  adversarial: "adversarial",
  flag: "flag",
};

function PunchlistPanel({ findings }: { findings: PunchlistFinding[] }) {
  const [filter, setFilter] = React.useState<PunchlistSeverity | "all">("all");
  const visible = filter === "all" ? findings : findings.filter((f) => f.severity === filter);
  if (findings.length === 0) {
    return (
      <Card className="border-emerald-400/30 bg-emerald-400/5 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Punchlist clean — no findings across coverage, coherence, adversarial, or rule layers.
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The architectural scores below still show the calibrated 0–5 health vector.
        </p>
      </Card>
    );
  }
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <ListChecks className="h-4 w-4 text-primary" />
            Punchlist ({findings.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Severity-ranked, failure-first. Each finding cites verbatim card text and proposes a concrete edit. Stable IDs let re-runs report resolved / persistent / new.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <FilterChip
            active={filter === "all"}
            label={`all · ${findings.length}`}
            onClick={() => setFilter("all")}
          />
          {(["critical", "major", "minor"] as PunchlistSeverity[]).map((s) => {
            const n = findings.filter((f) => f.severity === s).length;
            if (n === 0) return null;
            return (
              <FilterChip
                key={s}
                active={filter === s}
                label={`${PUNCHLIST_SEVERITY_TONE[s].label} · ${n}`}
                onClick={() => setFilter(s)}
                tone={s}
              />
            );
          })}
        </div>
      </div>
      <ol className="space-y-2">
        {visible.map((f, i) => (
          <PunchlistItem key={f.id} finding={f} index={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: PunchlistSeverity;
}) {
  const base =
    "rounded-md border px-2 py-1 font-medium uppercase tracking-wider transition-colors";
  if (!active) {
    return (
      <button
        type="button"
        className={`${base} border-border bg-card/40 text-muted-foreground hover:text-foreground`}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }
  if (tone) {
    return (
      <button
        type="button"
        className={`${base} ${PUNCHLIST_SEVERITY_TONE[tone].chip}`}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`${base} border-primary/40 bg-primary/15 text-primary`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function PunchlistItem({
  finding,
  index,
}: {
  finding: PunchlistFinding;
  index: number;
}) {
  const [open, setOpen] = React.useState(finding.severity === "critical");
  const tone = PUNCHLIST_SEVERITY_TONE[finding.severity];
  const Icon = tone.Icon;
  const Caret = open ? ChevronDown : ChevronRightIcon;
  const dimensionLabel = formatDimensionLabel(finding.dimension);
  return (
    <li className={`rounded-md border ${tone.card}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <Caret className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/40 font-mono text-[10px] text-muted-foreground">
          {index}
        </span>
        <span
          className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone.chip}`}
        >
          <Icon className="h-2.5 w-2.5" />
          {tone.label}
        </span>
        <span className="mt-0.5 inline-flex shrink-0 rounded-md border border-border bg-card/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {PUNCHLIST_SOURCE_LABEL[finding.source]}
          <span className="mx-1 opacity-40">·</span>
          {dimensionLabel}
        </span>
        <span className="min-w-0 flex-1 text-sm text-foreground/90">
          {finding.what}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3 text-xs">
          {finding.evidence.length > 0 && finding.evidence[0].quote !== "no such passage exists" && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Quote className="h-2.5 w-2.5" />
                Evidence
              </div>
              <ul className="space-y-1.5">
                {finding.evidence.map((e, i) => (
                  <li
                    key={i}
                    className="rounded-md border-l-2 border-primary/30 pl-3 italic text-foreground/85"
                  >
                    {e.location && (
                      <span className="mr-1.5 not-italic text-[10px] uppercase tracking-wider text-muted-foreground">
                        {e.location}
                      </span>
                    )}
                    &ldquo;{e.quote}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          )}
          {finding.evidence.length > 0 &&
            finding.evidence[0].quote === "no such passage exists" && (
              <div className="rounded-md border border-dashed border-border bg-card/30 p-2 text-[11px] italic text-muted-foreground">
                No such passage exists — this finding is about absence.
              </div>
            )}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Why it matters
            </div>
            <p className="leading-relaxed text-foreground/85">{finding.why}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-card/40 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              Suggested fix
              <span className="ml-1 rounded-sm border border-border px-1 py-px font-mono normal-case tracking-normal text-muted-foreground">
                {finding.suggestion.kind}
              </span>
              {finding.suggestion.target && (
                <span className="text-muted-foreground/70 normal-case tracking-normal">
                  · {finding.suggestion.target}
                </span>
              )}
            </div>
            <p className="whitespace-pre-line leading-relaxed text-foreground/85">
              {finding.suggestion.proposedChange}
            </p>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60">
            id: {finding.id}
          </div>
        </div>
      )}
    </li>
  );
}

function formatDimensionLabel(raw: string): string {
  // Architectural dim ids are bare ("structure"); coverage/coherence/adversarial
  // are namespaced ("coverage:capital"). Render the suffix when namespaced.
  const idx = raw.indexOf(":");
  if (idx === -1) return raw;
  return raw.slice(idx + 1);
}

// ============================================================================
// Coverage panel — 13 v3 surfaces, presence + latchability matrix
// ============================================================================

const PRESENCE_TONE: Record<
  StaticCoveragePresence,
  { chip: string; label: string }
> = {
  rich: {
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    label: "rich",
  },
  adequate: {
    chip: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
    label: "adequate",
  },
  thin: {
    chip: "bg-amber-500/10 text-amber-200 border-amber-500/40",
    label: "thin",
  },
  missing: {
    chip: "bg-destructive/15 text-destructive-foreground border-destructive/40",
    label: "missing",
  },
  na: {
    chip: "bg-muted text-muted-foreground border-border",
    label: "n/a",
  },
};

const LATCHABILITY_TONE: Record<StaticLatchability, string> = {
  high: "text-emerald-300",
  medium: "text-amber-200",
  low: "text-destructive-foreground/85",
};

function CoveragePanel({ coverage }: { coverage: StaticCoverageResult[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  // Hide NSFW dim when judge said "na" — keeps the matrix tight.
  const visible = coverage.filter((c) => !(c.id === "sexuality" && c.presence === "na"));
  return (
    <section>
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Crosshair className="h-4 w-4 text-primary" />
          Coverage map ({visible.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Thirteen content surfaces (v3 §5). Architecture says &quot;is this mechanically sound?&quot;; coverage says &quot;is this surface present with concrete handles?&quot;. Latchability is the cross-cut: would two renderers produce similar behavior?
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((c) => {
          const def = findCoverageDim(c.id);
          if (!def) return null;
          const tone = PRESENCE_TONE[c.presence];
          const isOpen = open === c.id;
          const evidenceCount = c.evidence.length;
          return (
            <Card key={c.id} className="p-3 text-xs">
              <button
                type="button"
                onClick={() => setOpen((o) => (o === c.id ? null : c.id))}
                className="flex w-full items-start gap-2 text-left"
              >
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {def.section}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {def.short}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone.chip}`}
                    >
                      {tone.label}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${LATCHABILITY_TONE[c.latchability]}`}
                      title="Latchability — would two renderers produce similar behavior?"
                    >
                      latch · {c.latchability}
                    </span>
                    {def.mapsTo && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-px font-mono text-[10px] text-muted-foreground/80">
                        <Link2 className="h-2.5 w-2.5" />
                        {def.mapsTo}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {c.notes || def.label}
                  </p>
                </div>
                {evidenceCount > 0 && (
                  <span className="mt-0.5 shrink-0 rounded border border-border bg-card/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {evidenceCount}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/80">Scope: </span>
                    {def.description}
                  </p>
                  {c.evidence.length > 0 ? (
                    <ul className="space-y-1.5">
                      {c.evidence.map((q, i) => (
                        <li
                          key={i}
                          className="rounded-md border-l-2 border-primary/30 pl-2 italic text-foreground/85"
                        >
                          &ldquo;{q}&rdquo;
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md border border-dashed border-border bg-card/30 p-2 text-[11px] italic text-muted-foreground">
                      No verbatim evidence — surface is{" "}
                      {c.presence === "missing" ? "missing" : "absent or only adjectival"}.
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// Coherence panel — waterfall findings (v3 §6)
// ============================================================================

const COHERENCE_TONE: Record<
  StaticCoherenceFinding["classification"],
  { chip: string; label: string; Icon: typeof AlertTriangle }
> = {
  unexplained_divergence: {
    chip: "bg-destructive/15 text-destructive-foreground border-destructive/40",
    label: "unexplained",
    Icon: XCircle,
  },
  explained_divergence: {
    chip: "bg-amber-500/10 text-amber-200 border-amber-500/40",
    label: "explained",
    Icon: AlertTriangle,
  },
  coherent: {
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
    label: "coherent",
    Icon: CheckCircle2,
  },
};

function coherenceLinkLabel(t: StaticCoherenceLinkType): string {
  return COHERENCE_LINKS.find((l) => l.type === t)?.label ?? t;
}

function CoherencePanel({
  coherence,
}: {
  coherence: StaticCoherenceFinding[];
}) {
  // Sort: unexplained > explained > coherent.
  const order: Record<StaticCoherenceFinding["classification"], number> = {
    unexplained_divergence: 0,
    explained_divergence: 1,
    coherent: 2,
  };
  const sorted = [...coherence].sort(
    (a, b) => order[a.classification] - order[b.classification],
  );
  return (
    <section>
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <GitBranch className="h-4 w-4 text-primary" />
          Coherence waterfall ({coherence.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Backstory → behavior cascade plus timeline, capital ↔ vulnerability, build / origin / voice cross-checks, and direct contradictions. Unexplained divergences are the high-leverage failures and always carry two options (add bridge / revise claim).
        </p>
      </div>
      <ul className="space-y-2">
        {sorted.map((c, i) => {
          const tone = COHERENCE_TONE[c.classification];
          const Icon = tone.Icon;
          return (
            <li
              key={i}
              className="rounded-md border border-border/60 bg-card/40 p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone.chip}`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {tone.label}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {coherenceLinkLabel(c.type)}
                </span>
              </div>
              <p className="mt-2 text-foreground/90">{c.what}</p>
              {c.evidence.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {c.evidence.map((e, j) => (
                    <li
                      key={j}
                      className="rounded-md border-l-2 border-primary/30 pl-3"
                    >
                      {e.label && (
                        <span className="mr-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {e.label}
                        </span>
                      )}
                      <span className="italic text-foreground/85">
                        &ldquo;{e.quote}&rdquo;
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {c.options && c.options.length > 0 && (
                <div className="mt-2 rounded-md border border-border/60 bg-background/30 p-2.5">
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="h-2.5 w-2.5 text-primary" />
                    {c.classification === "unexplained_divergence"
                      ? "Two options"
                      : "Bridge"}
                  </div>
                  <ul className="space-y-1">
                    {c.options.map((o, j) => (
                      <li
                        key={j}
                        className="leading-relaxed text-foreground/85"
                      >
                        <span className="mr-1.5 text-[10px] text-muted-foreground">
                          {j + 1}.
                        </span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ============================================================================
// Adversarial panel — four critical lenses (v3 §7)
// ============================================================================

const LENS_TONE: Record<StaticAdversarialLens, { chip: string; label: string }> = {
  trope: {
    chip: "bg-rose-500/10 text-rose-200 border-rose-500/40",
    label: "trope",
  },
  thinness: {
    chip: "bg-sky-500/10 text-sky-200 border-sky-500/40",
    label: "thinness",
  },
  evidence: {
    chip: "bg-violet-500/10 text-violet-200 border-violet-500/40",
    label: "evidence",
  },
  unexplored: {
    chip: "bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/40",
    label: "unexplored",
  },
};

function lensLabel(l: StaticAdversarialLens): string {
  return ADVERSARIAL_LENSES.find((a) => a.lens === l)?.label ?? l;
}

function AdversarialPanel({
  adversarial,
}: {
  adversarial: StaticAdversarialFinding[];
}) {
  const [activeLens, setActiveLens] = React.useState<
    StaticAdversarialLens | "all"
  >("all");
  const visible =
    activeLens === "all"
      ? adversarial
      : adversarial.filter((a) => a.lens === activeLens);
  const counts = adversarial.reduce<Record<StaticAdversarialLens, number>>(
    (acc, a) => ({ ...acc, [a.lens]: (acc[a.lens] ?? 0) + 1 }),
    { trope: 0, thinness: 0, evidence: 0, unexplored: 0 },
  );
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Swords className="h-4 w-4 text-primary" />
            Adversarial critique ({adversarial.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Judge attacks the card through four lenses (v3 §7). Findings flagged here often duplicate punchlist entries — these are the raw critic outputs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <FilterChip
            active={activeLens === "all"}
            label={`all · ${adversarial.length}`}
            onClick={() => setActiveLens("all")}
          />
          {(Object.keys(LENS_TONE) as StaticAdversarialLens[]).map((l) => {
            if (counts[l] === 0) return null;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLens(l)}
                className={`rounded-md border px-2 py-1 font-medium uppercase tracking-wider transition-colors ${
                  activeLens === l
                    ? LENS_TONE[l].chip
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {LENS_TONE[l].label} · {counts[l]}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="space-y-2">
        {visible.map((a, i) => {
          const tone = LENS_TONE[a.lens];
          const sevTone = PUNCHLIST_SEVERITY_TONE[a.severity];
          const SevIcon = sevTone.Icon;
          return (
            <li
              key={i}
              className="rounded-md border border-border/60 bg-card/40 p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone.chip}`}
                >
                  {lensLabel(a.lens)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sevTone.chip}`}
                >
                  <SevIcon className="h-2.5 w-2.5" />
                  {sevTone.label}
                </span>
              </div>
              <p className="mt-2 text-foreground/90">{a.critique}</p>
              {a.quote ? (
                <blockquote className="mt-2 rounded-md border-l-2 border-primary/30 pl-3 italic text-foreground/85">
                  &ldquo;{a.quote}&rdquo;
                </blockquote>
              ) : (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card/30 px-2 py-1 text-[11px] italic text-muted-foreground">
                  <CircleDashed className="h-2.5 w-2.5" />
                  about absence — no card passage to cite
                </div>
              )}
              {a.suggestion && (
                <div className="mt-2 rounded-md border border-border/60 bg-background/30 p-2.5">
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="h-2.5 w-2.5 text-primary" />
                    Suggested fix
                  </div>
                  <p className="leading-relaxed text-foreground/85">{a.suggestion}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
