# CharacterAI

A web workshop for **building, evaluating, and chatting with AI characters** — with a systematic story for catching shallow / drifting / generic characters before users see them.

Spec docs: [`Overview.md`](./Overview.md), [`Implementation.md`](./Implementation.md), [`ChatEval.md`](./ChatEval.md), [`StaticEval.md`](./StaticEval.md).

---

## The goal

Most character-chat platforms have a **character quality** problem: voices drift over long sessions, stated personalities don't match how characters actually behave under pressure, limits collapse on first push, and most "characters" feel like thin skins over a generic LLM. Users churn when characters feel flat.

This project bets that **character quality can be defined, measured, and improved systematically** — using psychological frameworks for the spec and automated LLM-judged evaluation for the feedback loop.

Two interleaved sides:

- **User-facing chat** — browse a library, pick a model, talk to a character.
- **Creator evaluation tooling** — define characters at psychological depth, drive an *automated* chat between a user-persona LLM and the character LLM, then have a strong judge model score the transcript on a 14-dimension rubric (+ an explicit failure flag) with verbatim citations.

---

## What it does (parts of the system)

| Part | What it is | Where it lives |
|---|---|---|
| **Character library** | Cards with backstory, voice, multi-state behavior, limits + provenance, self-model gap, worldview, secret, NPCs, first message, full system prompt. | `/characters` |
| **Persona library** | User-created system prompts that drive the user side during auto-pilot. | `/personas` |
| **Prompt presets** | Reusable narrator-style modules composed *on top of* a character card (Base Prompt, NSFW, etc). Modular: core + optional toggles. | `/prompts` |
| **Manual chat** | Streaming human ↔ character chat with model switcher and Evaluate button. | `/chat/new`, `/chat/[id]` |
| **Auto-pilot** | LLM ↔ LLM N-turn engine. Persona-LLM types the user side, character-LLM responds. | `/chat/[id]` (auto mode) |
| **Evaluate runner** | One-shot pipeline: pick character + ChatEval persona + N turns + judge → autopilot streams live, judge runs immediately after, report renders inline. | `/evaluate` |
| **Evaluation dashboard** | Suite-level stats, per-character roll-ups, all-reports table, deep-linkable detail page with history. | `/evaluations`, `/evaluations/[id]` |
| **Settings** | API key, default model, clear-all-data. | `/settings` |

### The two creator workflows

1. **Build** → fill in a character card (`/characters/new`).
2. **Evaluate** → `/evaluate` → pick a ChatEval persona → run autopilot + judge end-to-end → read the report → refine the card → re-run.

The evaluation loop is the differentiator. It catches: voice drift, dialogue self-gap collapse, limit collapse inconsistent with provenance, worldview-asserted-but-never-applied, and **resolution avoidance** (the highest-leverage failure mode — runtime invents in-fiction escapes to preserve central tension when the user-LLM tries to dissolve it).

---

## Tech stack

- **Next.js 14** App Router + **TypeScript**
- **Tailwind** + locally-built shadcn-style UI primitives (no `npx shadcn` step)
- **OpenRouter** as the single LLM gateway → Gemini, DeepSeek, Claude, GPT-4o, Llama, etc. with one API key
- **localStorage** for all persistence — no backend in v1
- **Streaming** SSE for both chat (token-by-token bubbles) and judge (live JSON)

---

## How it's wired

### Layered code structure

- **`lib/openrouter.ts`** — single `streamCompletion()` function. Parses SSE, calls `onChunk(token)` per chunk, rejects with typed `OpenRouterError` (rate limit, invalid key, model not found surfaced distinctly).
- **`lib/promptBuilder.ts`** — composes the character system prompt as `[narrator preset] --- [character card with {{user}}/{{char}} filled] --- [output rules]`. Builds OpenRouter message arrays for both character and persona LLM calls (the persona call gets the history with roles flipped).
- **`lib/autopilot.ts`** — N-turn engine. Each turn = persona-LLM call → user message → character-LLM call → assistant message. 500 ms gap between turns. AbortSignal on every call so Stop is responsive.
- **`lib/evaluation.ts`** — rubric catalog (`EVAL_DIMENSIONS` with 0/3/5 anchors per dim), judge prompt builder, defensive JSON parser (extracts the first balanced `{}` block, clamps numeric scores, handles N/A nulls), composite computation.
- **`lib/evalPersonas.ts`** — fixed catalog of the 6 ChatEval personas with structured `injectionFields[]`. `resolveEvalPersona(catalogEntry, injections)` synthesizes a `UserPersona` for the run; `suggestInjectionsFromCard(card)` auto-pre-fills injection text by scanning the card for matching markdown headers (`# Limits`, `# Worldview`, etc).
- **`lib/storage.ts`** — typed localStorage wrappers, first-run seeding, cascade-deletes (delete a character → its sessions + reports go too), and `resolveSessionPersona()` which prefers the embedded persona snapshot (for catalog runs) and falls back to library lookup.

