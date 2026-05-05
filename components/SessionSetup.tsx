"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModelSelector } from "@/components/ModelSelector";
import { PromptPresetSelector } from "@/components/PromptPresetSelector";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import {
  getCharacters,
  getConfig,
  getPersonas,
  getPromptPresets,
  saveSession,
} from "@/lib/storage";
import { fillCharacterTokens } from "@/lib/promptBuilder";
import { uid, truncate } from "@/lib/utils";
import type {
  CharacterCard,
  PromptPreset,
  Session,
  SessionPromptConfig,
  UserPersona,
} from "@/types";
import { DEFAULT_MODEL } from "@/types";
import { ArrowRight, Bot, FileText, User as UserIcon } from "lucide-react";

export function SessionSetup() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();

  const [characters, setCharacters] = React.useState<CharacterCard[]>([]);
  const [personas, setPersonas] = React.useState<UserPersona[]>([]);
  const [presets, setPresets] = React.useState<PromptPreset[]>([]);
  const [characterId, setCharacterId] = React.useState<string>("");
  const [personaId, setPersonaId] = React.useState<string>("");
  const [model, setModel] = React.useState<string>(DEFAULT_MODEL);
  const [promptConfig, setPromptConfig] = React.useState<
    SessionPromptConfig | undefined
  >(undefined);
  const [hasKey, setHasKey] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const cs = getCharacters();
    const ps = getPersonas();
    const pp = getPromptPresets();
    const cfg = getConfig();
    setCharacters(cs);
    setPersonas(ps);
    setPresets(pp);
    setModel(cfg.defaultModel || DEFAULT_MODEL);
    setHasKey(!!cfg.openRouterApiKey);
    const preselect = search?.get("character");
    if (preselect && cs.find((c) => c.id === preselect)) {
      setCharacterId(preselect);
    } else if (cs.length > 0) {
      setCharacterId(cs[0].id);
    }
    setLoaded(true);
  }, [search]);

  const character = characters.find((c) => c.id === characterId);
  const persona = personas.find((p) => p.id === personaId);
  const preset = presets.find((p) => p.id === promptConfig?.presetId);

  function handleStart() {
    if (!character) {
      toast({ title: "Pick a character first", variant: "error" });
      return;
    }
    if (!hasKey) {
      toast({
        title: "Add your OpenRouter API key in Settings before starting.",
        variant: "error",
      });
      router.push("/settings");
      return;
    }
    const now = Date.now();
    const initialMessages = character.firstMessage
      ? [
          {
            id: uid(),
            role: "assistant" as const,
            content: fillCharacterTokens(character.firstMessage, character.name),
            timestamp: now,
          },
        ]
      : [];
    const session: Session = {
      id: uid(),
      characterId: character.id,
      personaId: persona?.id,
      model,
      messages: initialMessages,
      promptConfig,
      createdAt: now,
      updatedAt: now,
      title: persona ? `${character.name} × ${persona.name}` : character.name,
    };
    saveSession(session);
    router.push(`/chat/${session.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>
              Character <span className="text-destructive">*</span>
            </Label>
            {loaded && characters.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                You don&apos;t have any characters yet.{" "}
                <Link
                  href="/characters/new"
                  className="text-foreground underline underline-offset-2"
                >
                  Create one
                </Link>
                .
              </div>
            ) : (
              <Select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>User persona (optional)</Label>
            <Select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
            >
              <option value="">— Manual chat (you type) —</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Pick a persona to enable auto-pilot mode (LLM ↔ LLM). Leave empty
              to type messages yourself.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Narrator prompt preset (optional)</Label>
            <PromptPresetSelector
              presets={presets}
              config={promptConfig}
              onChange={setPromptConfig}
            />
            <p className="text-xs text-muted-foreground">
              Composed before the character card. Manage presets in the{" "}
              <Link
                href="/prompts"
                className="text-foreground underline underline-offset-2"
              >
                Prompts library
              </Link>
              .
            </p>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <ModelSelector value={model} onChange={setModel} showBadge />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleStart} disabled={!character}>
              Start session
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Session preview
        </div>
        {character ? (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Avatar src={character.avatarUrl} name={character.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Character
                </div>
                <h3 className="truncate text-base font-semibold">
                  {character.name}
                </h3>
                {character.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                    {truncate(character.description, 200)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              <span>The character LLM speaks as the assistant.</span>
            </div>
            {persona ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300">
                <UserIcon className="h-3.5 w-3.5" />
                <span>
                  Auto-pilot enabled — &quot;{persona.name}&quot; will type for the user.
                </span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <UserIcon className="h-3.5 w-3.5" />
                <span>Manual mode — you type the user side.</span>
              </div>
            )}
            {preset ? (
              <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <FileText className="mt-0.5 h-3.5 w-3.5" />
                <span>
                  Narrator: <span className="text-foreground/90">{preset.title}</span>
                  {promptConfig?.enabledModuleIds.length
                    ? ` · +${promptConfig.enabledModuleIds.length} module${
                        promptConfig.enabledModuleIds.length === 1 ? "" : "s"
                      }`
                    : ""}
                </span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span>No narrator preset — character card only.</span>
              </div>
            )}
            {character.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {character.tags.slice(0, 6).map((t) => (
                  <Badge key={t} variant="muted" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-5 text-sm text-muted-foreground">
            Pick a character to see a preview.
          </Card>
        )}
      </div>
    </div>
  );
}
