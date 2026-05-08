"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { ModelBadge } from "@/components/ModelSelector";
import { CompositeScore, ScoreBar } from "@/components/ui/score-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  STATIC_EVAL_DIMENSIONS,
  buildStaticEvaluationExport,
  computeStaticGating,
  staticEvaluationExportFilename,
} from "@/lib/staticEvaluation";
import {
  deleteStaticEvaluation,
  getCharacters,
  getStaticEvaluations,
} from "@/lib/storage";
import { downloadText, formatRelativeTime } from "@/lib/utils";
import type {
  CardShape,
  CharacterCard,
  StaticDimId,
  StaticEvaluationReport,
} from "@/types";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Download,
  Filter,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type SortKey = "date" | "composite" | "character" | "shape";

export function StaticEvalsDashboard() {
  const [evals, setEvals] = React.useState<StaticEvaluationReport[]>([]);
  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [characterFilter, setCharacterFilter] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("date");
  const [sortDesc, setSortDesc] = React.useState(true);
  const [pendingDelete, setPendingDelete] =
    React.useState<StaticEvaluationReport | null>(null);
  const { toast } = useToast();

  const reload = React.useCallback(() => {
    setEvals(getStaticEvaluations());
    setCharacters(getCharacters());
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const charById = React.useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters],
  );

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteStaticEvaluation(pendingDelete.id);
    setPendingDelete(null);
    reload();
    toast({ title: "Static audit deleted", variant: "success" });
  }

  function handleDownload(report: StaticEvaluationReport) {
    const character = charById.get(report.characterId);
    const bundle = buildStaticEvaluationExport(report, character);
    downloadText(
      staticEvaluationExportFilename(report, character),
      JSON.stringify(bundle, null, 2),
      "application/json",
    );
  }

  // ---- Aggregates ----
  const totals = React.useMemo(() => {
    if (evals.length === 0) {
      return {
        count: 0,
        avgComposite: null as number | null,
        gatedPass: 0,
        gatedFail: 0,
        shapeMix: { open: 0, trajectory: 0, closed: 0, unknown: 0 } as Record<
          CardShape,
          number
        >,
      };
    }
    const cs = evals
      .map((e) => e.composite)
      .filter((v): v is number => typeof v === "number");
    const shapeMix: Record<CardShape, number> = {
      open: 0,
      trajectory: 0,
      closed: 0,
      unknown: 0,
    };
    let gatedPass = 0;
    let gatedFail = 0;
    for (const e of evals) {
      shapeMix[e.cardShape] = (shapeMix[e.cardShape] ?? 0) + 1;
      const gating = computeStaticGating(e.cardShape, e.scores, e.flags);
      if (gating.passes) gatedPass++;
      else gatedFail++;
    }
    return {
      count: evals.length,
      avgComposite: cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null,
      gatedPass,
      gatedFail,
      shapeMix,
    };
  }, [evals]);

  // ---- Per-character roll-ups ----
  interface StaticRollup {
    character: CharacterCard;
    reports: StaticEvaluationReport[];
    latest: StaticEvaluationReport;
    avgComposite: number | null;
    perDim: Record<StaticDimId, number | null>;
    latestGatePasses: boolean;
  }
  const characterRollups: StaticRollup[] = React.useMemo(() => {
    const byChar = new Map<string, StaticEvaluationReport[]>();
    for (const e of evals) {
      const arr = byChar.get(e.characterId) ?? [];
      arr.push(e);
      byChar.set(e.characterId, arr);
    }
    return Array.from(byChar.entries())
      .map(([cid, reports]) => {
        const c = charById.get(cid);
        if (!c) return null;
        // reports are already date-sorted desc by getStaticEvaluations.
        const latest = reports[0];
        const cs = reports
          .map((r) => r.composite)
          .filter((v): v is number => typeof v === "number");
        const perDim = {} as Record<StaticDimId, number | null>;
        for (const dim of STATIC_EVAL_DIMENSIONS) {
          const vals = reports
            .map((r) => r.scores[dim.id]?.score)
            .filter((v): v is number => typeof v === "number");
          perDim[dim.id] = vals.length
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null;
        }
        const gating = computeStaticGating(
          latest.cardShape,
          latest.scores,
          latest.flags,
        );
        return {
          character: c,
          reports,
          latest,
          avgComposite: cs.length
            ? cs.reduce((a, b) => a + b, 0) / cs.length
            : null,
          perDim,
          latestGatePasses: gating.passes,
        };
      })
      .filter((x): x is StaticRollup => x !== null);
  }, [evals, charById]);

  // ---- Filtered + sorted reports for table ----
  const filteredEvals = React.useMemo(() => {
    let list = evals;
    if (characterFilter) {
      list = list.filter((e) => e.characterId === characterFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => {
        const c = charById.get(e.characterId);
        return (
          (c?.name.toLowerCase().includes(q) ?? false) ||
          e.judgeModel.toLowerCase().includes(q) ||
          e.spine.toLowerCase().includes(q) ||
          e.cardShape.toLowerCase().includes(q)
        );
      });
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "composite":
          cmp = (a.composite ?? -1) - (b.composite ?? -1);
          break;
        case "shape":
          cmp = a.cardShape.localeCompare(b.cardShape);
          break;
        case "character":
          cmp = (charById.get(a.characterId)?.name ?? "").localeCompare(
            charById.get(b.characterId)?.name ?? "",
          );
          break;
        case "date":
        default:
          cmp = a.createdAt - b.createdAt;
      }
      return sortDesc ? -cmp : cmp;
    });
    return sorted;
  }, [evals, characterFilter, search, sortKey, sortDesc, charById]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  }

  return (
    <div>
      {loaded && evals.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" />}
          title="No static audits yet"
          description="Static audits read the character card directly — no chat needed. The judge scores the six static dimensions, detects card shape, and applies gating."
          action={
            <Link href="/evaluate?type=static">
              <Button>
                <ScrollText className="h-4 w-4" />
                Run a static audit
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Suite-level overview */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SuiteStat
              label="Audits"
              value={totals.count.toString()}
              hint={`${characterRollups.length} character${
                characterRollups.length === 1 ? "" : "s"
              }`}
            />
            <CompositeScore
              label="Avg composite"
              score={totals.avgComposite}
              hint="Mean of the 6 dim scores across audits"
            />
            <GatePassStat
              pass={totals.gatedPass}
              fail={totals.gatedFail}
            />
            <ShapeMixStat mix={totals.shapeMix} total={totals.count} />
          </div>

          {/* Per-character rollups */}
          {characterRollups.length > 0 && (
            <section className="mt-10">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-semibold">By character</h2>
                  <p className="text-xs text-muted-foreground">
                    Latest audit per character (with average composite across
                    all audits if you&apos;ve re-run after edits).
                  </p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {characterRollups.map((r) => (
                  <CharacterRollupCard key={r.character.id} rollup={r} />
                ))}
              </div>
            </section>
          )}

          {/* All audits table */}
          <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">All audits</h2>
                <p className="text-xs text-muted-foreground">
                  {filteredEvals.length} of {evals.length} audit
                  {evals.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by character, shape, judge…"
                    className="h-9 w-64 pl-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select
                    value={characterFilter}
                    onChange={(e) => setCharacterFilter(e.target.value)}
                    className="h-9 w-44 text-xs"
                  >
                    <option value="">All characters</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-card/40">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <ThSortable
                      label="Character"
                      onClick={() => toggleSort("character")}
                      active={sortKey === "character"}
                      desc={sortDesc}
                    />
                    <ThSortable
                      label="Shape"
                      onClick={() => toggleSort("shape")}
                      active={sortKey === "shape"}
                      desc={sortDesc}
                    />
                    <th className="px-3 py-2 font-medium">Judge</th>
                    <ThSortable
                      label="Composite"
                      onClick={() => toggleSort("composite")}
                      active={sortKey === "composite"}
                      desc={sortDesc}
                    />
                    <th className="px-3 py-2 font-medium">Gate</th>
                    <th className="px-3 py-2 font-medium">Flags</th>
                    <ThSortable
                      label="When"
                      onClick={() => toggleSort("date")}
                      active={sortKey === "date"}
                      desc={sortDesc}
                    />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredEvals.map((e) => {
                    const c = charById.get(e.characterId);
                    const gating = computeStaticGating(e.cardShape, e.scores, e.flags);
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-border/50 transition-colors hover:bg-card/40"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar
                              src={c?.avatarUrl}
                              name={c?.name ?? "?"}
                              size={26}
                            />
                            <span className="text-sm">
                              {c?.name ?? "(deleted)"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <ShapeBadge shape={e.cardShape} />
                        </td>
                        <td className="px-3 py-2">
                          <ModelBadge modelId={e.judgeModel} />
                        </td>
                        <td className="px-3 py-2 w-32">
                          <ScoreBar score={e.composite} variant="default" />
                        </td>
                        <td className="px-3 py-2">
                          {gating.passes ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
                            >
                              <ShieldCheck className="h-3 w-3" /> Pass
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              <ShieldAlert className="h-3 w-3" /> Fail · {gating.failures.length}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <RowFlags report={e} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {formatRelativeTime(e.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/evaluations/static/${e.id}`}
                              className="text-xs text-foreground/80 underline underline-offset-2 hover:text-foreground"
                            >
                              Open
                            </Link>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleDownload(e)}
                              aria-label="Download static audit as JSON"
                              title="Download JSON"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setPendingDelete(e)}
                              aria-label="Delete static audit"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this static audit?"
        description={
          pendingDelete
            ? `This permanently removes the audit for ${
                charById.get(pendingDelete.characterId)?.name ?? "(deleted character)"
              } from ${formatRelativeTime(pendingDelete.createdAt)}.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Stats
// ============================================================================

function SuiteStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function GatePassStat({ pass, fail }: { pass: number; fail: number }) {
  const total = pass + fail;
  const tone =
    total === 0
      ? "border-border bg-card/60"
      : fail === 0
        ? "border-emerald-500/30 bg-emerald-500/10"
        : pass === 0
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/30 bg-amber-500/10";
  const text =
    total === 0
      ? "text-foreground"
      : fail === 0
        ? "text-emerald-300"
        : pass === 0
          ? "text-destructive-foreground"
          : "text-amber-300";
  return (
    <div className={`rounded-xl border p-5 ${tone}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Gate verdict
      </div>
      <div className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${text}`}>
        {fail === 0 && total > 0 ? (
          <ShieldCheck className="h-5 w-5" />
        ) : (
          <ShieldAlert className="h-5 w-5" />
        )}
        {pass}
        <span className="text-base text-muted-foreground"> / {total} pass</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {fail === 0 && total > 0
          ? "Every audited card passes its shape's gate."
          : `${fail} of ${total} audit${total === 1 ? "" : "s"} failed gating.`}
      </div>
    </div>
  );
}

function ShapeMixStat({
  mix,
  total,
}: {
  mix: Record<CardShape, number>;
  total: number;
}) {
  return (
    <Card className="p-5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Shape mix
      </div>
      <div className="mt-2 space-y-1.5 text-xs">
        <ShapeRow label="Open" count={mix.open ?? 0} total={total} />
        <ShapeRow label="Trajectory" count={mix.trajectory ?? 0} total={total} />
        <ShapeRow label="Closed" count={mix.closed ?? 0} total={total} />
        {mix.unknown > 0 && (
          <ShapeRow label="Unknown" count={mix.unknown ?? 0} total={total} />
        )}
      </div>
    </Card>
  );
}

function ShapeRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : (count / total) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="relative flex-1 overflow-hidden rounded-full bg-muted/30 h-1.5">
        <div
          className="absolute inset-y-0 left-0 bg-primary/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono tabular-nums text-foreground/80">
        {count}
      </span>
    </div>
  );
}

function ShapeBadge({ shape }: { shape: CardShape }) {
  const tone =
    shape === "open"
      ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300"
      : shape === "trajectory"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
        : shape === "closed"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-border bg-card/40 text-muted-foreground";
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${tone}`}>
      {shape}
    </Badge>
  );
}

function RowFlags({ report }: { report: StaticEvaluationReport }) {
  const errors = report.flags.filter((f) => f.severity === "error").length;
  const warnings = report.flags.filter((f) => f.severity === "warning").length;
  const infos = report.flags.filter((f) => f.severity === "info").length;
  if (report.flags.length === 0) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {errors > 0 && (
        <Badge variant="destructive" className="text-[10px]">
          {errors} err
        </Badge>
      )}
      {warnings > 0 && (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-200 text-[10px]"
        >
          {warnings} warn
        </Badge>
      )}
      {infos > 0 && (
        <Badge variant="muted" className="text-[10px]">
          {infos} info
        </Badge>
      )}
    </div>
  );
}

function ThSortable({
  label,
  onClick,
  active,
  desc,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  desc: boolean;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? "text-foreground" : "hover:text-foreground"
        }`}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${
            active && !desc ? "rotate-180" : ""
          } transition-transform`}
        />
      </button>
    </th>
  );
}

// ============================================================================
// Per-character rollup card
// ============================================================================

interface StaticRollup {
  character: CharacterCard;
  reports: StaticEvaluationReport[];
  latest: StaticEvaluationReport;
  avgComposite: number | null;
  perDim: Record<StaticDimId, number | null>;
  latestGatePasses: boolean;
}

function CharacterRollupCard({ rollup }: { rollup: StaticRollup }) {
  const { character, reports, latest, avgComposite, perDim, latestGatePasses } = rollup;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Avatar src={character.avatarUrl} name={character.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">
                {character.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {reports.length} audit{reports.length === 1 ? "" : "s"}
                </span>
                <ShapeBadge shape={latest.cardShape} />
                {latestGatePasses ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
                  >
                    <ShieldCheck className="h-3 w-3" /> Gate pass
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">
                    <ShieldAlert className="h-3 w-3" /> Gate fail
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <Link
                href={`/evaluations/static/${latest.id}`}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Latest →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <CompositeScore
          label="Avg composite (across audits)"
          score={avgComposite}
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Six dimensions (mean across audits)
        </div>
        <div className="flex flex-col gap-1">
          {STATIC_EVAL_DIMENSIONS.map((dim) => (
            <div key={dim.id} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                {dim.number}
              </span>
              <span
                className="flex-1 truncate text-[11px] text-foreground/70"
                title={dim.label}
              >
                {dim.short}
              </span>
              <ScoreBar
                score={perDim[dim.id]}
                variant="compact"
                className="w-16"
              />
              <span className="w-8 text-right font-mono text-[10px] tabular-nums text-foreground/70">
                {perDim[dim.id] === null
                  ? "—"
                  : (perDim[dim.id] as number).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {latest.spine && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Latest spine
          </div>
          <p className="text-xs italic text-foreground/80">
            &ldquo;{latest.spine}&rdquo;
          </p>
        </div>
      )}

      {latest.flags.filter((f) => f.severity !== "info").length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            Latest flags ({latest.flags.length})
          </div>
          <ul className="space-y-1 text-xs text-foreground/80">
            {latest.flags
              .filter((f) => f.severity !== "info")
              .slice(0, 3)
              .map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] uppercase ${
                      f.severity === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive-foreground"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {f.severity}
                  </span>
                  <span className="line-clamp-1">{f.label}</span>
                </li>
              ))}
            {latest.flags.length > 3 && (
              <li className="text-[10px] italic text-muted-foreground">
                +{latest.flags.length - 3} more — open the report for full list
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  );
}
