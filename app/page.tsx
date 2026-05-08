"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ModelBadge } from "@/components/ModelSelector";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  deleteSession,
  getCharacters,
  getEvaluations,
  getPersonas,
  getPromptPresets,
  getSessions,
  getStaticEvaluations,
} from "@/lib/storage";
import { formatRelativeTime, truncate } from "@/lib/utils";
import type {
  CharacterCard,
  EvaluationReport,
  PromptPreset,
  Session,
  StaticEvaluationReport,
  UserPersona,
} from "@/types";
import {
  BarChart3,
  FileText,
  Gavel,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

export default function DashboardPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [personas, setPersonas] = React.useState<UserPersona[]>([]);
  const [presets, setPresets] = React.useState<PromptPreset[]>([]);
  const [evaluations, setEvaluations] = React.useState<EvaluationReport[]>([]);
  const [staticEvals, setStaticEvals] = React.useState<StaticEvaluationReport[]>(
    [],
  );
  const [loaded, setLoaded] = React.useState(false);

  const reload = React.useCallback(() => {
    setSessions(getSessions());
    setCharacters(getCharacters());
    setPersonas(getPersonas());
    setPresets(getPromptPresets());
    setEvaluations(getEvaluations());
    setStaticEvals(getStaticEvaluations());
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function handleDeleteSession(id: string) {
    deleteSession(id);
    toast({ title: "Session deleted", variant: "success" });
    reload();
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Workshop"
        description="Build characters with psychological depth, audit cards statically, run them through dynamic-eval personas, and ship the ones that hold."
        actions={
          <Link href="/chat/new">
            <Button>
              <MessageSquarePlus className="h-4 w-4" />
              New chat
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <StatCard
          icon={<Users className="h-4 w-4 text-primary" />}
          label="Characters"
          value={characters.length}
          href="/characters"
          ctaLabel="Open library"
        />
        <StatCard
          icon={<UserCog className="h-4 w-4 text-primary" />}
          label="Personas"
          value={personas.length}
          href="/personas"
          ctaLabel="Open personas"
        />
        <StatCard
          icon={<FileText className="h-4 w-4 text-primary" />}
          label="Prompt presets"
          value={presets.length}
          href="/prompts"
          ctaLabel="Open prompts"
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4 text-primary" />}
          label="Sessions"
          value={sessions.length}
          href="/chat/new"
          ctaLabel="Start new chat"
        />
        <StatCard
          icon={<ScrollText className="h-4 w-4 text-primary" />}
          label="Static audits"
          value={staticEvals.length}
          href="/evaluations?type=static"
          ctaLabel="Open audits"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          label="Dynamic Evals"
          value={evaluations.length}
          href="/evaluations"
          ctaLabel="Open dashboard"
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent sessions</h2>
            {sessions.length > 0 && (
              <Link
                href="/chat/new"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Start another
              </Link>
            )}
          </div>

          {loaded && sessions.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="No sessions yet"
              description="Sessions show up here as soon as you start chatting with a character."
              action={
                <Link href="/chat/new">
                  <Button>
                    <MessageSquarePlus className="h-4 w-4" />
                    Start your first chat
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.slice(0, 12).map((s) => {
                const c = characters.find((x) => x.id === s.characterId);
                const personaName =
                  s.personaSnapshot?.name ??
                  (s.personaId
                    ? personas.find((x) => x.id === s.personaId)?.name
                    : undefined);
                if (!c) return null;
                const lastMsg = s.messages[s.messages.length - 1];
                return (
                  <Link
                    key={s.id}
                    href={`/chat/${s.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-card"
                  >
                    <Avatar src={c.avatarUrl} name={c.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.name}
                        </span>
                        {personaName && (
                          <Badge variant="default" className="text-[10px]">
                            auto · {personaName}
                          </Badge>
                        )}
                        <ModelBadge modelId={s.model} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {lastMsg
                          ? truncate(lastMsg.content, 120)
                          : "No messages yet"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div className="hidden text-[11px] text-muted-foreground sm:block">
                        {formatRelativeTime(s.updatedAt)}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteSession(s.id);
                        }}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete session"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Quick start</h2>
          <Card className="p-4">
            <div className="space-y-3 text-sm">
              <Link
                href="/characters/new"
                className="flex items-center gap-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Create a character
              </Link>
              <Link
                href="/personas/new"
                className="flex items-center gap-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Create a dynamic-eval persona
              </Link>
              <Link
                href="/prompts/new"
                className="flex items-center gap-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Create a prompt preset
              </Link>
              <Link
                href="/chat/new"
                className="flex items-center gap-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Sparkles className="h-4 w-4" />
                Run an auto-pilot session
              </Link>
              <Link
                href="/evaluate?type=static"
                className="flex items-center gap-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ScrollText className="h-4 w-4" />
                Audit a card (static)
              </Link>
              <Link
                href="/evaluate"
                className="flex items-center gap-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Gavel className="h-4 w-4" />
                Run a Dynamic Eval
              </Link>
            </div>
          </Card>

          <h3 className="mb-3 mt-6 text-xs uppercase tracking-wider text-muted-foreground">
            Characters
          </h3>
          {characters.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No characters yet —{" "}
              <Link
                href="/characters/new"
                className="text-foreground underline underline-offset-2"
              >
                make one
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {characters.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={`/chat/new?character=${c.id}`}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 p-2 text-sm transition-colors hover:border-primary/40 hover:bg-card"
                >
                  <Avatar src={c.avatarUrl} name={c.name} size={28} />
                  <span className="truncate">{c.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  ctaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  ctaLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <Link
          href={href}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {ctaLabel} →
        </Link>
      </CardContent>
    </Card>
  );
}
