import { describe, expect, it } from "vitest";
import { normalize, resolveQuestion } from "../resolveQuestion";
import { SUGGESTED, TOPICS } from "../topics";

const intentOf = (q: string) => { const r = resolveQuestion(q); return r.kind === "topic" ? r.intent : r.kind; };

describe("question resolver", () => {
  it("normalizes case, punctuation, accents and length", () => {
    expect(normalize("  What IS the Return-Envelope?!  ")).toBe("what is the return-envelope");
    expect(normalize("Café")).toBe("cafe");
    expect(normalize("x".repeat(400)).length).toBe(250);
  });

  it("answers the spec's example questions with the right topic", () => {
    expect(intentOf("What is Mars BEACON?")).toBe("getting_started");
    expect(intentOf("How can I make a route?")).toBe("plan_eva");
    expect(intentOf("Is this safe to walk?")).toBe("safety");
    expect(intentOf("Why isn't my route working?")).toBe("no_route");
    expect(intentOf("Where did the elevation come from?")).toBe("source_provenance");
    expect(intentOf("Why does the boundary look striped?")).toBe("p90_uncertainty");
    expect(intentOf("How much oxygen is left?")).toBe("oxygen_margin");
    expect(intentOf("Can I see the surface temperature?")).toBe("thermal_layer");
    expect(intentOf("Can I view it on my phone?")).toBe("mobile");
    expect(intentOf("Where are your equations?")).toBe("equations");
    expect(intentOf("Can you plan for me?")).toBe("plan_eva");
    expect(intentOf("What does P90 mean?")).toBe("p90_uncertainty");
    expect(intentOf("show me the slope layer")).toBe("slope_layer");
  });

  it("matches paraphrases by weighted tokens", () => {
    expect(intentOf("which nasa instruments made the imagery")).toBe("source_provenance");
    expect(intentOf("the app is laggy on my laptop")).toBe("performance");
    expect(intentOf("explain the blue boundary")).toBe("return_envelope");
  });

  it("refuses to guess on unknown questions", () => {
    const r = resolveQuestion("what is the capital of france");
    expect(r.kind).toBe("unknown");
    expect(resolveQuestion("").kind).toBe("unknown");
    expect(resolveQuestion("!!!").kind).toBe("unknown");
  });

  it("shows ambiguity instead of picking one", () => {
    const r = resolveQuestion("data plan");
    expect(["ambiguous", "topic"]).toContain(r.kind);
    if (r.kind === "ambiguous") expect(r.options.length).toBeGreaterThan(1);
  });

  it("every topic is complete and every suggested prompt resolves", () => {
    expect(TOPICS.length).toBeGreaterThanOrEqual(18);
    expect(TOPICS.length).toBeLessThanOrEqual(25);
    for (const t of TOPICS) { expect(t.summary.length).toBeGreaterThan(20); expect(t.source).toBeTruthy(); expect((t.steps ?? []).length).toBeLessThanOrEqual(3); }
    for (const s of SUGGESTED) if (s.intent !== "tour") expect(intentOf(s.label)).toBe(s.intent);
  });
});
