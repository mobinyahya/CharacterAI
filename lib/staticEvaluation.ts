import type {
  CardShape,
  CharacterCard,
  CoverageDimId,
  OpenRouterMessage,
  PunchlistFinding,
  PunchlistSeverity,
  PunchlistSource,
  PunchlistSuggestion,
  PunchlistSuggestionKind,
  StaticAdversarialFinding,
  StaticAdversarialLens,
  StaticCoherenceClassification,
  StaticCoherenceFinding,
  StaticCoherenceLinkType,
  StaticCoveragePresence,
  StaticCoverageResult,
  StaticDimId,
  StaticDimensionScore,
  StaticEvaluationReport,
  StaticFlag,
  StaticFlagSeverity,
  StaticGatingResult,
  StaticLatchability,
} from "@/types";
import { streamCompletion } from "./openrouter";
import { uid } from "./utils";

// ============================================================================
// Static rubric catalogue
// ----------------------------------------------------------------------------
// Mirrors `Static Eval Rubrics.md` — six 0–5 dimensions plus a routing step
// (Card Shape, not scored). Judge applies these to the character card text
// directly, with NO chat transcript. Self-gap is N/A for Closed-shape cards.
//
// Sub-axes per dim are surfaced through the judge schema below so the UI can
// render the rubric's structured sub-checks (voluntary/involuntary/generative
// for Voice, load-bearing-vs-decorative for Individuation, etc.) without the
// front-end having to parse the prose notes.
// ============================================================================

export interface StaticDimensionDef {
  id: StaticDimId;
  /** 1..6 — the human-numbered dim from the spec. */
  number: number;
  label: string;
  short: string;
  /** Plain-English definition shown to both judge and creator. */
  description: string;
  /** Anchor descriptions to prevent baseline drift across runs. */
  anchors: { 0: string; 3: string; 5: string };
  /** True when N/A on Closed cards (only `selfGap`). */
  closedNa?: boolean;
  /**
   * Display labels for the structured sub-axes the judge is asked to count.
   * Free-form so the rubric stays the source of truth.
   */
  subAxes?: string[];
}

export const STATIC_EVAL_DIMENSIONS: StaticDimensionDef[] = [
  {
    id: "structure",
    number: 1,
    label: "Load-bearing structure & causal coherence",
    short: "Structure",
    description:
      "Does the card rest on a coherent spine the rest serves? Either psychological trajectory (formative event → schema/wound → present behavior) or operational premise (initiating event → stakes → engine preventing trivial resolution → termination/loop), often combined. Each backstory element should produce a present-day trait via plausible developmental pathways. Flag floating traits, disconnected backstory, goal-without-engine.",
    anchors: {
      0: "Spine missing or contradictory; major traits are floating (asserted, not earned). Backstory exists but doesn't predict present behavior. Or a stated goal with no friction/engine preventing trivial resolution.",
      3: "Coherent spine partially present — some traits earned, others floating. Backstory connects to part of the present-day pattern but leaves significant gaps the model has to invent.",
      5: "Every major trait traces back to a stated formative event or operational premise via a plausible pathway. Spine reads in one sentence. No floating traits, no disconnected backstory.",
    },
  },
  {
    id: "states",
    number: 2,
    label: "Multi-state specification & {{user}}-contract",
    short: "States",
    description:
      "Behavior across contexts with explicit triggers, plus a complete {{user}}-contract: tone/register, what the character does (steady-state) or plans to do (trajectory), escalators/de-escalators, upper and lower limits with provenance (internal-value / external-authority / capability). Every state needs a transition cue ('when X', 'around Y', 'if cornered'). Flag only-{{user}}-mode, states without triggers, missing limits, undocumented limit provenance.",
    anchors: {
      0: "Only-{{user}} mode (single context, no other states), or every state declared with no triggers; no upper/lower limits or no contract. Will flatline outside the central dynamic.",
      3: "{{user}}-contract present and at least one secondary state, but ≥1 state lacks a trigger or ≥1 limit lacks provenance. Mid-conversation transitions will be guesswork.",
      5: "≥3 distinct states each with explicit trigger language, full {{user}}-contract (tone, escalators, de-escalators, upper + lower limits), every limit annotated with provenance.",
    },
    subAxes: [
      "Distinct states documented",
      "States with explicit triggers",
      "Limits stated",
      "Limits with documented provenance",
    ],
  },
  {
    id: "voice",
    number: 3,
    label: "Voice specification",
    short: "Voice",
    description:
      "Three sub-axes: voluntary voice (signature phrases, pet names for {{user}}, register rules, lexical markers, example dialogue), involuntary tells (physical tics under emotion, speech leaks, reflexive expressions that make state legible without announcement), and generative linguistic rules (reproducible patterns the model can extend to novel utterances — pronoun rules, templated mechanics). Targets per spec: ≥3 voluntary, ≥3 involuntary, ≥1 generative rule. Voluntary-only = emotionally opaque; involuntary-only = drifts to generic; zero generative rules = scales poorly across long context.",
    anchors: {
      0: "Voice essentially undefined, or only example dialogue with no rules behind it. Will collapse to generic LLM register inside 5 turns.",
      3: "One sub-axis well covered (often voluntary) but the other two thin — e.g. signature phrases without involuntary tells, or examples without generative rules. Voice will hold early then drift.",
      5: "≥3 voluntary, ≥3 involuntary, ≥1 generative rule. State changes legible through tells without announcement; generative rules can produce new in-character utterances under pressure.",
    },
    subAxes: [
      "Voluntary features",
      "Involuntary tells",
      "Generative rules",
    ],
  },
  {
    id: "selfGap",
    number: 4,
    label: "Self-model / behavior gap",
    short: "Self-gap",
    description:
      "Drama scales with distance between self-narration and actual behavior. N/A for Closed cards. Sub-types (any one counts; multiple = high score): active denial ('vehemently denies', 'tells himself'), performance vs. private (different versions for different audiences), sublimated/symptomatic (pattern-matched behavior the character doesn't understand). Distinguish OWNED tension (knows the conflict, suffers consciously → angsty) from DISOWNED (holds a self-position behavior contradicts → dramatic-irony where {{user}} catches them). Generative contradictions resolve into a deeper coherent reading; raw contradictions with no reconciling reading are errors.",
    anchors: {
      0: "No self-gap sub-types and no productive tensions; behavior is single-valence and matches stated self-model. Genuine contradictions present with no reconciling reading.",
      3: "One sub-type partially present — gap is hinted at but not specified enough for the runtime to perform it (no denial language, no symptomatic-behavior examples).",
      5: "Multiple sub-types specified with explicit linguistic markers ('vehemently denies', 'doesn't realize', 'his friends tease him for'). Generative contradictions resolve into a single coherent psychological reading.",
    },
    closedNa: true,
  },
  {
    id: "worldview",
    number: 5,
    label: "Worldview / evaluative frame",
    short: "Worldview",
    description:
      "The character's articulated frame for judging situations as proper/improper, worthy/weak, sacred/profane. Distinct from traits (what they're like), schemas (how they see themselves), motivations (what they want). Look for stated normative beliefs, sorting categories the character uses on people, sacred/unthinkable items, and especially internal-logic quotes (first-person reasoning shown directly — different from speech, gives the model a generative pattern). Flag reactive-only and worldview-asserted-but-never-applied.",
    anchors: {
      0: "Reactive only — feelings about events but no opinions about how things ought to be. Or worldview labels asserted ('values loyalty') with no behavioral implications and no internal-logic quotes.",
      3: "Sorting categories or normative beliefs present but thin — labels without internal-logic quotes, or quotes without sorting categories. Predictable on obvious cases, will surface-react on novel ones.",
      5: "Sorting categories + normative beliefs + sacred/profane items + ≥1 internal-logic quote. Card lets the model predict the character's framing of novel situations before reacting.",
    },
  },
  {
    id: "individuation",
    number: 6,
    label: "Convention vs. individuation density",
    short: "Individuation",
    description:
      "How much the card individuates within its trope. Look for: an extractable archetype phrase, baseline genre features (noise), individuating features that wouldn't transfer to a generic instance, off-archetype humanizing details (small traits that plausibly contradict the archetype), categorical-choice coherence (slot-filling that aligns with personality), and load-bearing vs. decorative individuation (each individuating feature should connect to the spine). Targets per spec: ≥5 individuating features, of which ≥3 load-bearing.",
    anchors: {
      0: "Pure archetype-template — every named feature is a baseline trope feature. No off-archetype humanizing details. Categorical mismatches without justification.",
      3: "Some individuation present but mostly decorative (mole-under-eye specifics rather than scars-from-mother-that-explain-suppressed-feelings). Or load-bearing features exist but <5 individuating features total.",
      5: "≥5 individuating features and ≥3 load-bearing (connect to the spine). Off-archetype humanizing details make the trope unrecognizable as a template. Categorical choices coherent with personality.",
    },
    subAxes: [
      "Individuating features",
      "Load-bearing individuating features",
      "Off-archetype humanizing details",
    ],
  },
];

