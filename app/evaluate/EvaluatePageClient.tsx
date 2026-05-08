"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { EvaluationRunner } from "@/components/EvaluationRunner";
import { StaticEvaluationRunner } from "@/components/StaticEvaluationRunner";
import { cn } from "@/lib/utils";
import { Gavel, ScrollText } from "lucide-react";

type EvalType = "dynamic" | "static";

function isEvalType(v: string | null | undefined): v is EvalType {
  return v === "dynamic" || v === "static";
}

const TYPE_COPY: Record<
  EvalType,
  {
    title: string;
    description: string;
  }
> = {
  dynamic: {
    title: "Run a Dynamic Eval",
    description:
      "Pick a character, pick a user-driver persona, choose how many turns. The system runs an LLM ↔ LLM auto-pilot and a strong judge scores the transcript on the 18-dimension turn-based rubric (+ A6 / B6 flags) end-to-end.",
  },
  static: {
    title: "Run a Static Audit",
    description:
      "Pick a character. The judge reads the card directly — no chat, no persona — and scores the six static dimensions (structure, states, voice, self-gap, worldview, individuation) with card-shape detection, gating, and concrete card-level fixes.",
  },
};

export function EvaluatePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read type from URL so deep-links + back/forward work naturally.
  const typeParam = searchParams?.get("type");
  const type: EvalType = isEvalType(typeParam) ? typeParam : "dynamic";

  const setType = React.useCallback(
    (next: EvalType) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "dynamic") {
        params.delete("type");
      } else {
        params.set("type", next);
      }
      const qs = params.toString();
      router.replace(qs ? `/evaluate?${qs}` : "/evaluate");
    },
    [router, searchParams],
  );

  const copy = TYPE_COPY[type];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />

      <EvalTypeTabs value={type} onChange={setType} />

      <div className="mt-6">
        {type === "dynamic" ? <EvaluationRunner /> : <StaticEvaluationRunner />}
      </div>
    </>
  );
}

// ============================================================================
// Type tabs
// ============================================================================

function EvalTypeTabs({
  value,
  onChange,
}: {
  value: EvalType;
  onChange: (v: EvalType) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Evaluation type"
      className="inline-flex rounded-xl border border-border bg-card/40 p-1 text-sm shadow-sm"
    >
      <TabButton
        value="dynamic"
        active={value === "dynamic"}
        onClick={() => onChange("dynamic")}
        icon={<Gavel className="h-3.5 w-3.5" />}
        label="Dynamic"
        sub="Chat + judge"
      />
      <TabButton
        value="static"
        active={value === "static"}
        onClick={() => onChange("static")}
        icon={<ScrollText className="h-3.5 w-3.5" />}
        label="Static"
        sub="Card audit only"
      />
    </div>
  );
}

function TabButton({
  value,
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  value: EvalType;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`eval-panel-${value}`}
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
        <span className="text-sm font-medium">{label}</span>
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
