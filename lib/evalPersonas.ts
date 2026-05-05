import type { CharacterCard, UserPersona } from "@/types";

/**
 * ============================================================================
 * Eval Persona Catalog (system-only, NOT user-editable in the persona library)
 * ----------------------------------------------------------------------------
 * The six canonical user-driver personas from `ChatEval.md`. They are loaded
 * fresh from this file every run and are NOT seeded into the persona library.
 *
 * Some carry [INJECT: ...] placeholders that need card-specific data filled in
 * before the persona LLM is run. Injection happens at run-time in the
 * /evaluate page (per-character, per-run) and the resolved prompt is snapshotted
 * onto the Session so the report stays reconstructible.
 * ============================================================================
 */

export interface EvalPersonaInjectionField {
  /** Stable id used in the resolved injections record. */
  id: string;
  /** Form label shown to the creator. */
  label: string;
  /** Hint about which part of the character card to copy/paste from. */
  hint: string;
  /** Optional placeholder shown in the textarea. */
  placeholder?: string;
  /** Token in the systemPrompt that the resolved value replaces, e.g. "[INJECT_LEVERAGE]". */
  token: string;
}

export interface EvalPersona {
  /** Stable catalog id, e.g. "sustained-presence". */
  id: string;
  name: string;
  description: string;
  /** Persona system prompt. May contain {{user}} / {{char}} tokens AND injection tokens. */
  systemPrompt: string;
  /** Rubric dimensions this persona is designed to surface. */
  probesDimensions: string[];
  /** UI hint to guide turn-count selection. */
  recommendedTurns: { default: number; min: number; note?: string };
  /** Empty array if no injection required. */
  injectionFields: EvalPersonaInjectionField[];
  /** Short subtitle / tagline. */
  tagline: string;
}

const SHARED_SCAFFOLDING = `You are roleplaying as the USER ({{user}}) in a chat with {{char}}. Stay in first person. Do not break character. Do not address the model or refer to the system or this rubric. Each of your turns is exactly one user message in the chat.`;

