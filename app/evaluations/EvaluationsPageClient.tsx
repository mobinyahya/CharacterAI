"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DynamicEvalsDashboard } from "./DynamicEvalsDashboard";
import { StaticEvalsDashboard } from "./StaticEvalsDashboard";
import { getEvaluations, getStaticEvaluations } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Gavel, ScrollText } from "lucide-react";

type EvalType = "dynamic" | "static";

function isEvalType(v: string | null | undefined): v is EvalType {
  return v === "dynamic" || v === "static";
}

const TYPE_COPY: Record<EvalType, { title: string; description: string }> = {
  dynamic: {
    title: "Dynamic Evaluations",
    description:
      "LLM-judge reports on auto-pilot chat transcripts. Cluster A scores card faithfulness, B session quality, C+D emotional texture and narrative craft. A6 (resolution avoidance) and B6 (internal consistency) are binary failure flags.",
  },
  static: {
    title: "Static Audits",
    description:
      "LLM-judge audits of the character card itself — no chat. Six 0–5 dimensions plus card-shape detection (Open / Trajectory / Closed) and gating. Use these to catch shallow cards before you waste runtime on them.",
  },
};

export function EvaluationsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams?.get("type");
  const type: EvalType = isEvalType(typeParam) ? typeParam : "dynamic";

  // Counts in tab labels — read once on mount and again when the tab changes
  // so a freshly-saved report shows up in the badge.
  const [counts, setCounts] = React.useState<{ dynamic: number; static: number }>({
    dynamic: 0,
    static: 0,
  });
  React.useEffect(() => {
    setCounts({
      dynamic: getEvaluations().length,
      static: getStaticEvaluations().length,
    });
  }, [type]);

  const setType = React.useCallback(
    (next: EvalType) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "dynamic") {
        params.delete("type");
      } else {
        params.set("type", next);
      }
      const qs = params.toString();
      router.replace(qs ? `/evaluations?${qs}` : "/evaluations");
    },
    [router, searchParams],
  );

  const copy = TYPE_COPY[type];
  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          type === "dynamic" ? (
            <Link href="/evaluate">
              <Button>
                <Gavel className="h-4 w-4" />
                Run Dynamic Eval
              </Button>
            </Link>
          ) : (
            <Link href="/evaluate?type=static">
              <Button>
                <ScrollText className="h-4 w-4" />
                Run Static Audit
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-6">
        <DashboardTypeTabs
          value={type}
          onChange={setType}
          counts={counts}
        />
      </div>

      {type === "dynamic" ? <DynamicEvalsDashboard /> : <StaticEvalsDashboard />}
    </>
  );
}

// ============================================================================
// Tabs
// ============================================================================

function DashboardTypeTabs({
  value,
  onChange,
  counts,
}: {
  value: EvalType;
  onChange: (v: EvalType) => void;
  counts: { dynamic: number; static: number };
}) {
  return (
    <div
      role="tablist"
      aria-label="Evaluation type"
      className="inline-flex rounded-xl border border-border bg-card/40 p-1 text-sm shadow-sm"
    >
      <TabButton
        active={value === "dynamic"}
        onClick={() => onChange("dynamic")}
        icon={<Gavel className="h-3.5 w-3.5" />}
        label="Dynamic"
        sub="Chat + judge"
        count={counts.dynamic}
        controls="dynamic-panel"
      />
      <TabButton
        active={value === "static"}
        onClick={() => onChange("static")}
        icon={<ScrollText className="h-3.5 w-3.5" />}
        label="Static"
        sub="Card audit only"
        count={counts.static}
        controls="static-panel"
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  sub,
  count,
  controls,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  count: number;
  controls: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          active ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          <span
            className={cn(
              "rounded-full px-1.5 text-[10px] tabular-nums",
              active
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted-foreground/15 text-muted-foreground",
            )}
          >
            {count}
          </span>
        </span>
        <span
          className={cn(
            "text-[10px]",
            active ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {sub}
        </span>
      </span>
    </button>
  );
}
