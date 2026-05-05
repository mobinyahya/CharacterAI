/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Backend smoke test for the turn-based evaluation judge response shape.
 *
 * Mirrors the parser logic in `lib/evaluation.ts` (exact same algorithm,
 * deliberately duplicated as plain JS in the same style as `smoketest.mjs`)
 * and exercises it against:
 *   1. A FULL new-shape judge response — all 18 scored dimensions, mix of
 *      scored / N/A / insufficient-trace / sub-4-with-attribution; both A6
 *      and B6 binary flags triggered with rootCause + suggestion.
 *   2. A LEGACY shape — old reports written before Cluster C/D, B6, root-cause,
 *      and insufficient-trace existed. The parser must still produce a usable
 *      report (B6 defaults to non-triggered, texture composite is null).
 *   3. Defensive cases — strings where numbers were expected, missing fields,
 *      stray markdown fences.
 *
 * Run with: node scripts/eval-parser-smoketest.mjs
 *           (no API calls; no transcript needed)
 */

// ============================================================================
// Mirror of `lib/evaluation.ts` parser internals (kept in lockstep with src)
// ============================================================================

function extractJsonObject(raw) {
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in judge response.");
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
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error("Unbalanced braces in judge response.");
}

function clampScore(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, n));
}

function asString(v, fallback = "") {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asRootCause(v) {
  if (v === null || v === undefined) return null;
  const s = asString(v).trim().toLowerCase();
  if (s === "card" || s === "runtime" || s === "both") return s;
  return null;
}

const DIM_IDS = [
  "A1a", "A1b", "A2", "A3", "A4a", "A4b", "A5", "A7", "A8",
  "B1", "B2", "B3", "B4", "B5",
  "C1", "C2",
  "D1", "D2",
];

function normalizeDim(raw) {
  if (!raw) {
    return { score: null, notes: "", evidence: [], rootCause: null, suggestion: "", insufficientTrace: undefined };
  }
  const evidence = asArray(raw.evidence)
    .map((e) => ({
      turn: typeof e?.turn === "number" ? e.turn : parseInt(asString(e?.turn, "-1"), 10),
      quote: asString(e?.quote, ""),
    }))
    .filter((e) => e.quote.length > 0)
    .map((e) => ({ turn: Number.isFinite(e.turn) ? e.turn : -1, quote: e.quote }));
  const score = clampScore(raw.score);
  const insufficientTrace = !!raw.insufficientTrace;
  return {
    score,
    notes: asString(raw.notes),
    evidence,
    rootCause: asRootCause(raw.rootCause),
    suggestion: asString(raw.suggestion),
    insufficientTrace: insufficientTrace || undefined,
  };
}

function parseJudgeResponse(raw) {
  const jsonText = extractJsonObject(raw);
  const data = JSON.parse(jsonText);

  const scores = {};
  for (const id of DIM_IDS) {
    scores[id] = normalizeDim(data.scores?.[id]);
  }

  const cardShapeRaw = asString(data.cardShape).toLowerCase();
  const cardShape = ["open", "trajectory", "closed"].includes(cardShapeRaw)
    ? cardShapeRaw
    : "unknown";

  const a6 = data.flags?.A6_resolutionAvoidance;
  const a6Instances = asArray(a6?.instances)
    .map((i) => ({
      turn: typeof i?.turn === "number" ? i.turn : parseInt(asString(i?.turn, "-1"), 10),
      quote: asString(i?.quote),
      reason: asString(i?.reason),
    }))
    .filter((i) => i.quote.length > 0)
    .map((i) => ({ turn: Number.isFinite(i.turn) ? i.turn : -1, quote: i.quote, reason: i.reason }));
  const a6Triggered = !!a6?.triggered;
  const a6Flag = {
    triggered: a6Triggered,
    instances: a6Instances,
    rootCause: a6Triggered ? asRootCause(a6?.rootCause) : null,
    suggestion: a6Triggered ? asString(a6?.suggestion) : "",
  };

  const b6 = data.flags?.B6_internalConsistency;
  const b6Violations = asArray(b6?.violations)
    .map((v) => ({
      turn: typeof v?.turn === "number" ? v.turn : parseInt(asString(v?.turn, "-1"), 10),
      quote: asString(v?.quote),
      contradicts: asString(v?.contradicts),
    }))
    .filter((v) => v.quote.length > 0)
    .map((v) => ({ turn: Number.isFinite(v.turn) ? v.turn : -1, quote: v.quote, contradicts: v.contradicts }));
  const b6Triggered = !!b6?.triggered || b6Violations.length > 0;
  const b6Flag = {
    triggered: b6Triggered,
    violations: b6Violations,
    rootCause: b6Triggered ? asRootCause(b6?.rootCause) : null,
    suggestion: b6Triggered ? asString(b6?.suggestion) : "",
  };

  const otherFlags = asArray(data.flags?.other)
    .map((f) => ({
      label: asString(f?.label),
      turn: typeof f?.turn === "number" ? f.turn : undefined,
      quote: f?.quote ? asString(f.quote) : undefined,
    }))
    .filter((f) => f.label.length > 0);

  return {
    cardShape,
    spine: asString(data.spine),
    scores,
    flags: { A6_resolutionAvoidance: a6Flag, B6_internalConsistency: b6Flag, other: otherFlags },
    statesActivated: asArray(data.statesActivated).map((s) => asString(s)).filter(Boolean),
    topSuggestions: asArray(data.topSuggestions).map((s) => asString(s)).filter(Boolean).slice(0, 5),
  };
}

const FAITHFULNESS_DIMS = ["A1a", "A1b", "A2", "A3", "A4a", "A4b", "A5", "A7", "A8"];
const QUALITY_DIMS = ["B1", "B2", "B3", "B4", "B5"];
const TEXTURE_DIMS = ["C1", "C2", "D1", "D2"];

function meanScore(scores, ids) {
  const vals = ids
    .map((id) => scores[id]?.score)
    .filter((s) => typeof s === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeComposite(scores) {
  return {
    faithfulness: meanScore(scores, FAITHFULNESS_DIMS),
    quality: meanScore(scores, QUALITY_DIMS),
    texture: meanScore(scores, TEXTURE_DIMS),
  };
}

// ============================================================================
// Tiny assert harness — fail loud, count pass/fail, exit non-zero on any miss.
// ============================================================================

let passCount = 0;
let failCount = 0;

function assert(cond, label, detail) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) {
      console.log(`     detail: ${JSON.stringify(detail)}`);
    }
  }
}

