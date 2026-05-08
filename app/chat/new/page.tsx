"use client";

import { Suspense } from "react";
import { SessionSetup } from "@/components/SessionSetup";
import { PageHeader } from "@/components/PageHeader";

export default function NewChatPage() {
  return (
    <div className="container py-8">
      <PageHeader
        title="Start a chat"
        description="Pick a character and either type with them yourself, or set a user persona to run an auto-pilot Dynamic Eval."
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <SessionSetup />
      </Suspense>
    </div>
  );
}