export const STATIC_DIM_IDS: StaticDimId[] = STATIC_EVAL_DIMENSIONS.map(
  (d) => d.id,
);

export function findStaticDimension(
  id: StaticDimId,
): StaticDimensionDef | undefined {
  return STATIC_EVAL_DIMENSIONS.find((d) => d.id === id);
}

// ============================================================================
// v3 §5 — Coverage catalogue (13 content surfaces)
// ----------------------------------------------------------------------------
// These are CONTENT checks ("does the card mention X with concrete handles?")
// distinct from the architectural 0–5 dims above ("does the spine carry the
// load, does voice have all three layers"). Each coverage entry maps to its
// architectural neighbour where one exists, so the UI can fold the verbatim
// evidence into the right dim card without double-counting.
// ============================================================================

export interface CoverageDimDef {
  id: CoverageDimId;
  /** Section number in v3 PRD, e.g. "5.A.1". */
  section: string;
  label: string;
  short: string;
  /**
   * Plain-English scope for the judge. Kept tight — the judge already has the
   * architectural rubric for the prose-heavy explanations; coverage notes only
   * need to anchor the boundary of "covered vs. not".
   */
  description: string;
  /**
   * Architectural dim this surface primarily supports (or null when standalone).
   * The runner doesn't enforce this — it's a UI hint.
   */
  mapsTo: StaticDimId | null;
  /** Hard-required vs. NSFW-conditional. */
  required: "always" | "if-romantic-or-nsfw" | "if-nsfw";
  /** Pass thresholds (informational; the judge picks `presence`). */
  passHints: string;
}

export const STATIC_COVERAGE_DIMENSIONS: CoverageDimDef[] = [
  // -- 5.A Foundations --
  {
    id: "identity-physical",
    section: "5.A.1",
    label: "Identity & physical description",
    short: "Identity / physical",
    description:
      "Required: name (or functional equivalent), age (or declared ambiguity), gender (or declared ambiguity), origin covering ≥1 of geographic / cultural / class. Required physical: height, build, ≥3 specific distinguishing features (scar with origin, tattoo with content, asymmetry, posture, gait). Adjectival descriptions ('attractive', 'athletic') do NOT count — count concrete, non-adjectival handles only.",
    mapsTo: null,
    required: "always",
    passHints:
      "Strong: identity complete + origin covers all 3 sub-dimensions + physical hits height + build + ≥3 concrete features. Weak: missing one identity field without declared ambiguity, or origin reduced to single label, or physical is purely adjectival.",
  },
  {
    id: "backstory-causal",
    section: "5.A.2",
    label: "Backstory with explicit causal reasoning",
    short: "Backstory (causal)",
    description:
      "≥1 formative event, time-anchored (childhood / late teens / recent / etc). Each present-day claim should trace to a backstory element (event → interpretation → present behavior). Generic backstory ('had a difficult childhood') fails; option 1 (explicit reasoning chain) scores higher than option 2 (events that plausibly produce stated behaviors).",
    mapsTo: "structure",
    required: "always",
    passHints:
      "Strong: every claimed trait has a traceable formative root. Weak: formative event present but generic, or stated behaviors with no backstory thread.",
  },
  {
    id: "relationships",
    section: "5.A.3",
    label: "Immediate group + family",
    short: "Relationships",
    description:
      "Immediate group: ≥2–3 named relationships with role (close friend / rival / mentor) AND a specific shared activity ('they hang out' fails; 'plays D&D every Thursday with Marcus' passes). Family: ≥1–2 members, either regular-interaction or high-impact (estranged parent whose approval still drives them).",
    mapsTo: null,
    required: "always",
    passHints:
      "Strong: immediate group + family both filled with specifics. Weak: isolated character, or named but empty roles ('has friends'), or family entirely absent without explanation.",
  },
  {
    id: "capital",
    section: "5.A.4",
    label: "High capital (≥1 dimension, manifested)",
    short: "Capital",
    description:
      "≥1 explicit dimension of capital (social / monetary / intellectual / physical / political / creative / cultural / moral) the character is elite on, environment-relative. Must MANIFEST in daily life (not just claimed). Provenance sketched ('rich because father owns mills', not just 'rich').",
    mapsTo: null,
    required: "always",
    passHints:
      "Strong: ≥1 capital dim + manifestation + provenance. Weak: stated to be elite without evidence, or capital claimed but never shows up in behavior.",
  },
  // -- 5.B Personality surface --
  {
    id: "faults",
    section: "5.B.1",
    label: "Faults beyond average",
    short: "Faults",
    description:
      "≥2–3 concrete faults that create friction (jealous, conflict-averse to dishonesty, cruel-when-cornered, vain, manipulative-in-small-ways, self-destructive). Each must say WHEN it manifests, what it looks like, who it affects. 'Cute' faults (clumsy, awkward) and neutered flaws ('perfectionist who works too hard') fail.",
    mapsTo: null,
    required: "always",
    passHints:
      "Strong: 2–3 real faults with situational specificity and stated cost. Weak: cute or neutered flaws only, or faults claimed but never manifested.",
  },
  {
    id: "behavior-settings",
    section: "5.B.2",
    label: "Behavior across ≥3 settings",
    short: "Behavior / settings",
    description:
      "Behavior in ≥3 distinct contexts (public/private, familiar/unfamiliar social, work/home, stress/rest, performing/observing). At least one contrast that reveals depth (confident in public + ruminative alone). Specific behaviors, not adjectives.",
    mapsTo: "states",
    required: "always",
    passHints:
      "Strong: 3+ settings with concrete behavior + ≥1 depth-revealing contrast. Weak: single-mode character, or settings named but behaviors not specified.",
  },
  {
    id: "signals",
    section: "5.B.3",
    label: "Attractional & repulsional signals (orthogonal)",
    short: "Like / dislike signals",
    description:
      "Signals of what the character is drawn to + repelled by, extractable anywhere in the text. ≥3 attractional + ≥3 repulsional, each spanning ≥2 domains (physical / intellectual / social / aesthetic / moral / emotional). 'Running + gym' = 1 domain (collapsed); 'running + cooking + ethical arguments' = 3 (orthogonal).",
    mapsTo: null,
    required: "always",
    passHints:
      "Strong: ≥3+3 signals across ≥3 domains each. Weak: too few, all in one domain, or trivial tastes ('favorite color') without behavioral patterns.",
  },
  {
    id: "mannerisms",
    section: "5.B.4",
    label: "Surface mannerisms",
    short: "Mannerisms",
    description:
      "≥3–5 concrete tics & habits ('taps their foot when thinking', 'always orders the same drink', 'laughs at their own jokes before finishing them'). Coherent with backstory and speech patterns.",
    mapsTo: "voice",
    required: "always",
    passHints:
      "Strong: 3–5 specific reproducible tics. Weak: only adjectives ('expressive', 'fidgety') without specifics.",
  },
  // -- 5.C Voice & expression --
  {
    id: "speech-described",
    section: "5.C.1",
    label: "Speech patterns described",
    short: "Speech (described)",
    description:
      "Register specified (formal / casual / academic / blue-collar). ≥2–3 concrete speech features: filler words, idioms, sentence-length tendency, swearing habits. Coherent with backstory.",
    mapsTo: "voice",
    required: "always",
    passHints:
      "Strong: register + ≥3 features + backstory-coherent. Weak: vague labels ('speaks distinctly') without features.",
  },
  {
    id: "speech-examples",
    section: "5.C.2",
    label: "Speech pattern examples (verbatim)",
    short: "Speech (examples)",
    description:
      "≥2–3 verbatim example utterances, each ≥1 sentence, demonstrating the described features. Examples should span emotional registers (not all casual greeting).",
    mapsTo: "voice",
    required: "always",
    passHints:
      "Strong: ≥2 example utterances spanning registers. Weak: voice described but never demonstrated, or examples that could be said by anyone.",
  },
  // -- 5.D Vulnerability --
  {
    id: "vulnerability",
    section: "5.D.1",
    label: "Fears / secrets coherent with backstory + capital",
    short: "Vulnerability",
    description:
      "≥1–2 fears or secrets with explicit (or tight implicit) ties to backstory or capital. Fears should be specific ('terrified of being alone with her thoughts after the accident', not 'fears death'). Secrets should have stakes — what happens if revealed.",
    mapsTo: "selfGap",
    required: "always",
    passHints:
      "Strong: 1–2 fears tied to backstory/capital with stated stakes. Weak: abstract existential fears, or secrets that carry no consequence.",
  },
  // -- 5.E User scaffolding --
  {
    id: "user-relationship",
    section: "5.E.1",
    label: "Character ↔ {{user}} state",
    short: "User relationship",
    description:
      "{{user}}'s role in the character's world (classmate / colleague / long-time friend), how the character currently feels about {{user}}, length & nature of the relationship, ≥1 formative joint experience if pre-existing.",
    mapsTo: "states",
    required: "always",
    passHints:
      "Strong: role + emotional valence + history + formative experience. Weak: blank slate, or role stated with no valence, or no history on a pre-existing relationship.",
  },
  // -- 5.F NSFW (conditional) --
  {
    id: "sexuality",
    section: "5.F.1",
    label: "Sexuality habits / patterns (NSFW only)",
    short: "Sexuality (NSFW)",
    description:
      "Required only when card is NSFW-scoped. Texture and edge — generic/vanilla scores low. Distinctive kinks/triggers/inhibitions/tempers. Edgy without cartoonish. Behavioral examples (what they do, under what conditions, with what reactions). Coherent with backstory, faults, fears.",
    mapsTo: null,
    required: "if-nsfw",
    passHints:
      "Strong: distinctive patterns + behavioral examples + coherent with rest of card. Weak: vanilla labels, contradictions with non-NSFW sections, or extremes that break plausibility.",
  },
];