### Data flow for `/evaluate`

```
configure  ──▶  resolveEvalPersona(catalog, injections)  ──▶  Session w/ personaSnapshot
                                                                       │
                                                                       ▼
                                runAutopilotSession({character, persona, turns, ...})
                                  ├─ stream live transcript bubble-by-bubble
                                  └─ persist Session.messages after every turn
                                                                       │
                                                                       ▼
                                runEvaluation({session, character, persona, judgeModel})
                                  ├─ stream judge JSON live
                                  └─ parseJudgeResponse → EvaluationReport
                                                                       │
                                                                       ▼
                                          tabbed view: Report | Transcript
```

### Data model (key fields, see `types/index.ts`)

- `CharacterCard` — `name`, `description`, `firstMessage`, `systemPrompt` (the full card), `tags[]`, …
- `UserPersona` — `name`, `systemPrompt`, `description?` …
- `PromptPreset` — `title`, `modules[]` (each module: `id`, `content`, `isCore`).
- `Session` — `characterId`, `personaId?` (library) **or** `personaSnapshot?` (catalog), `model`, `messages[]`, `promptConfig?`. Snapshot carries `source`, `name`, the resolved `systemPrompt`, and `injections` so reports remain reconstructible long after the run.
- `EvaluationReport` — composites, per-dimension `{ score, notes, evidence:[{turn, quote}] }`, A6 flag with instances, `cardShape`, `spine`, `statesActivated`, `topSuggestions`, `rawJudgeResponse` (kept verbatim for audit).

### What gets scored (rubric from `ChatEval.md`)

- **Cluster A — Card Faithfulness** (0–5, with anchors)
  - A1a/A1b voice persistence (dialogue / narration)
  - A2 state-trigger fidelity · A3 limit integrity by provenance
  - A4a/A4b self-gap maintenance + location *(N/A for Closed cards)*
  - A5 worldview activation · A7 spec containment · A8 NPC fidelity *(conditional)*
- **Cluster B — Session Quality** (0–5, with anchors)
  - B1 agency / initiation rate · B2 per-turn info density
  - B3 arc development · B4 show vs. tell · B5 continuity & callback
- **A6 — Resolution avoidance** (binary flag, headlined on every report; highest diagnostic weight)
- Composites: `faithfulness = mean(Cluster A non-null)`, `quality = mean(Cluster B non-null)`. A6 never folds into means.
- Judge cites verbatim quotes with turn numbers per non-null score; negative scores **must** cite a failure-evidence turn.

### The 6 ChatEval personas (system catalog, not in the editable library)

| Persona | Probes | Injection? |
|---|---|---|
| Sustained-Presence | A1a/A1b drift, B1 agency under no friction, B2/B5 | none |
| Genre-Deflater | A6 resolution avoidance, B1 real agency, A7 | none |
| Bluff-Caller | A6, A3 at the leverage layer | central leverage |
| Informed Antagonist | A3 under attack, A4 wound-triggered self-gap, B1 | weak points |
| Worldview Violator | A5 (clean test on third parties / non-self situations) | worldview / values |
| State-Cycle Prober | A2 state fidelity, A2b coverage, A8 | state list with triggers |

Editing the catalog = edit `lib/evalPersonas.ts` and reload (loaded fresh on every render).

---

## Status vs. spec

What's solid:

- Character / persona / prompt-preset libraries, manual chat, auto-pilot, in-chat Evaluate, dedicated `/evaluate` runner, dashboard with per-character rollups (incl. **A2b state coverage** as cumulative states-activated badges), per-session detail page with run history.
- Full Cluster A + B rubric with 0/3/5 anchors, A6 binary flag, verbatim citations, defensive JSON parser, raw judge response retained.
- Persona catalog with auto-fill of injection blocks from the character card.

Known gaps to close:

