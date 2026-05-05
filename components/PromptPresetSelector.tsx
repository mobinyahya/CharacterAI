"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { PromptPreset, SessionPromptConfig } from "@/types";
import { Sparkles, Lock } from "lucide-react";

interface PromptPresetSelectorProps {
  presets: PromptPreset[];
  config: SessionPromptConfig | undefined;
  onChange: (next: SessionPromptConfig | undefined) => void;
  /** When true, shows compact layout (e.g. inside session settings dialog). */
  compact?: boolean;
}

export function PromptPresetSelector({
  presets,
  config,
  onChange,
  compact = false,
}: PromptPresetSelectorProps) {
  const presetId = config?.presetId ?? "";
  const preset = presets.find((p) => p.id === presetId);
  const enabledIds = new Set(config?.enabledModuleIds ?? []);

  function setPreset(nextId: string) {
    if (!nextId) {
      onChange(undefined);
      return;
    }
    const next = presets.find((p) => p.id === nextId);
    if (!next) {
      onChange(undefined);
      return;
    }
    // Default: no optional modules enabled (cores are always on).
    onChange({
      presetId: next.id,
      enabledModuleIds: [],
    });
  }

  function toggleModule(id: string, checked: boolean) {
    if (!preset) return;
    const next = new Set(enabledIds);
    if (checked) next.add(id);
    else next.delete(id);
    onChange({
      presetId: preset.id,
      enabledModuleIds: Array.from(next),
    });
  }

  const optionalModules = preset?.modules.filter((m) => !m.isCore) ?? [];
  const coreModules = preset?.modules.filter((m) => m.isCore) ?? [];

  return (
    <div className={compact ? "space-y-3" : "space-y-3"}>
      <Select value={presetId} onChange={(e) => setPreset(e.target.value)}>
        <option value="">— None (character card only) —</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.author ? ` · ${p.author}` : ""}
          </option>
        ))}
      </Select>

      {preset && (
        <div className="rounded-lg border border-border bg-card/40 p-3">
          {preset.description && !compact && (
            <p className="mb-3 text-xs text-muted-foreground">
              {preset.description}
            </p>
          )}

          {coreModules.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Core (always on)
              </div>
              <div className="flex flex-col gap-1">
                {coreModules.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 text-xs text-foreground/80"
                  >
                    <Lock className="h-3 w-3 text-muted-foreground" />
                    <span>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optionalModules.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Optional modules
              </div>
              <div className="flex flex-col gap-1.5">
                {optionalModules.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-accent/40"
                  >
                    <input
                      type="checkbox"
                      checked={enabledIds.has(m.id)}
                      onChange={(e) => toggleModule(m.id, e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground/90">
                        {m.name}
                      </div>
                      {m.description && (
                        <div className="text-[11px] text-muted-foreground">
                          {m.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {coreModules.length === 0 && optionalModules.length === 0 && (
            <p className="text-xs text-muted-foreground">
              This preset has no modules.
            </p>
          )}

          {!compact && preset.recommendedTemperature !== undefined && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              Suggested temperature:{" "}
              <Badge variant="muted" className="text-[10px]">
                {preset.recommendedTemperature.toFixed(2)}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
