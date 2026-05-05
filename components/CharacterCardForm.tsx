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
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { saveCharacter } from "@/lib/storage";
import { uid, truncate } from "@/lib/utils";
import type { CharacterCard } from "@/types";
import { Save, X } from "lucide-react";

interface CharacterCardFormProps {
  initial?: CharacterCard;
  mode: "new" | "edit";
}

export function CharacterCardForm({ initial, mode }: CharacterCardFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = React.useState(initial?.name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(initial?.avatarUrl ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [firstMessage, setFirstMessage] = React.useState(initial?.firstMessage ?? "");
  const [systemPrompt, setSystemPrompt] = React.useState(initial?.systemPrompt ?? "");
  const [tagsInput, setTagsInput] = React.useState(initial?.tags.join(", ") ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const tags = React.useMemo(
    () =>
      tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput],
  );

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
      toast({
        title: "Some fields need attention",
        variant: "error",
      });
      return;
    }
    const now = Date.now();
    const card: CharacterCard = {
      id: initial?.id ?? uid(),
      name: name.trim(),
      avatarUrl: avatarUrl.trim() || undefined,
      description: description.trim(),
      firstMessage: firstMessage.trim(),
      systemPrompt: systemPrompt.trim(),
      tags,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    saveCharacter(card);
    toast({
      title: mode === "new" ? "Character created" : "Character updated",
      variant: "success",
    });
    router.push("/characters");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
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
                placeholder="e.g. Vincent Moreau"
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
              <Label htmlFor="description">Short description / hook</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One or two sentences that show up on the library card."
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="comma, separated, tags"
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <Badge key={t} variant="muted" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">First message</CardTitle>
            <CardDescription>
              The character&apos;s opening line. Sets tone and dynamic. Use{" "}
              <code className="rounded bg-muted px-1 text-[11px]">
                {"{{user}}"}
              </code>{" "}
              to refer to the user.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="The bell above the door rings as you step inside…"
              className="min-h-[180px]"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              System prompt <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              The full character card injected as the system message. Define
              identity, personality, voice, behavioral states, limits, secrets,
              and named NPCs here. Use{" "}
              <code className="rounded bg-muted px-1 text-[11px]">{"{{user}}"}</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1 text-[11px]">{"{{char}}"}</code>{" "}
              freely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={`# Identity\n…\n\n# Personality\n…\n\n# Voice\n…\n\n# Behavioral states\n- With {{user}}: …\n- When alone: …\n- When cornered: …\n\n# Limits\n…\n\n# Secret\n…`}
              className="min-h-[420px] font-mono text-[13px]"
            />
            {errors.systemPrompt && (
              <p className="text-xs text-destructive-foreground">
                {errors.systemPrompt}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/characters")}
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button type="submit">
            <Save className="h-4 w-4" />
            {mode === "new" ? "Create character" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Library preview
        </div>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Avatar src={avatarUrl} name={name || "?"} size={48} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold">
                {name || "Untitled character"}
              </h3>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {description ? truncate(description, 200) : "No description yet."}
              </p>
            </div>
          </div>
          {tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {tags.slice(0, 6).map((t) => (
                <Badge key={t} variant="muted" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </Card>
        <p className="text-xs text-muted-foreground">
          A solid character card has at least: a clear archetype, multiple
          behavioral states with triggers, voice rules (signature phrases +
          involuntary tells), and explicit limits with provenance.
        </p>
      </div>
    </form>
  );
}
