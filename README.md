# CharacterAI

A web-based workshop for **building, evaluating, and chatting with AI characters**. Built per the project spec in `Overview.md` and `Implementation.md`.

The app has two interleaved sides:

1. **User-facing chat** — browse a library of AI characters, pick a model, and have a streaming conversation with them.
2. **Creator evaluation tooling** — define characters with psychological depth, run **auto-pilot** sessions where a *user-persona LLM* talks to the *character LLM* automatically, then have an **LLM judge** score the resulting transcript on the Card-Faithfulness + Session-Quality rubric from `ChatEval.md`. This surfaces voice drift, limit collapse, agency failures, resolution-avoidance, and other failure modes before users ever see the character.

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + locally-built shadcn-style UI primitives (no `npx shadcn` step needed)
- **OpenRouter** as the single LLM gateway → access to Gemini, DeepSeek, Claude, GPT-4o, Llama, etc. with one API key
- **localStorage** for all persistence (no backend in v1)
- **Streaming** SSE responses so characters "type" in real time

## Getting Started

```bash
# from the project root
npm install
npm run dev
# → http://localhost:3000
```

On first run the app pre-seeds:

- The **Vincent Moreau** character so you can chat immediately.
- Two **prompt presets** (Base Prompt + NSFW System).

The **six canonical evaluation personas** from `ChatEval.md` (Sustained-Presence, Genre-Deflater, Bluff-Caller, Informed Antagonist, Worldview Violator, State-Cycle Prober) live in `lib/evalPersonas.ts` as a fixed system catalog and are surfaced inside the **Evaluate** flow — they're not seeded into the editable persona library.

Add your OpenRouter key in **Settings** before sending a message.

### Other scripts

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm start          # production server (after build)
```

## Configuration

1. Get an API key from [openrouter.ai/keys](https://openrouter.ai/keys).
2. Open the app → **Settings** → paste the key, optionally hit **Test**, then **Save**.
3. Pick a default model (used when starting new chats).

The key is stored in `localStorage` and is only ever sent to OpenRouter. There's no backend, no analytics, no telemetry.

## Project Structure

```
app/                    Next.js App Router pages
  layout.tsx            Root shell, sidebar, onboarding banner
  page.tsx              Dashboard — stats + recent sessions
  characters/           Character library + new/edit forms
  personas/             User-persona library + new/edit forms
  prompts/              Prompt-preset library + new/edit forms
  chat/
    new/                Session setup (pick character, optional persona, model)
    [sessionId]/        Live chat interface (manual + auto-pilot)
  evaluate/
    page.tsx            One-shot evaluation runner — pick character + system persona +
                        N turns + judge → autopilot + judge in one click
  evaluations/
    page.tsx            Evaluation dashboard — suite stats, per-character roll-ups, all-reports table
    [sessionId]/        Per-session full report, with history of prior runs
  settings/             API key, default model, danger zone
  not-found.tsx         404

components/             React components
  ui/                   Local shadcn-style primitives (Button, Input, Card, Toast, ScoreBar, …)
  Sidebar.tsx           Persistent left nav
  OnboardingBanner.tsx  Top banner prompting for API key
  CharacterCardForm.tsx Character spec form with live library preview
  UserPersonaForm.tsx   Persona spec form
  SessionSetup.tsx      Character + persona + model selector
  ChatInterface.tsx     Streaming chat UI with manual + auto-pilot modes + Evaluate button
  ModelSelector.tsx     Reusable model dropdown + provider badges
  LibraryCard.tsx       Library grid card with edit / delete / start-chat / evaluate
  EvaluationPanel.tsx   In-chat modal: pick judge model, run, stream, view report + history
  EvaluationRunner.tsx  Evaluate page — config + live transcript + auto-chained judge + tabbed report
  EvaluationReportView.tsx  Shared report renderer (composites + per-dimension cards + flags)