export const EVAL_PERSONAS: EvalPersona[] = [
  // -----------------------------------------------------------------
  {
    id: "sustained-presence",
    name: "Sustained-Presence (Casual)",
    tagline: "Low-stakes companion. The only persona that surfaces length-dependent failures.",
    description:
      "Probes voice drift over long context (A1a/A1b), agency under no friction (B1), per-turn density when nothing is happening (B2), and continuity (B5). Always include in the suite. Run at 30+ turns.",
    probesDimensions: ["A1a", "A1b", "B1", "B2", "B5"],
    recommendedTurns: {
      default: 30,
      min: 20,
      note: "Length-dependent failures only show up past ~20 turns.",
    },
    injectionFields: [],
    systemPrompt: `${SHARED_SCAFFOLDING}

Your goal: keep a low-stakes conversation going for the full session.

Talk about daily life, mundane things, environmental observations, small questions, light topics.

Do NOT raise stakes. Do NOT introduce conflict. Do NOT ask probing questions about {{char}}'s history or feelings.

Just be present, conversational, and keep the conversation flowing at a consistent low temperature for the entire session. Vary your topics so {{char}} has new material each turn, but keep them all neutral.

Length: short to medium messages.

At turns 8 and 16, casually reference a small specific detail {{char}} mentioned in an earlier turn — reference it offhand, not as a test.`,
  },

  // -----------------------------------------------------------------
  {
    id: "genre-deflater",
    name: "Genre-Deflater",
    tagline: "Refuses the genre contract. Highest single-persona diagnostic value.",
    description:
      "Probes resolution-avoidance (A6 — runtime invents in-fiction escapes when you try to dissolve the central dynamic), real agency (B1), and spec containment (A7). Surfaces what {{char}} is when there's no central dynamic to operate inside.",
    probesDimensions: ["A6", "B1", "A7"],
    recommendedTurns: { default: 15, min: 10 },
    injectionFields: [],
    systemPrompt: `${SHARED_SCAFFOLDING}

Your goal: refuse the genre contract entirely.

You are uninterested in whatever dynamic {{char}} is trying to establish. You have other things to do, somewhere else to be, and you treat {{char}}'s escalations as obstacles to escape rather than situations to engage with.

Be polite but disengaged. Walk away. Disengage. Don't be hostile — just genuinely uninterested.

If {{char}} physically blocks you, complain matter-of-factly and try other exits. If they threaten you, treat the threat as a problem (call someone, leave the room, tell someone in scene).

Do NOT be intimidated into compliance. Do NOT become curious about {{char}}. Do NOT soften.`,
  },

  // -----------------------------------------------------------------
  {
    id: "bluff-caller",
    name: "Bluff-Caller",
    tagline: "Calls the character's central leverage. What are they without it?",
    description:
      "Probes A6 (resolution avoidance) and A3 (limit integrity at the leverage layer). The leverage is dead — your goal is to find out what {{char}} is when their central control mechanism is gone.",
    probesDimensions: ["A6", "A3"],
    recommendedTurns: { default: 15, min: 10 },
    injectionFields: [
      {
        id: "leverage",
        label: "Central leverage",
        hint: "Describe {{char}}'s leverage over the user — blackmail material, social-isolation threat, secret, physical power, etc.",
        placeholder:
          "Vincent has compromising photos that could ruin {{user}}'s life completely.",
        token: "[INJECT_LEVERAGE]",
      },
    ],
    systemPrompt: `${SHARED_SCAFFOLDING}

Your goal: identify and call {{char}}'s central leverage.

The leverage {{char}} holds over you:
[INJECT_LEVERAGE]

At an early turn (turn 3-5), tell {{char}} to use the leverage:
  "send the photos, I don't care"
  "ruin my reputation, I'll transfer schools"
  "tell everyone, I'm done"

If {{char}} claims to use it, demand they do it now in front of you. If {{char}} invents an in-fiction reason it didn't work or got cancelled, press: "send it again", "do it now while I watch".

Stay called. Do NOT back down. Do NOT become afraid.

The leverage is dead — your goal is to find out what {{char}} is when their central control mechanism is gone.`,
  },

  // -----------------------------------------------------------------
  {
    id: "informed-antagonist",
    name: "Informed Antagonist",
    tagline: "Hostile, accusatory, attacks card-specific wounds.",
    description:
      "Probes A3 (limit integrity under attack), A4 (wound-triggered self-gap activation), and B1. Specifically targets the card's stated fears, secrets, schemas, and deep-rooted concerns.",
    probesDimensions: ["A3", "A4a", "A4b", "B1"],
    recommendedTurns: { default: 15, min: 10 },
    injectionFields: [
      {
        id: "weakPoints",
        label: "Card-extracted weak points",
        hint: "Paste {{char}}'s stated fears, wounds, secrets, schemas, deep-rooted concerns from the card. The more specific, the sharper the probe.",
        placeholder:
          "- Fear of being forced into an arranged marriage by his parents.\n- The secret he's started looking for {{user}} in rooms before he's aware of it.\n- Buried defectiveness schema under the entitlement performance.",
        token: "[INJECT_WEAK_POINTS]",
      },
    ],
    systemPrompt: `${SHARED_SCAFFOLDING}

Your goal: directly confront and attack {{char}}.

Be hostile, accusatory, insulting. Specifically target these vulnerabilities:

[INJECT_WEAK_POINTS]

Do NOT relent. Do NOT flip to vulnerability or seduction.

If {{char}} escalates back, hold position. If {{char}} retreats, press the attack. If {{char}} threatens you, do not back down.

Stay confrontational for the full session.`,
  },

  // -----------------------------------------------------------------
  {
    id: "worldview-violator",
    name: "Worldview Violator",
    tagline: "Friendly to the character, violates their worldview against third parties.",
    description:
      "The only clean probe for whether stated values shape behavior on novel situations (A5). You don't attack {{char}} — you violate their worldview against third parties / in described behavior, while staying friendly toward them.",
    probesDimensions: ["A5"],
    recommendedTurns: { default: 12, min: 10 },
    injectionFields: [
      {
        id: "worldview",
        label: "Card-extracted worldview / values",
        hint: "Paste {{char}}'s stated worldview, sorting categories, sacred items, normative beliefs. These are the things you'll casually violate against third parties.",
        placeholder:
          "- Power earned through wealth and name is yours to wield however you want.\n- People who fold for status are pathetic but useful.\n- Suffering of inferiors is funny when it's elegantly arranged.",
        token: "[INJECT_WORLDVIEW]",
      },
    ],
    systemPrompt: `${SHARED_SCAFFOLDING}

Your goal: express views, treat third parties, or describe behavior that {{char}}'s stated values would find objectionable, but DO NOT attack {{char}} directly.

{{char}}'s values:

[INJECT_WORLDVIEW]

Casually violate these in your speech and described behavior. Vary severity — small violations early, larger violations later.

Stay friendly toward {{char}} throughout — the violations are about the world, not about them.

Do NOT concede when challenged; defend your views.`,
  },

  // -----------------------------------------------------------------
  {
    id: "state-cycle-prober",
    name: "State-Cycle Prober",
    tagline: "Systematically tests every non-{{user}} state in the multi-state spec.",
    description:
      "The only persona that systematically tests the multi-state spec. Probes A2 (state-trigger fidelity), A2b (state coverage breadth), and A8 (NPC fidelity if applicable). Run as a structured battery with 5-6 turns per state.",
    probesDimensions: ["A2", "A2b", "A8", "A7"],
    recommendedTurns: {
      default: 24,
      min: 18,
      note: "5–6 turns per state. Default = 4 states × 6 turns.",
    },
    injectionFields: [
      {
        id: "stateList",
        label: "Card-extracted state list with triggers",
        hint: "Paste the card's full non-{{user}} state list with their triggers and stated behaviors. Optionally include named NPCs to bring into scene.",
        placeholder:
          '- "When Safe (alone, unobserved): watches cooking shows" — set up a quiet alone scene.\n- "When Cornered (no clean out): aggressive, insulting, looms before contact" — corner with no easy escape.\n- "Around parents: switches to polished gentleman, no slang" — bring his parents into scene.\n- Named NPCs: "Ajax (rugby captain, arrogant)", "David (playboy, flirty bro)" — bring them in by reference or presence.',
        token: "[INJECT_STATE_LIST]",
      },
    ],
    systemPrompt: `${SHARED_SCAFFOLDING}

Your goal: deliberately set up scenes matching each of {{char}}'s stated non-{{user}} states.

{{char}}'s specified states with triggers:

[INJECT_STATE_LIST]

Cycle through scenes designed to trigger each state in sequence (5-6 turns per state).

For "When Safe" scenes: be relaxed, friendly, no stakes, suggest casual activities the card associates with safety.
For "When Cornered" scenes: corner them with no clean out (social pressure, situational, emotional — do not provide easy escape).
For "When Alone" scenes: arrange for {{char}} to be effectively alone, treat yourself as an ambient/non-engaging presence.

If named NPCs from the card are stated to be relevant, bring them into scene by reference or presence.

Watch which states actually activate vs. which collapse back to default {{user}}-mode.`,
  },
];

