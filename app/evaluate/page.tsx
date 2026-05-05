import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EvaluationRunner } from "@/components/EvaluationRunner";

export default function EvaluatePage() {
  return (
    <div className="container py-8">
      <PageHeader
        title="Evaluate a character"
        description="Pick a character, pick a user-driver persona, choose how many turns, and the system will run an auto-pilot chat between two LLMs and judge the transcript end-to-end. No need to chat manually first."
      />
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading runner…</div>
        }
      >
        <EvaluationRunner />
      </Suspense>
    </div>
  );
}
