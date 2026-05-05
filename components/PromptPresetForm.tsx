"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { savePromptPreset } from "@/lib/storage";
import { importPromptPresetFromRaw } from "@/lib/seedPrompts";
import { uid } from "@/lib/utils";
import type { PromptPreset, PromptPresetModule } from "@/types";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

interface PromptPresetFormProps {
  initial?: PromptPreset;
  mode: "new" | "edit";
}

export function PromptPresetForm({ initial, mode }: PromptPresetFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [author, setAuthor] = React.useState(initial?.author ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [tagsInput, setTagsInput] = React.useState(initial?.tags?.join(", ") ?? "");
  const [recommendedTemperature, setRecommendedTemperature] = React.useState(
    initial?.recommendedTemperature !== undefined
      ? String(initial.recommendedTemperature)
      : "",
  );
  const [modules, setModules] = React.useState<PromptPresetModule[]>(
    initial?.modules ?? [],
  );
  const [importOpen, setImportOpen] = React.useState(false);
  const [importJson, setImportJson] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const tags = React.useMemo(
    () =>
      tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput],
  );

  const builtIn = !!initial?.builtIn;

  function newModuleId(): string {
    let attempt = `module-${modules.length + 1}`;
    let i = modules.length + 1;
    const seen = new Set(modules.map((m) => m.id));
    while (seen.has(attempt)) {
      i += 1;
      attempt = `module-${i}`;
    }
    return attempt;
  }

  function addModule() {
    const id = newModuleId();
    const next: PromptPresetModule = {
      id,
      name: "Untitled module",
      description: "",
      content: "",
      isCore: false,
    };
    setModules((m) => [...m, next]);
    setExpanded((e) => ({ ...e, [id]: true }));
  }

  function updateModule(id: string, patch: Partial<PromptPresetModule>) {
    setModules((all) => all.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function removeModule(id: string) {
    setModules((all) => all.filter((m) => m.id !== id));
  }

  function moveModule(id: string, dir: -1 | 1) {
    setModules((all) => {
      const idx = all.findIndex((m) => m.id === id);
      if (idx < 0) return all;
      const target = idx + dir;
      if (target < 0 || target >= all.length) return all;
      const next = [...all];
      const [removed] = next.splice(idx, 1);
      next.splice(target, 0, removed);
      return next;
    });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required.";
    if (modules.length === 0) e.modules = "Add at least one module.";
    for (const m of modules) {
      if (!m.content.trim()) {
        e.modules = `"${m.name || m.id}" has no content.`;
        break;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      toast({ title: "Some fields need attention", variant: "error" });
      return;
    }
    const now = Date.now();
    const tempNum = recommendedTemperature.trim()
      ? Number(recommendedTemperature)
      : undefined;
    const preset: PromptPreset = {
      id: initial?.id ?? uid(),
      title: title.trim(),
      description: description.trim() || undefined,
      author: author.trim() || undefined,
      category: initial?.category,
      tags: tags.length > 0 ? tags : undefined,
      modules: modules.map((m) => ({
        ...m,
        name: m.name.trim() || "Untitled module",
        description: m.description?.trim() || undefined,
        content: m.content,
      })),
      recommendedTemperature:
        tempNum !== undefined && Number.isFinite(tempNum) ? tempNum : undefined,
      recommendedModels: initial?.recommendedModels,
      builtIn: initial?.builtIn ?? false,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    savePromptPreset(preset);
    toast({
      title: mode === "new" ? "Preset created" : "Preset updated",
      variant: "success",
    });
    router.push("/prompts");
  }

  function handleImport() {
    try {
      const parsed = JSON.parse(importJson);
      const preset = importPromptPresetFromRaw(parsed, uid());
      setTitle(preset.title);
      setDescription(preset.description ?? "");
      setAuthor(preset.author ?? "");
      setTagsInput(preset.tags?.join(", ") ?? "");
      setRecommendedTemperature(
        preset.recommendedTemperature !== undefined
          ? String(preset.recommendedTemperature)
          : "",
      );
      setModules(preset.modules);
      setImportOpen(false);
      setImportJson("");
      toast({ title: "Imported preset draft", variant: "success" });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Invalid JSON",
        variant: "error",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">Preset details</CardTitle>
            {mode === "new" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Import JSON
              </Button>
            )}
          </div>
          {builtIn && (
            <CardDescription>
              This is a built-in preset. Edits here override the bundled
              version locally.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cinematic Narrator"
            />
            {errors.title && (
              <p className="text-xs text-destructive-foreground">
                {errors.title}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="author">Author (optional)</Label>
              <Input
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Alyn"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature">Recommended temperature (optional)</Label>
              <Input
                id="temperature"
                value={recommendedTemperature}
                onChange={(e) => setRecommendedTemperature(e.target.value)}
                placeholder="e.g. 0.65"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One or two sentences explaining what this preset does."
              className="min-h-[70px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (optional, comma-separated)</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="narrator, roleplay, NSFW"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="muted" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Modules <span className="text-destructive">*</span>
              </CardTitle>
              <CardDescription>
                Core modules are always active. Optional modules can be toggled
                per session.
              </CardDescription>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addModule}>
              <Plus className="h-3.5 w-3.5" />
              Add module
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {modules.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No modules yet. Click <strong>Add module</strong> or{" "}
              <strong>Import JSON</strong> to start.
            </p>
          ) : (
            modules.map((m, idx) => {
              const isExpanded = expanded[m.id] ?? false;
              return (
                <div
                  key={m.id}
                  className="rounded-lg border border-border bg-card/40 p-3"
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [m.id]: !isExpanded }))
                      }
                      className="mt-1 text-muted-foreground hover:text-foreground"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={m.name}
                          onChange={(e) =>
                            updateModule(m.id, { name: e.target.value })
                          }
                          placeholder="Module name"
                          className="h-8 max-w-xs text-sm"
                        />
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={m.isCore}
                            onChange={(e) =>
                              updateModule(m.id, { isCore: e.target.checked })
                            }
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          Core (always on)
                        </label>
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={idx === 0}
                            onClick={() => moveModule(m.id, -1)}
                            className="h-7 px-2 text-xs"
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={idx === modules.length - 1}
                            onClick={() => moveModule(m.id, 1)}
                            className="h-7 px-2 text-xs"
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeModule(m.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label="Remove module"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {isExpanded && (
                        <>
                          <Input
                            value={m.description ?? ""}
                            onChange={(e) =>
                              updateModule(m.id, { description: e.target.value })
                            }
                            placeholder="Short description (optional)"
                            className="h-8 text-xs"
                          />
                          <Textarea
                            value={m.content}
                            onChange={(e) =>
                              updateModule(m.id, { content: e.target.value })
                            }
                            placeholder="Module content — instructions sent to the model when active."
                            className="min-h-[180px] font-mono text-[12px]"
                          />
                        </>
                      )}
                      {!isExpanded && m.content && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {m.content.slice(0, 220)}
                          {m.content.length > 220 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {errors.modules && (
            <p className="text-xs text-destructive-foreground">
              {errors.modules}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/prompts")}
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit">
          <Save className="h-4 w-4" />
          {mode === "new" ? "Create preset" : "Save changes"}
        </Button>
      </div>

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import preset from JSON"
        description="Paste a preset JSON (the same shape as files in the /prompts folder). Title, modules, tags and recommendations will be loaded into the form for you to review before saving."
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"title": "...", "modules": [{"name": "...", "content": "...", "isCore": true}]}'
            className="min-h-[200px] font-mono text-[12px]"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={!importJson.trim()}
            >
              Load into form
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}
