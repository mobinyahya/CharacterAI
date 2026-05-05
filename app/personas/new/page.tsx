"use client";

import { UserPersonaForm } from "@/components/UserPersonaForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewPersonaPage() {
  return (
    <div className="container max-w-3xl py-8">
      <PageHeader
        title="New persona"
        description="Each persona is a system prompt that drives the user-LLM during auto-pilot sessions."
      />
      <UserPersonaForm mode="new" />
    </div>
  );
}