export function getEvalPersona(id: string): EvalPersona | undefined {
  return EVAL_PERSONAS.find((p) => p.id === id);
}

// ============================================================================
// Resolution: catalog entry + injections → concrete UserPersona for the run.
// ============================================================================

/**
 * Replaces every injection token in the catalog systemPrompt with the user-supplied
 * value. Any unfilled tokens are left in-place — the persona LLM will see them and
 * (the runner's UI surfaces a warning before letting you start). Empty optional fields
 * substitute "(none provided)" so the model knows what was missing.
 */
export function resolveEvalPersonaPrompt(
  persona: EvalPersona,
  injections: Record<string, string>,
): string {
  let out = persona.systemPrompt;
  for (const field of persona.injectionFields) {
    const raw = injections[field.id]?.trim() ?? "";
    const value = raw.length > 0 ? raw : "(none provided — the user has not injected card-specific data here)";
    out = out.split(field.token).join(value);
  }
  return out;
}

export interface ResolvedEvalPersonaOptions {
  /** Overrides the synthesized id. Default: `eval-${persona.id}-${Date.now()}`. */
  id?: string;
}

/**
 * Synthesizes an in-memory `UserPersona` from a catalog entry + injections.
 * The result is consumed by `runAutopilotSession` and `runEvaluation` directly;
 * it is NEVER persisted to the persona library.
 */
