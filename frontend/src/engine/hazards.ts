// Risk summary for a stop: the hazards the challenge names (terrain, large rocks, conditions, radiation)
// read from the same layers the map shows. Thresholds are ASSUMPTIONS, shown in the ledger.
import type { SiteBundle } from "../data/bundle";
import { toCell } from "../data/bundle";
import { temperatureAt } from "./overlays";
import { evaDoseMsv } from "./environment";

export type Level = "ok" | "caution" | "high";
export interface Hazard { id: "slope" | "rocks" | "cold" | "dose" | "margin"; label: string; value: string; level: Level; why: string }

export const HAZARD_LIMITS = {
  slopeCaution: 12, // deg, P90 within the work area (ASSUMPTION: footing for sampling work)
  rocksCaution: 8, rocksHigh: 20, // % area of boulders >= 0.75 m (ASSUMPTION)
  coldCaution: -60, coldHigh: -80, // °C ground temperature at arrival (ASSUMPTION: suit glove and boot contact)
  doseCaution: 0.5, doseHigh: 2.0, // mSv for the EVA so far (ASSUMPTION; RAD surface rate is 0.64 mSv/day)
  marginCaution: 30, marginHigh: 10, // minutes on site before turn-back (ASSUMPTION)
};
const L = HAZARD_LIMITS;
const WORK_RADIUS_M = 12;

function around(bundle: SiteBundle, x: number, y: number, field: Float32Array | undefined, f: (vals: number[]) => number) {
  if (!field) return NaN;
  const m = bundle.manifest, g = m.grid;
  const [c0, r0] = toCell(m, x, y);
  const R = Math.ceil(WORK_RADIUS_M / g.liveM);
  const vals: number[] = [];
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    if (dr * dr + dc * dc > R * R) continue;
    const r = r0 + dr, c = c0 + dc;
    if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
    const v = field[r * g.cols + c];
    if (Number.isFinite(v)) vals.push(v);
  }
  return vals.length ? f(vals) : NaN;
}
const p90 = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))]; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function stopHazards(bundle: SiteBundle, x: number, y: number, o: { lsDeg: number; tau: number; arriveLmstH: number; elapsedS: number; storm: boolean; stayMin: number | null }): Hazard[] {
  const out: Hazard[] = [];
  const slope = around(bundle, x, y, bundle.slopeP90 ?? bundle.slopeDeg, (v) => p90(v.filter((s) => s < 89)));
  if (Number.isFinite(slope)) out.push({ id: "slope", label: "Slope", value: `${slope.toFixed(0)}°`, level: slope > 20 ? "high" : slope > L.slopeCaution ? "caution" : "ok", why: "90th percentile slope within 12 m (4 m grid, P90 of 16 DEM realisations)" });
  const rocks = around(bundle, x, y, bundle.rocks, mean) * 100;
  if (Number.isFinite(rocks)) {
    if (bundle.manifest.rocksReliable === false) out.push({ id: "rocks", label: "Boulders", value: "not rated", level: "caution", why: "The boulder layer at this site is display only: sand-ripple crests are detected as rocks. Check rover images before relying on it." });
    else out.push({ id: "rocks", label: "Boulders", value: `${rocks.toFixed(0)}%`, level: rocks > L.rocksHigh ? "high" : rocks > L.rocksCaution ? "caution" : "ok", why: "Boulder cover within 12 m from the M2 HiRISE detector (precision not yet measured)" });
  }
  const cell = (() => { const [c, r] = toCell(bundle.manifest, x, y); return r * bundle.manifest.grid.cols + c; })();
  const t = temperatureAt(bundle, o.lsDeg, o.tau, o.arriveLmstH, cell);
  out.push({ id: "cold", label: "Ground", value: `${Math.round(t)} °C`, level: t < L.coldHigh ? "high" : t < L.coldCaution ? "caution" : "ok", why: "Modelled ground temperature at arrival (slope, aspect, sun and dust)" });
  const dose = evaDoseMsv(o.elapsedS, o.storm ? 10 : 1);
  out.push({ id: "dose", label: "Dose", value: `${dose.toFixed(2)} mSv`, level: dose > L.doseHigh ? "high" : dose > L.doseCaution ? "caution" : "ok", why: o.storm ? "Solar particle event scenario: ten times the RAD surface rate" : "Curiosity RAD surface rate for the time outside so far" });
  if (o.stayMin !== null) out.push({ id: "margin", label: "On site", value: `${Math.floor(o.stayMin)} min`, level: o.stayMin < L.marginHigh ? "high" : o.stayMin < L.marginCaution ? "caution" : "ok", why: "Time the crew can stay before turning back, from the Return Envelope" });
  return out;
}