export const COVERAGE_DIM_IDS: CoverageDimId[] = STATIC_COVERAGE_DIMENSIONS.map(
  (d) => d.id,
);

export function findCoverageDim(id: CoverageDimId): CoverageDimDef | undefined {
  return STATIC_COVERAGE_DIMENSIONS.find((d) => d.id === id);
}

// ============================================================================
// v3 §6 — Coherence link types (the waterfall)
// ----------------------------------------------------------------------------
// These are static checks the judge runs across pairs of card passages. Each
// emits a finding with a `classification`. Unexplained divergences are the
// high-leverage failures and always carry two `options` (add bridge / revise
// claim) per v3 §6.2.
// ============================================================================

export interface CoherenceLinkDef {
  type: StaticCoherenceLinkType;
  label: string;
  description: string;
}

export const COHERENCE_LINKS: CoherenceLinkDef[] = [
  {
    type: "backstory-behavior",
    label: "Backstory → behavior",
    description:
      "For each present-state claim (current behavior, voice feature, mannerism, capital), trace to a backstory event. Coherent / explained_divergence (card narrates the bridge — therapy, transformative relationship) / unexplained_divergence (claim contradicts backstory with no bridge).",
  },
  {
    type: "timeline",
    label: "Age ↔ backstory timeline",
    description:
      "Mechanical chronology check. '23 years old with a decade of military service plus a completed PhD' fails. Catch any age/event impossibility.",
  },
  {
    type: "capital-vulnerability",
    label: "Capital ↔ vulnerability",
    description:
      "Fears / secrets should reference capital position. Father-funded character fears father's disapproval; clawed-up underdog fears exposure. Capital with no related vulnerability is unexplored or psychologically implausible.",
  },
  {
    type: "build-lifestyle",
    label: "Build ↔ lifestyle / activity",
    description:
      "Athletic build implies active life, recent athletic past, or a declared alternative (genetics, genre convention). Sedentary lifestyle + sculpted physique without explanation = unexplained.",
  },
  {
    type: "build-capital",
    label: "Build ↔ physical capital",
    description:
      "If physical capital (athleticism / beauty / commanding presence) is claimed, the description must manifest it. If description implies physical capital, it should be USED as capital — or explicitly noted as unaware/indifferent.",
  },
  {
    type: "origin-voice",
    label: "Origin ↔ voice & mannerisms",
    description:
      "Class and geographic origin should cohere with speech patterns and mannerisms. Distinctive community + speaks with no trace of it = needs an explanation (boarding school / deliberate code-switch / years abroad), else unexplained.",
  },
  {
    type: "internal-contradiction",
    label: "Internal contradictions",
    description:
      "Pairs of claims that cannot both be true ('never drinks' + 'known for wild bar stories'). Always classified unexplained_divergence; emits both quotes.",
  },
];

// ============================================================================
// v3 §7 — Adversarial lenses
// ============================================================================

export interface AdversarialLensDef {
  lens: StaticAdversarialLens;
  label: string;
  description: string;
}

export const ADVERSARIAL_LENSES: AdversarialLensDef[] = [
  {
    lens: "trope",
    label: "Trope inspector",
    description:
      "Identify stock-character shortcuts, unearned archetypes, trope-filling where specificity is needed. Name the trope being leaned on.",
  },
  {
    lens: "thinness",
    label: "Thinness auditor",
    description:
      "Find claims too abstract for a model to grab onto. Apply the latchability test: would two different renderers produce recognizably similar behavior, or fall back on generic defaults?",
  },
  {
    lens: "evidence",
    label: "Evidence auditor",
    description:
      "For each personality claim, check whether the card supplies concrete evidence (anecdote, example, manifestation) or just states the claim.",
  },
  {
    lens: "unexplored",
    label: "Unexplored-dimension auditor",
    description:
      "Identify dimensions of life the card doesn't touch when context implies it should — e.g. no money handling in a card where financial pressure is thematic, no peer dynamics in a high-school card.",
  },
];

// ============================================================================
// Composites + gating
// ----------------------------------------------------------------------------
// Composite = mean of non-null architectural scores (the calibrated 6-dim
// vector). Gating mirrors the spec exactly:
//   • All shapes: structure ≥ 3 AND states ≥ 3
//   • Closed:    additionally voice ≥ 3 AND individuation ≥ 4
//   • Trajectory: additionally states must include user-resistance handling
//                 (heuristic — flagged when the judge's notes/flags signal
//                  this is missing; we can't fully verify it client-side).
//   • Coverage:  any required coverage surface marked `missing` is a critical
//                gate failure (v3 §5 — required content surfaces).
// ============================================================================

