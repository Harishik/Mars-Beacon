import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { toCell } from "../data/bundle";
import type { EnvelopeParams } from "./envelope";

/** Owns the engine worker; recomputes the envelope whenever an input changes. */
export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const bundle = useStore((s) => s.bundle);
  const inputs = useStore(useShallow((s) => [s.v0, s.slopeLimitDeg, s.reserveM, s.kG, s.mRestW, s.bodyMassKg, s.timeBudgetS, s.timeSpentS, s.crew, s.roverActive]));

  useEffect(() => {
    if (!bundle) return;
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.postMessage({ type: "terrain", height: bundle.height, slope: bundle.slopeDeg });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type !== "envelope" || d.id !== reqId.current) return;
      useStore.getState().setEnvelope({
        margin: d.margin, timeToHaven: d.timeToHaven, ms: d.ms, insideCells: d.insideCells,
        computing: false, version: d.id,
      });
    };
    return () => { w.terminate(); workerRef.current = null; };
  }, [bundle]);

  useEffect(() => {
    const w = workerRef.current;
    if (!bundle || !w) return;
    const s = useStore.getState();
    const m = bundle.manifest;
    const havens = m.havens
      .filter((h) => h.type === "habitat" || (h.type === "rover" && s.roverActive))
      .map((h) => toCell(m, h.x, h.y));
    const params: EnvelopeParams = {
      cols: m.grid.cols, rows: m.grid.rows, cellM: m.grid.liveM,
      slopeLimitDeg: s.slopeLimitDeg, v0: s.v0, kG: s.kG, mRestW: s.mRestW, bodyMassKg: s.bodyMassKg,
      reserveM: s.reserveM, timeBudgetS: s.timeBudgetS, timeSpentS: s.timeSpentS,
      crew: s.crew.map((c) => ({ fMob: c.fMob, loadKg: c.loadKg, o2BudgetG: c.o2BudgetG, o2SpentG: c.o2SpentG })) as EnvelopeParams["crew"],
      havens,
    };
    const id = ++reqId.current;
    s.setEnvelope({ computing: true });
    // Small debounce so dragging a slider does not queue dozens of runs.
    const t = setTimeout(() => { if (id === reqId.current) w.postMessage({ type: "envelope", id, params }); }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, ...inputs]);
}
