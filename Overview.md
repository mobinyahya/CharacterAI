Project Overview & Context Document
To be included at the top of the Cursor project as PROJECT_CONTEXT.md

What This Is
This project is a web-based character chat evaluation and creation tool. It has two interrelated purposes:
User-facing chat product: Users can browse a library of AI characters and have conversations with them. Each character has a distinct personality, backstory, voice, and behavioral rules encoded in a "character card." The experience should feel like talking to a real, coherent person — not a generic chatbot.


Character evaluation tooling: Creators and researchers can test how well a character performs by running automated conversations between a "user persona" LLM and a "character" LLM, then analyzing the results. This is the core technical differentiator — most character chat platforms have no systematic way to know if a character is actually good before publishing it.


The platform's philosophical bet is that character quality is the primary driver of user engagement, and that quality can be defined, measured, and improved systematically using psychological frameworks and automated evaluation.

Why This Exists
Platforms like Character.AI, Janitor.AI, and similar products suffer from a character quality problem. Most user-created characters are shallow — they behave inconsistently, their voice drifts over long conversations, their stated personality doesn't match how they actually respond under pressure, and they feel like thin skins over a generic LLM rather than distinct people. Users churn when characters feel flat.
This project attempts to solve that by:
Giving creators structured tools to define characters at a psychological depth level (not just "write a description")
Giving creators automated feedback on whether their character actually performs as intended before anyone talks to it
Providing an evaluation framework that can catch specific failure modes: voice drift, self-gap collapse, sycophancy creep, genre-template collapse, etc.

Core Concepts
Character Card: The full specification of a character. Contains:
Backstory and formative experiences that explain present behavior
Personality traits anchored to psychological frameworks (Big Five, Schema Therapy schemas, Attachment style)
Multi-state behavioral specification: how the character behaves with the user, when alone, when safe, when cornered, with specific named NPCs
Voice specification: voluntary markers (signature phrases, lexical patterns), involuntary tells (physical tics, speech leaks), generative rules the model can extend
Self-model / behavior gap: what the character believes about themselves vs. what they actually do — the source of dramatic irony
Worldview: the character's evaluative frame for judging situations
Stated limits with provenance (internal-value / external-authority / capability)
A secret — something true about the character they don't openly disclose
Named NPCs in their world with their own mini-specs
First message: the character's opening line that sets tone and dynamic
User Persona: A system prompt that instructs the LLM playing the user role how to behave during an automated evaluation session. Different personas probe different character behaviors:
Casual/sustained: tests voice drift over long sessions
Vulnerable seeker: tests emotional response calibration
Antagonist: tests limit integrity and wound-activation
Bluff-caller: tests whether the character can operate when their central leverage is removed
Genre-deflater: tests whether the character has agency outside the genre contract
And others — each designed to surface specific failure modes
Session: A conversation between a user (human or LLM persona) and a character LLM. Sessions are the primary unit of evaluation data.
Auto-pilot mode: Both sides of the conversation are run by LLMs. The user-persona LLM generates user messages; the character LLM responds as the character. The system alternates between them for N turns. This is the evaluation engine.
Evaluation rubrics: A set of scored dimensions (0–5 each, judged by an LLM) applied to a completed session transcript. Two clusters:
Cluster A (Card Faithfulness): Is the character behaving as the card specifies? Voice persistence, state-trigger fidelity, limit integrity, self-gap maintenance, worldview activation, spec containment, NPC fidelity, resolution-avoidance detection.
Cluster B (Session Quality): Is the session actually engaging? Agency/initiation rate, per-turn information density, story arc development, show vs. tell ratio, continuity and callbacks.
Cluster C (Prose Texture): Prose freshness, sensory specificity, pacing variance, action coherence.
Cluster D (Engagement Mechanics): Tension generation, hook density, subtext presence, emotional volatility realism.
Cluster E (Relationship Dynamics): Does the character read and respond to the specific user, track relationship state, handle power-dynamic shifts.
Cluster F (Failure Mode Flags): Therapy-speak intrusion, sycophancy creep, genre-template collapse, fourth-wall slips, repetition loops.

What the Product Actually Does (User Flows)
Flow 1 — Creator builds a character:
Goes to Characters → New Character
Fills in the character card form (name, backstory, personality, voice, states, limits, secret, NPCs, first message, full system prompt)
Saves character to library
Optionally: selects a user persona to run against the character, picks a model, runs an auto-pilot session, and reviews the transcript + evaluation scores to refine the card
Flow 2 — Creator evaluates a character:
Opens a character from the library
Goes to Evaluate → selects a user persona from the library
Selects model and number of turns
Runs auto-pilot session
After session completes, triggers LLM-judge evaluation — the judge scores the transcript on the rubric dimensions
Reviews score vector, flags, and specific cited turns
Refines the character card based on feedback, re-runs
Flow 3 — User chats with a character:
Browses character library (grid of cards with name, tags, short description)
Selects a character
Selects a model (or uses platform default)
Enters chat — character opens with its first message
Has a free-form conversation
Can export transcript

Technical Architecture Decisions
OpenRouter as LLM gateway: Single integration point that provides access to Gemini, DeepSeek, Claude, GPT-4o, Llama, and others under one API key. This means users can experiment with different models for the same character, which is valuable for evaluation (does this character work across models, or only on one?).
No backend in v1: All data (characters, personas, sessions, API key) lives in localStorage. This simplifies deployment to a static host and avoids auth complexity. The tradeoff is no cross-device sync and a storage limit, both acceptable at prototype stage.
Streaming responses: All LLM calls use streaming so the chat interface feels responsive — characters "type" in real time rather than showing a loading spinner then dumping text.
System prompt construction: The character's system prompt is injected as the system message. In auto-pilot mode, the user-persona prompt is injected as a separate system message for the user-LLM call. The session message history is shared context for both calls, building a coherent conversation.
Evaluation as a separate LLM call: After an auto-pilot session completes, the evaluation step is a separate call to a strong judge model (Claude or GPT-4o recommended) with the full transcript and rubric injected as context. The judge returns a structured JSON score vector with cited evidence per dimension.

Design Principles for Implementation
Character quality over character quantity: The UI should communicate that this is a platform for well-crafted characters, not a dumping ground. Presentation should feel considered.
Transparency of the system: Creators should be able to see exactly what system prompt is being sent, what the session looked like turn by turn, and why a score came out the way it did. No black boxes.
Model agnosticism: The product works with whatever LLM the user has access to. Never hard-code to one provider.
Creator and user are different audiences: Creator flows (character building, evaluation) should be clearly separated from user flows (browsing, chatting). Don't conflate them in the UI.
Evaluation is iterative: The eval → refine → re-eval loop is the core creator workflow. The UI should make this loop fast and low-friction, not buried in settings.

Scope Boundaries for v1
In scope:
Character card creation and editing
User persona creation and editing
Manual chat (human user + character LLM)
Auto-pilot chat (persona LLM + character LLM)
LLM-judge evaluation of completed sessions
Score display with cited evidence
Session export
Model selection via OpenRouter
API key management
Out of scope for v1:
User accounts / auth
Cloud sync
Character sharing / marketplace
Image generation for avatars
Voice / audio
Multi-character scenes
Fine-tuning or training on session data
Mobile app