- **`StaticEval.md` is not implemented.** The static 6-dim card audit (`structure / states / voice / self-gap / worldview / individuation` + Open/Trajectory/Closed routing + gates) has no code path yet. Should land as a separate `/audit` (or in-form sidebar) running pre-conversation against the card text.
- **C1 cross-card structural similarity** is not surfaced in the dashboard. Needed when running the same persona suite across multiple characters in the same genre.
- **B1 per-card target rate** (passive ≈15%, manipulative ≈60%+) is not a card field; the judge currently has to infer it. Should become an explicit numeric on `CharacterCard`.
- **Run-config tiers** (5 / 20 / 50 turns) and **cross-model driver matrix** (same model both sides vs. driver-from-Claude-against-target-from-X) aren't first-class concepts in the runner UI.
- **Standardized seed scenes per genre** (the `ChatEval.md` "Run Configuration" idea — user-LLM never picks the opening) — currently the character's `firstMessage` is the de-facto seed.
- **Suite-mode** (one click runs all 6 personas in sequence at chosen turn counts → produces a combined scorecard per character) — not yet built.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

On first run the app pre-seeds the **Vincent Moreau** character and two **prompt presets** (Base + NSFW). The 6 ChatEval personas live in `lib/evalPersonas.ts` and surface inside `/evaluate` only — the editable persona library starts empty.

Add your OpenRouter key in **Settings** before sending a message.

### Other scripts

```bash
npm run build         # production build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm start             # production server (after build)
node scripts/smoketest.mjs   # static request-payload check, no API calls
```

---

## Configuration

1. Get a key from [openrouter.ai/keys](https://openrouter.ai/keys).
2. Settings → paste the key → optionally **Test** → **Save**.
3. Pick a default model (used for new chats).

The key is in `localStorage` and is only ever sent to OpenRouter. No backend, no analytics, no telemetry.

---

## Project structure

```
app/                  Next.js App Router pages
  layout.tsx          Sidebar + onboarding banner shell
  page.tsx            Dashboard (stats + recent sessions + quick-start)
  characters/         Character library + new/edit forms
  personas/           User-persona library + new/edit forms
  prompts/            Prompt-preset library + new/edit forms
  chat/
    new/              Session setup (character + optional persona + model)
    [sessionId]/      Live chat (manual + auto-pilot, in-chat Evaluate panel)
  evaluate/           One-shot eval runner (configure → run → done)
  evaluations/        Dashboard + per-session detail page (history, deep-links)
  settings/           API key, default model, clear-all

components/
  ui/                 Local shadcn-style primitives (Button, Card, ScoreBar, …)
  Sidebar · OnboardingBanner · PageHeader
  CharacterCardForm · UserPersonaForm · PromptPresetForm
  ModelSelector · PromptPresetSelector · LibraryCard
  SessionSetup · ChatInterface
  EvaluationRunner · EvaluationPanel · EvaluationReportView

lib/
  openrouter.ts       Streaming chat-completion + key tester + typed errors
  promptBuilder.ts    System prompt composition (preset + card + rules)
  autopilot.ts        N-turn persona-LLM ↔ character-LLM engine (with abort)
  evaluation.ts       Rubric catalog, judge prompt, runner, defensive JSON parser
  evalPersonas.ts     ChatEval persona catalog + injection resolver + card auto-fill
  storage.ts          Typed localStorage wrappers + seeding + persona resolver
  seedData.ts         Vincent Moreau character card seed
  seedPrompts.ts      Built-in prompt presets (loaded from /prompts/*.json)
  seedPersonas.ts     (placeholder — eval personas are NOT seeded into the library)
  utils.ts            cn(), uid(), formatRelativeTime, downloadText, …

prompts/              Source JSONs for built-in prompt presets
scripts/              smoketest.mjs (static end-to-end payload check, no API)
types/index.ts        Shared interfaces, model registry, evaluation types
```

---

## Storage

`localStorage` keys (all under `charai.*.v1`):

- `charai.characters.v1` · `charai.personas.v1` · `charai.prompts.v1`
- `charai.sessions.v1` · `charai.evaluations.v1` · `charai.config.v1`

Cascade rules: deleting a character drops its sessions and reports; deleting a session drops its reports. **Settings → Clear all data** wipes everything.

## Cleaning up

- All deps are local: `rm -rf node_modules` removes them.
- All app data lives in your browser's `localStorage` for `localhost:3000` — DevTools → Application → Storage to clear.
- No global installs, no backend, no databases.
