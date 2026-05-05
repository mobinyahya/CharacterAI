Here's a full implementation spec for Cursor:
Project Setup
Next.js 14 app with TypeScript, Tailwind CSS, shadcn/ui component library
OpenRouter as the LLM gateway (single API key, access to Gemini, DeepSeek, Claude, GPT, etc.)
Local storage for persistence (no backend/DB needed for v1)
Structure: /app (pages), /components (UI), /lib (logic), /types (TypeScript interfaces)

Data Models (/types/index.ts)
CharacterCard: { id, name, description, firstMessage, systemPrompt, avatarUrl?, tags[], createdAt }
UserPersona: { id, name, systemPrompt, avatarUrl?, createdAt }
Session: { id, characterId, personaId?, model, messages[], createdAt }
Message: { id, role: 'user'|'assistant'|'system', content, timestamp }
AppConfig: { openRouterApiKey, defaultModel }

Pages / Routes
/ — dashboard/home: lists sessions, quick-start buttons
/characters — character library: grid of character cards, create/edit/delete
/characters/new — character creation form
/characters/[id]/edit — edit existing character
/personas — user persona library: same pattern as characters
/personas/new — persona creation form
/chat/new — session setup: pick character + optional persona + model
/chat/[sessionId] — active chat interface
/settings — API key, default model config

Core Components
Character Card Form (/components/CharacterCardForm.tsx)
Fields: Name, Avatar URL (optional), Description/backstory (large textarea), First Message (textarea — what character opens with), System Prompt (large textarea — the actual card injected as system context), Tags (multi-input)
Validation: name + system prompt required
Save to localStorage under characters[]
User Persona Form (/components/UserPersonaForm.tsx)
Fields: Name, System Prompt (large textarea — describes how the user-LLM should behave), Avatar URL optional
Save to localStorage under personas[]
Note in UI: "Leave persona unset for manual (human) chatting"
Session Setup (/components/SessionSetup.tsx)
Dropdown: select character (required)
Dropdown: select user persona (optional — if set, enables auto-pilot mode where both sides are LLM)
Dropdown: select model — populated from a hardcoded list of OpenRouter model IDs with display names
Include: google/gemini-2.0-flash, deepseek/deepseek-chat, anthropic/claude-sonnet-4-5, openai/gpt-4o, meta-llama/llama-3.3-70b-instruct as starting set
Start session button → creates Session object, redirects to /chat/[sessionId]
Chat Interface (/components/ChatInterface.tsx)
Message list: alternating user/character bubbles with avatar thumbnails, character name label, timestamps
Input box + send button (disabled when persona auto-pilot is active)
Top bar: character name, model badge, session info, settings gear
Auto-scroll to bottom on new message
Two modes:
Manual mode (no persona): user types, character LLM responds
Auto-pilot mode (persona set): "Run N turns" button, system runs user-persona LLM → character LLM alternately for N turns, displays results in real time with a small delay between turns for readability
Export session button (downloads JSON or plain text transcript)
Model Selector (/components/ModelSelector.tsx)
Reusable dropdown with model display name, provider badge (color-coded), context length note
Used in session setup and chat header (allow switching mid-session)
Character/Persona Library Cards (/components/LibraryCard.tsx)
Shows avatar, name, tag chips, truncated description
Edit / Delete / Start Chat action buttons
Start Chat from character card → goes to session setup pre-filled with that character

LLM Integration (/lib/openrouter.ts)
Single function streamCompletion({ model, messages, apiKey, onChunk, onDone })
Calls https://openrouter.ai/api/v1/chat/completions with streaming enabled
Builds message array:
System message: character's system prompt (always first)
If persona is set and this is a user turn: inject persona system prompt as a second system message or prepend to user message
Conversation history
Handle streaming chunks: parse SSE, call onChunk(token) per token, call onDone(fullText) when stream ends
Error handling: surface rate limit errors, invalid API key, model not found distinctly in UI
Prompt construction logic (/lib/promptBuilder.ts)
buildCharacterSystemPrompt(card: CharacterCard): string — wraps card system prompt with formatting instructions (stay in character, third-person narration rules, etc.)
buildPersonaSystemPrompt(persona: UserPersona): string — wraps persona prompt with instructions ("You are the user in this chat. Respond as your persona would. Keep messages to 1-3 sentences unless the scene demands more.")
buildMessageHistory(messages: Message[]): OpenRouterMessage[] — converts internal message format to OpenRouter format

Auto-Pilot Engine (/lib/autopilot.ts)
runAutopilotTurn(session, character, persona, model, apiKey): single turn — runs user-persona LLM to generate user message, then runs character LLM to respond
runAutopilotSession(n, ...): runs N turns sequentially, emits events for UI to update after each turn
Add 500ms delay between turns so UI renders progressively rather than dumping all at once
Stop button cancels mid-run

Storage Layer (/lib/storage.ts)
Wrappers around localStorage: getCharacters(), saveCharacter(), deleteCharacter(), getPersonas(), savePersona(), getSessions(), saveSession(), appendMessage(), getConfig(), saveConfig()
All functions typed against the data models
Use a simple UUID generator (crypto.randomUUID()) for IDs

Settings Page
API key input (masked, with show/hide toggle) — saved to localStorage, never sent anywhere except OpenRouter API calls
Default model selector
"Test connection" button — makes a minimal API call to verify key works
Clear all data button (with confirmation modal)

UI/UX Details
Sidebar navigation: Dashboard / Characters / Personas / Settings
Dark mode by default (fits the roleplay/character genre)
Character card creation: side-by-side layout — form on left, live preview card on right showing how it'll look in the library
Chat interface: full-height, sidebar collapses on small screens
First-time onboarding: if no API key set, show a banner pointing to settings with a direct link to OpenRouter key creation page (https://openrouter.ai/keys)
Empty states for each library (characters, personas, sessions) with a clear CTA to create the first one
Toast notifications for save success, errors, copy actions

Implementation Order for Cursor
Project scaffold + Tailwind + shadcn/ui setup
Types file
Storage layer
Settings page + API key flow
OpenRouter streaming integration (test with a hardcoded prompt first)
Character creation form + library page
Persona creation form + library page
Session setup page
Manual chat interface (human user, character LLM)
Auto-pilot engine + auto-pilot mode in chat UI
Polish: sidebar nav, empty states, onboarding banner, export, dark mode

