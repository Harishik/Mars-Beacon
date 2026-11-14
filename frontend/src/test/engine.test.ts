import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { o2RateGph, speed } from "../engine/physiology";
import { computeEnvelope, type EnvelopeParams } from "../engine/envelope";

describe("physiology", () => {
  it("watts to oxygen conversion: 696 W is about 178 g/h (conversion check only)", () => {
    expect(o2RateGph(696)).toBeCloseTo(178.0, 0);
  });
  it("flat-ground speed equals v0", () => {
    expect(speed(0, 0.7, 1)).toBeCloseTo(0.7, 6);
  });
  it("uphill is slower than flat", () => {
    expect(speed(0.2, 0.7, 1)).toBeLessThan(speed(0, 0.7, 1));
  });
});

function params(cols: number, rows: number, havens: [number, number][]): EnvelopeParams {
  return {
    cols, rows, cellM: 4, slopeLimitDeg: 20, v0: 0.7, kG: 0.76, mRestW: 100, bodyMassKg: 80, reserveM: 0.25,
    timeBudgetS: 3600 * 4, timeSpentS: 3600 * 3,
    crew: [
      { fMob: 1, loadKg: 104, o2BudgetG: 1000, o2SpentG: 750 },
      { fMob: 1, loadKg: 104, o2BudgetG: 1000, o2SpentG: 750 },
    ],
    havens,
  };
}

describe("envelope", () => {
  it("flat grid: time grows with distance and a slower crew member slows the pair", () => {
    const n = 41, h = new Float32Array(n * n), s = new Float32Array(n * n);
    const p = params(n, n, [[20, 20]]);
    const a = computeEnvelope(h, s, p);
    expect(a.timeToHaven[20 * n + 20]).toBe(0);
    const straight = a.timeToHaven[20 * n + 30]; // 10 cells east = 40 m
    expect(straight).toBeCloseTo(40 / 0.7, 0);
    p.crew[1].fMob = 0.5;
    const b = computeEnvelope(h, s, p);
    expect(b.timeToHaven[20 * n + 30]).toBeCloseTo(2 * straight, 0);
  });

  it("blocked cells are never inside", () => {
    const n = 21, h = new Float32Array(n * n), s = new Float32Array(n * n);
    for (let r = 0; r < n; r++) s[r * n + 10] = 30; // wall
    const out = computeEnvelope(h, s, params(n, n, [[5, 10]]));
    expect(out.inside[10 * n + 15]).toBe(0);
    expect(out.inside[10 * n + 6]).toBe(1);
  });

  it("synthetic 750 x 750 bundle: full recompute timing", () => {
    const dir = new URL("../../../fixtures/bundle/gale-synthetic/", import.meta.url);
    const h = new Float32Array(readFileSync(new URL("height_4m.f32", dir)).buffer.slice(0));
    const s8 = new Uint8Array(readFileSync(new URL("slope_4m.u8", dir)));
    const s = Float32Array.from(s8, (v) => v * 0.1);
    const out = computeEnvelope(h, s, params(750, 750, [[250, 600], [520, 300]]));
    console.log(`750x750 two-haven envelope: ${out.ms.toFixed(0)} ms, ${out.insideCells} cells inside`);
    expect(out.insideCells).toBeGreaterThan(1000);
  });
});
