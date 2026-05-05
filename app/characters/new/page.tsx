"use client";

import { CharacterCardForm } from "@/components/CharacterCardForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewCharacterPage() {
  return (
    <div className="container py-8">
      <PageHeader
        title="New character"
        description="Define a character with depth — backstory that earns the present-day behavior, multiple states with triggers, voice with involuntary tells, explicit limits."
      />
      <CharacterCardForm mode="new" />
    </div>
  );
}
