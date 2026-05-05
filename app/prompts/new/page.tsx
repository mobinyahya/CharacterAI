"use client";

import { PromptPresetForm } from "@/components/PromptPresetForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewPromptPresetPage() {
  return (
    <div className="container py-8">
      <PageHeader
        title="New prompt preset"
        description="Define a narrator preset and its modules. You can paste a JSON file in the same shape as /prompts/base_prompt.json to load it as a starting point."
      />
      <PromptPresetForm mode="new" />
    </div>
  );
}
