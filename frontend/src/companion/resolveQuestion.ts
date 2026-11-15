// Deterministic question-to-topic matching (§5.6). No model, no network, no string-distance loops.
import { TOPICS } from "./topics";
import type { GuideIntent } from "./types";

export const MAX_QUESTION = 250;

export type Resolution =
  | { kind: "topic"; intent: GuideIntent; score: number }
  | { kind: "ambiguous"; options: GuideIntent[] }
  | { kind: "unknown"; nearby: GuideIntent[] };

const STOP = new Set(["the", "a", "an", "is", "are", "to", "of", "in", "on", "for", "and", "or", "i", "me", "my", "you", "your", "it", "this", "that", "do", "does", "can", "how", "what", "where", "show", "see", "please", "with", "be", "there", "about", "tell"]);

export function normalize(text: string): string {
  return text.slice(0, MAX_QUESTION).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9₂\s-]/g, " ").replace(/₂/g, "2").replace(/\s+/g, " ").trim();
}

const tokens = (s: string) => s.split(" ").filter((w) => w && !STOP.has(w));

/** Light stemming so "stops"/"stop", "planning"/"plan" meet. */
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

interface Indexed { id: GuideIntent; aliases: string[]; weights: Map<string, number> }
const INDEX: Indexed[] = TOPICS.map((t) => {
  const weights = new Map<string, number>();
  for (const k of t.keywords) {
    const [w, n] = k.split(":");
    weights.set(stem(normalize(w)), Number(n) || 1);
  }
  for (const a of t.aliases) for (const w of tokens(normalize(a))) if (!weights.has(stem(w))) weights.set(stem(w), 0.5);
  return { id: t.id, aliases: t.aliases.map(normalize), weights };
});

const THRESHOLD = 1.5;   // minimum token score to answer
const SEPARATION = 1.25; // the winner must beat the runner-up by this factor

export function resolveQuestion(input: string): Resolution {
  const q = normalize(input);
  if (!q) return { kind: "unknown", nearby: ["getting_started", "plan_eva", "return_envelope"] };
  // 1. Exact alias.
  for (const t of INDEX) if (t.aliases.includes(q)) return { kind: "topic", intent: t.id, score: 100 };
  // 2. Whole-phrase alias inside the question (longest wins).
  let phrase: { id: GuideIntent; len: number } | null = null;
  for (const t of INDEX) for (const a of t.aliases) {
    if (a.split(" ").length >= 2 && (` ${q} `).includes(` ${a} `) && (!phrase || a.length > phrase.len)) phrase = { id: t.id, len: a.length };
  }
  if (phrase) return { kind: "topic", intent: phrase.id, score: 50 };
  // 3. Weighted tokens.
  const words = [...new Set(tokens(q).map(stem))];
  const scored = INDEX.map((t) => ({ id: t.id, score: words.reduce((a, w) => a + (t.weights.get(w) ?? 0), 0) }))
    .filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { kind: "unknown", nearby: ["getting_started", "plan_eva", "source_provenance"] };
  const [top, second] = scored;
  if (top.score < THRESHOLD) {
    // Two topics touched equally but weakly ("data plan"): ask which one rather than say unknown.
    const tied = scored.filter((s) => s.score === top.score && s.score >= 1);
    if (tied.length >= 2) return { kind: "ambiguous", options: tied.slice(0, 3).map((s) => s.id) };
    return { kind: "unknown", nearby: scored.slice(0, 3).map((s) => s.id) };
  }
  if (second && top.score < second.score * SEPARATION) return { kind: "ambiguous", options: scored.slice(0, 3).filter((s) => s.score >= top.score / SEPARATION).map((s) => s.id) };
  return { kind: "topic", intent: top.id, score: top.score };
}
