"use client";

import * as React from "react";
import { ensureSeeded } from "@/lib/storage";

export function SeedProvider() {
  React.useEffect(() => {
    ensureSeeded();
  }, []);
  return null;
}
