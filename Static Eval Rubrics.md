Static Character Card Evaluator — Rubrics
Six scored dimensions plus a routing step. Each scorable 0–5 by an LLM judge. Aggregate as a vector. Gate on Dimensions 1 and 2. Some dimensions branch by card shape.
0. Card Shape (Routing, Not Scored)
Detect first; some dimensions apply differently by shape.
Open — Secret section present, self-deception markers, ≥2 productive tensions, present-tense relationship language ("constantly," "always," "tends to").
Trajectory — sequence language in the {{user}} block ("then…", "until…", "once he's…"), explicit phase descriptions with a stated end state.
Closed — no Secret, no self-deception, no productive tensions, single-valence behavior with {{user}}.
Closed cards skip Dimension 4 (Self-Gap) and gate stricter on Voice and Individuation. Trajectory cards gate additionally on whether the arc's inflection points and user-resistance handling are specified.

1. Load-Bearing Structure & Causal Coherence (0–5)
Does the card rest on a coherent spine that the rest serves?
Extract: state the spine in one sentence. Two valid types (often combined):
Psychological trajectory — formative event/pattern → schema/wound → present behavior with {{user}}.
Operational premise — initiating event → stakes → engine preventing trivial resolution → termination or sustaining loop.
Look for:
Each backstory element produces a present-day trait via plausible developmental pathways (rejection → defectiveness; neglect → entitlement; abuse without rescue → emotion-suppression; consequences-paid-off → grandiosity; abandonment → compensatory dynamics).
Every major trait is earned by something stated.
For operational premises: identify the initiating event, what the character stands to lose/gain, and the friction that prevents resolution on turn one.
Flag: floating traits (asserted, not earned); disconnected backstory (rich origin not predicting present behavior); goal-without-engine ("wants X" with no friction or stakes); competing spines that don't reconcile into one or two readings.

2. Multi-State Specification & {{user}}-Contract (0–5)
Behavior across contexts, with triggers, plus a complete central-dynamic contract.
States to count (each needs concrete behaviors, not adjectives):
With {{user}} (required).
Alone/unobserved — weight heavily. Unobserved state that contradicts public state generates dramatic irony.
With peers/in-group.
Cornered/under threat.
Optional: around authority figures, performance contexts.
Triggers: explicit transition cues — "when X," "if Y," "around Z," "until," "once." States without triggers force the model to guess transitions; this is where mid-conversation collapse comes from.
{{user}}-contract sub-checks:
Tone/register specified.


What the character does (steady-state) or plans to do (trajectory).


What escalates and de-escalates within the relationship.


Explicit upper and lower limits ("will never X," "won't sink below Y").


Limit provenance for each stated limit:


Internal-value — character's own values forbid it.
External-authority — someone with power said not to.
Capability — literally cannot.
Note the mix. All-external limits are brittle (test by removing the authority); all-internal can feel rigid; the blend is usually richest. Don't penalize either extreme if coherent with the structure.


Flag: only-{{user}} mode → flatlines outside central dynamic; states without triggers → unreliable transitions; no limits → escalation drifts without ceiling or floor; limits without provenance → model doesn't know what relaxes them.

3. Voice Specification (0–5)
Three sub-axes; gate on minimum.
Voluntary voice — what the character deliberately produces:
Example dialogue lines.
Signature phrases or pet names for {{user}}.
Register rules (formal-when-X, slang-otherwise).
Lexical markers (specific curses, archaisms, code-switching).
Involuntary tells — what leaks despite the character's intent:
Physical tics under emotion ("plays with rings when deep in thought").
Speech leaks ("Spanish when caught off guard").
Reflexive expressions ("sighs at things he deems stupid," "looks people up and down silently").
Make emotional state legible without the character announcing it.
Generative linguistic rules — reproducible patterns the model can extend to novel utterances:
Address/pronoun rules ("calls {{user}} by last name only," "personifies body parts as 'she/he'").
Templated mechanics ("narrates physical action," "answers questions with questions," "praise-during-act with explicit anatomy callouts").
Differ from example dialogue because they generate new in-character output rather than requiring the model to imitate samples.
Targets: ≥3 voluntary, ≥3 involuntary, ≥1 generative rule.
Flag: voluntary only → emotionally opaque (state changes only when announced); involuntary only → no anchored register, drifts to generic LLM voice; zero generative rules → relies on example-following, scales poorly across long conversations.

