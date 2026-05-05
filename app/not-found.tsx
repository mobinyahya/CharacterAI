import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-6xl font-semibold tracking-tight text-primary">404</div>
      <p className="mt-3 text-base text-muted-foreground">
        That page doesn&apos;t exist (or the entity it pointed to was deleted).
      </p>
      <Link href="/" className="mt-6">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
