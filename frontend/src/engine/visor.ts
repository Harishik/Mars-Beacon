// What the helmet visor needs each moment: the planned path ahead of the crew, the hazards along it,
// and the suit's current work rate. Pure functions over the shared mission state.
import type { SiteBundle } from "../data/bundle";
import { toCell, sampleHeight } from "../data/bundle";
import type { Plan } from "./planner";
import { speed, metabolicPower, o2RateGph } from "./physiology";

export interface PathPoint { x: number; y: number; slope: number }
export interface Hazard3D { kind: "boulder" | "steep"; x: number; y: number; size: number; along: number }

function cellXY(b: SiteBundle, cell: number): [number, number] {
  const g = b.manifest.grid, E = g.extentM;
  const r = Math.floor(cell / g.cols), c = cell - r * g.cols;
  return [(c + 0.5) * g.liveM - E / 2, E / 2 - (r + 0.5) * g.liveM];
}

/** The planned route from the crew's position onward, up to `lengthM` metres (whole remaining plan legs). */
export function forwardPath(b: SiteBundle, plan: Plan, pos: { x: number; y: number }, lengthM = 260): PathPoint[] {
  const cells: number[] = [];
  for (const leg of plan.legs) for (const c of leg.cells) if (cells[cells.length - 1] !== c) cells.push(c);
  if (!cells.length) return [];
  // Nearest route cell to the crew. Ties go to the later cell so the path never points backwards after a stop.
  let best = 0, bd = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cellXY(b, cells[i]);
    const d = (x - pos.x) ** 2 + (y - pos.y) ** 2;
    if (d <= bd) { bd = d; best = i; }
    if (d > bd + 400 && bd < 16) break; // already past the crew's leg
  }
  const out: PathPoint[] = [{ x: pos.x, y: pos.y, slope: Math.min(60, b.slopeDeg[cells[best]] ?? 0) }];
  let len = 0, px = pos.x, py = pos.y;
  for (let i = best + 1; i < cells.length && len < lengthM; i++) {
    const [x, y] = cellXY(b, cells[i]);
    len += Math.hypot(x - px, y - py);
    out.push({ x, y, slope: Math.min(60, b.slopeDeg[cells[i]]) });
    px = x; py = y;
  }
  return out;
}

/** Boulders of 1 m or more within `reachM` of the path, and steep cells on it. */
export function pathHazards(path: PathPoint[], rocks: Float32Array | null, reachM = 6, steepDeg = 15): Hazard3D[] {
  const out: Hazard3D[] = [];
  if (path.length < 2) return out;
  const along: number[] = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of path) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (rocks) {
    for (let k = 0; k < rocks.length; k += 3) {
      const x = rocks[k], y = rocks[k + 1], d = rocks[k + 2];
      if (d < 1 || x < minX - reachM || x > maxX + reachM || y < minY - reachM || y > maxY + reachM) continue;
      let bestD = Infinity, bestA = 0;
      for (let i = 1; i < path.length; i++) {
        const ax = path[i - 1].x, ay = path[i - 1].y, bx = path[i].x, by = path[i].y;
        const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
        const dd = Math.hypot(ax + t * vx - x, ay + t * vy - y);
        if (dd < bestD) { bestD = dd; bestA = along[i - 1] + t * Math.sqrt(L2); }
      }
      if (bestD - d / 2 <= reachM) out.push({ kind: "boulder", x, y, size: d, along: bestA });
    }
  }
  path.forEach((p, i) => { if (p.slope > steepDeg && i > 0) out.push({ kind: "steep", x: p.x, y: p.y, size: p.slope, along: along[i] }); });
  return out.sort((a, c) => a.along - c.along);
}

/** Suit work right now: grade along the heading, walking pace, metabolic power and O2 use. */
export function suitNow(b: SiteBundle, pos: { x: number; y: number; heading: number }, walking: boolean,
  p: { v0: number; fMob: number; massKg: number; loadKg: number; kG: number; mRestW: number }) {
  const h = (pos.heading * Math.PI) / 180, step = 8;
  const z0 = sampleHeight(b, pos.x, pos.y), z1 = sampleHeight(b, pos.x + Math.sin(h) * step, pos.y + Math.cos(h) * step);
  const grade = walking ? (z1 - z0) / step : 0;
  const v = walking ? speed(grade, p.v0, p.fMob) : 0;
  const watts = walking ? metabolicPower(grade, v, p.massKg, p.loadKg, p.kG, p.mRestW) : p.mRestW;
  // Heart rate from work rate: linear between rest (70 bpm at M_rest) and about 150 bpm at 700 W (ASSUMPTION).
  const hr = Math.round(70 + Math.max(0, watts - p.mRestW) * (80 / (700 - p.mRestW)));
  return { gradePct: grade * 100, speed: v, watts, o2gph: o2RateGph(watts), hr, cell: toCell(b.manifest, pos.x, pos.y) };
}