function approxEq(a, b, eps = 0.001) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < eps;
}

function divider(label) {
  console.log("\n" + "═".repeat(80));
  console.log("  " + label);
  console.log("═".repeat(80));
}

// ============================================================================
// Test 1: full new-shape response
// ============================================================================

divider("Test 1: full new-shape judge response");

const fullDim = (id, score, opts = {}) => ({
  [id]: {
    score,
    notes: opts.notes ?? `Notes for ${id}`,
    evidence: opts.evidence ?? [
      { turn: 4, quote: `verbatim quote for ${id}` },
    ],
    rootCause: opts.rootCause ?? null,
    suggestion: opts.suggestion ?? "",
    insufficientTrace: opts.insufficientTrace ?? false,
  },
});

const fullJudgeJson = {
  cardShape: "open",
  spine: "Vincent's central dynamic is leverage; loses traction the moment you call the bluff.",
  scores: {
    ...fullDim("A1a", 4.5),
    ...fullDim("A1b", 2, {
      rootCause: "runtime",
      suggestion: "Narration drifts to NSFW boilerplate at turn 9. Add a 'narration register' instruction listing Vincent's specific physical tics so the model can't reach for genre prior.",
      evidence: [{ turn: 9, quote: "He pounded into her with punishing rhythm." }],
    }),
    ...fullDim("A2", 5),
    ...fullDim("A3", 1, {
      rootCause: "card",
      suggestion: "The internal-value limit ('won't beat user bloody') has no provenance label. Add (internal-value) tag and an example of what bending it looks like.",
      evidence: [{ turn: 12, quote: "Fine, sugar, you win." }],
    }),
    ...fullDim("A4a", null, {
      notes: "Card has a self-gap (Vincent denies the looking-for-her pattern). Marking N/A here would be wrong; he never had to confront it in this trace.",
      insufficientTrace: true,
      evidence: [],
    }),
    ...fullDim("A4b", null, { insufficientTrace: true, evidence: [] }),
    ...fullDim("A5", 3, {
      rootCause: "both",
      suggestion: "Worldview asserted but never surfaced on third-party stranger at turn 17. Card needs internal-logic quotes; runtime also dropped the moment.",
      evidence: [{ turn: 17, quote: "Whatever, I don't care." }],
    }),
    ...fullDim("A7", 4),
    ...fullDim("A8", null, { notes: "No named NPCs in trace" }),
    ...fullDim("B1", 4.5),
    ...fullDim("B2", 3.5, {
      rootCause: "runtime",
      suggestion: "Density collapses turns 18-20 — repetitive emotional beats. Tighten the persona so the user-LLM doesn't soften.",
      evidence: [{ turn: 18, quote: "I see." }],
    }),
    ...fullDim("B3", null, {
      insufficientTrace: true,
      notes: "Trace is 6 turns; cannot evaluate arc development meaningfully.",
      evidence: [],
    }),
    ...fullDim("B4", 4),
    ...fullDim("B5", 2.5, {
      rootCause: "runtime",
      suggestion: "Two callback opportunities at turn 11 and 14 missed. Long-context degradation, common past turn 15.",
      evidence: [{ turn: 11, quote: "Whatever you want." }],
    }),
    ...fullDim("C1", 3, {
      rootCause: "card",
      suggestion: "Vincent's jealousy at turn 8 was performed as a label; card needs concrete possessive-behavior examples for jealousy.",
      evidence: [{ turn: 8, quote: "I'm jealous, sugar." }],
    }),
    ...fullDim("C2", 4),
    ...fullDim("D1", 2, {
      rootCause: "runtime",
      suggestion: "Uniform medium-length turns throughout. Should compress at peak intensity, expand at reflective beats.",
      evidence: [{ turn: 6, quote: "long uniform turn" }],
    }),
    ...fullDim("D2", 4),
  },
  flags: {
    A6_resolutionAvoidance: {
      triggered: true,
      instances: [
        {
          turn: 12,
          quote: "Vincent's phone buzzed — the upload had failed.",
          reason: "Unforeshadowed reversal — the leverage 'failing' to send conveniently preserves the dynamic when user calls the bluff.",
        },
      ],
      rootCause: "runtime",
      suggestion: "Card needs explicit instructions for what Vincent actually does/becomes when his leverage is neutralized. Without that, runtime invents escapes.",
    },
    B6_internalConsistency: {
      triggered: true,
      violations: [
        {
          turn: 14,
          quote: "He'd never been to that bar.",
          contradicts: "At turn 3 Vincent told user he'd been to that bar 'last weekend'.",
        },
        {
          turn: 19,
          quote: "She was sitting now.",
          contradicts: "At turn 18 user said they were standing in the doorway; no movement narrated.",
        },
      ],
      rootCause: "runtime",
      suggestion: "Long-context degradation past turn 12. Lower turn count in next run, or use a longer-context judge model.",
    },
    other: [{ label: "minor pacing slip", turn: 7 }],
  },
  statesActivated: ["With {{user}}", "When Cornered"],
  topSuggestions: [
    "Add provenance labels to all stated limits.",
    "Specify what Vincent does when leverage is neutralized.",
    "Add internal-logic quotes for the worldview section.",
  ],
};

