"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LibraryCard } from "@/components/LibraryCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deleteCharacter, getCharacters } from "@/lib/storage";
import type { CharacterCard } from "@/types";
import { Plus, Users } from "lucide-react";

export default function CharactersPage() {
  const { toast } = useToast();
  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const reload = React.useCallback(() => {
    setCharacters(getCharacters());
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function handleDelete(id: string, name: string) {
    deleteCharacter(id);
    toast({ title: `Deleted "${name}"`, variant: "success" });
    reload();
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Characters"
        description="Your library of crafted characters. Edit to refine the spec, or start a chat to test it."
        actions={
          <Link href="/characters/new">
            <Button>
              <Plus className="h-4 w-4" />
              New character
            </Button>
          </Link>
        }
      />

      {loaded && characters.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No characters yet"
          description="Build your first character — define their personality, voice, behavioral states, and limits."
          action={
            <Link href="/characters/new">
              <Button>
                <Plus className="h-4 w-4" />
                Create your first character
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {characters.map((c) => (
            <LibraryCard
              key={c.id}
              id={c.id}
              name={c.name}
              description={c.description}
              avatarUrl={c.avatarUrl}
              tags={c.tags}
              href={`/characters/${c.id}/edit`}
              editHref={`/characters/${c.id}/edit`}
              startHref={`/chat/new?character=${c.id}`}
              evaluateHref={`/evaluate?characterId=${c.id}`}
              onDelete={() => handleDelete(c.id, c.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
