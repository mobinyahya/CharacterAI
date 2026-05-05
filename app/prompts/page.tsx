"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deletePromptPreset, getPromptPresets } from "@/lib/storage";
import { truncate } from "@/lib/utils";
import type { PromptPreset } from "@/types";
import { FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

export default function PromptsPage() {
  const { toast } = useToast();
  const [presets, setPresets] = React.useState<PromptPreset[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<PromptPreset | null>(
    null,
  );

  const reload = React.useCallback(() => {
    setPresets(getPromptPresets());
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function doDelete() {
    if (!confirmDelete) return;
    deletePromptPreset(confirmDelete.id);
    toast({ title: `Deleted "${confirmDelete.title}"`, variant: "success" });
    setConfirmDelete(null);
    reload();
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Prompt presets"
        description="Reusable narrator / system-prompt presets that compose with the character card. Pick one (or none) per session and toggle individual modules."
        actions={
          <Link href="/prompts/new">
            <Button>
              <Plus className="h-4 w-4" />
              New preset
            </Button>
          </Link>
        }
      />

      {loaded && presets.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No prompt presets yet"
          description="Presets define the model's narrator style (perspective, dialogue rules, NSFW handling, etc.) on top of the character card."
          action={
            <Link href="/prompts/new">
              <Button>
                <Plus className="h-4 w-4" />
                Create your first preset
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {presets.map((p) => {
            const cores = p.modules.filter((m) => m.isCore).length;
            const optional = p.modules.length - cores;
            return (
              <Card key={p.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold">
                        {p.title}
                      </h3>
                      {p.builtIn && (
                        <Badge variant="muted" className="text-[10px]">
                          built-in
                        </Badge>
                      )}
                    </div>
                    {p.author && (
                      <p className="text-[11px] text-muted-foreground">
                        by {p.author}
                      </p>
                    )}
                    {p.description && (
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {truncate(p.description, 220)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {cores} core
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {optional} optional
                  </Badge>
                  {p.recommendedTemperature !== undefined && (
                    <span>
                      rec. temp {p.recommendedTemperature.toFixed(2)}
                    </span>
                  )}
                </div>

                {p.tags && p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.slice(0, 6).map((t) => (
                      <Badge key={t} variant="muted" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-end gap-1">
                  <Link href={`/prompts/${p.id}/edit`}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label="Delete"
                    onClick={() => setConfirmDelete(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete ? `Delete "${confirmDelete.title}"?` : ""}
        description="Sessions that referenced this preset will fall back to the character card alone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={doDelete}>
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