lib/
  openrouter.ts         Streaming chat-completion client + key tester
  promptBuilder.ts      System prompt composition (preset + character + rules)
  autopilot.ts          Persona-LLM ↔ Character-LLM N-turn engine
  evaluation.ts         Rubric catalogue, judge prompt, runEvaluation, JSON parser, composites
  evalPersonas.ts       System catalog of the six ChatEval personas + injection resolver
  storage.ts            Typed localStorage wrappers + first-run seeding + resolveSessionPersona
  seedData.ts           Vincent Moreau character card seed
  seedPrompts.ts        Built-in prompt presets (loaded from /prompts/*.json)
  seedPersonas.ts       (placeholder — eval personas are NOT seeded into the library)
  utils.ts              cn(), uid(), formatRelativeTime, downloadText, …

prompts/                Source JSONs for built-in prompt presets
scripts/
  smoketest.mjs         Static end-to-end check of request payloads (no API calls)

types/index.ts          Shared TypeScript interfaces + model registry + evaluation types
```

## Prompt Presets

A **Prompt Preset** is a reusable narrator-style system prompt that gets composed *on top of* a character card. Presets are organized into modules; some are core (always active when the preset is selected) and others are optional toggles.

Two presets ship pre-loaded on first run, derived directly from `prompts/base_prompt.json` and `prompts/nsfw_system.json`:

- **Base Prompt** — narrator engine with 13 modules (CORE PROMPT + 12 optional: World Autonomy, Character Depth, Relationships and Intimacy, NSFW Protocol, etc.).
- **NSFW System** — single-module preset for explicit roleplay.

You can add your own at `/prompts/new` — paste any JSON in the same shape as `prompts/base_prompt.json` (title, description, modules[]) and the form will pre-fill from it.

When a preset is selected for a session, the system prompt sent to the character-LLM looks like:

```
# Narrator system prompt
[CORE PROMPT content]
[any selected optional modules content]

---

# Character
[character card system prompt with {{user}}/{{char}} filled in]

---

# Output rules
[built-in formatting rules]
```

The narrator preset is intentionally **NOT** sent to the user-persona LLM during auto-pilot — it governs how the character narrates, not how the user behaves.

## How Auto-Pilot Works

1. You set up a session with a **character** and a **user persona** (and optionally a prompt preset).
2. The chat interface shows a "Run N turns" button.
3. Each turn:
   - The persona-LLM is called with the persona system prompt + the conversation history (with roles flipped, since from its POV the *character* is the assistant). Output → user message.
   - The character-LLM is called with the (preset + character) system prompt + the now-extended history. Output → assistant message.
   - Both are streamed live; transcript is persisted after each turn.
4. A 500ms pause between turns keeps the UI legible.
5. **Stop** aborts mid-turn.

## One-Shot Evaluation Flow (`/evaluate`)

The dedicated **Evaluate** tab lets you score a character without manually chatting first. You pick a character, pick one of the six built-in ChatEval personas (or any persona from your library), set the turn count, and click run — the page drives the full pipeline end-to-end on one screen:

1. **Configure** — pick character + user-driver persona + N turns + driver model + judge model + (optional) narrator preset.
2. **Run** — the auto-pilot streams turn-by-turn into a live transcript, with a progress bar showing "Turn k / N".
3. **Judge** — as soon as the chat finishes the page automatically chains into the judge call; the streaming JSON is shown live.
4. **Done** — composite scores at the top + tabbed view: **Report** (full rubric breakdown) | **Transcript** (the full chat that produced the score). Buttons: *View full report*, *Continue in chat*, *Run another*.

The session is persisted to localStorage exactly like a manual chat, so it shows up in `/chat/[sessionId]`, `/evaluations`, and `/evaluations/[sessionId]`. Stop anytime — partial transcripts are saved and the page bounces you to the chat view to inspect.

### The six built-in eval personas live in `lib/evalPersonas.ts`

They're a fixed system catalog, **not** seeded into the editable persona library. Each entry carries:

- A system prompt (with `{{user}}` / `{{char}}` tokens).
- A `probesDimensions` list (which Cluster-A/B IDs the persona surfaces).
- A `recommendedTurns.default` (Sustained-Presence is 30; the others 12–24).
- For four of the six: `injectionFields[]` describing what card-specific data the user must paste in (leverage / weak-points / worldview / state-list).

The `/evaluate` runner pre-fills the injection fields by scanning the character card's systemPrompt for matching markdown headers (`# Limits`, `# Worldview`, `# Behavioral states`, etc.). The user can edit the prefilled text inline before running. Resolved injections are snapshotted onto `Session.personaSnapshot.injections` so the report stays reconstructible.

| Persona | What it probes | Injection? |
|---|---|---|
| Sustained-Presence | Voice drift over long context (A1a/A1b), agency under no friction (B1), info density (B2), continuity (B5) | none |
| Genre-Deflater | A6 resolution avoidance, real B1 agency, A7 spec containment | none |
| Bluff-Caller | A6, A3 (limit integrity at the leverage layer) | central leverage |
| Informed Antagonist | A3 under attack, A4 wound-triggered self-gap activation, B1 | card-extracted weak points |
| Worldview Violator | A5 (worldview operative vs. decorative) | card-extracted worldview |
| State-Cycle Prober | A2 state-trigger fidelity, A2b state coverage, A8 NPC fidelity | state list with triggers |

Editing the catalog itself = edit `lib/evalPersonas.ts` and reload — they're loaded fresh from the file on every render.

## Turn-Based Evaluation (in-chat)

Once you have a transcript (manual or auto-pilot) you can score it on the rubric from `ChatEval.md` with an LLM judge. Click **Evaluate** in the chat top bar — same rubric, same composites, same report, just kicked off from a session you already have rather than the one-shot runner.

### What gets scored

The judge applies fourteen 0–5 dimensions across two clusters, each with explicit `0 / 3 / 5` anchor descriptions to prevent baseline drift, plus a binary failure flag:

- **Cluster A — Card Faithfulness** (is the run holding the card?)
  - `A1a` Voice persistence — dialogue
  - `A1b` Voice persistence — narration
  - `A2`  State-trigger fidelity
  - `A3`  Limit integrity & collapse pattern
  - `A4a` Self-gap maintenance — dialogue *(N/A for Closed cards)*
  - `A4b` Self-gap location — dialogue vs narration *(N/A for Closed cards)*
  - `A5`  Worldview activation in novel situations
  - `A7`  Spec containment
  - `A8`  NPC fidelity *(N/A when no named NPCs in trace)*
- **Cluster B — Session Quality** (is the session itself any good?)
  - `B1` Agency / initiation rate
  - `B2` Per-turn information density
  - `B3` Story arc development
  - `B4` Show vs. tell ratio
  - `B5` Continuity & callback
- **Binary flag — `A6` Resolution avoidance** — moments where the runtime invents an in-fiction escape to preserve central tension. Highest-weight failure mode; surfaced front-and-center on every report.

For every non-null score the judge cites at least one **verbatim quote with its turn number**. Negative scores must cite the failure-evidence turn. The judge also returns a **spine extraction** (its one-sentence read of the character), the **states it observed activated** in the trace, and **1–3 leverage suggestions** for the creator.

Composite scores: `faithfulness = mean(Cluster A non-null)`, `quality = mean(Cluster B non-null)`. A6 is never folded into the means.

### Running a judge

1. Open any session at `/chat/[sessionId]`.
2. Click **Evaluate** → pick a judge model (defaults to Claude Sonnet 4.5; only strong reading-comprehension models are offered).
3. The judge call streams; you see the structured JSON appear live in the panel. **Stop** cancels.
4. Once parsed the report renders inline. The header shows composites, A6 status, judge + driver model badges, and a JSON download.

The latest report's composites show up as a small badge (`F4.2 · Q3.8`) in the chat top bar so you always know whether the open session has been scored.

### Where reports live

- **`/evaluations`** — dashboard with suite-level stats (avg faithfulness, avg quality, A6 rate), per-character roll-up cards (mean per dimension as mini score-bars + states activated across runs as A2b coverage), and a sortable / filterable table of every report.
- **`/evaluations/[sessionId]`** — full-page report view, with a `?report=<id>` deep-link and a History strip when a session has multiple judge runs.

### The rubric is auditable

Every report saves the raw judge response alongside the parsed report (collapsed by default in the report view). If you ever want to verify the parser, switch judge models, or feed a transcript through a different rubric, the original JSON is right there.

## Storage Keys

All data is in `localStorage` under these keys:

- `charai.characters.v1`
- `charai.personas.v1`
- `charai.prompts.v1`
- `charai.sessions.v1`
- `charai.evaluations.v1`
- `charai.config.v1`

Deleting a character cascades to its sessions and evaluation reports; deleting a session cascades to its evaluation reports. Use **Settings → Clear all data** to wipe everything, or just delete those keys from DevTools.

## Cleaning Up

The project is self-contained:

- All node deps live in `./node_modules` — `rm -rf node_modules` to remove them.
- All app data lives in your browser's `localStorage` for `localhost:3000` — DevTools → Application → Storage to clear.
- No global installs, no backend, no databases.
