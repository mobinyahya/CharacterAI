"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getConfig } from "@/lib/storage";
import { KeyRound, ArrowRight } from "lucide-react";

export function OnboardingBanner() {
  const pathname = usePathname();
  const [needsKey, setNeedsKey] = React.useState(false);

  React.useEffect(() => {
    const config = getConfig();
    setNeedsKey(!config.openRouterApiKey);

    function onStorage() {
      setNeedsKey(!getConfig().openRouterApiKey);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [pathname]);

  if (!needsKey) return null;
  // Hide on chat / settings pages — the chat view assumes full viewport height.
  if (pathname.startsWith("/settings") || pathname.startsWith("/chat/"))
    return null;

  return (
    <div className="border-b border-border bg-primary/10">
      <div className="container flex items-center justify-between gap-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-foreground/90">
          <KeyRound className="h-4 w-4 text-primary" />
          <span>
            Add your{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2"
            >
              OpenRouter API key
            </a>{" "}
            to start chatting.
          </span>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Open Settings
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
