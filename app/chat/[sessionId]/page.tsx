"use client";

import * as React from "react";
import { Suspense } from "react";
import { notFound, useParams } from "next/navigation";
import { ChatInterface } from "@/components/ChatInterface";
import {
  getCharacter,
  getSession,
  resolveSessionPersona,
} from "@/lib/storage";
import type { CharacterCard, Session, UserPersona } from "@/types";

export default function ChatPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;

  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "missing" }
    | {
        status: "ready";
        session: Session;
        character: CharacterCard;
        persona?: UserPersona;
      }
  >({ status: "loading" });

  React.useEffect(() => {
    if (!sessionId) return;
    const session = getSession(sessionId);
    if (!session) {
      setState({ status: "missing" });
      return;
    }
    const character = getCharacter(session.characterId);
    if (!character) {
      setState({ status: "missing" });
      return;
    }
    const persona = resolveSessionPersona(session);
    setState({ status: "ready", session, character, persona });
  }, [sessionId]);

  if (state.status === "loading") {
    return (
      <div className="container py-10 text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }
  if (state.status === "missing") {
    notFound();
  }

  return (
    // ChatInterface reads ?continue=manual via useSearchParams; wrap in
    // Suspense per Next.js 14 client-component-with-search-params guidance.
    <Suspense
      fallback={
        <div className="container py-10 text-sm text-muted-foreground">
          Loading session…
        </div>
      }
    >
      <ChatInterface
        initialSession={state.session}
        character={state.character}
        persona={state.persona}
      />
    </Suspense>
  );
}
