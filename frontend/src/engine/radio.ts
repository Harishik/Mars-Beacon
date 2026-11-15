// Radio line of sight to the habitat antenna (and the parked rover as a relay) over the DEM.
// Ridges between the crew and the habitat put the crew in a radio shadow: no voice or telemetry link.
// Method: rays from the antenna to every edge cell of the grid (the R2 viewshed approximation), tracking the
// steepest terrain angle so far; a cell is in sight if the line to a helmet antenna clears it. Mars curvature
// is included (0.33 m drop at 1.5 km). Heights are the 4 m DEM, so small rocks and the crew's own bodies are not.
import type { SiteBundle } from "../data/bundle";
import { toCell } from "../data/bundle";

export const HAB_MAST_M = 3.0;     // habitat antenna height above ground (ASSUMPTION)
export const ROVER_MAST_M = 2.5;   // rover mast antenna (ASSUMPTION)
export const HELMET_ANT_M = 1.8;   // suit antenna height (ASSUMPTION)
const R_MARS = 3396190;

export function viewshed(height: Float32Array, cols: number, rows: number, cellM: number, src: [number, number], mastM: number, rxM = HELMET_ANT_M): Uint8Array {
  const vis = new Uint8Array(cols * rows);
  const [c0, r0] = src;
  const h0 = height[r0 * cols + c0] + mastM;
  vis[r0 * cols + c0] = 1;
  const edges: [number, number][] = [];
  for (let c = 0; c < cols; c++) { edges.push([c, 0], [c, rows - 1]); }
  for (let r = 1; r < rows - 1; r++) { edges.push([0, r], [cols - 1, r]); }
  for (const [ce, re] of edges) {
    const dc = ce - c0, dr = re - r0;
    const n = Math.max(Math.abs(dc), Math.abs(dr)) * 2;
    if (n === 0) continue;
    let maxTan = -Infinity;
    for (let k = 1; k <= n; k++) {
      const c = Math.round(c0 + (dc * k) / n), r = Math.round(r0 + (dr * k) / n);
      const i = r * cols + c;
      const h = height[i];
      if (!Number.isFinite(h)) continue;
      const d = Math.hypot(c - c0, r - r0) * cellM;
      if (d === 0) continue;
      const drop = (d * d) / (2 * R_MARS);
      const tRx = (h + rxM - drop - h0) / d;
      if (tRx >= maxTan) vis[i] = 1;
      const tGround = (h - drop - h0) / d;
      if (tGround > maxTan) maxTan = tGround;
    }
  }
  return vis;
}

const cache = new WeakMap<SiteBundle, Map<string, Uint8Array>>();

/** 1 where a helmet antenna has line of sight to the habitat (or to the parked rover when it relays), else 0. */
export function radioCoverage(b: SiteBundle, withRover: boolean): Uint8Array | null {
  const m = b.manifest, g = m.grid;
  const hab = m.havens.find((h) => h.type === "habitat");
  if (!hab) return null;
  const key = withRover ? "hab+rover" : "hab";
  let per = cache.get(b);
  if (!per) { per = new Map(); cache.set(b, per); }
  const hit = per.get(key);
  if (hit) return hit;
  const out = viewshed(b.height, g.cols, g.rows, g.liveM, toCell(m, hab.x, hab.y), HAB_MAST_M);
  const rover = m.havens.find((h) => h.type === "rover");
  if (withRover && rover) {
    const rv = viewshed(b.height, g.cols, g.rows, g.liveM, toCell(m, rover.x, rover.y), ROVER_MAST_M);
    for (let i = 0; i < out.length; i++) out[i] |= rv[i];
  }
  per.set(key, out);
  return out;
}

/** Share of a route in radio contact, and the longest stretch out of contact (seconds along the plan). */
export function routeRadio(cov: Uint8Array, samples: { cell: number; t: number }[]) {
  if (!samples.length) return { share: 1, longestGapS: 0 };
  let inSight = 0, gapStart: number | null = null, longest = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const ok = cov[s.cell] === 1;
    if (ok) inSight++;
    if (!ok && gapStart === null) gapStart = s.t;
    if ((ok || i === samples.length - 1) && gapStart !== null) { longest = Math.max(longest, s.t - gapStart); gapStart = null; }
  }
  return { share: inSight / samples.length, longestGapS: longest };
}