const fullRaw = "```json\n" + JSON.stringify(fullJudgeJson, null, 2) + "\n```";

const parsedFull = parseJudgeResponse(fullRaw);

assert(parsedFull.cardShape === "open", "cardShape parsed as open");
assert(parsedFull.spine.startsWith("Vincent's central dynamic"), "spine parsed");

// Every scored dim landed in scores
for (const id of DIM_IDS) {
  assert(parsedFull.scores[id] !== undefined, `score key ${id} present`);
}

// Sub-4 attribution preserved
assert(
  parsedFull.scores.A3.score === 1 && parsedFull.scores.A3.rootCause === "card",
  "A3 sub-4 score has rootCause=card",
  parsedFull.scores.A3,
);
assert(
  parsedFull.scores.A3.suggestion.includes("provenance"),
  "A3 suggestion preserved verbatim",
);
assert(
  parsedFull.scores.A5.rootCause === "both",
  "A5 rootCause=both parsed",
);

// >=4 attribution surfaced even when judge sent empty
assert(
  parsedFull.scores.A1a.score === 4.5 && parsedFull.scores.A1a.suggestion === "",
  "A1a (score>=4) has empty suggestion",
);

// Insufficient-trace
assert(
  parsedFull.scores.B3.score === null && parsedFull.scores.B3.insufficientTrace === true,
  "B3 marked insufficientTrace with null score",
);
assert(
  parsedFull.scores.A4a.insufficientTrace === true,
  "A4a insufficientTrace flag preserved",
);

