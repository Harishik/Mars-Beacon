// Return Envelope: multi-haven reverse Dijkstra on a 16-neighbour lattice,
// minimising paired-crew walking time (the pair walks at the slower member's
// pace), with oxygen per crew member accumulated along the SAME tree path.
// 21_Simulation_and_Physics.md sections 5.1 to 5.3 (tree T only, for now).

import { metabolicPower, o2RateGph } from "./physiology";
// Pair speed below is speed() from physiology.ts inlined for the hot loop.

export interface CrewParams { fMob: number; loadKg: number; o2BudgetG: number; o2SpentG: number }
export interface EnvelopeParams {
  cols: number; rows: number; cellM: number;
  slopeLimitDeg: number;
  v0: number; kG: number; mRestW: number; bodyMassKg: number;
  reserveM: number;           // margin fraction, e.g. 0.25
  timeBudgetS: number; timeSpentS: number;
  crew: [CrewParams, CrewParams];
  havens: [number, number][]; // [col, row]
}
export interface EnvelopeOut {
  timeToHaven: Float32Array;  // seconds; Infinity when no path or beyond the time reach
  margin: Float32Array;       // smallest remaining fraction over all resources; < 0 is outside
  inside: Uint8Array;
  parent: Int32Array;         // next cell on the way home (-1 at a haven or unreached)
  o2A: Float32Array;          // grams of O2 EV1 needs to walk home from each cell
  o2B: Float32Array;
  ms: number;
  insideCells: number;
}

// 8 neighbours plus 8 knight moves. For knight moves, the two cells the edge
// passes over are checked so no edge cuts a blocked corner.
const NB: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];

export function computeEnvelope(height: Float32Array, slopeDeg: Float32Array, p: EnvelopeParams): EnvelopeOut {
  const t0 = performance.now();
  const { cols, rows, cellM } = p;
  const n = cols * rows;
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) blocked[i] = slopeDeg[i] > p.slopeLimitDeg || !Number.isFinite(height[i]) ? 1 : 0;

  const time = new Float32Array(n).fill(Infinity);
  const o2A = new Float32Array(n);
  const o2B = new Float32Array(n);
  const done = new Uint8Array(n);
  const parent = new Int32Array(n).fill(-1);

  // Binary min-heap of (key, node) in typed arrays, lazy deletion.
  let cap = 1 << 20;
  let hk = new Float32Array(cap);
  let hv = new Int32Array(cap);
  let size = 0;
  const push = (k: number, v: number) => {
    if (size >= cap) {
      cap *= 2;
      const nk = new Float32Array(cap); nk.set(hk); hk = nk;
      const nv = new Int32Array(cap); nv.set(hv); hv = nv;
    }
    let i = size++;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (hk[par] <= k) break;
      hk[i] = hk[par]; hv[i] = hv[par]; i = par;
    }
    hk[i] = k; hv[i] = v;
  };
  const pop = (): number => {
    const top = hv[0];
    const k = hk[--size], v = hv[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c]; hv[i] = hv[c]; i = c;
    }
    hk[i] = k; hv[i] = v;
    return top;
  };

  for (const [c, r] of p.havens) {
    const id = r * cols + c;
    if (id < 0 || id >= n || blocked[id]) continue;
    time[id] = 0; push(0, id);
  }

  const [A, B] = p.crew;
  const f = 1 + p.reserveM;
  const tLeft = p.timeBudgetS - p.timeSpentS;
  // No cell needing more than this can be inside, so the search stops there.
  const maxT = tLeft > 0 ? tLeft / f : 0;
  const DXY = NB.map(([dc, dr]) => Math.sqrt(dc * dc + dr * dr) * cellM);
  const norm = 1 / Math.exp(-0.175);
  while (size > 0) {
    const v = pop();
    if (done[v]) continue;
    done[v] = 1;
    const vr = (v / cols) | 0, vc = v - vr * cols;
    const zv = height[v];
    for (let k = 0; k < 16; k++) {
      const dc = NB[k][0], dr = NB[k][1];
      const uc = vc + dc, ur = vr + dr;
      if (uc < 0 || ur < 0 || uc >= cols || ur >= rows) continue;
      const u = ur * cols + uc;
      if (done[u] || blocked[u]) continue;
      if (k >= 8) {
        // Cells crossed by a knight move.
        const ac = Math.abs(dc) === 2 ? vc + dc / 2 : vc;
        const ar = Math.abs(dr) === 2 ? vr + dr / 2 : vr;
        const bc = Math.abs(dc) === 2 ? vc + dc / 2 : vc + dc;
        const br = Math.abs(dr) === 2 ? vr + dr / 2 : vr + dr;
        if (blocked[ar * cols + ac] || blocked[br * cols + bc]) continue;
      }
      // Forward edge u -> v (walking toward the haven), reverse search.
      const dxy = DXY[k];
      const dz = zv - height[u];
      const grade = dz / dxy;
      const ds = Math.sqrt(dxy * dxy + dz * dz);
      const vPair = p.v0 * Math.min(A.fMob, B.fMob) * Math.exp(-3.5 * Math.abs(grade + 0.05)) * norm;
      const dt = ds / vPair;
      const nt = time[v] + dt;
      if (nt < time[u] && nt <= maxT) {
        time[u] = nt;
        parent[u] = v;
        const h = dt / 3600;
        o2A[u] = o2A[v] + o2RateGph(metabolicPower(grade, vPair, p.bodyMassKg, A.loadKg, p.kG, p.mRestW)) * h;
        o2B[u] = o2B[v] + o2RateGph(metabolicPower(grade, vPair, p.bodyMassKg, B.loadKg, p.kG, p.mRestW)) * h;
        push(nt, u);
      }
    }
  }

  // Same-path certification: Spent + (1 + m) * PathCost <= Budget, every resource.
  const margin = new Float32Array(n);
  const inside = new Uint8Array(n);
  const aLeft = A.o2BudgetG - A.o2SpentG;
  const bLeft = B.o2BudgetG - B.o2SpentG;
  let insideCells = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(time[i])) { margin[i] = -1; continue; }
    const mt = tLeft > 0 ? 1 - (f * time[i]) / tLeft : -1;
    const ma = aLeft > 0 ? 1 - (f * o2A[i]) / aLeft : -1;
    const mb = bLeft > 0 ? 1 - (f * o2B[i]) / bLeft : -1;
    const m = Math.min(mt, ma, mb);
    margin[i] = m;
    if (m >= 0) { inside[i] = 1; insideCells++; }
  }
  return { timeToHaven: time, margin, inside, parent, o2A, o2B, ms: performance.now() - t0, insideCells };
}

/** Walk the tree from a cell to its haven: the certified route home, as cell indices. */
export function routeHome(parent: Int32Array, start: number, maxSteps = 5000): number[] {
  const out: number[] = [];
  let c = start;
  for (let i = 0; i < maxSteps && c >= 0; i++) { out.push(c); c = parent[c]; }
  return out;
}
