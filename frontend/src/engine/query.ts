// Answers the crew's question for one point: "if we are here, how do we get
// home, what does it cost, and how long can we stay?"
import type { SiteBundle } from "../data/bundle";
import { toCell } from "../data/bundle";
import { routeHome } from "./envelope";
import { o2RateGph } from "./physiology";

/** Metabolic power while working at a stop (sampling, imaging). ASSUMPTION, shown in the ledger. */
export const WORK_POWER_W = 250;

export interface PointReport {
  reachable: boolean;          // a certified path home exists within the time reach
  inside: boolean;             // inside the Return Envelope (all resources with reserve)
  walkHomeS: number;
  o2HomeG: [number, number];
  distanceM: number;
  stayMin: number;             // minutes of work possible here before turning back (min over resources)
  limitedBy: "time" | "EV1 oxygen" | "EV2 oxygen";
  route: [number, number][];   // site-frame metres, from the point to the haven
  haven: string;
}

export function reportAt(b: SiteBundle, s: {
  envelope: { timeToHaven: Float32Array | null; parent: Int32Array | null; o2A: Float32Array | null; o2B: Float32Array | null; margin: Float32Array | null };
  timeBudgetS: number; timeSpentS: number; reserveM: number;
  crew: { o2BudgetG: number; o2SpentG: number }[];
}, x: number, y: number): PointReport | null {
  const e = s.envelope;
  if (!e.timeToHaven || !e.parent || !e.o2A || !e.o2B || !e.margin) return null;
  const m = b.manifest;
  const [c, r] = toCell(m, x, y);
  const i = r * m.grid.cols + c;
  const t = e.timeToHaven[i];
  const reachable = Number.isFinite(t);
  const f = 1 + s.reserveM;
  const cells = reachable ? routeHome(e.parent, i) : [];
  const { liveM, extentM, cols } = m.grid;
  const route = cells.map((k) => {
    const rr = Math.floor(k / cols), cc = k - rr * cols;
    return [(cc + 0.5) * liveM - extentM / 2, extentM / 2 - (rr + 0.5) * liveM] as [number, number];
  });
  let distanceM = 0;
  for (let k = 1; k < route.length; k++) distanceM += Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]);
  const end = route[route.length - 1];
  const haven = end ? (m.havens.reduce((best, h) => (Math.hypot(h.x - end[0], h.y - end[1]) < Math.hypot(best.x - end[0], best.y - end[1]) ? h : best), m.havens[0]).type === "rover" ? "Support rover" : "Habitat airlock") : "";

  const tSlackMin = (s.timeBudgetS - s.timeSpentS - f * (reachable ? t : Infinity)) / 60;
  const workGpm = o2RateGph(WORK_POWER_W) / 60;
  const aSlack = (s.crew[0].o2BudgetG - s.crew[0].o2SpentG - f * e.o2A[i]) / workGpm;
  const bSlack = (s.crew[1].o2BudgetG - s.crew[1].o2SpentG - f * e.o2B[i]) / workGpm;
  const options: [number, PointReport["limitedBy"]][] = [[tSlackMin, "time"], [aSlack, "EV1 oxygen"], [bSlack, "EV2 oxygen"]];
  options.sort((p, q) => p[0] - q[0]);
  return {
    reachable, inside: e.margin[i] >= 0,
    walkHomeS: reachable ? t : Infinity,
    o2HomeG: [e.o2A[i], e.o2B[i]],
    distanceM, stayMin: reachable ? options[0][0] : -Infinity, limitedBy: options[0][1],
    route, haven,
  };
}