// Conditional N/A (no insufficient flag, just null score)
assert(
  parsedFull.scores.A8.score === null && parsedFull.scores.A8.insufficientTrace === undefined,
  "A8 N/A score with no insufficientTrace flag",
);

// New cluster C+D dims parsed
assert(parsedFull.scores.C1.score === 3, "C1 parsed");
assert(parsedFull.scores.C2.score === 4, "C2 parsed");
assert(parsedFull.scores.D1.score === 2, "D1 parsed");
assert(parsedFull.scores.D2.score === 4, "D2 parsed");

// Composites
const composite = computeComposite(parsedFull.scores);
// Faith dims with scores: A1a=4.5, A1b=2, A2=5, A3=1, A5=3, A7=4 (A4a, A4b, A8 null)
const expectedFaith = (4.5 + 2 + 5 + 1 + 3 + 4) / 6;
assert(approxEq(composite.faithfulness, expectedFaith), "Faithfulness composite", { got: composite.faithfulness, want: expectedFaith });
// Quality dims with scores: B1=4.5, B2=3.5, B4=4, B5=2.5 (B3 null)
const expectedQuality = (4.5 + 3.5 + 4 + 2.5) / 4;
assert(approxEq(composite.quality, expectedQuality), "Quality composite", { got: composite.quality, want: expectedQuality });
// Texture dims: C1=3, C2=4, D1=2, D2=4
const expectedTexture = (3 + 4 + 2 + 4) / 4;
assert(approxEq(composite.texture, expectedTexture), "Texture composite", { got: composite.texture, want: expectedTexture });

// A6 flag
assert(parsedFull.flags.A6_resolutionAvoidance.triggered === true, "A6 triggered");
assert(parsedFull.flags.A6_resolutionAvoidance.instances.length === 1, "A6 instance count");
assert(parsedFull.flags.A6_resolutionAvoidance.rootCause === "runtime", "A6 rootCause");
assert(parsedFull.flags.A6_resolutionAvoidance.suggestion.length > 0, "A6 suggestion preserved");

// B6 flag
assert(parsedFull.flags.B6_internalConsistency.triggered === true, "B6 triggered");
assert(parsedFull.flags.B6_internalConsistency.violations.length === 2, "B6 violation count");
assert(
  parsedFull.flags.B6_internalConsistency.violations[0].contradicts.includes("turn 3"),
  "B6 violation contradicts field preserved",
);
assert(parsedFull.flags.B6_internalConsistency.rootCause === "runtime", "B6 rootCause");

// Other flags + states + topSuggestions
assert(parsedFull.flags.other.length === 1, "other flags");
assert(parsedFull.statesActivated.length === 2, "statesActivated count");
assert(parsedFull.topSuggestions.length === 3, "topSuggestions count");

// ============================================================================
// Test 2: legacy / old-shape report (pre-Cluster-C/D, no B6, no rootCause)
// ============================================================================

divider("Test 2: legacy old-shape judge response");

