"use client";

import * as React from "react";
import { notFound, useParams } from "next/navigation";
import { PromptPresetForm } from "@/components/PromptPresetForm";
import { PageHeader } from "@/components/PageHeader";
import { getPromptPreset } from "@/lib/storage";
import type { PromptPreset } from "@/types";

export default function EditPromptPresetPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [preset, setPreset] = React.useState<PromptPreset | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!id) return;
    setPreset(getPromptPreset(id) ?? null);
  }, [id]);

  if (preset === undefined) {
    return (
      <div className="container py-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (preset === null) {
    notFound();
  }

  return (
    <div className="container py-8">
      <PageHeader
        title={`Edit: ${preset.title}`}
        description="Edits apply to new sessions and to existing sessions that reference this preset."
      />
      <PromptPresetForm mode="edit" initial={preset} />
    </div>
  );
}
