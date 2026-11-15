import { describe, it, expect } from "vitest";
import { summarise } from "../engine/liveWeather";
import { earthMarsSeparationDeg } from "../engine/lighttime";

const now = Date.parse("2026-11-15T00:00:00Z");
describe("space weather summary", () => {
  it("quiet with no events", () => {
    expect(summarise([], [], [], 30, now).level).toBe("quiet");
  });
  it("a Mars-bound CME arriving within four days is an alert", () => {
    expect(summarise([], [], [{ id: "c", start: "2026-11-13T00:00Z", arrival: "2026-11-16T06:00Z" }], 120, now).level).toBe("alert");
  });
  it("a recent SEP is an alert when Mars faces Earth's side of the Sun, a watch otherwise", () => {
    const sep = [{ id: "s", time: "2026-11-14T10:00Z", instruments: [] }];
    expect(summarise([], sep, [], 20, now).level).toBe("alert");
    expect(summarise([], sep, [], 150, now).level).toBe("watch");
  });
});

describe("Earth-Mars separation", () => {
  it("is small near opposition (Jan 2025) and large near conjunction (Nov 2023)", () => {
    expect(earthMarsSeparationDeg(Date.parse("2025-01-16T00:00:00Z"))).toBeLessThan(10);
    expect(earthMarsSeparationDeg(Date.parse("2023-11-18T00:00:00Z"))).toBeGreaterThan(170);
  });
});
