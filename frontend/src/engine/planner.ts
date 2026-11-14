// EVA planner: chooses and orders science stops, simulates the walk, and keeps
// every point of the plan inside the Return Envelope (21_Simulation_and_Physics.md section 6).
//
// 1. Leg costs: one forward Dijkstra from the habitat and from each stop gives
//    time, O2 per crew and the path to every other stop (paired pace).
// 2. Stop selection: every ordered subset of stops (N <= 6) is simulated. A plan is
//    feasible only if, at every stop, both suits can still walk home with reserve.
// 3. Three plans: maximum science, maximum margin, balanced.

import { metabolicPower, o2RateGph } from "./physiology";

export interface PlanInput {
  cols: number; rows: number; cellM: number; slopeLimitDeg: number;
  v0: number; kG: number; mRestW: number; bodyMassKg: number; reserveM: number;
  timeBudgetS: number; o2BudgetG: [number, number];
  fMob: [number, number]; loadKg: [number, number];
  workPowerW: number;             // while sampling at a stop
  dwellS: number;                 // time at each stop
  home: [number, number];         // [col, row] of the habitat airlock
  stops: { id: string; cell: [number, number]; science: number }[];
}

export interface PlanLeg { from: string; to: string; cells: number[]; timeS: number; o2G: [number, number]; distM: number }
export interface PlanEvent { t: number; kind: "depart" | "arrive" | "leave" | "return"; stop: string }
export interface PlanSample { cell: number; t: number; o2Left: [number, number]; timeLeft: number; distM: number; elev: number; returnNeedS: number }
export interface Plan {
  id: "maxScience" | "maxMargin" | "balanced";
  order: string[];
  legs: PlanLeg[];
  events: PlanEvent[];
  samples: PlanSample[];
  science: number;
  minMargin: number;              // smallest remaining fraction over time and both suits' O2
  totalS: number;
  o2UsedG: [number, number];
  distM: number;
}

const NB: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];

