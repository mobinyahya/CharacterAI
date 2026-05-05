"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, "id"> | string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider/>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    (input) => {
      const item: ToastItem =
        typeof input === "string"
          ? { id: uid(), title: input, variant: "info" }
          : { id: uid(), ...input, variant: input.variant ?? "info" };
      setToasts((prev) => [...prev, item]);
      window.setTimeout(() => dismiss(item.id), 4000);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastEl key={t.id} item={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastEl({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon =
    item.variant === "success"
      ? CheckCircle2
      : item.variant === "error"
        ? AlertTriangle
        : Info;
  const tone =
    item.variant === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : item.variant === "error"
        ? "border-destructive/40 bg-destructive/10 text-destructive-foreground"
        : "border-border bg-card text-card-foreground";
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur animate-fade-in",
        tone,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-medium">{item.title}</div>
        {item.description && (
          <div className="mt-0.5 text-xs opacity-80">{item.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
