"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ModelBadge } from "@/components/ModelSelector";
import { CompositeScore, ScoreBar } from "@/components/ui/score-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  EVAL_DIMENSIONS,
  FAITHFULNESS_DIMS,
  QUALITY_DIMS,
} from "@/lib/evaluation";
import {
  getCharacters,
  getEvaluations,
  getPersonas,
} from "@/lib/storage";
import { formatRelativeTime } from "@/lib/utils";
import type {
  CharacterCard,
  EvaluationReport,
  UserPersona,
} from "@/types";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Filter,
  Gavel,
  Search,
} from "lucide-react";

type SortKey = "date" | "faithfulness" | "quality" | "character";

export default function EvaluationsDashboardPage() {
  const [evals, setEvals] = React.useState<EvaluationReport[]>([]);
  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [personas, setPersonas] = React.useState<UserPersona[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [characterFilter, setCharacterFilter] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("date");
  const [sortDesc, setSortDesc] = React.useState(true);

  const reload = React.useCallback(() => {
    setEvals(getEvaluations());
    setCharacters(getCharacters());
    setPersonas(getPersonas());
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const charById = React.useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters],
  );
  const personaById = React.useMemo(
    () => new Map(personas.map((p) => [p.id, p])),
    [personas],
  );

  // ---- Aggregates ----
  const totals = React.useMemo(() => {
    if (evals.length === 0) {
      return {
        count: 0,
        avgFaith: null as number | null,
        avgQuality: null as number | null,
        a6Rate: null as number | null,
      };
    }
    const fs = evals
      .map((e) => e.composite.faithfulness)
      .filter((v): v is number => typeof v === "number");
    const qs = evals
      .map((e) => e.composite.quality)
      .filter((v): v is number => typeof v === "number");
    const a6Triggered = evals.filter(
      (e) => e.flags.A6_resolutionAvoidance.triggered,
    ).length;
    return {
      count: evals.length,
      avgFaith: fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null,
      avgQuality: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null,
      a6Rate: a6Triggered / evals.length,
    };
  }, [evals]);

  // ---- Per-character roll-ups ----
  interface CharacterRollup {
    character: CharacterCard;
    reports: EvaluationReport[];
    avgFaith: number | null;
    avgQuality: number | null;
    a6Count: number;
    perDim: Record<string, number | null>;
    states: string[];
  }
  const characterRollups: CharacterRollup[] = React.useMemo(() => {
    const byChar = new Map<string, EvaluationReport[]>();
    for (const e of evals) {
      const arr = byChar.get(e.characterId) ?? [];
      arr.push(e);
      byChar.set(e.characterId, arr);
    }
    return Array.from(byChar.entries())
      .map(([cid, reports]) => {
        const c = charById.get(cid);
        if (!c) return null;
        const fs = reports
          .map((r) => r.composite.faithfulness)
          .filter((v): v is number => typeof v === "number");
        const qs = reports
          .map((r) => r.composite.quality)
          .filter((v): v is number => typeof v === "number");
        const perDim: Record<string, number | null> = {};
        for (const d of EVAL_DIMENSIONS) {
          const vals = reports
            .map((r) => r.scores[d.id]?.score)
            .filter((v): v is number => typeof v === "number");
          perDim[d.id] = vals.length
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null;
        }
        const states = Array.from(
          new Set(reports.flatMap((r) => r.statesActivated)),
        );
        return {
          character: c,
          reports,
          avgFaith: fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null,
          avgQuality: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null,
          a6Count: reports.filter((r) => r.flags.A6_resolutionAvoidance.triggered)
            .length,
          perDim,
          states,
        };
      })
      .filter((x): x is CharacterRollup => x !== null);
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
        const pName =
          e.personaName ??
          (e.personaId ? personaById.get(e.personaId)?.name : undefined);
        return (
          (c?.name.toLowerCase().includes(q) ?? false) ||
          (pName?.toLowerCase().includes(q) ?? false) ||
          e.judgeModel.toLowerCase().includes(q) ||
          e.driverModel.toLowerCase().includes(q) ||
          e.spine.toLowerCase().includes(q)
        );
      });
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "faithfulness":
          cmp =
            (a.composite.faithfulness ?? -1) - (b.composite.faithfulness ?? -1);
          break;
        case "quality":
          cmp = (a.composite.quality ?? -1) - (b.composite.quality ?? -1);
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
  }, [evals, characterFilter, search, sortKey, sortDesc, charById, personaById]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Evaluations"
        description="LLM-judge reports on auto-pilot transcripts. Cluster A scores card faithfulness; Cluster B scores session quality. Resolution-avoidance is the headline failure flag."
        actions={
          <Link href="/chat/new">
            <Button>
              <Gavel className="h-4 w-4" />
              Run new session
            </Button>
          </Link>
        }
      />

      {loaded && evals.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No evaluations yet"
          description="Start a chat (or auto-pilot session) with a character, then click Evaluate from the chat top-bar to score it. Reports show up here."
          action={
            <Link href="/chat/new">
              <Button>
                <Gavel className="h-4 w-4" />
                Start a session
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
              label="Reports"
              value={totals.count.toString()}
              hint={`${characterRollups.length} character${
                characterRollups.length === 1 ? "" : "s"
              }`}
            />
            <CompositeScore
              label="Avg faithfulness"
              score={totals.avgFaith}
              hint="Mean across all reports"
            />
            <CompositeScore
              label="Avg quality"
              score={totals.avgQuality}
              hint="Mean across all reports"
            />
            <FlagRateStat rate={totals.a6Rate ?? 0} count={totals.count} />
          </div>

          {/* By-character cards */}
          {characterRollups.length > 0 && (
            <section className="mt-10">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-semibold">By character</h2>
                  <p className="text-xs text-muted-foreground">
                    Aggregate over all reports for each character. Per-dimension
                    bars show the mean across runs.
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

          {/* All reports table */}
          <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">All reports</h2>
                <p className="text-xs text-muted-foreground">
                  {filteredEvals.length} of {evals.length} report
                  {evals.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by character, persona, model…"
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
                    <th className="px-3 py-2 font-medium">Persona</th>
                    <th className="px-3 py-2 font-medium">Models</th>
                    <ThSortable
                      label="Faith"
                      onClick={() => toggleSort("faithfulness")}
                      active={sortKey === "faithfulness"}
                      desc={sortDesc}
                    />
                    <ThSortable
                      label="Quality"
                      onClick={() => toggleSort("quality")}
                      active={sortKey === "quality"}
                      desc={sortDesc}
                    />
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
                    const personaLabel =
                      e.personaName ??
                      (e.personaId
                        ? personaById.get(e.personaId)?.name
                        : undefined);
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
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {personaLabel ?? (
                            <span className="opacity-60">manual</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <ModelBadge modelId={e.driverModel} />
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <ModelBadge modelId={e.judgeModel} />
                          </div>
                        </td>
                        <td className="px-3 py-2 w-32">
                          <ScoreBar
                            score={e.composite.faithfulness}
                            variant="default"
                          />
                        </td>
                        <td className="px-3 py-2 w-32">
                          <ScoreBar
                            score={e.composite.quality}
                            variant="default"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {e.flags.A6_resolutionAvoidance.triggered ? (
                            <Badge variant="destructive" className="text-[10px]">
                              A6
                            </Badge>
                          ) : e.flags.other.length > 0 ? (
                            <Badge variant="muted" className="text-[10px]">
                              {e.flags.other.length} other
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {formatRelativeTime(e.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/evaluations/${e.sessionId}?report=${e.id}`}
                            className="text-xs text-foreground/80 underline underline-offset-2 hover:text-foreground"
                          >
                            Open
                          </Link>
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
    </div>
  );
}

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

function FlagRateStat({ rate, count }: { rate: number; count: number }) {
  const triggered = Math.round(rate * count);
  const tone =
    rate === 0
      ? "good"
      : rate < 0.25
        ? "warning"
        : "destructive";
  const toneCls: Record<string, string> = {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    destructive:
      "border-destructive/40 bg-destructive/10 text-destructive-foreground",
  };
  return (
    <div className={`rounded-xl border p-5 ${toneCls[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        A6 — resolution-avoidance rate
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">
          {(rate * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {tone !== "good" && <AlertTriangle className="h-3 w-3" />}
        {triggered} of {count} report{count === 1 ? "" : "s"} flagged
      </div>
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

function CharacterRollupCard({
  rollup,
}: {
  rollup: {
    character: CharacterCard;
    reports: EvaluationReport[];
    avgFaith: number | null;
    avgQuality: number | null;
    a6Count: number;
    perDim: Record<string, number | null>;
    states: string[];
  };
}) {
  const { character, reports, avgFaith, avgQuality, a6Count, perDim, states } =
    rollup;
  const faithDimVals = FAITHFULNESS_DIMS.map((id) => ({
    id,
    score: perDim[id],
  }));
  const qualityDimVals = QUALITY_DIMS.map((id) => ({
    id,
    score: perDim[id],
  }));
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Avatar
          src={character.avatarUrl}
          name={character.name}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">
                {character.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {reports.length} report{reports.length === 1 ? "" : "s"}
                </span>
                {a6Count > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    A6 in {a6Count}
                  </Badge>
                )}
              </div>
            </div>
            <Link
              href={`/evaluations/${reports[0].sessionId}?report=${reports[0].id}`}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Latest →
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <CompositeScore label="Faithfulness" score={avgFaith} />
        <CompositeScore label="Quality" score={avgQuality} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DimColumn title="Cluster A" rows={faithDimVals} />
        <DimColumn title="Cluster B" rows={qualityDimVals} />
      </div>

      {states.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            States activated across reports (A2b coverage)
          </div>
          <div className="flex flex-wrap gap-1">
            {states.map((s) => (
              <Badge key={s} variant="muted" className="text-[10px]">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function DimColumn({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; score: number | null }[];
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => {
          const dim = EVAL_DIMENSIONS.find((d) => d.id === r.id);
          return (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                {r.id}
              </span>
              <span
                className="flex-1 truncate text-[11px] text-foreground/70"
                title={dim?.label}
              >
                {dim?.short}
              </span>
              <ScoreBar score={r.score} variant="compact" className="w-16" />
              <span className="w-8 text-right font-mono text-[10px] tabular-nums text-foreground/70">
                {r.score === null ? "—" : r.score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
