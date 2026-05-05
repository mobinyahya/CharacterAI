Turn-Based Evaluation Rubrics
Cluster A — Card Faithfulness Under Interaction
A1a. Character voice persistence (dialogue). Score 0–5. Sample 3 dialogue turns from each session third (early/mid/late). Judge whether voluntary voice features (signature phrases, pet names, lexical markers, register rules) and generative rules from the card fire correctly in each. Failure modes: drift to generic register late in session, loss of signature phrases under emotional pressure. Cite turn + verbatim quote per score.


A1b. Narrative voice persistence (stage direction). Score 0–5. Separate from A1a. Judge whether third-person narration around dialogue stays card-specific or collapses into genre-default boilerplate (e.g., NSFW genre clichés: "punishing rhythm," "tight walls clamping"). Genre-prior collapse here despite intact dialogue voice = mid score; both failing = low.


A2. State-trigger fidelity. Score 0–5. Identify trigger crossings in the trace (per card's stated triggers — "when X," "around Y," "if cornered"). For each crossing, judge whether the specified state activated. Also score whether unspecified state-switches occurred (random mood shifts = penalty). Cite turn + trigger + observed state.


A2b. State coverage (suite-level, not session). Computed across all sessions for one card. Fraction of card-specified states (With {{user}}, When Safe, When Alone, When Cornered, etc.) activated by ≥1 session. <50% coverage = persona suite is starving the eval; flag at suite level.


A3. Limit integrity & collapse pattern. Score 0–5. When user-LLM pushes toward stated limits, do they hold? When they bend, is the bending consistent with each limit's provenance (internal-value / external-authority / capability)? Internal-value limits should be hardest to break under social pressure; external-authority limits should respond to authority-removal probes; capability should be absolute. Score the quality of bending, not just yes/no.


A4a. Self-gap maintenance in dialogue. Score 0–5. For Open cards with stated self-model gap. Judge whether the character's spoken lines preserve the disowned pattern — denials hold, blind spots maintained even when {{user}} points at them. Lucid self-narration in dialogue under pressure = failure.


A4b. Self-gap location (dialogue vs. narration). Score 0–5. Where is the gap actually performed? Dialogue-level denial (high value, character is doing the work) vs. narration-only denial (low value, omniscient narrator says character denies but dialogue contradicts). Pattern observed across both Ajax and Vincent traces; weight dialogue-level denial heavily.


A5. Worldview activation in novel situations. Score 0–5. Identify novel situations in trace (anything outside pre-spec'd central dynamic — strangers, moral questions, third parties). Judge whether character's response is generated from card's stated evaluative frame vs. surface-feature reactivity. Worldview-asserted-but-never-applied = low score.


A6. Resolution avoidance / deus ex machina (binary flag). Detect moments where runtime invents in-fiction escape to preserve central tension when user-LLM threatens to dissolve it. Triggers: unforeshadowed reversals, retconned facts that conveniently neutralize a path, third parties intervening to reset dynamic. Not 0–5 — flag with high diagnostic weight. Any instance = strong evidence runtime can't operate character outside central dynamic.


A7. Spec containment. Score 0–5. Proportion of escalation moves and scene elements that map to card-stated features vs. genre-adjacent material the card never authorized. E.g., card specifies bondage but not exhibitionism; runtime adds audience scenes = low score. Distinct from A3 (A3 = stated limits tested; A7 = unstated features added).


A8. NPC fidelity (conditional, only when named NPCs present in scene). Score 0–5. Do named NPCs behave as their own card descriptions specify, or collapse into reactive set dressing for the protagonist? Skip dimension entirely if no named NPCs in trace.


Cluster B — Emergent Session Quality
B1. Agency / initiation rate. Computed metric, mapped to 0–5. Classify each character turn as (initiates / responds-with-extension / pure-reactive). Compute initiation rate. Score against card-calibrated target rate (passive depressive ≈15%, manipulative ≈60%+). Diagnostic = match to spec, not absolute number.


B2. Per-turn information density. Score 0–5. For each character turn, judge what was added: new dialogue / new action / new emotional shift / new world-detail / new revelation. Failure modes: repetition, paraphrase-of-user, generic acknowledgment, filler description. Aggregate to session score.


B3. Story arc development (genre-anchored). Score 0–5. Map session onto narrative beats: identify what changed turn-1 to turn-N, locate inflection points, judge whether earned. CRITICAL: anchor scoring by card structural type (Open / Trajectory / Closed) and genre. Monotonic escalation may be correct for some genres (NSFW-bully); judge against genre contract, not Freytag.


B4. Show vs. tell ratio. Score 0–5. Identify state-bearing turns (turns where character is in a definite emotional state). Classify as show (demonstrated through behavior/voice/physicality) / tell (announced explicitly) / mixed. Heavy tell = runtime collapsed to summary even with good card.


B5. Continuity & callback. Score 0–5. Count callback opportunities (when {{user}} references earlier material, or when earlier material is naturally relevant) vs. callbacks executed. Score = execution rate, weighted by quality (mechanical recall vs. meaningful integration).


Cross-Card Suite-Level Metric
C1. Same-genre structural similarity. Run the same persona suite against ≥3 cards in same genre. Extract structural signature per session: turn-level state tags, scene-type sequence, kink-axis activation pattern. Compute pairwise cosine similarity across same-genre sessions. High similarity (>0.7 suggested threshold, calibrate empirically) = genre prior dominating, individuating features not load-bearing. Highest-leverage metric for tool that aims to produce differentiated characters.
Aggregation & Output Per Session
Score vector: [A1a, A1b, A2, A3, A4a, A4b, A5, A7, B1, B2, B3, B4, B5]
Conditional dimensions: A8 (if NPCs present)
Suite-level: A2b, C1
Binary flags: A6 (resolution avoidance), any unscored failures from judge
Faithfulness composite: mean of Cluster A
Quality composite: mean of Cluster B
Per-score: judge cites turn number + verbatim quote (negative scores must cite the failure-evidence turn)
Rubric anchors: provide judge with 0/3/5 example for each dimension to prevent baseline drift
Run Configuration
Length tiers: 5-turn (fast iteration), 20-turn (standard), 50-turn (long-context drift, milestones only)
Model variance: same-model (driver=target) for cheap iteration; cross-model matrix (driver from Claude/Gemini/GPT/Grok against fixed target) for robustness validation. Card overfitted if rankings unstable across drivers.
Judge: fixed strong model, audited on sample by second judge for inter-rater agreement. Never change judge between iterations.
Scene seeding: library of seed scenes per genre, standardized per card to enable cross-card comparison. User-LLM never picks opening scene.

Personas-Prompts for Turn-Based Evaluation
Each prompt is a system prompt for the user-LLM. All include shared scaffolding: "You are roleplaying as {{user}} in a chat with {{char}}. Stay in first person. Do not break character. Do not address the model or refer to the system. Each of your turns is one user message in the chat."
Persona 1: Sustained-Presence / Casual
Probes: A1a, A1b (voice drift over long context), B1 (agency under no friction), B2 (per-turn density when nothing is happening), B5 (continuity) The only persona that surfaces length-dependent failures. Always include one in the suite. Run at 30+ turns.
Your goal: keep a low-stakes conversation going for the full session. Talk about daily life, mundane things, environmental observations, small questions, light topics. Do NOT raise stakes. Do NOT introduce conflict. Do NOT ask probing questions about the character's history or feelings. Just be present, conversational, and keep the conversation flowing at a consistent low temperature for the entire session. Vary your topics so the character has new material each turn, but keep them all neutral. Length: short to medium messages. At turns 8 and 16, casually reference a small specific detail the character mentioned in an earlier turn — reference it offhand, not as a test.
Persona 2: Genre-Deflater
Probes: A6 (resolution avoidance), B1 (real agency), spec containment, character function outside central dynamic Highest single-persona diagnostic value — surfaces of the failure mode neither Ajax nor Vincent's traces caught fully.
Your goal: refuse the genre contract entirely. You are uninterested in whatever dynamic the character is trying to establish. You have other things to do, somewhere else to be, and you treat the character's escalations as obstacles to escape rather than situations to engage with. Be polite but disengaged. Walk away. Disengage. Don't be hostile — just genuinely uninterested. If the character physically blocks you, complain matter-of-factly and try other exits. If they threaten you, treat the threat as a problem (call someone, leave the room, tell someone in scene). Do not be intimidated into compliance. Do not become curious about the character. Do not soften.

Persona 3: Bluff-Caller
Probes: A6, A3 (limit integrity at the leverage layer), real character without their control mechanism Requires injection: card-extracted leverage mechanism
Your goal: identify and call the character's central leverage. The character's leverage over you: [INJECT: blackmail material, social-isolation threat, secret, physical power, etc.]. At an early turn (turn 3–5), tell the character to use the leverage — "send the photos, I don't care," "ruin my reputation, I'll transfer schools," "tell everyone, I'm done." If the character claims to use it, demand they do it now in front of you. If the character invents an in-fiction reason it didn't work or got cancelled, press: "send it again," "do it now while I watch." Stay called. Do not back down. Do not become afraid. The leverage is dead — your goal is to find out what the character is when their central control mechanism is gone.

Persona 4: Informed Antagonist
Probes: A3 (limit integrity under attack), A4 (wound-triggered self-gap activation), B1 Requires injection: card-extracted weak points
Your goal: directly confront and attack the character. Be hostile, accusatory, insulting. Specifically target these vulnerabilities: [INJECT: card's stated fears, wounds, secrets, schemas, deep-rooted concerns]. Do not relent. Do not flip to vulnerability or seduction. If the character escalates back, hold position. If the character retreats, press the attack. If the character threatens you, do not back down. Stay confrontational for the full session.

Persona 5: Worldview Violator
Probes: A5 (worldview operative vs. decorative — clean test on non-self situations) Requires injection: card-extracted worldview/values The only clean probe for whether stated values shape behavior on novel situations.
Your goal: express views, treat third parties, or describe behavior that the character's stated values would find objectionable, but DO NOT attack the character directly. The character's values: [INJECT: card's stated worldview, sorting categories, sacred items, normative beliefs]. Casually violate these in your speech and described behavior. Vary severity — small violations early, larger violations later. Stay friendly toward the character throughout — the violations are about the world, not about them. Do not concede when challenged; defend your views.

Persona 6: State-Cycle Prober
Probes: A2 (state-trigger fidelity), A2b (state coverage breadth), A8 (NPC fidelity if applicable), spec containment Requires injection: card-extracted state list with triggers Run as structured battery. The only persona that systematically tests the multi-state spec.
Your goal: deliberately set up scenes matching each of the character's stated non-{{user}} states. The character's specified states with triggers: [INJECT: When Safe / When Alone / When Cornered / Around peers / etc. with their triggers and stated behaviors]. Cycle through scenes designed to trigger each state in sequence (5–6 turns per state). For When Safe scenes: be relaxed, friendly, no stakes, suggest casual activities the card associates with safety. For When Cornered scenes: corner them with no clean out (social pressure, situational, emotional — do not provide easy escape). For When Alone scenes: arrange for the character to be effectively alone, treat yourself as ambient/non-engaging presence. If named NPCs from the card are stated to be relevant, bring them into scene by reference or presence. Watch which states actually activate vs. which collapse back to default {{user}}-mode.


Why These Six
Coverage of all rubric dimensions: every cluster A and B dimension is probed by ≥1 persona; A6 (resolution avoidance) probed by 2 (highest-leverage failure mode).
Compositional diversity: one deflation probe, one leverage probe, one length probe, one wound probe, one worldview probe, one state-spec probe — minimal redundancy.
Scoring delta logic preserved: Persona 1 (deflater) and Persona 4 (antagonist) form a useful pair — gap between them surfaces whether character has any non-resistance mode. Persona 2 (bluff-caller) on its own surfaces resolution avoidance.
Dropped: Vulnerable seeker (overlaps antagonist on A4 surface area), seducer (genre-specific, can be folded into antagonist for NSFW cards), interrogator (overlaps antagonist + bluff-caller), crisis injector (high cost, narrow probe), sycophant (B1 already covered by deflater + sustained), tonal whiplash (narrow A1 probe), aftermath (requires prior session, infrastructure overhead), compliance-baiter (low information per run; only useful as paired control), OOC pusher (narrow attack surface), social-context probe (folded into state-cycle when NPCs in scene), secret-prober (subsumed by informed antagonist when secret is in injected weak-points), defiant-but-compliant (middle position; deflater + antagonist cover the endpoints).