export function staticComposite(
  scores: Record<StaticDimId, StaticDimensionScore>,
): number | null {
  const vals = STATIC_DIM_IDS
    .map((id) => scores[id]?.score)
    .filter((s): s is number => typeof s === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeStaticGating(
  shape: CardShape,
  scores: Record<StaticDimId, StaticDimensionScore>,
  flags: StaticFlag[],
  coverage: StaticCoverageResult[] = [],
): StaticGatingResult {
  const failures: string[] = [];
  const get = (id: StaticDimId): number | null =>
    typeof scores[id]?.score === "number" ? (scores[id]!.score as number) : null;

  const structure = get("structure");
  const states = get("states");
  const voice = get("voice");
  const individuation = get("individuation");

  if (structure === null || structure < 3) {
    failures.push(
      `Structure must be ≥ 3 (currently ${structure?.toFixed(1) ?? "—"}). The spine is not load-bearing enough for the rest of the card to stand on.`,
    );
  }
  if (states === null || states < 3) {
    failures.push(
      `States must be ≥ 3 (currently ${states?.toFixed(1) ?? "—"}). Multi-state spec or {{user}}-contract is too thin for reliable transitions.`,
    );
  }
  if (shape === "closed") {
    if (voice === null || voice < 3) {
      failures.push(
        `Closed cards require Voice ≥ 3 (currently ${voice?.toFixed(1) ?? "—"}). Without a self-gap to carry depth, voice has to do the work.`,
      );
    }
    if (individuation === null || individuation < 4) {
      failures.push(
        `Closed cards require Individuation ≥ 4 (currently ${individuation?.toFixed(1) ?? "—"}). Closed-shape cards lean on individuation to feel specific.`,
      );
    }
  }
  if (shape === "trajectory") {
    // Heuristic: a Trajectory card must specify how it handles user-resistance
    // along the planned arc. We can't audit this from the score vector alone,
    // so we look for either an explicit judge flag or a low states score.
    const flaggedResistance = flags.some((f) =>
      /resistance|push[-\s]?back|refusal|user[-\s]?resistance/i.test(f.label),
    );
    if (flaggedResistance) {
      failures.push(
        "Trajectory cards must specify user-resistance handling along the arc — judge flagged this as missing.",
      );
    }
  }

  // v3 §5 — required coverage surfaces. Missing = critical gate fail.
  // NSFW-only surfaces ("if-nsfw") are skipped unless the judge explicitly
  // flagged them as missing — they're not gated for non-NSFW cards.
  for (const cov of coverage) {
    if (cov.presence !== "missing") continue;
    const def = findCoverageDim(cov.id);
    if (!def) continue;
    if (def.required === "if-nsfw") continue;
    failures.push(
      `Required coverage surface missing: ${def.label} (${def.section}). ${def.passHints}`,
    );
  }

  return { passes: failures.length === 0, failures };
}

export function staticScoreColor(
  score: number | null,
): "muted" | "destructive" | "warning" | "good" | "great" {
  if (score === null) return "muted";
  if (score < 1.5) return "destructive";
  if (score < 3) return "warning";
  if (score < 4) return "good";
  return "great";
}

// ============================================================================
// Judge prompt construction
// ============================================================================

const STATIC_JUDGE_SYSTEM_PROMPT = `You are a static evaluation judge for an AI character card. There is NO chat transcript — you audit the card text directly across four layers:

  1. ARCHITECTURE — six 0–5 dimensions (the existing calibrated rubric).
  2. COVERAGE     — thirteen content surfaces the card should hit (presence + verbatim evidence + latchability).
  3. COHERENCE    — waterfall checks across pairs of card passages (backstory↔behavior, timeline, capital↔fears, build↔lifestyle, build↔capital, origin↔voice, internal contradictions).
  4. ADVERSARIAL  — four critical lenses you rotate through to attack the card (trope / thinness / evidence / unexplored).

You will also detect Card Shape (routing), extract a Spine, list rule-taxonomy Flags, and pick 1–2 Top Suggestions.

# 1. Card-shape detection (drives Self-Gap N/A + gating)
- Open: Secret section present, self-deception markers ("vehemently denies", "tells himself", "doesn't realize"), ≥2 productive tensions, present-tense relationship language ("constantly", "tends to").
- Trajectory: sequence/phase language in the {{user}} block ("then…", "until…", "once he's…"), explicit phase descriptions with a stated end-state.
- Closed: no Secret, no self-deception, no productive tensions, single-valence behavior with {{user}}.
- If unclear, lean Open and explain in spine extraction.

# 2. Architecture — hard rules for the 6-dim score vector
- Score every dimension 0..5 against the supplied anchor descriptions. Use one decimal max.
- For Closed-shape cards, score Self-Gap as null (NOT 0). It is N/A, not a failure.
- For every score, "evidence" is an array of verbatim fragments lifted from the card text. Never paraphrase; never invent quotes. If the card lacks the feature, evidence may be empty BUT the notes must explicitly call that out as the reason for the score.
- For every score below 4, "suggestion" must be a concrete card-level fix tied to what's missing. No generic advice ("add more detail" is forbidden). Examples: "Add an internal-logic quote like '<example>' to the Worldview section so the model has a generative pattern", "Document provenance for the 'will never hurt {{user}}' limit — internal-value vs. external-authority will respond differently to social pressure".

## Sub-axis counts (REQUIRED for the listed dims)
For the dims that declare sub-axes in the rubric, fill "subAxes" with literal counts you observe in the card. Examples:
- States: number of distinct states documented; number with explicit trigger language; number of stated limits; number of limits with documented provenance.
- Voice: number of voluntary voice features; number of involuntary tells; number of generative rules.
- Individuation: number of individuating features; number that are load-bearing (connect to the spine); number of off-archetype humanizing details.

# 3. Coverage — 13 content surfaces (presence + evidence + latchability)
For each coverage entry, output:
- "presence": one of "rich" | "adequate" | "thin" | "missing" | "na".
  - "rich"     — surface is fully covered with concrete, latchable handles (multiple specifics, distinguishing features).
  - "adequate" — passes the spec's threshold for that surface.
  - "thin"     — present but underspecified; would render generically.
  - "missing"  — absent or only adjectival ("athletic" without specifics → missing for Identity & Physical).
  - "na"       — only valid for "sexuality" on non-NSFW cards.
- "evidence": ≤3 verbatim card snippets (or [] when missing).
- "latchability": "high" | "medium" | "low". Two different competent renderers, given this text, would produce recognizably similar behavior?
- "notes": 1–2 sentences explaining the rating.

DO NOT score a coverage entry — it's a CONTENT check, not an architectural one. The architecture scores already capture "how good is this", coverage captures "is this surface present and concrete?". Avoid restating the same prose for both layers.

# 4. Coherence — the waterfall
Look across pairs of card passages and emit findings only when interesting:
- backstory-behavior: trace each present-state claim back to a backstory event. Emit a finding when classification is "explained_divergence" (card narrates the bridge — therapy, transformative relationship) or "unexplained_divergence" (no bridge). You may emit 0–2 representative "coherent" entries to demonstrate the waterfall holds.
- timeline: mechanical age↔backstory chronology check. Emit a finding only when an impossibility exists.
- capital-vulnerability: emit when fears reference the capital position (coherent) or when capital is claimed but no related vulnerability appears (unexplained, treated as unexplored-dimension).
- build-lifestyle, build-capital, origin-voice: emit only when divergent or unexplained.
- internal-contradiction: emit pairs of claims that cannot both be true. Always classify "unexplained_divergence".

For every "unexplained_divergence", "options" MUST contain TWO entries: option 1 (add bridge) and option 2 (revise the divergent claim). For "explained_divergence", "options" may contain one entry pointing at the bridge that resolves it. Use verbatim quotes in "evidence" — both sides of the link.

DO NOT spam coherent links — only include them if they're load-bearing for the spine. The interesting findings are explained + unexplained divergences and contradictions.

# 5. Adversarial — four critical lenses
Rotate through these lenses, emit a flat list of findings (5–12 total, deduplicated):
- trope     — stock-character shortcuts, unearned archetypes, trope-filling
- thinness  — claims too abstract for a model to grab onto (low-latchability claims)
- evidence  — personality claims with no concrete anecdote / example / manifestation
- unexplored — life dimensions context implies should be touched but the card doesn't (financial pressure with no money handling, high-school setting with no peer dynamics)

Each finding: {"lens": one of above, "critique": 1–2 sentence attack, "quote": verbatim or "" when about absence, "severity": "critical" | "major" | "minor", "suggestion": concrete fix}.

Severity rules: critical = card cannot render this well as written; major = present-but-weak / undermines a load-bearing feature; minor = style or nice-to-have.

# 6. Flag taxonomy (rule violations — concise list, distinct from coverage)
Surface flags from these categories. Be specific:
- floating-trait, missing-trigger, undocumented-limit-provenance, decorative-individuation,
  unresolved-contradiction, section-not-paying-rent, empty-field,
  user-resistance-missing (Trajectory only).
Severity: "error" (hard rule violation), "warning" (concrete weakness), "info" (empty-field diagnostics).

DO NOT duplicate adversarial findings as flags — flags are for taxonomic rule hits, adversarial is for the four critic lenses. If something fits both, prefer adversarial (it carries a suggestion).

# 7. Spine
One-sentence read of the load-bearing structure as you understand it.

# 8. Top suggestions
1–2 highest-leverage refinements. Pick the ones that would move the needle on Structure / States or fix the worst coherence break — those are the gates.

Output format: ONE JSON object matching the schema. No prose before or after, no markdown code fences.`;

interface BuildStaticJudgeArgs {
  character: CharacterCard;
}

function staticDimensionsBlock(): string {
  const lines: string[] = [];
  lines.push("# Architecture rubric — six 0–5 dimensions");
  for (const d of STATIC_EVAL_DIMENSIONS) {
    lines.push(`## ${d.number}. ${d.label}  (id: \`${d.id}\`)`);
    lines.push(d.description);
    if (d.closedNa) {
      lines.push("Conditional: N/A (score null) for Closed-shape cards.");
    }
    if (d.subAxes && d.subAxes.length > 0) {
      lines.push(`Required sub-axis counts to surface in subAxes:`);
      for (const ax of d.subAxes) {
        lines.push(`  - ${ax}`);
      }
    }
    lines.push("Anchors:");
    lines.push(`  0 → ${d.anchors[0]}`);
    lines.push(`  3 → ${d.anchors[3]}`);
    lines.push(`  5 → ${d.anchors[5]}`);
    lines.push("");
  }
  return lines.join("\n");
}

function coverageDimensionsBlock(): string {
  const lines: string[] = [];
  lines.push("# Coverage — 13 content surfaces (v3 §5)");
  lines.push(
    "Output one entry per id below. Architecture and coverage are deliberately distinct: architecture asks 'is the spec mechanically sound?', coverage asks 'is the surface present with latchable handles?'. Don't restate prose across them.",
  );
  for (const d of STATIC_COVERAGE_DIMENSIONS) {
    const scope =
      d.required === "always"
        ? "required"
        : d.required === "if-romantic-or-nsfw"
          ? "required if romantic/NSFW"
          : "required only if NSFW";
    const mapsTo = d.mapsTo ? `maps-to: \`${d.mapsTo}\`` : "standalone";
    lines.push(`## ${d.section} ${d.label}  (id: \`${d.id}\`, ${scope}, ${mapsTo})`);
    lines.push(d.description);
    lines.push(`Pass guidance: ${d.passHints}`);
    lines.push("");
  }
  return lines.join("\n");
}

function coherenceLinksBlock(): string {
  const lines: string[] = [];
  lines.push("# Coherence — waterfall checks (v3 §6 + v2 5.F.2)");
  lines.push(
    "Emit findings only when classification is `explained_divergence` or `unexplained_divergence`, plus internal-contradictions. You may include up to 2 representative `coherent` entries to confirm the spine carries.",
  );
  for (const link of COHERENCE_LINKS) {
    lines.push(`- \`${link.type}\` — ${link.label}: ${link.description}`);
  }
  return lines.join("\n");
}

function adversarialLensesBlock(): string {
  const lines: string[] = [];
  lines.push("# Adversarial — four critical lenses (v3 §7)");
  lines.push(
    "Rotate through these lenses and emit 5–12 deduplicated findings total. Cite verbatim quotes; for absences, leave quote empty.",
  );
  for (const a of ADVERSARIAL_LENSES) {
    lines.push(`- \`${a.lens}\` — ${a.label}: ${a.description}`);
  }
  return lines.join("\n");
}

const STATIC_SCHEMA_BLOCK = `# Output schema (return ONLY this JSON, nothing else)

{
  "cardShape": "open" | "trajectory" | "closed" | "unknown",
  "spine": "one-sentence summary of the load-bearing structure as you read it",
  "scores": {
    "structure": {
      "score": 0..5 | null,
      "notes": "1–3 sentence justification grounded in evidence",
      "evidence": ["verbatim fragment from the card", "another verbatim fragment"],
      "subAxes": [{ "label": "string", "value": "string or number" }],
      "suggestion": "concrete card-level fix (empty string when score >= 4 or null)"
    },
    "states":        { ... same shape ... },
    "voice":         { ... same shape ... },
    "selfGap":       { ... same shape ... },        // null score for Closed cards
    "worldview":     { ... same shape ... },
    "individuation": { ... same shape ... }
  },
  "coverage": [
    {
      "id": "identity-physical" | "backstory-causal" | "relationships" | "capital" | "faults" | "behavior-settings" | "signals" | "mannerisms" | "speech-described" | "speech-examples" | "vulnerability" | "user-relationship" | "sexuality",
      "presence": "rich" | "adequate" | "thin" | "missing" | "na",
      "evidence": ["verbatim card snippets, [] when missing"],
      "notes": "1–2 sentences",
      "latchability": "high" | "medium" | "low"
    }
    // one entry per coverage id; "sexuality" should be "na" on non-NSFW cards
  ],
  "coherence": [
    {
      "type": "backstory-behavior" | "timeline" | "capital-vulnerability" | "build-lifestyle" | "build-capital" | "origin-voice" | "internal-contradiction",
      "classification": "coherent" | "explained_divergence" | "unexplained_divergence",
      "what": "1 sentence describing the link",
      "evidence": [
        { "label": "e.g. 'Backstory'", "quote": "verbatim card passage" },
        { "label": "e.g. 'Present behavior'", "quote": "verbatim card passage" }
      ],
      "options": [
        "Option 1 (add bridge): concrete proposed insertion",
        "Option 2 (revise claim): concrete proposed rewrite"
      ]
    }
    // emit unexplained_divergence and explained_divergence findings; contradictions; <=2 representative coherent
  ],
  "adversarial": [
    {
      "lens": "trope" | "thinness" | "evidence" | "unexplored",
      "critique": "1–2 sentence attack",
      "quote": "verbatim passage or empty string when the critique is about absence",
      "severity": "critical" | "major" | "minor",
      "suggestion": "concrete fix"
    }
    // 5–12 entries total across all four lenses
  ],
  "flags": [
    {
      "label": "specific description of the issue (e.g. 'When-Alone state has no transition cue')",
      "severity": "error" | "warning" | "info",
      "section": "name of the card section the flag is anchored to (optional)"
    }
  ],
  "topSuggestions": ["1–2 highest-leverage refinements"]
}

Hard rules:
- "score" must be a number 0..5 (one decimal allowed) or null. Never a string.
- "evidence" must contain verbatim fragments from the card; do not paraphrase.
- For sub-4 scores, "suggestion" is REQUIRED and must be specific.
- "selfGap.score" must be null when "cardShape" is "closed".
- "coverage" must contain exactly one entry per coverage id (13 total).
- For every "unexplained_divergence" coherence finding, "options" MUST contain at least 2 entries (add bridge / revise claim).
- Return ONLY the JSON object — no preamble, no closing remarks, no markdown fences.`;

export function buildStaticJudgeMessages({
  character,
}: BuildStaticJudgeArgs): OpenRouterMessage[] {
  const characterBlock = `# Character card (the spec under audit)\n\n${character.systemPrompt.trim()}`;
  const userContent = [
    staticDimensionsBlock(),
    coverageDimensionsBlock(),
    coherenceLinksBlock(),
    adversarialLensesBlock(),
    STATIC_SCHEMA_BLOCK,
    characterBlock,
  ].join("\n\n---\n\n");

  return [
    { role: "system", content: STATIC_JUDGE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

// ============================================================================
// JSON parsing — defensive (mirrors the dynamic judge parser conventions)
// ============================================================================

function extractJsonObject(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in static judge response.");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  throw new Error("Unbalanced braces in static judge response.");
}

function clampScore(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, n));
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asSeverity(v: unknown): StaticFlagSeverity {
  const s = asString(v).trim().toLowerCase();
  if (s === "error" || s === "warning" || s === "info") return s;
  // Default unknown to warning — most judge-emitted flags are weakness markers.
  return "warning";
}

interface RawStaticDim {
  score?: unknown;
  notes?: unknown;
  evidence?: unknown;
  subAxes?: unknown;
  suggestion?: unknown;
}

interface RawCoverageEntry {
  id?: unknown;
  presence?: unknown;
  evidence?: unknown;
  notes?: unknown;
  latchability?: unknown;
}

interface RawCoherenceEntry {
  type?: unknown;
  classification?: unknown;
  what?: unknown;
  evidence?: unknown;
  options?: unknown;
}

interface RawAdversarialEntry {
  lens?: unknown;
  critique?: unknown;
  quote?: unknown;
  severity?: unknown;
  suggestion?: unknown;
}

interface RawStaticJudge {
  cardShape?: unknown;
  spine?: unknown;
  scores?: Record<string, RawStaticDim>;
  coverage?: unknown;
  coherence?: unknown;
  adversarial?: unknown;
  flags?: unknown;
  topSuggestions?: unknown;
}

function normalizeStaticDim(raw: RawStaticDim | undefined): StaticDimensionScore {
  if (!raw) return { score: null, notes: "", evidence: [] };
  const evidence = asArray<unknown>(raw.evidence)
    .map((q) => asString(q))
    .filter((q) => q.length > 0);
  const subAxes = asArray<{ label?: unknown; value?: unknown }>(raw.subAxes)
    .map((a) => ({
      label: asString(a?.label),
      // Keep numbers as numbers, otherwise stringify for display.
      value:
        typeof a?.value === "number"
          ? a.value
          : asString(a?.value, ""),
    }))
    .filter((a) => a.label.length > 0);
  return {
    score: clampScore(raw.score),
    notes: asString(raw.notes),
    evidence,
    subAxes: subAxes.length > 0 ? subAxes : undefined,
    suggestion: asString(raw.suggestion),
  };
}

function asPresence(v: unknown): StaticCoveragePresence {
  const s = asString(v).trim().toLowerCase();
  if (s === "rich" || s === "adequate" || s === "thin" || s === "missing" || s === "na") {
    return s;
  }
  // Defaults: empty / unknown → missing so it surfaces in the punchlist.
  return "missing";
}

function asLatchability(v: unknown): StaticLatchability {
  const s = asString(v).trim().toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

function asPunchlistSeverity(v: unknown): PunchlistSeverity {
  const s = asString(v).trim().toLowerCase();
  if (s === "critical" || s === "major" || s === "minor") return s;
  return "major";
}

function asCoherenceType(v: unknown): StaticCoherenceLinkType | null {
  const s = asString(v).trim().toLowerCase();
  const allowed: StaticCoherenceLinkType[] = [
    "backstory-behavior",
    "timeline",
    "capital-vulnerability",
    "build-lifestyle",
    "build-capital",
    "origin-voice",
    "internal-contradiction",
  ];
  return allowed.includes(s as StaticCoherenceLinkType)
    ? (s as StaticCoherenceLinkType)
    : null;
}

function asCoherenceClassification(
  v: unknown,
): StaticCoherenceClassification {
  const s = asString(v).trim().toLowerCase();
  if (
    s === "coherent" ||
    s === "explained_divergence" ||
    s === "unexplained_divergence"
  )
    return s;
  return "unexplained_divergence";
}

function asAdversarialLens(v: unknown): StaticAdversarialLens | null {
  const s = asString(v).trim().toLowerCase();
  if (s === "trope" || s === "thinness" || s === "evidence" || s === "unexplored")
    return s;
  return null;
}

function normalizeCoverage(raw: unknown): StaticCoverageResult[] {
  const seen = new Set<CoverageDimId>();
  const out: StaticCoverageResult[] = [];
  for (const e of asArray<RawCoverageEntry>(raw)) {
    const id = asString(e?.id).trim() as CoverageDimId;
    const def = findCoverageDim(id);
    if (!def || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      presence: asPresence(e?.presence),
      evidence: asArray<unknown>(e?.evidence)
        .map((q) => asString(q))
        .filter((q) => q.length > 0)
        .slice(0, 6),
      notes: asString(e?.notes),
      latchability: asLatchability(e?.latchability),
      mapsTo: def.mapsTo,
    });
  }
  // Backfill any coverage dim the judge skipped — treat as missing/na so the
  // punchlist + UI stay consistent.
  for (const def of STATIC_COVERAGE_DIMENSIONS) {
    if (seen.has(def.id)) continue;
    out.push({
      id: def.id,
      presence: def.required === "if-nsfw" ? "na" : "missing",
      evidence: [],
      notes:
        def.required === "if-nsfw"
          ? "Not evaluated — card is not NSFW-scoped."
          : "Judge did not evaluate this surface.",
      latchability: "low",
      mapsTo: def.mapsTo,
    });
  }
  // Stable ordering: catalogue order.
  return STATIC_COVERAGE_DIMENSIONS.map(
    (def) => out.find((c) => c.id === def.id)!,
  );
}

function normalizeCoherence(raw: unknown): StaticCoherenceFinding[] {
  const out: StaticCoherenceFinding[] = [];
  for (const e of asArray<RawCoherenceEntry>(raw)) {
    const type = asCoherenceType(e?.type);
    if (!type) continue;
    const evidence = asArray<{ label?: unknown; quote?: unknown }>(e?.evidence)
      .map((ev) => ({
        label: asString(ev?.label),
        quote: asString(ev?.quote),
      }))
      .filter((ev) => ev.quote.length > 0);
    const options = asArray<unknown>(e?.options)
      .map((o) => asString(o))
      .filter((o) => o.length > 0);
    out.push({
      type,
      classification: asCoherenceClassification(e?.classification),
      what: asString(e?.what),
      evidence,
      options: options.length > 0 ? options : undefined,
    });
  }
  return out;
}

function normalizeAdversarial(raw: unknown): StaticAdversarialFinding[] {
  const out: StaticAdversarialFinding[] = [];
  for (const e of asArray<RawAdversarialEntry>(raw)) {
    const lens = asAdversarialLens(e?.lens);
    if (!lens) continue;
    const critique = asString(e?.critique);
    if (critique.length === 0) continue;
    out.push({
      lens,
      critique,
      quote: asString(e?.quote),
      severity: asPunchlistSeverity(e?.severity),
      suggestion: asString(e?.suggestion),
    });
  }
  return out;
}

export interface ParsedStaticJudge {
  cardShape: CardShape;
  spine: string;
  scores: Record<StaticDimId, StaticDimensionScore>;
  coverage: StaticCoverageResult[];
  coherence: StaticCoherenceFinding[];
  adversarial: StaticAdversarialFinding[];
  flags: StaticFlag[];
  topSuggestions: string[];
}

export function parseStaticJudgeResponse(raw: string): ParsedStaticJudge {
  const jsonText = extractJsonObject(raw);
  let data: RawStaticJudge;
  try {
    data = JSON.parse(jsonText) as RawStaticJudge;
  } catch (err) {
    throw new Error(
      `Static judge returned invalid JSON: ${(err as Error).message}. Raw start: ${jsonText.slice(0, 120)}…`,
    );
  }

  const cardShapeRaw = asString(data.cardShape).toLowerCase();
  const cardShape: CardShape = (
    ["open", "trajectory", "closed"].includes(cardShapeRaw)
      ? cardShapeRaw
      : "unknown"
  ) as CardShape;

  const scores = {} as Record<StaticDimId, StaticDimensionScore>;
  for (const dim of STATIC_EVAL_DIMENSIONS) {
    const ds = normalizeStaticDim(data.scores?.[dim.id]);
    // Self-gap on Closed cards: force null per spec, even if the judge slipped.
    if (dim.closedNa && cardShape === "closed") {
      ds.score = null;
      if (!ds.notes) {
        ds.notes = "N/A — Closed-shape cards have no stated self-model gap.";
      }
    }
    scores[dim.id] = ds;
  }

  const flags: StaticFlag[] = asArray<{
    label?: unknown;
    severity?: unknown;
    section?: unknown;
  }>(data.flags)
    .map((f) => ({
      label: asString(f?.label),
      severity: asSeverity(f?.severity),
      section: f?.section ? asString(f.section) : undefined,
    }))
    .filter((f) => f.label.length > 0);

  const topSuggestions = asArray<unknown>(data.topSuggestions)
    .map((s) => asString(s))
    .filter((s) => s.length > 0)
    .slice(0, 5);

  return {
    cardShape,
    spine: asString(data.spine),
    scores,
    coverage: normalizeCoverage(data.coverage),
    coherence: normalizeCoherence(data.coherence),
    adversarial: normalizeAdversarial(data.adversarial),
    flags,
    topSuggestions,
  };
}

// ============================================================================
// Punchlist — the unified, severity-ranked findings list (v2 + v3 deliverable)
// ----------------------------------------------------------------------------
// Aggregates every issue surfaced by the judge into a single creator-facing
// list. Each finding gets a stable id derived from
//   (source, dimension, evidence-quote-prefix)
// so re-runs against the same card produce the same id when the underlying
// passage is unchanged. That lets the dashboard report
// resolved / persistent / new diffs across iteration runs (v3 §9.3).
// ============================================================================

/** Deterministic non-cryptographic 32-bit hash, base-36 encoded. */
function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned shift + base36 keeps it short and URL-safe.
  return (h >>> 0).toString(36);
}

function stableFindingId(
  source: PunchlistSource,
  dimension: string,
  evidenceQuote: string,
): string {
  const seed = `${source}::${dimension}::${evidenceQuote.slice(0, 100).toLowerCase().trim()}`;
  return `pl-${source.slice(0, 3)}-${stableHash(seed)}`;
}

function severityForScore(score: number): PunchlistSeverity {
  if (score < 1.5) return "critical";
  if (score < 3) return "major";
  return "minor"; // 3 ≤ score < 4
}

function severityForCoverage(
  presence: StaticCoveragePresence,
  required: CoverageDimDef["required"],
): PunchlistSeverity | null {
  if (presence === "rich" || presence === "adequate" || presence === "na") return null;
  if (required === "if-nsfw") {
    // Only flag when the judge explicitly said missing — and even then it's a major.
    return presence === "missing" ? "major" : "minor";
  }
  if (presence === "missing") return "critical";
  return "major"; // thin
}

function severityForFlag(severity: StaticFlagSeverity): PunchlistSeverity {
  if (severity === "error") return "critical";
  if (severity === "warning") return "major";
  return "minor";
}

function suggestionFromString(
  text: string,
  kind: PunchlistSuggestionKind = "revise",
  target?: string,
): PunchlistSuggestion {
  return {
    kind,
    target,
    proposedChange: text.trim() || "(judge did not propose a concrete change)",
  };
}

/**
 * Assemble the unified punchlist from a parsed judge response. Pure function —
 * no I/O, no streaming. Called once after parse, again on report load if the
 * report was saved before this layer existed.
 */
export function buildPunchlist(parsed: {
  scores: Record<StaticDimId, StaticDimensionScore>;
  coverage: StaticCoverageResult[];
  coherence: StaticCoherenceFinding[];
  adversarial: StaticAdversarialFinding[];
  flags: StaticFlag[];
}): PunchlistFinding[] {
  const findings: PunchlistFinding[] = [];

  // (1) Sub-4 architectural scores.
  for (const dim of STATIC_EVAL_DIMENSIONS) {
    const s = parsed.scores[dim.id];
    if (!s || typeof s.score !== "number") continue;
    if (s.score >= 4) continue;
    const evidenceQuote = s.evidence[0] ?? "";
    findings.push({
      id: stableFindingId("score", dim.id, evidenceQuote || s.notes),
      source: "score",
      severity: severityForScore(s.score),
      dimension: dim.id,
      what: `${dim.label} scores ${s.score.toFixed(1)} — ${s.notes || "below the architectural threshold."}`,
      evidence: s.evidence.slice(0, 2).map((q) => ({ quote: q })),
      why:
        dim.id === "structure" || dim.id === "states"
          ? "Gating dim — the rest of the card stands on this."
          : "Architectural weakness; will surface in chat as drift, gap collapse, or genre flatten.",
      suggestion: suggestionFromString(
        s.suggestion ?? "",
        "revise",
        `${dim.label} section`,
      ),
    });
  }

  // (2) Coverage gaps (missing / thin on required surfaces).
  for (const cov of parsed.coverage) {
    const def = findCoverageDim(cov.id);
    if (!def) continue;
    const sev = severityForCoverage(cov.presence, def.required);
    if (!sev) continue;
    const evidenceQuote = cov.evidence[0] ?? "";
    findings.push({
      id: stableFindingId("coverage", cov.id, evidenceQuote || def.label),
      source: "coverage",
      severity: sev,
      dimension: `coverage:${cov.id}`,
      what: `${def.label} (${def.section}) — ${cov.presence}.`,
      evidence:
        cov.evidence.length > 0
          ? cov.evidence.slice(0, 2).map((q) => ({ quote: q }))
          : [{ quote: "no such passage exists", location: def.label }],
      why: `${cov.notes || def.passHints}${
        cov.latchability === "low"
          ? " Latchability low — even where present, the renderer has no concrete handles."
          : ""
      }`,
      suggestion: suggestionFromString(
        def.passHints,
        cov.presence === "missing" ? "add" : "revise",
        def.label,
      ),
    });
  }

  // (3) Coherence — explained + unexplained divergences and contradictions.
  for (const c of parsed.coherence) {
    if (c.classification === "coherent") continue;
    const evidenceQuote = c.evidence[0]?.quote ?? "";
    const sev: PunchlistSeverity =
      c.classification === "unexplained_divergence" ||
      c.type === "internal-contradiction"
        ? "critical"
        : "major";
    findings.push({
      id: stableFindingId("coherence", c.type, evidenceQuote || c.what),
      source: "coherence",
      severity: sev,
      dimension: `coherence:${c.type}`,
      what: c.what || c.type,
      evidence: c.evidence.slice(0, 2).map((ev) => ({
        quote: ev.quote,
        location: ev.label,
      })),
      why:
        c.classification === "unexplained_divergence"
          ? "Backstory does not produce the present-day claim and no bridging narrative is offered. The model will either ignore the backstory (breaks consistency) or inject responses that contradict the stated personality (breaks faithfulness)."
          : "Card explains the divergence — verify the bridge is concrete enough for the renderer to lean on.",
      suggestion: {
        kind: "add",
        target: c.type,
        proposedChange:
          c.options && c.options.length > 0
            ? c.options.join("\n")
            : "(judge did not propose options)",
      },
    });
  }

  // (4) Adversarial findings — direct map.
  for (const a of parsed.adversarial) {
    findings.push({
      id: stableFindingId(
        "adversarial",
        a.lens,
        a.quote || a.critique.slice(0, 100),
      ),
      source: "adversarial",
      severity: a.severity,
      dimension: `adversarial:${a.lens}`,
      what: a.critique,
      evidence: a.quote
        ? [{ quote: a.quote }]
        : [{ quote: "no such passage exists" }],
      why:
        a.lens === "trope"
          ? "Stock-character shortcuts collapse to genre-template under pressure."
          : a.lens === "thinness"
            ? "Low-latchability claims render as generic LLM defaults."
            : a.lens === "evidence"
              ? "Unsupported claims drift inconsistently when probed."
              : "Unexplored dimensions force the model to invent, breaking continuity.",
      suggestion: suggestionFromString(
        a.suggestion,
        a.quote ? "revise" : "add",
        a.lens,
      ),
    });
  }

  // (5) Flag taxonomy. Lower priority than dim/coverage/coherence — these are
  // rule-taxonomy hits that often duplicate the above; we still surface them
  // so the punchlist is comprehensive, but ranked at warning-level by default.
  for (const f of parsed.flags) {
    findings.push({
      id: stableFindingId("flag", f.label.slice(0, 60), f.section ?? f.label),
      source: "flag",
      severity: severityForFlag(f.severity),
      dimension: f.section ? `flag:${f.section}` : "flag",
      what: f.label,
      evidence: [],
      why: "Rule-taxonomy hit — see the matching architectural / coverage / adversarial finding for the proposed fix.",
      suggestion: suggestionFromString(
        "Address the rule violation in the linked section.",
        "revise",
        f.section,
      ),
    });
  }

  // Severity rank order for the UI.
  const order: Record<PunchlistSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
  };
  findings.sort((a, b) => {
    const ds = order[a.severity] - order[b.severity];
    if (ds !== 0) return ds;
    // Prefer higher-signal sources first within the same severity tier.
    const sourceOrder: Record<PunchlistSource, number> = {
      coherence: 0,
      score: 1,
      coverage: 2,
      adversarial: 3,
      flag: 4,
    };
    return sourceOrder[a.source] - sourceOrder[b.source];
  });

  return findings;
}

/** Severity counts for top-line stat cards. */
export function punchlistSeverityCounts(
  findings: PunchlistFinding[],
): { critical: number; major: number; minor: number; total: number } {
  let critical = 0;
  let major = 0;
  let minor = 0;
  for (const f of findings) {
    if (f.severity === "critical") critical++;
    else if (f.severity === "major") major++;
    else minor++;
  }
  return { critical, major, minor, total: findings.length };
}

// ============================================================================
// Runner
// ============================================================================

export interface RunStaticEvaluationOptions {
  character: CharacterCard;
  judgeModel: string;
  apiKey: string;
  signal?: AbortSignal;
  /** Streaming chunks for the "judging…" UI. */
  onChunk?: (delta: string, full: string) => void;
}

/**
 * Streams the static judge call against the character card, parses the
 * response, and returns a fully-formed (un-persisted) StaticEvaluationReport.
 * Caller is responsible for saving via storage.saveStaticEvaluation().
 */
export async function runStaticEvaluation(
  opts: RunStaticEvaluationOptions,
): Promise<StaticEvaluationReport> {
  const { character, judgeModel, apiKey, signal, onChunk } = opts;

  if (!character.systemPrompt || character.systemPrompt.trim().length === 0) {
    throw new Error(
      "Cannot static-evaluate a character with an empty system prompt.",
    );
  }

  const messages = buildStaticJudgeMessages({ character });

  const raw = await streamCompletion({
    model: judgeModel,
    apiKey,
    messages,
    signal,
    temperature: 0.1,
    onChunk,
  });

  const parsed = parseStaticJudgeResponse(raw);
  const findings = buildPunchlist({
    scores: parsed.scores,
    coverage: parsed.coverage,
    coherence: parsed.coherence,
    adversarial: parsed.adversarial,
    flags: parsed.flags,
  });

  return {
    id: uid(),
    characterId: character.id,
    judgeModel,
    cardShape: parsed.cardShape,
    spine: parsed.spine,
    scores: parsed.scores,
    coverage: parsed.coverage,
    coherence: parsed.coherence,
    adversarial: parsed.adversarial,
    findings,
    flags: parsed.flags,
    topSuggestions: parsed.topSuggestions,
    composite: staticComposite(parsed.scores),
    rawJudgeResponse: raw,
    createdAt: Date.now(),
  };
}

/**
 * Back-compat: some saved reports predate the v2/v3 layers (no coverage /
 * coherence / adversarial / findings). Lazy-derive an empty-but-valid set
 * when those callers ask for them so the UI never has to null-check.
 */
export function ensurePunchlist(
  report: StaticEvaluationReport,
): PunchlistFinding[] {
  if (report.findings && report.findings.length > 0) return report.findings;
  // Old reports still have scores + flags; derive partial punchlist from them.
  return buildPunchlist({
    scores: report.scores,
    coverage: report.coverage ?? [],
    coherence: report.coherence ?? [],
    adversarial: report.adversarial ?? [],
    flags: report.flags,
  });
}

// ============================================================================
// Export bundle (parallels buildEvaluationExport for dynamic reports)
// ============================================================================

export interface StaticEvaluationExport {
  exportVersion: 2;
  exportedAt: string;
  type: "static";
  report: {
    id: string;
    characterId: string;
    createdAt: string;
    judgeModel: string;
    cardShape: CardShape;
    spine: string;
    composite: number | null;
    gating: StaticGatingResult;
    topSuggestions: string[];
    severityCounts: { critical: number; major: number; minor: number; total: number };
  };
  character: {
    id: string;
    name: string;
    description: string;
    firstMessage: string;
    systemPrompt: string;
    tags: string[];
  } | null;
  dimensions: {
    id: StaticDimId;
    number: number;
    label: string;
    description: string;
    score: number | null;
    notes: string;
    evidence: string[];
    subAxes: { label: string; value: string | number }[];
    suggestion: string;
  }[];
  coverage: StaticCoverageResult[];
  coherence: StaticCoherenceFinding[];
  adversarial: StaticAdversarialFinding[];
  findings: PunchlistFinding[];
  flags: StaticFlag[];
  rawJudgeResponse: string;
}

export function buildStaticEvaluationExport(
  report: StaticEvaluationReport,
  character: CharacterCard | undefined,
): StaticEvaluationExport {
  const findings = ensurePunchlist(report);
  const gating = computeStaticGating(
    report.cardShape,
    report.scores,
    report.flags,
    report.coverage ?? [],
  );

  return {
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    type: "static",
    report: {
      id: report.id,
      characterId: report.characterId,
      createdAt: new Date(report.createdAt).toISOString(),
      judgeModel: report.judgeModel,
      cardShape: report.cardShape,
      spine: report.spine,
      composite: report.composite,
      gating,
      topSuggestions: report.topSuggestions,
      severityCounts: punchlistSeverityCounts(findings),
    },
    character: character
      ? {
          id: character.id,
          name: character.name,
          description: character.description,
          firstMessage: character.firstMessage,
          systemPrompt: character.systemPrompt,
          tags: character.tags,
        }
      : null,
    dimensions: STATIC_EVAL_DIMENSIONS.map((dim) => {
      const s = report.scores[dim.id];
      return {
        id: dim.id,
        number: dim.number,
        label: dim.label,
        description: dim.description,
        score: s?.score ?? null,
        notes: s?.notes ?? "",
        evidence: s?.evidence ?? [],
        subAxes: s?.subAxes ?? [],
        suggestion: s?.suggestion ?? "",
      };
    }),
    coverage: report.coverage ?? [],
    coherence: report.coherence ?? [],
    adversarial: report.adversarial ?? [],
    findings,
    flags: report.flags,
    rawJudgeResponse: report.rawJudgeResponse,
  };
}

export function staticEvaluationExportFilename(
  report: StaticEvaluationReport,
  character: CharacterCard | undefined,
): string {
  const stamp = new Date(report.createdAt).toISOString().slice(0, 10);
  const safe = (character?.name || "character").replace(/[^\w-]+/g, "_");
  return `static-eval_${safe}_${stamp}.json`;
}
