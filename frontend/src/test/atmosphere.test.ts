import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { seasonalTau, pressureAt } from "../engine/atmosphere";

const base = "../fixtures/bundle/gale-boxwork/atmosphere";
const clim = JSON.parse(readFileSync(`${base}/opacity_climatology.json`, "utf8"));
const pres = JSON.parse(readFileSync(`${base}/rems_pressure.json`, "utf8"));

describe("measured atmosphere", () => {
  it("dust climatology matches the Python model (Ls 150: 0.688) and is periodic", () => {
    expect(seasonalTau(clim.tau880, 150).tau).toBeCloseTo(0.6877, 3);
    expect(seasonalTau(clim.tau880, 0).tau).toBeCloseTo(seasonalTau(clim.tau880, 360).tau, 9);
  });
  it("REMS pressure replay returns measured bins and leaves gaps missing", () => {
    const p = pressureAt({ pressure: pres.sols }, 4534, 0.3);
    expect(p?.pa).toBeCloseTo(825.1, 1);
    expect(pressureAt({ pressure: pres.sols }, 9999, 12)).toBeNull();
  });
});
