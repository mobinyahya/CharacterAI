"use client";

import * as React from "react";
import { notFound, useParams } from "next/navigation";
import { UserPersonaForm } from "@/components/UserPersonaForm";
import { PageHeader } from "@/components/PageHeader";
import { getPersona } from "@/lib/storage";
import type { UserPersona } from "@/types";

export default function EditPersonaPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [persona, setPersona] = React.useState<UserPersona | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!id) return;
    setPersona(getPersona(id) ?? null);
  }, [id]);

  if (persona === undefined) {
    return (
      <div className="container max-w-3xl py-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (persona === null) {
    notFound();
  }

  return (
    <div className="container max-w-3xl py-8">
      <PageHeader
        title={`Edit: ${persona.name}`}
        description="Update this persona's system prompt and metadata."
      />
      <UserPersonaForm mode="edit" initial={persona} />
    </div>
  );
}
