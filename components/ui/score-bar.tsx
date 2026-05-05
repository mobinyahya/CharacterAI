"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/evaluation";

interface ScoreBarProps {
  score: number | null;
  /** "compact" hides the numeric label and shrinks the height. */
  variant?: "default" | "compact";
  className?: string;
}

const TONE_BG: Record<ReturnType<typeof scoreColor>, string> = {
  muted: "bg-muted-foreground/30",
  destructive: "bg-destructive",
  warning: "bg-amber-500",
  good: "bg-emerald-500/70",
  great: "bg-emerald-400",
};

const TONE_TEXT: Record<ReturnType<typeof scoreColor>, string> = {
  muted: "text-muted-foreground",
  destructive: "text-destructive-foreground",
  warning: "text-amber-300",
  good: "text-emerald-300",
  great: "text-emerald-200",
};

export function ScoreBar({ score, variant = "default", className }: ScoreBarProps) {
  const tone = scoreColor(score);
  const widthPct = score === null ? 0 : (score / 5) * 100;
  const isNa = score === null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-full bg-muted/40",
          variant === "compact" ? "h-1.5" : "h-2",
        )}
      >
        {!isNa && (
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BG[tone])}
            style={{ width: `${widthPct}%` }}
          />
        )}
      </div>
      {variant === "default" && (
        <span
          className={cn(
            "min-w-[2.5rem] text-right font-mono text-xs tabular-nums",
            isNa ? "text-muted-foreground" : TONE_TEXT[tone],
          )}
        >
          {isNa ? "N/A" : score.toFixed(1)}
        </span>
      )}
    </div>
  );
}

interface CompositeScoreProps {
  label: string;
  score: number | null;
  hint?: string;
  className?: string;
}

const CARD_TONE: Record<ReturnType<typeof scoreColor>, string> = {
  muted: "border-border bg-card/60",
  destructive: "border-destructive/40 bg-destructive/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  good: "border-emerald-500/30 bg-emerald-500/10",
  great: "border-emerald-400/40 bg-emerald-400/15",
};

export function CompositeScore({
  label,
  score,
  hint,
  className,
}: CompositeScoreProps) {
  const tone = scoreColor(score);
  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        CARD_TONE[tone],
        className,
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            "text-3xl font-semibold tabular-nums",
            score === null ? "text-muted-foreground" : TONE_TEXT[tone],
          )}
        >
          {score === null ? "—" : score.toFixed(2)}
        </span>
        <span className="text-sm text-muted-foreground">/ 5</span>
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
