"use client";

import * as React from "react";
import { AVAILABLE_MODELS } from "@/types";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
  showBadge?: boolean;
  compact?: boolean;
}

export function ModelSelector({
  value,
  onChange,
  className,
  showBadge = true,
  compact = false,
}: ModelSelectorProps) {
  const current = AVAILABLE_MODELS.find((m) => m.id === value);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={compact ? "h-8 text-xs" : ""}
      >
        {AVAILABLE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.provider}
            {m.contextLength ? ` (${m.contextLength})` : ""}
          </option>
        ))}
      </Select>
      {showBadge && current && (
        <Badge
          variant="outline"
          className={cn("hidden md:inline-flex", current.providerColor)}
        >
          {current.provider}
        </Badge>
      )}
    </div>
  );
}

export function ModelBadge({ modelId }: { modelId: string }) {
  const m = AVAILABLE_MODELS.find((x) => x.id === modelId);
  if (!m) {
    return (
      <Badge variant="outline" className="text-[10px]">
        {modelId}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-[10px]", m.providerColor)}>
      {m.label}
    </Badge>
  );
}
