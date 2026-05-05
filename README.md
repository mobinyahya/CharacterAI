# CharacterAI

A web-based workshop for **building, evaluating, and chatting with AI characters**. Built per the project spec in `Overview.md` and `Implementation.md`.

The app has two interleaved sides:

1. **User-facing chat** — browse a library of AI characters, pick a model, and have a streaming conversation with them.
2. **Creator evaluation tooling** — define characters with psychological depth, then run **auto-pilot** sessions where a *user-persona LLM* talks to the *character LLM* automatically. This surfaces voice drift, limit collapse, agency failures, and other failure modes before users ever see the character.

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

On first run the app pre-seeds the **Vincent Moreau** character so you can chat immediately. Add your OpenRouter key in **Settings** before sending a message.

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
  settings/             API key, default model, danger zone
  not-found.tsx         404

components/             React components
  ui/                   Local shadcn-style primitives (Button, Input, Card, Toast, …)
  Sidebar.tsx           Persistent left nav
  OnboardingBanner.tsx  Top banner prompting for API key
  CharacterCardForm.tsx Character spec form with live library preview
  UserPersonaForm.tsx   Persona spec form
  SessionSetup.tsx      Character + persona + model selector
  ChatInterface.tsx     Streaming chat UI with manual + auto-pilot modes
  ModelSelector.tsx     Reusable model dropdown + provider badges
  LibraryCard.tsx       Library grid card with edit / delete / start-chat

lib/
  openrouter.ts         Streaming chat-completion client + key tester
  promptBuilder.ts      System prompt composition (preset + character + rules)
  autopilot.ts          Persona-LLM ↔ Character-LLM N-turn engine
  storage.ts            Typed localStorage wrappers + first-run seeding
  seedData.ts           Vincent Moreau character card seed
  seedPrompts.ts        Built-in prompt presets (loaded from /prompts/*.json)
  utils.ts              cn(), uid(), formatRelativeTime, downloadText, …

prompts/                Source JSONs for built-in prompt presets
scripts/
  smoketest.mjs         Static end-to-end check of request payloads (no API calls)

types/index.ts          Shared TypeScript interfaces + model registry
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

LLM-judge evaluation of the resulting transcript (per the rubrics in `ChatEval.md`) is intentionally **out of scope for this v1** — the auto-pilot transcript is the eval data. Add the judge later by feeding the saved JSON transcript to a strong model with the rubric in context.

## Storage Keys

All data is in `localStorage` under these keys:

- `charai.characters.v1`
- `charai.personas.v1`
- `charai.prompts.v1`
- `charai.sessions.v1`
- `charai.config.v1`

Use **Settings → Clear all data** to wipe everything, or just delete those keys from DevTools.

## Cleaning Up

The project is self-contained:

- All node deps live in `./node_modules` — `rm -rf node_modules` to remove them.
- All app data lives in your browser's `localStorage` for `localhost:3000` — DevTools → Application → Storage to clear.
- No global installs, no backend, no databases.
