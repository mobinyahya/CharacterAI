"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LibraryCard } from "@/components/LibraryCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deletePersona, getPersonas } from "@/lib/storage";
import type { UserPersona } from "@/types";
import { Plus, UserCog } from "lucide-react";

export default function PersonasPage() {
  const { toast } = useToast();
  const [personas, setPersonas] = React.useState<UserPersona[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const reload = React.useCallback(() => {
    setPersonas(getPersonas());
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function handleDelete(id: string, name: string) {
    deletePersona(id);
    toast({ title: `Deleted "${name}"`, variant: "success" });
    reload();
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="User Personas"
        description="Personas drive the user side of auto-pilot evaluation sessions. Different personas surface different character failure modes."
        actions={
          <Link href="/personas/new">
            <Button>
              <Plus className="h-4 w-4" />
              New persona
            </Button>
          </Link>
        }
      />

      {loaded && personas.length === 0 ? (
        <EmptyState
          icon={<UserCog className="h-5 w-5" />}
          title="No personas yet"
          description="Create personas (sustained-presence, genre-deflater, antagonist, bluff-caller, etc.) to drive auto-pilot evaluations."
          action={
            <Link href="/personas/new">
              <Button>
                <Plus className="h-4 w-4" />
                Create your first persona
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {personas.map((p) => (
            <LibraryCard
              key={p.id}
              id={p.id}
              name={p.name}
              description={p.description}
              avatarUrl={p.avatarUrl}
              href={`/personas/${p.id}/edit`}
              editHref={`/personas/${p.id}/edit`}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
