"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ModelSelector } from "@/components/ModelSelector";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/ui/toast";
import { clearAllData, getConfig, saveConfig } from "@/lib/storage";
import { testApiKey } from "@/lib/openrouter";
import {
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { DEFAULT_MODEL } from "@/types";

export default function SettingsPage() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = React.useState("");
  const [defaultModel, setDefaultModel] = React.useState<string>(DEFAULT_MODEL);
  const [show, setShow] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    | { ok: true }
    | { ok: false; error: string }
    | null
  >(null);
  const [confirmClear, setConfirmClear] = React.useState(false);

  React.useEffect(() => {
    const cfg = getConfig();
    setApiKey(cfg.openRouterApiKey);
    setDefaultModel(cfg.defaultModel || DEFAULT_MODEL);
  }, []);

  function handleSave() {
    saveConfig({ openRouterApiKey: apiKey.trim(), defaultModel });
    toast({ title: "Settings saved", variant: "success" });
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testApiKey(apiKey.trim(), defaultModel);
    setTesting(false);
    setTestResult(result);
    if (result.ok) {
      toast({ title: "Connection successful", variant: "success" });
    } else {
      toast({
        title: "Connection failed",
        description: result.error,
        variant: "error",
      });
    }
  }

  function handleClearAll() {
    clearAllData();
    setApiKey("");
    setDefaultModel(DEFAULT_MODEL);
    setConfirmClear(false);
    toast({
      title: "All local data cleared",
      description: "Reload to re-seed example characters.",
      variant: "success",
    });
  }

  return (
    <div className="container max-w-3xl py-8">
      <PageHeader
        title="Settings"
        description="Configure your OpenRouter API key and default model. Everything is stored locally in your browser."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              OpenRouter API Key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a key at{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
              >
                openrouter.ai/keys
                <ExternalLink className="h-3 w-3" />
              </a>
              . Your key never leaves your browser except when calling
              OpenRouter directly.
            </p>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="api-key"
                    type={show ? "text" : "password"}
                    placeholder="sk-or-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-10 font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide key" : "Show key"}
                  >
                    {show ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button variant="outline" onClick={handleTest} disabled={testing || !apiKey}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Test
                </Button>
              </div>
              {testResult && (
                <div
                  className={`flex items-center gap-2 text-xs ${
                    testResult.ok
                      ? "text-emerald-300"
                      : "text-destructive-foreground"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {testResult.ok
                    ? "Key works."
                    : `Failed: ${testResult.error}`}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Default Model</Label>
              <ModelSelector
                value={defaultModel}
                onChange={setDefaultModel}
                showBadge
              />
              <p className="text-xs text-muted-foreground">
                Used when starting a new chat. You can override per-session.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave}>Save settings</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive-foreground">
              <Trash2 className="h-4 w-4" />
              Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Wipes characters, personas, sessions, and your API key from
              localStorage.
            </div>
            <Button
              variant="destructive"
              onClick={() => setConfirmClear(true)}
            >
              Clear all data
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all local data?"
        description="This will delete every character, persona, and session, and remove your saved API key. There is no undo."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleClearAll}>
            Yes, clear everything
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
