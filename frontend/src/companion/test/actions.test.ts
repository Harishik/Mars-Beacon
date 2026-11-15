import { beforeEach, describe, expect, it } from "vitest";
import { runGuideAction, ACTION_IDS } from "../actions";
import { useStore } from "../../store/store";
import { TOUR } from "../tourSteps";
import { TOPICS } from "../topics";

// A minimal loaded site so site-dependent actions can run.
const fakeBundle = { manifest: { targets: [], havens: [], grid: { cols: 1, rows: 1, liveM: 4, extentM: 4 } } } as never;

/** Everything the guide must never change silently (§4). */
const mission = () => {
  const s = useStore.getState();
  return JSON.stringify({ crew: s.crew, v0: s.v0, slope: s.slopeLimitDeg, reserve: s.reserveM, time: s.timeBudgetS, rover: s.roverActive,
    storm: s.storm, tau: s.tau, ls: s.lsDeg, excluded: s.excludedStops, kG: s.kG, mass: s.bodyMassKg, dwell: s.dwellMin });
};

describe("guide actions", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window ??= globalThis;
    (globalThis as unknown as { location: { hash: string } }).location ??= { hash: "#/app" };
    window.location.hash = "#/app";
    useStore.setState({ bundle: fakeBundle, playing: false, phase: "plan", plans: [], ledger: false, quality: "high" });
  });

  it("refuses anything outside the allowlist", () => {
    expect(runGuideAction("set_crew").ok).toBe(false);
    expect(runGuideAction({ type: "open_plan" }).ok).toBe(false);
    expect(runGuideAction(undefined).ok).toBe(false);
  });

  it("never changes mission budgets, limits or stops (G-05)", () => {
    const before = mission();
    for (const id of ACTION_IDS) if (id !== "start_rehearsal") runGuideAction(id);
    expect(mission()).toBe(before);
  });

  it("never starts playback except from start_rehearsal (G-06)", () => {
    for (const id of ACTION_IDS) { if (id === "start_rehearsal") continue; runGuideAction(id); expect(useStore.getState().playing).toBe(false); }
    expect(runGuideAction("start_rehearsal").ok).toBe(false); // no plan: refused with a manual route
    expect(useStore.getState().playing).toBe(false);
  });

  it("ensures layers on and never toggles them off", () => {
    useStore.setState({ layers: { ...useStore.getState().layers, envelope: true, slope: true } });
    runGuideAction("show_envelope"); runGuideAction("show_slope");
    expect(useStore.getState().layers.envelope).toBe(true);
    expect(useStore.getState().layers.slope).toBe(true);
  });

  it("low power changes rendering only", () => {
    const before = mission();
    runGuideAction("set_low_quality");
    expect(useStore.getState().quality).toBe("low");
    expect(mission()).toBe(before);
  });

  it("explains missing site data instead of acting", () => {
    useStore.setState({ bundle: null });
    const r = runGuideAction("show_envelope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.manual.length).toBeGreaterThan(0);
  });

  it("tour steps never auto-run playback or mission changes; Rehearse is an offer", () => {
    for (const step of TOUR) expect(step.enter).not.toBe("start_rehearsal");
    expect(TOUR.find((s) => s.id === "rehearse")?.offer?.action).toBe("start_rehearsal");
    expect(TOUR.map((s) => s.id)).toEqual(["welcome", "explore", "science", "plan", "return", "rehearse", "evidence", "finish"]);
    for (const t of TOPICS) expect(t.action).not.toBe("start_rehearsal");
  });
});
