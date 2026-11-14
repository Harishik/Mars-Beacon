import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { toCell, type SiteBundle } from "../data/bundle";
import type { EnvelopeParams } from "./envelope";
import type { PlanInput } from "./planner";
import { WORK_POWER_W } from "./query";

/** Science value per stop type, a transparent weighting shown in the ledger (ASSUMPTION). */
export const SCIENCE_WEIGHT = { ridge: 0.35, hollow: 0.35, drill: 0.2 } as const;

/** Radius over which a stop's science value is read from the science raster (drill coordinates are approximate). */
export const SCIENCE_RADIUS_M = 12;

/**
 * Science value of a stop from the pipeline's science raster (S = 0.6 ridge/hollow contrast + 0.4 rover context,
 * 0 to 1): the highest value within SCIENCE_RADIUS_M, since the crew samples the best spot near the target.
 * Returns undefined when the bundle has no science layer.
 */
export function stopScience(bundle: SiteBundle, x: number, y: number): number | undefined {
  const S = bundle.science;
  if (!S) return undefined;
  const m = bundle.manifest;
  const [c0, r0] = toCell(m, x, y);
  const R = Math.ceil(SCIENCE_RADIUS_M / m.grid.liveM);
  let best = NaN;
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    if (dr * dr + dc * dc > R * R) continue;
    const r = r0 + dr, c = c0 + dc;
    if (r < 0 || c < 0 || r >= m.grid.rows || c >= m.grid.cols) continue;
    const v = S[r * m.grid.cols + c];
    if (Number.isFinite(v) && !(v <= best)) best = v;
  }
  return Number.isFinite(best) ? Math.round(best * 100) / 100 : undefined;
}

/**
 * Owns the engine worker. The envelope recomputes whenever the shared mission
 * state changes (including while the timeline plays: one job in flight, newest
 * request queued). Plans recompute when the model inputs change.
 */
export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const envId = useRef(0);
  const planId = useRef(0);
  const inFlight = useRef(false);
  const pending = useRef<EnvelopeParams | null>(null);
  const bundle = useStore((s) => s.bundle);
  const envInputs = useStore(useShallow((s) => [s.v0, s.slopeLimitDeg, s.reserveM, s.kG, s.mRestW, s.bodyMassKg, s.timeBudgetS, s.timeSpentS, s.crew, s.roverActive, s.playing]));
  const planInputs = useStore(useShallow((s) => [s.v0, s.slopeLimitDeg, s.reserveM, s.kG, s.mRestW, s.bodyMassKg, s.timeBudgetS, s.dwellMin,
    s.crew[0].loadKg, s.crew[1].loadKg, s.crew[0].fMob, s.crew[1].fMob, s.crew[0].o2BudgetG, s.crew[1].o2BudgetG]));

  const send = (params: EnvelopeParams) => {
    const w = workerRef.current;
    if (!w) return;
    if (inFlight.current) { pending.current = params; return; }
    inFlight.current = true;
    w.postMessage({ type: "envelope", id: ++envId.current, params });
  };

  useEffect(() => {
    if (!bundle) return;
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.postMessage({ type: "terrain", height: bundle.height, slope: bundle.slopeDeg, slopeP90: bundle.slopeP90 });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "envelope") {
        inFlight.current = false;
        useStore.getState().setEnvelope({
          margin: d.margin, timeToHaven: d.timeToHaven, parent: d.parent, o2A: d.o2A, o2B: d.o2B, ms: d.ms, insideCells: d.insideCells, insideP90: d.insideP90, p90Cells: d.p90Cells,
          computing: pending.current !== null, version: d.id,
        });
        if (pending.current) { const p = pending.current; pending.current = null; send(p); }
      } else if (d.type === "plan" && d.id === planId.current) {
        useStore.getState().set({ plans: d.plans, planMs: d.ms, planBusy: false });
      }
    };
    return () => { w.terminate(); workerRef.current = null; inFlight.current = false; pending.current = null; };
  }, [bundle]);

  // Envelope from the current shared state.
  useEffect(() => {
    if (!bundle || !workerRef.current) return;
    const s = useStore.getState();
    const m = bundle.manifest;
    const havens = m.havens
      .filter((h) => h.type === "habitat" || (h.type === "rover" && s.roverActive))
      .map((h) => toCell(m, h.x, h.y));
    s.setEnvelope({ computing: true });
    send({
      cols: m.grid.cols, rows: m.grid.rows, cellM: m.grid.liveM,
      slopeLimitDeg: s.slopeLimitDeg, v0: s.v0, kG: s.kG, mRestW: s.mRestW, bodyMassKg: s.bodyMassKg,
      reserveM: s.reserveM, timeBudgetS: s.timeBudgetS, timeSpentS: s.timeSpentS,
      crew: s.crew.map((c) => ({ fMob: c.fMob, loadKg: c.loadKg, o2BudgetG: c.o2BudgetG, o2SpentG: c.o2SpentG })) as EnvelopeParams["crew"],
      havens,
      p90: !s.playing, // the band doubles the work, so it is skipped while the timeline plays
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, ...envInputs]);

  // Plans from egress, with full budgets.
  useEffect(() => {
    const w = workerRef.current;
    if (!bundle || !w) return;
    const s = useStore.getState();
    const m = bundle.manifest;
    const hab = m.havens.find((h) => h.type === "habitat")!;
    const input: PlanInput = {
      cols: m.grid.cols, rows: m.grid.rows, cellM: m.grid.liveM, slopeLimitDeg: s.slopeLimitDeg,
      v0: s.v0, kG: s.kG, mRestW: s.mRestW, bodyMassKg: s.bodyMassKg, reserveM: s.reserveM,
      timeBudgetS: s.timeBudgetS, o2BudgetG: [s.crew[0].o2BudgetG, s.crew[1].o2BudgetG],
      fMob: [s.crew[0].fMob, s.crew[1].fMob], loadKg: [s.crew[0].loadKg, s.crew[1].loadKg],
      workPowerW: WORK_POWER_W, dwellS: s.dwellMin * 60,
      home: toCell(m, hab.x, hab.y),
      stops: m.targets.map((t) => ({ id: t.id, cell: toCell(m, t.x, t.y), science: stopScience(bundle, t.x, t.y) ?? SCIENCE_WEIGHT[t.type] })),
    };
    s.set({ planBusy: true });
    const id = ++planId.current;
    const t = setTimeout(() => { if (id === planId.current) w.postMessage({ type: "plan", id, input }); }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, ...planInputs]);
}
