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

import { airMass, declinationDeg, directIrradiance, evaDoseMsv, toaIrradiance } from "../engine/environment";
describe("environment", () => {
  it("declination is zero at Ls 0 and +25.19 at Ls 90", () => {
    expect(declinationDeg(0)).toBeCloseTo(0, 6);
    expect(declinationDeg(90)).toBeCloseTo(25.19, 4);
  });
  it("air mass is 1 overhead and grows toward the horizon", () => {
    expect(airMass(0)).toBeCloseTo(1, 6);
    expect(airMass(80)).toBeGreaterThan(5);
  });
  it("irradiance is higher near perihelion than aphelion", () => {
    expect(toaIrradiance(251)).toBeGreaterThan(toaIrradiance(71));
  });
  it("dust dims the direct beam", () => {
    expect(directIrradiance(150, 60, 3)).toBeLessThan(directIrradiance(150, 60, 0.5));
  });
  it("one sol outside is about 0.66 mSv at the RAD average", () => {
    expect(evaDoseMsv(88775.2)).toBeCloseTo(0.66, 1);
  });
});

import { planEVA } from "../engine/planner";
describe("planner", () => {
  it("flat grid: plans stay inside budgets and max science visits more stops", () => {
    const n = 101, h = new Float32Array(n * n), s = new Float32Array(n * n);
    const plans = planEVA(h, s, {
      cols: n, rows: n, cellM: 4, slopeLimitDeg: 20, v0: 0.7, kG: 0.76, mRestW: 100, bodyMassKg: 80, reserveM: 0.25,
      timeBudgetS: 3600, o2BudgetG: [400, 400], fMob: [1, 1], loadKg: [104, 104], workPowerW: 250, dwellS: 600,
      home: [50, 50], stops: [
        { id: "a", cell: [60, 50], science: 1 }, { id: "b", cell: [50, 62], science: 1 }, { id: "c", cell: [95, 95], science: 1 },
      ],
    });
    expect(plans.length).toBe(3);
    const sci = plans.find((p) => p.id === "maxScience")!;
    expect(sci.order.length).toBeGreaterThanOrEqual(2);
    for (const p of plans) {
      expect(p.minMargin).toBeGreaterThanOrEqual(0);
      expect(p.totalS).toBeLessThanOrEqual(3600);
      expect(p.events[0].kind).toBe("depart");
      expect(p.events[p.events.length - 1].kind).toBe("return");
    }
  });
});
