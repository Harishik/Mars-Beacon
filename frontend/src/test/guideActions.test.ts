import { describe, expect, it } from "vitest";
import { parseGuideAction, runGuideAction } from "../companion/actions";
import { useStore } from "../store/store";

describe("guide actions are allowlisted", () => {
  it("accepts known actions with valid values", () => {
    expect(parseGuideAction({ type: "goPhase", phase: "plan" })).toEqual({ type: "goPhase", phase: "plan" });
    expect(parseGuideAction({ type: "setView", view: "eva" })).toEqual({ type: "setView", view: "eva" });
    expect(parseGuideAction({ type: "showLayer", layer: "slope", on: true })).toEqual({ type: "showLayer", layer: "slope", on: true });
    expect(parseGuideAction({ type: "highlight", target: "timeline" })).toEqual({ type: "highlight", target: "timeline" });
  });

  it("refuses unknown actions, values and non-objects", () => {
    expect(typeof parseGuideAction({ type: "setCrew", loadKg: 0 })).toBe("string");
    expect(typeof parseGuideAction({ type: "goPhase", phase: "launch" })).toBe("string");
    expect(typeof parseGuideAction({ type: "showLayer", layer: "__proto__", on: true })).toBe("string");
    expect(typeof parseGuideAction({ type: "highlight", target: "body" })).toBe("string");
    expect(typeof parseGuideAction({ type: "selectStop", stopId: "nope" })).toBe("string");
    expect(typeof parseGuideAction("goPhase")).toBe("string");
    expect(typeof parseGuideAction(null)).toBe("string");
  });

  it("drops extra fields instead of passing them through", () => {
    expect(parseGuideAction({ type: "focusView", on: true, crew: [] })).toEqual({ type: "focusView", on: true });
  });

  it("runs an allowed action and reports refusals without throwing", () => {
    expect(runGuideAction({ type: "goPhase", phase: "debrief" })).toEqual({ ok: true });
    expect(useStore.getState().phase).toBe("debrief");
    const before = useStore.getState().crew;
    expect(runGuideAction({ type: "setCrew", i: 0, p: { o2BudgetG: 1 } }).ok).toBe(false);
    expect(useStore.getState().crew).toBe(before);
  });
});
