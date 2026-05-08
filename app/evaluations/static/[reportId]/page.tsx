"use client";

import * as React from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StaticEvaluationReportView } from "@/components/StaticEvaluationReportView";
import {
  getCharacter,
  getStaticEvaluation,
  getStaticEvaluationsForCharacter,
} from "@/lib/storage";
import type {
  CharacterCard,
  StaticEvaluationReport,
} from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, FileText, Gavel, ScrollText } from "lucide-react";

interface State {
  status: "loading" | "missing" | "ready";
  report?: StaticEvaluationReport;
  character?: CharacterCard;
  history: StaticEvaluationReport[];
}

export default function StaticEvaluationDetailPage() {
  const params = useParams<{ reportId: string }>();
  const reportId = params?.reportId;

  const [state, setState] = React.useState<State>({
    status: "loading",
    history: [],
  });
  const [activeId, setActiveId] = React.useState<string | undefined>(reportId);

  React.useEffect(() => {
    if (!reportId) return;
    const report = getStaticEvaluation(reportId);
    if (!report) {
      setState({ status: "missing", history: [] });
      return;
    }
    const character = getCharacter(report.characterId);
    const history = getStaticEvaluationsForCharacter(report.characterId);
    setState({ status: "ready", report, character, history });
    setActiveId(report.id);
  }, [reportId]);

  if (state.status === "loading") {
    return (
      <div className="container py-10 text-sm text-muted-foreground">
        Loading audit…
      </div>
    );
  }
  if (state.status === "missing") notFound();

  const { report, character, history } = state;
  if (!report) return null;

  const active = history.find((r) => r.id === activeId) ?? report;

  return (
    <div className="container py-8">
      <BackLink />

      {history.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <span className="self-center text-[11px] uppercase tracking-wider text-muted-foreground">
            History:
          </span>
          {history.map((r) => (
            <Link
              key={r.id}
              href={`/evaluations/static/${r.id}`}
              onClick={(e) => {
                // soft-update the active report without a full route change
                e.preventDefault();
                setActiveId(r.id);
                window.history.replaceState(
                  null,
                  "",
                  `/evaluations/static/${r.id}`,
                );
              }}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                r.id === active.id
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-card/40 text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              {formatRelativeTime(r.createdAt)} · {r.composite?.toFixed(1) ?? "—"} ·{" "}
              {r.cardShape}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {character ? null : (
            <PageHeader
              title="Character missing"
              description="This audit references a character that no longer exists in the library."
            />
          )}
          <StaticEvaluationReportView
            report={active}
            character={character}
            variant="full"
          />
        </div>

        <aside className="space-y-3">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Character
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold">
              {character?.name ?? "(deleted)"}
            </h3>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Audits</span>
                <span className="tabular-nums">{history.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Latest</span>
                <span className="tabular-nums">
                  {history[0] && formatRelativeTime(history[0].createdAt)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {character && (
                <>
                  <Link href={`/characters/${character.id}/edit`}>
                    <Button variant="outline" size="sm" className="w-full">
                      <FileText className="h-3.5 w-3.5" />
                      Edit character
                    </Button>
                  </Link>
                  <Link
                    href={`/evaluate?type=static&characterId=${character.id}`}
                  >
                    <Button variant="ghost" size="sm" className="w-full">
                      <ScrollText className="h-3.5 w-3.5" />
                      Re-audit (static)
                    </Button>
                  </Link>
                  <Link
                    href={`/evaluate?characterId=${character.id}`}
                  >
                    <Button variant="ghost" size="sm" className="w-full">
                      <Gavel className="h-3.5 w-3.5" />
                      Run Dynamic Eval
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/evaluations?type=static"
      className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All static audits
    </Link>
  );
}
