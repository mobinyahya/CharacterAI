"use client";

import * as React from "react";
import { notFound, useParams } from "next/navigation";
import { CharacterCardForm } from "@/components/CharacterCardForm";
import { PageHeader } from "@/components/PageHeader";
import { getCharacter } from "@/lib/storage";
import type { CharacterCard } from "@/types";

export default function EditCharacterPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [character, setCharacter] = React.useState<CharacterCard | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!id) return;
    setCharacter(getCharacter(id) ?? null);
  }, [id]);

  if (character === undefined) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (character === null) {
    notFound();
  }

  return (
    <div className="container py-8">
      <PageHeader
        title={`Edit: ${character.name}`}
        description="Update the character spec. Changes apply to new sessions immediately."
      />
      <CharacterCardForm mode="edit" initial={character} />
    </div>
  );
}
