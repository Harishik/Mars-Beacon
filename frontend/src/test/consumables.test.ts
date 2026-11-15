import { describe, expect, it } from "vitest";
import { o2RateGph, waterRateGph, waterFromO2, batteryWhFor, consumablesLeft, SUIT_ELEC_W } from "../engine/physiology";
import { computeEnvelope, type EnvelopeParams } from "../engine/envelope";

describe("cooling water and suit battery", () => {
  it("water from O2 and time matches the hourly rate at constant power", () => {
    for (const w of [150, 400, 696]) {
      expect(waterFromO2(o2RateGph(w), 3600)).toBeCloseTo(waterRateGph(w), 6);
    }
  });
  it("water rate: 400 W walking plus the suit load rejects about 0.65 kg/h", () => {
    expect(waterRateGph(400)).toBeCloseTo(((400 + SUIT_ELEC_W) * 3600) / 2454, 6);
    expect(waterRateGph(400)).toBeGreaterThan(600);
    expect(waterRateGph(400)).toBeLessThan(700);
  });
  it("battery is the electrical load times time", () => {
    expect(batteryWhFor(3600)).toBeCloseTo(SUIT_ELEC_W, 6);
  });
  it("nothing used at egress", () => {
    const l = consumablesLeft({ o2SpentG: 0, waterBudgetG: 3600, batteryBudgetWh: 400 }, 0);
    expect(l.waterLeftG).toBe(3600);
    expect(l.batteryLeftWh).toBe(400);
  });
});

function params(): EnvelopeParams {
  return {
    cols: 60, rows: 60, cellM: 4, slopeLimitDeg: 20, v0: 0.7, kG: 0.76, mRestW: 100, bodyMassKg: 80, reserveM: 0.25,
    timeBudgetS: 3600 * 4, timeSpentS: 0,
    crew: [
      { fMob: 1, loadKg: 104, o2BudgetG: 1000, o2SpentG: 0 },
      { fMob: 1, loadKg: 104, o2BudgetG: 1000, o2SpentG: 0 },
    ],
    havens: [[30, 30]],
  };
}

describe("envelope with water and battery", () => {
  const n = 60 * 60;
  const h = new Float32Array(n), s = new Float32Array(n);

  it("generous budgets change nothing", () => {
    const base = computeEnvelope(h, s, params());
    const p = params();
    p.crew = p.crew.map((c) => ({ ...c, waterBudgetG: 1e6, waterSpentG: 0, batteryBudgetWh: 1e6, batterySpentWh: 0 })) as EnvelopeParams["crew"];
    const out = computeEnvelope(h, s, p);
    expect(out.insideCells).toBe(base.insideCells);
  });

  it("a nearly flat battery shrinks the envelope and certifies on the same path", () => {
    const base = computeEnvelope(h, s, params());
    const p = params();
    p.crew = p.crew.map((c) => ({ ...c, batteryBudgetWh: 1.0, batterySpentWh: 0 })) as EnvelopeParams["crew"];
    const out = computeEnvelope(h, s, p);
    expect(out.insideCells).toBeGreaterThan(0);
    expect(out.insideCells).toBeLessThan(base.insideCells);
    for (let i = 0; i < n; i++) {
      if (out.inside[i]) expect(1.25 * batteryWhFor(out.timeToHaven[i])).toBeLessThanOrEqual(1.0 + 1e-6);
    }
  });

  it("one suit short of water limits the pair", () => {
    const p = params();
    p.crew = [
      { ...p.crew[0], waterBudgetG: 3600, waterSpentG: 0 },
      { ...p.crew[1], waterBudgetG: 3600, waterSpentG: 3590 },
    ];
    const out = computeEnvelope(h, s, p);
    for (let i = 0; i < n; i++) {
      if (out.inside[i]) expect(1.25 * waterFromO2(out.o2B[i], out.timeToHaven[i])).toBeLessThanOrEqual(10 + 1e-3);
    }
    expect(out.insideCells).toBeLessThan(computeEnvelope(h, s, params()).insideCells);
  });
});