/** Forward Dijkstra (walking away from `src`), paired pace, with parents. */
function dijkstraFrom(height: Float32Array, blocked: Uint8Array, p: PlanInput, src: number) {
  const { cols, rows, cellM } = p;
  const n = cols * rows;
  const time = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  let cap = 1 << 18, hk = new Float32Array(cap), hv = new Int32Array(cap), size = 0;
  const push = (k: number, v: number) => {
    if (size >= cap) { cap *= 2; const a = new Float32Array(cap); a.set(hk); hk = a; const b = new Int32Array(cap); b.set(hv); hv = b; }
    let i = size++;
    while (i > 0) { const q = (i - 1) >> 1; if (hk[q] <= k) break; hk[i] = hk[q]; hv[i] = hv[q]; i = q; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
    const top = hv[0], k = hk[--size], v = hv[size];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= size) break; if (c + 1 < size && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
    hk[i] = k; hv[i] = v; return top;
  };
  const norm = 1 / Math.exp(-0.175);
  const fPair = Math.min(p.fMob[0], p.fMob[1]);
  const DXY = NB.map(([a, b]) => Math.sqrt(a * a + b * b) * cellM);
  const maxT = p.timeBudgetS;
  time[src] = 0; push(0, src);
  while (size > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    const ur = (u / cols) | 0, uc = u - ur * cols;
    for (let k = 0; k < 16; k++) {
      const dc = NB[k][0], dr = NB[k][1];
      const vc = uc + dc, vr = ur + dr;
      if (vc < 0 || vr < 0 || vc >= cols || vr >= rows) continue;
      const v = vr * cols + vc;
      if (done[v] || blocked[v]) continue;
      if (k >= 8) {
        const ac = Math.abs(dc) === 2 ? uc + dc / 2 : uc, ar = Math.abs(dr) === 2 ? ur + dr / 2 : ur;
        const bc = Math.abs(dc) === 2 ? uc + dc / 2 : uc + dc, br = Math.abs(dr) === 2 ? ur + dr / 2 : ur + dr;
        if (blocked[ar * cols + ac] || blocked[br * cols + bc]) continue;
      }
      const dz = height[v] - height[u];
      const grade = dz / DXY[k];
      const ds = Math.sqrt(DXY[k] * DXY[k] + dz * dz);
      const vp = p.v0 * fPair * Math.exp(-3.5 * Math.abs(grade + 0.05)) * norm;
      const nt = time[u] + ds / vp;
      if (nt < time[v] && nt <= maxT) { time[v] = nt; parent[v] = u; push(nt, v); }
    }
  }
  return { time, parent };
}

/** Walks a path cell by cell and totals time, O2 per crew and distance (forward direction). */
function legCost(height: Float32Array, p: PlanInput, cells: number[]) {
  const { cols, cellM } = p;
  const norm = 1 / Math.exp(-0.175);
  const fPair = Math.min(p.fMob[0], p.fMob[1]);
  let t = 0, a = 0, b = 0, d = 0;
  for (let k = 1; k < cells.length; k++) {
    const u = cells[k - 1], v = cells[k];
    const dc = (v % cols) - (u % cols), dr = Math.floor(v / cols) - Math.floor(u / cols);
    const dxy = Math.sqrt(dc * dc + dr * dr) * cellM;
    const dz = height[v] - height[u];
    const grade = dz / dxy, ds = Math.sqrt(dxy * dxy + dz * dz);
    const vp = p.v0 * fPair * Math.exp(-3.5 * Math.abs(grade + 0.05)) * norm;
    const dt = ds / vp, h = dt / 3600;
    t += dt; d += ds;
    a += o2RateGph(metabolicPower(grade, vp, p.bodyMassKg, p.loadKg[0], p.kG, p.mRestW)) * h;
    b += o2RateGph(metabolicPower(grade, vp, p.bodyMassKg, p.loadKg[1], p.kG, p.mRestW)) * h;
  }
  return { timeS: t, o2G: [a, b] as [number, number], distM: d };
}

function pathTo(parent: Int32Array, src: number, dst: number): number[] | null {
  const out: number[] = [];
  let c = dst;
  for (let i = 0; i < 100000 && c >= 0; i++) { out.push(c); if (c === src) return out.reverse(); c = parent[c]; }
  return null;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((x, i) => { for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([x, ...rest]); });
  return out;
}

export function planEVA(height: Float32Array, slopeDeg: Float32Array, p: PlanInput): Plan[] {
  const n = p.cols * p.rows;
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) blocked[i] = slopeDeg[i] > p.slopeLimitDeg ? 1 : 0;
  const idx = (c: [number, number]) => c[1] * p.cols + c[0];
  const nodes = [{ id: "home", cell: idx(p.home), science: 0 }, ...p.stops.map((s) => ({ id: s.id, cell: idx(s.cell), science: s.science }))];
  const trees = nodes.map((nd) => dijkstraFrom(height, blocked, p, nd.cell));

  // Leg table between every pair of nodes.
  const legs = new Map<string, PlanLeg>();
  nodes.forEach((a, i) => nodes.forEach((b, j) => {
    if (i === j) return;
    const cells = pathTo(trees[i].parent, a.cell, b.cell);
    if (!cells) return;
    const c = legCost(height, p, cells);
    legs.set(`${a.id}>${b.id}`, { from: a.id, to: b.id, cells, ...c });
  }));

  const f = 1 + p.reserveM;
  const workG = o2RateGph(p.workPowerW) * (p.dwellS / 3600);
  const sci = new Map(nodes.map((nd) => [nd.id, nd.science]));
  const candidates: Plan[] = [];
  const ids = p.stops.map((s) => s.id);

  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const subset = ids.filter((_, k) => mask & (1 << k));
    for (const order of permutations(subset)) {
      const seq = ["home", ...order, "home"];
      let t = 0, a = 0, b = 0, d = 0, ok = true, minMargin = 1;
      const used: PlanLeg[] = [];
      const events: PlanEvent[] = [{ t: 0, kind: "depart", stop: "home" }];
      for (let k = 1; k < seq.length && ok; k++) {
        const leg = legs.get(`${seq[k - 1]}>${seq[k]}`);
        if (!leg) { ok = false; break; }
        used.push(leg);
        t += leg.timeS; a += leg.o2G[0]; b += leg.o2G[1]; d += leg.distM;
        const at = seq[k];
        if (at === "home") { events.push({ t, kind: "return", stop: "home" }); break; }
        events.push({ t, kind: "arrive", stop: at });
        t += p.dwellS; a += workG; b += workG;
        events.push({ t, kind: "leave", stop: at });
        // Certification at the stop, after sampling: can both still walk home with reserve?
        const home = legs.get(`${at}>home`);
        if (!home) { ok = false; break; }
        const mt = 1 - (t + f * home.timeS) / p.timeBudgetS;
        const ma = 1 - (a + f * home.o2G[0]) / p.o2BudgetG[0];
        const mb = 1 - (b + f * home.o2G[1]) / p.o2BudgetG[1];
        const m = Math.min(mt, ma, mb);
        minMargin = Math.min(minMargin, m);
        if (m < 0) ok = false;
      }
      if (!ok) continue;
      // Final margin at the airlock.
      minMargin = Math.min(minMargin, 1 - t / p.timeBudgetS, 1 - a / p.o2BudgetG[0], 1 - b / p.o2BudgetG[1]);
      if (minMargin < 0) continue;
      const science = order.reduce((s, id) => s + (sci.get(id) ?? 0), 0);
      candidates.push({ id: "balanced", order, legs: used, events, samples: [], science, minMargin, totalS: t, o2UsedG: [a, b], distM: d });
    }
  }
  if (candidates.length === 0) return [];

  const best = (score: (c: Plan) => number) => candidates.reduce((x, y) => (score(y) > score(x) ? y : x));
  const maxSci = Math.max(...candidates.map((c) => c.science)) || 1;
  const pick: [Plan["id"], Plan][] = [
    ["maxScience", best((c) => c.science * 1000 + c.minMargin)],
    ["maxMargin", best((c) => (c.science > 0 ? c.minMargin : -1))],
    ["balanced", best((c) => 0.6 * (c.science / maxSci) + 0.4 * c.minMargin)],
  ];
  return pick.map(([id, c]) => ({ ...c, id, samples: sampleTimeline(height, p, c, legs) }));
}

