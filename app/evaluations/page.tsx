import { Suspense } from "react";
import { EvaluationsPageClient } from "./EvaluationsPageClient";

export default function EvaluationsDashboardPage() {
  return (
    <div className="container py-8">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading dashboard…</div>
        }
      >
        <EvaluationsPageClient />
      </Suspense>
    </div>
  );
}