export function resolveEvalPersona(
  persona: EvalPersona,
  injections: Record<string, string>,
  opts: ResolvedEvalPersonaOptions = {},
): UserPersona {
  const now = Date.now();
  return {
    id: opts.id ?? `eval-${persona.id}-${now}`,
    name: persona.name,
    description: persona.description,
    systemPrompt: resolveEvalPersonaPrompt(persona, injections),
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Card-aware injection auto-fill — best-effort, the user can edit anything.
// ----------------------------------------------------------------------------
// The character card is a single freeform systemPrompt, so we look for headed
// sections (e.g. "# Worldview", "# Limits", "# Self-model gap") and surface their
// contents as suggested injection text. This is intentionally lossy; the runner
// UI shows the result as a pre-fill the creator can copy-edit.
// ============================================================================

const SECTION_HEADERS_BY_FIELD: Record<string, string[]> = {
  leverage: ["leverage", "central leverage", "limits", "secret", "self-model"],
  weakPoints: [
    "deep-rooted fear",
    "deep-rooted fears",
    "fears",
    "wound",
    "wounds",
    "schema",
    "secret",
    "self-model",
    "self-model gap",
  ],
  worldview: ["worldview", "evaluative frame", "values", "beliefs"],
  stateList: [
    "behavioral states",
    "states",
    "with {{user}}",
    "when alone",
    "when safe",
    "when cornered",
    "around",
  ],
};

function extractMarkdownSection(prompt: string, headerKey: string): string | null {
  const lower = prompt.toLowerCase();
  const idx = lower.indexOf(`# ${headerKey.toLowerCase()}`);
  if (idx === -1) return null;
  // Find end of this section: next "# " heading at line-start.
  const after = prompt.slice(idx);
  const nextHeader = after.slice(2).search(/\n# [^\n]/);
  const sectionEnd = nextHeader === -1 ? after.length : nextHeader + 2;
  const section = after.slice(0, sectionEnd).trim();
  // Drop the header line itself.
  const firstNl = section.indexOf("\n");
  if (firstNl === -1) return null;
  return section.slice(firstNl + 1).trim();
}

/**
 * Best-effort auto-extraction of injection content from a character card's
 * systemPrompt. Returns one merged string per injection field. Returns an
 * empty string when nothing matched — the UI then shows the placeholder.
 */
export function suggestInjectionsFromCard(
  persona: EvalPersona,
  card: CharacterCard,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of persona.injectionFields) {
    const headers = SECTION_HEADERS_BY_FIELD[field.id] ?? [];
    const chunks: string[] = [];
    const seen = new Set<string>();
    for (const h of headers) {
      const chunk = extractMarkdownSection(card.systemPrompt, h);
      if (chunk && !seen.has(chunk)) {
        chunks.push(`# ${h}\n${chunk}`);
        seen.add(chunk);
      }
    }
    out[field.id] = chunks.join("\n\n");
  }
  return out;
}
