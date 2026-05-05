"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { savePersona } from "@/lib/storage";
import { uid } from "@/lib/utils";
import type { UserPersona } from "@/types";
import { Save, X, Info } from "lucide-react";

interface UserPersonaFormProps {
  initial?: UserPersona;
  mode: "new" | "edit";
}

export function UserPersonaForm({ initial, mode }: UserPersonaFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = React.useState(initial?.name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(initial?.avatarUrl ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = React.useState(initial?.systemPrompt ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required.";
    if (!systemPrompt.trim()) e.systemPrompt = "System prompt is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      toast({ title: "Some fields need attention", variant: "error" });
      return;
    }
    const now = Date.now();
    const persona: UserPersona = {
      id: initial?.id ?? uid(),
      name: name.trim(),
      avatarUrl: avatarUrl.trim() || undefined,
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    savePersona(persona);
    toast({
      title: mode === "new" ? "Persona created" : "Persona updated",
      variant: "success",
    });
    router.push("/personas");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Genre-Deflater"
            />
            {errors.name && (
              <p className="text-xs text-destructive-foreground">
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL (optional)</Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Short description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this persona probe? e.g. 'Tests resolution-avoidance and real character agency.'"
              className="min-h-[70px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            System prompt <span className="text-destructive">*</span>
          </CardTitle>
          <CardDescription>
            Describes how the user-LLM should behave during auto-pilot sessions.
            Keep it short and operational. Reference{" "}
            <code className="rounded bg-muted px-1 text-[11px]">{"{{char}}"}</code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1 text-[11px]">{"{{user}}"}</code>{" "}
            freely; they get filled in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={`Your goal: …\n\nDo: …\nDon't: …\n\nRegister: short to medium messages, first person.`}
            className="min-h-[260px] font-mono text-[13px]"
          />
          {errors.systemPrompt && (
            <p className="text-xs text-destructive-foreground">
              {errors.systemPrompt}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-card/50 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Leave persona unset when starting a chat to type messages yourself.
          Personas are only used for auto-pilot sessions.
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/personas")}
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit">
          <Save className="h-4 w-4" />
          {mode === "new" ? "Create persona" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