/** Resource and elevation samples along the plan, about every 30 s of walking. */
function sampleTimeline(height: Float32Array, p: PlanInput, plan: Plan, legs: Map<string, PlanLeg>): PlanSample[] {
  const out: PlanSample[] = [];
  const f = 1 + p.reserveM;
  const workGps = o2RateGph(p.workPowerW) / 3600;
  let t = 0, a = 0, b = 0, d = 0;
  const push = (cell: number, returnNeedS: number) => out.push({
    cell, t, o2Left: [p.o2BudgetG[0] - a, p.o2BudgetG[1] - b], timeLeft: p.timeBudgetS - t, distM: d, elev: height[cell], returnNeedS,
  });
  for (const leg of plan.legs) {
    const home = leg.to === "home" ? null : legs.get(`${leg.to}>home`);
    let lastT = -Infinity;
    for (let k = 1; k < leg.cells.length; k++) {
      const c = legCost(height, p, [leg.cells[k - 1], leg.cells[k]]);
      t += c.timeS; a += c.o2G[0]; b += c.o2G[1]; d += c.distM;
      if (t - lastT >= 30 || k === leg.cells.length - 1) { push(leg.cells[k], home ? f * home.timeS : 0); lastT = t; }
    }
    if (leg.to !== "home") {
      t += p.dwellS; a += workGps * p.dwellS; b += workGps * p.dwellS;
      push(leg.cells[leg.cells.length - 1], home ? f * home.timeS : 0);
    }
  }
  return out;
}