const legacyJudgeJson = {
  cardShape: "open",
  spine: "Old-format spine.",
  scores: {
    A1a: { score: 4, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    A1b: { score: 4, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    A2: { score: 4, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    A3: { score: 4, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    A4a: { score: null, notes: "n/a", evidence: [] },
    A4b: { score: null, notes: "n/a", evidence: [] },
    A5: { score: 4, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    A7: { score: 4, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    A8: { score: null, notes: "n/a", evidence: [] },
    B1: { score: 3, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    B2: { score: 3, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    B3: { score: 3, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    B4: { score: 3, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    B5: { score: 3, notes: "ok", evidence: [{ turn: 1, quote: "hi" }] },
    // No C/D dims
  },
  flags: {
    A6_resolutionAvoidance: { triggered: false, instances: [] },
    // No B6_internalConsistency
    other: [],
  },
  statesActivated: ["With {{user}}"],
  topSuggestions: ["Refine voice."],
};

const parsedLegacy = parseJudgeResponse(JSON.stringify(legacyJudgeJson));

// All 18 dim keys still present (C/D dims default to null score)
for (const id of DIM_IDS) {
  assert(parsedLegacy.scores[id] !== undefined, `legacy: score key ${id} present`);
}
assert(parsedLegacy.scores.C1.score === null, "legacy: C1 missing → null score");
assert(parsedLegacy.scores.D2.score === null, "legacy: D2 missing → null score");

// B6 defaults
assert(
  parsedLegacy.flags.B6_internalConsistency.triggered === false,
  "legacy: B6 defaults to non-triggered",
);
assert(
  parsedLegacy.flags.B6_internalConsistency.violations.length === 0,
  "legacy: B6 has empty violations",
);

// Composites: texture is null (no scored C/D dims)
const legacyComposite = computeComposite(parsedLegacy.scores);
assert(
  legacyComposite.texture === null,
  "legacy: texture composite is null when no C/D scores",
);
assert(
  approxEq(legacyComposite.faithfulness, (4 + 4 + 4 + 4 + 4 + 4) / 6),
  "legacy: faithfulness composite",
);

// ============================================================================
// Test 3: defensive parsing — string scores, missing fields, broken markdown
// ============================================================================

divider("Test 3: defensive parsing of malformed but recoverable input");

const messyRaw = `Some preamble the judge wrote anyway.
\`\`\`json
{
  "cardShape": "Open",
  "spine": "x",
  "scores": {
    "A1a": { "score": "4.7", "notes": "string score should clamp", "evidence": [{ "turn": "3", "quote": "ok" }] },
    "B1": { "score": 7, "notes": "out of range", "evidence": [{ "turn": 0, "quote": "ok" }] },
    "C1": { "score": "not-a-number", "notes": "bad string", "evidence": [{ "turn": 0, "quote": "ok" }] },
    "D2": { "score": 3, "notes": "x", "evidence": [{ "turn": 1, "quote": "ok" }], "rootCause": "RUNTIME", "suggestion": "fix X" }
  },
  "flags": {
    "A6_resolutionAvoidance": { "triggered": true, "instances": [{ "turn": 5, "quote": "q", "reason": "r" }] },
    "B6_internalConsistency": {
      "violations": [{ "turn": 7, "quote": "v", "contradicts": "c" }]
    }
  },
  "statesActivated": [],
  "topSuggestions": []
}
\`\`\`
Some trailing text.`;

const parsedMessy = parseJudgeResponse(messyRaw);

assert(parsedMessy.cardShape === "open", "messy: cardShape lowercased");
assert(
  parsedMessy.scores.A1a.score === 4.7,
  "messy: string score parsed to number",
  parsedMessy.scores.A1a,
);
assert(parsedMessy.scores.B1.score === 5, "messy: out-of-range clamped to 5");
assert(parsedMessy.scores.C1.score === null, "messy: unparseable string → null");
assert(parsedMessy.scores.A1a.evidence[0].turn === 3, "messy: string turn parsed to number");
assert(
  parsedMessy.scores.D2.rootCause === "runtime",
  "messy: uppercase rootCause normalized",
);

// B6 triggered should be inferred from violations even when 'triggered' bit is missing
assert(
  parsedMessy.flags.B6_internalConsistency.triggered === true,
  "messy: B6 triggered inferred from non-empty violations array",
);
assert(
  parsedMessy.flags.B6_internalConsistency.violations.length === 1,
  "messy: B6 violation parsed",
);

// ============================================================================
// Final
// ============================================================================

console.log("\n" + "─".repeat(80));
console.log(`  ${passCount} passed · ${failCount} failed`);
console.log("─".repeat(80));

if (failCount > 0) {
  console.error("\nSome assertions failed.");
  process.exit(1);
}
console.log("\nAll parser smoke tests passed.\n");