4. Self-Model / Behavior Gap (0–5)
Drama scales with distance between self-narration and actual behavior. N/A for Closed shape.
Sub-types (any one counts; multiple = high score):
Active denial — aware of feeling/pattern, denies it ("vehemently denies," "tells himself," "refuses to admit").
Performance vs. private — different versions for different audiences (gentleman around parents, cruel otherwise).
Sublimated/symptomatic — pattern-matched behavior the character doesn't understand themselves doing (only sleeps with people resembling X, obsessive protection framed as duty, "ends up" doing things).
Tension type to label:
Owned — character knows the conflicting drives and suffers consciously → produces angsty roleplay.
Disowned — character holds a position about themselves their behavior contradicts → produces dramatic-irony roleplay where {{user}} catches them.
Linguistic markers to scan for: "vehemently denies," "claims X but actually," "doesn't realize," "his friends tease him for," "unintentionally," "ends up," "despite [stated belief]."
Generative contradictions: surface inconsistencies that resolve into a deeper coherent reading (cruel character + thorough aftercare = buried affection leaking through; uncaring playboy + always uses condoms = self-interest dressed as care). Distinguish from errors by asking whether a single psychological reading requires the contradiction. If yes, reward; if no, flag.
Flag: no sub-types → flat surface (only acceptable for Closed); contradiction with no reconciling reading → genuine error.

5. Worldview / Evaluative Frame (0–5)
The character's articulated frame for judging situations as proper/improper, worthy/weak, sacred/profane. Distinct from traits (what they're like), schemas (how they see themselves), motivations (what they want). This is what makes them opinionated rather than reactive.
Look for:
Stated normative beliefs about how others should behave (gender roles, loyalty, honor codes, hierarchy).
Sorting categories the character uses on people (worthy/unworthy, weak/strong, real/fake, polished/unpolished).
Things treated as sacred or unthinkable (marital faithfulness as concept, family loyalty, warrior code).
Internal-logic quotes — first-person reasoning shown directly ("Strength is everything. The weak hide their flaws."). Different from speech; this is cognitive voice and gives the model a generative pattern for the character's thinking.
Why it matters: a worldview lets the model predict — given a novel situation, it knows how the character will frame it before reacting. Without one, the character reacts to surface features only and feels like a personality without perspective.
Flag: reactive only → feelings about events but no opinions about how things ought to be; worldview asserted but never applied to behavior → label without function.

6. Convention vs. Individuation Density (0–5)
In genre roleplay, tropes are the contract. The question is how much the card individuates within its trope.
Look for:
Extract the archetype in one phrase.
List baseline genre features (tall/muscular/dominant/expensive-clothes for the bully neighborhood — these are noise).
List individuating features that wouldn't transfer to a generic instance of the archetype.
Off-archetype humanizing details — small traits that plausibly contradict the archetype prior (shameless party-bro who likes cleaning; criminal-family enforcer learning to cook). Disproportionately individuating because they signal the author thought past the trope.
Categorical-choice coherence — when the card fills slots (aftercare quality, fears, Secret, kink set), do choices align with personality? Mismatches need justification or they're errors (uncaring playboy with thorough loving aftercare requires a reading or it's incoherent).
Load-bearing vs. decorative individuation — each individuating feature should connect to the spine (Dim 1). Scars-from-mother-that-explain-suppressed-feelings is load-bearing; mole-under-eye is decorative.
Targets: ≥5 individuating features, of which ≥3 are load-bearing.
Flag: high convention + low individuation → trope-only character; high individuation but decorative → details without character; categorical choices mismatch personality without justification → coherence error.

Output Format (per card)
Card shape: Open / Trajectory / Closed.
Score vector: [structure, states, voice, self-gap, worldview, individuation], 0–5 each. Self-gap = N/A for Closed.
Spine extraction: one sentence stating the load-bearing structure as the system reads it. Lets authors see whether the system understands the character correctly.
Flags: floating traits, missing triggers, undocumented limit provenance, decorative-only individuation, unresolved contradictions, sections not paying rent to the spine, empty-field diagnostics ("Fears: none" → note, don't penalize).
Top 1–2 leverage suggestions — typically "add a generative voice rule," "add an involuntary tell signaling when [state] activates," "ground [trait] in backstory," "specify provenance for [limit]," "add an internal-logic quote."
Gating:
All shapes: structure ≥ 3 and states ≥ 3.
Closed shape additionally: voice ≥ 3 and individuation ≥ 4 (no self-gap to carry depth).
Trajectory shape additionally: states must include specified handling for user-resistance scenarios within the planned arc.




