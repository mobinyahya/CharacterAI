"use client";

import * as React from "react";
import { cn, initials } from "@/lib/utils";

interface AvatarProps {
  src?: string;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const [errored, setErrored] = React.useState(false);
  const showImage = !!src && !errored;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/30 to-secondary text-foreground/90 ring-1 ring-border",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span
          className="font-semibold tracking-wide"
          style={{ fontSize: Math.max(11, size * 0.38) }}
        >
          {initials(name) || "?"}
        </span>
      )}
    </div>
  );
}
