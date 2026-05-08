import { Suspense } from "react";
import { EvaluatePageClient } from "./EvaluatePageClient";

export default function EvaluatePage() {
  return (
    <div className="container py-8">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading runner…</div>
        }
      >
        <EvaluatePageClient />
      </Suspense>
    </div>
  );
}
