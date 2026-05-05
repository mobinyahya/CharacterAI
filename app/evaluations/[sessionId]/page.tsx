"use client";

import * as React from "react";
import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationReportView } from "@/components/EvaluationReportView";
import {
  getCharacter,
  getEvaluationsForSession,
  getSession,
  resolveSessionPersona,
} from "@/lib/storage";
import type {
  CharacterCard,
  EvaluationReport,
  Session,
  UserPersona,
} from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Gavel, MessageSquare } from "lucide-react";

interface State {
  status: "loading" | "missing" | "ready";
  session?: Session;
  character?: CharacterCard;
  persona?: UserPersona;
  reports: EvaluationReport[];
}

export default function EvaluationDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const search = useSearchParams();
  const sessionId = params?.sessionId;
  const requestedReportId = search?.get("report") ?? undefined;

  const [state, setState] = React.useState<State>({
    status: "loading",
    reports: [],
  });
  const [activeId, setActiveId] = React.useState<string | undefined>(
    requestedReportId,
  );

  React.useEffect(() => {
    if (!sessionId) return;
    const session = getSession(sessionId);
    if (!session) {
      setState({ status: "missing", reports: [] });
      return;
    }
    const character = getCharacter(session.characterId);
    if (!character) {
      setState({ status: "missing", reports: [] });
      return;
    }
    const persona = resolveSessionPersona(session);
    const reports = getEvaluationsForSession(sessionId);
    setState({ status: "ready", session, character, persona, reports });
    if (!activeId && reports.length > 0) setActiveId(reports[0].id);
  }, [sessionId, activeId]);

  if (state.status === "loading") {
    return (
      <div className="container py-10 text-sm text-muted-foreground">
        Loading report…
      </div>
    );
  }
  if (state.status === "missing") notFound();

  const { session, character, persona, reports } = state;

  if (reports.length === 0) {
    return (
      <div className="container py-8">
        <BackLink />
        <PageHeader
          title="No evaluation yet"
          description={`There's no judge report for "${character?.name ?? "this session"}" yet. Open the chat and click Evaluate to score the transcript.`}
        />
        <EmptyState
          icon={<Gavel className="h-5 w-5" />}
          title="Run your first evaluation"
          description="The judge reads the transcript, applies the Cluster A + B rubric with anchor descriptions, and returns dimension-level scores with verbatim citations."
          action={
            <Link href={`/chat/${sessionId}`}>
              <Button>
                <MessageSquare className="h-4 w-4" />
                Open chat
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const active = reports.find((r) => r.id === activeId) ?? reports[0];

  return (
    <div className="container py-8">
      <BackLink />

      {reports.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <span className="self-center text-[11px] uppercase tracking-wider text-muted-foreground">
            History:
          </span>
          {reports.map((r) => {
            const a6 = r.flags.A6_resolutionAvoidance.triggered;
            const b6 = r.flags.B6_internalConsistency?.triggered ?? false;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveId(r.id)}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  r.id === active.id
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-card/40 text-muted-foreground hover:border-border/80 hover:text-foreground"
                }`}
              >
                {formatRelativeTime(r.createdAt)} · F
                {r.composite.faithfulness?.toFixed(1) ?? "—"} / Q
                {r.composite.quality?.toFixed(1) ?? "—"} / T
                {r.composite.texture?.toFixed(1) ?? "—"}
                {a6 && " · A6"}
                {b6 && " · B6"}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <EvaluationReportView
            report={active}
            character={character}
            persona={persona}
            variant="full"
          />
        </div>

        <aside className="space-y-3">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Session
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold">
              {character?.name}
            </h3>
            {persona && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                × {persona.name}
              </div>
            )}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Messages</span>
                <span className="tabular-nums">
                  {session?.messages.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="tabular-nums">
                  {session && formatRelativeTime(session.createdAt)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/chat/${sessionId}`}>
                <Button variant="outline" size="sm" className="w-full">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Open chat
                </Button>
              </Link>
              {character && (
                <Link href={`/characters/${character.id}/edit`}>
                  <Button variant="ghost" size="sm" className="w-full">
                    Edit character
                  </Button>
                </Link>
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
      href="/evaluations"
      className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All evaluations
    </Link>
  );
}
