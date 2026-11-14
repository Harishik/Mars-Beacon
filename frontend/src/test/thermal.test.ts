import { describe, expect, it } from "vitest";
import { thermalTable, THERMAL_DEFAULTS, flatCurve, STEPS_PER_SOL, SLOPES, ASPECTS } from "../engine/thermal";

const base = { latDeg: -4.8031, lonEastDeg: 137.384, inertia: THERMAL_DEFAULTS.inertia, albedo: THERMAL_DEFAULTS.albedo, emissivity: THERMAL_DEFAULTS.emissivity };

describe("thermal model", () => {
  it("flat-ground sol cycle falls inside the range REMS measured at Gale", () => {
    const t = thermalTable({ ...base, lsDeg: 150, tau: 0.6 });
    const c = flatCurve(t);
    let iMax = 0; for (let i = 0; i < c.length; i++) if (c[i] > c[iMax]) iMax = i;
    console.log(`Ls 150 tau 0.6: min ${(t.flatMinK - 273.15).toFixed(1)} C, max ${(t.flatMaxK - 273.15).toFixed(1)} C at ${(24 * iMax / STEPS_PER_SOL).toFixed(1)} h`);
    // REMS ground temperature at Gale: roughly -90 to -65 C before dawn, -10 to +20 C early afternoon.
    expect(t.flatMinK - 273.15).toBeGreaterThan(-100);
    expect(t.flatMinK - 273.15).toBeLessThan(-55);
    expect(t.flatMaxK - 273.15).toBeGreaterThan(-25);
    expect(t.flatMaxK - 273.15).toBeLessThan(30);
    // Peak after local noon (thermal lag).
    expect(24 * iMax / STEPS_PER_SOL).toBeGreaterThan(12);
    expect(24 * iMax / STEPS_PER_SOL).toBeLessThan(15);
  });
  it("dust storm narrows the daily swing; higher thermal inertia narrows it too", () => {
    const clear = thermalTable({ ...base, lsDeg: 150, tau: 0.5 });
    const storm = thermalTable({ ...base, lsDeg: 150, tau: 3 });
    const rock = thermalTable({ ...base, lsDeg: 150, tau: 0.5, inertia: 900 });
    const swing = (t: typeof clear) => t.flatMaxK - t.flatMinK;
    expect(swing(storm)).toBeLessThan(swing(clear));
    expect(swing(rock)).toBeLessThan(swing(clear));
  });
  it("in southern summer a north-facing slope at Gale gets less sun than a south-facing one", () => {
    const t = thermalTable({ ...base, lsDeg: 270, tau: 0.5 });
    const s = SLOPES.indexOf(24);
    expect(t.insolation[s * ASPECTS + 0]).toBeLessThan(t.insolation[s * ASPECTS + 4]);
  });
});
