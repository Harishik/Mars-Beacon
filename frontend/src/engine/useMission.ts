import { useEffect } from "react";
import { useStore } from "../store/store";
import type { Plan } from "./planner";

/** One Mars hour of local solar time in SI seconds (sol / 24). */
export const MARS_HOUR_S = 88775.2 / 24;

export function activePlanOf(s: { plans: Plan[]; activePlan: Plan["id"] }): Plan | undefined {
  return s.plans.find((p) => p.id === s.activePlan) ?? s.plans[0];
}

/**
 * Mission clock. The playhead on the active plan is the single source of truth:
 * from it come the crew position, time and oxygen spent, and the local solar time.
 * Every display (console, tablet, helmet) reads these from the same store, and the
 * Return Envelope recomputes from them.
 */
export function useMission() {
  // Derive crew state whenever the playhead or the plan changes.
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.playheadS === prev.playheadS && s.plans === prev.plans && s.activePlan === prev.activePlan && s.evaStartLmst === prev.evaStartLmst) return;
    const plan = activePlanOf(s);
    const b = s.bundle;
    if (!plan || !b || plan.samples.length === 0) return;
    const t = Math.max(0, Math.min(plan.totalS, s.playheadS));
    let k = 0;
    while (k < plan.samples.length - 1 && plan.samples[k + 1].t <= t) k++;
    const a = plan.samples[k], n = plan.samples[Math.min(k + 1, plan.samples.length - 1)];
    const f = n.t > a.t ? (t - a.t) / (n.t - a.t) : 0;
    const { cols, liveM, extentM } = b.manifest.grid;
    const xy = (cell: number) => {
      const r = Math.floor(cell / cols), c = cell - r * cols;
      return [(c + 0.5) * liveM - extentM / 2, extentM / 2 - (r + 0.5) * liveM];
    };
    const [ax, ay] = xy(a.cell), [nx, ny] = xy(n.cell);
    const x = t === 0 ? ax : ax + (nx - ax) * f, y = t === 0 ? ay : ay + (ny - ay) * f;
    const heading = Math.atan2(nx - ax, ny - ay) * 180 / Math.PI;
    const o2a = a.o2Left[0] + (n.o2Left[0] - a.o2Left[0]) * f;
    const o2b = a.o2Left[1] + (n.o2Left[1] - a.o2Left[1]) * f;
    const crew = s.crew.map((c, i) => ({ ...c, o2SpentG: Math.max(0, Math.round(c.o2BudgetG - (i === 0 ? o2a : o2b))) })) as typeof s.crew;
    useStore.setState({
      timeSpentS: t, crew,
      lmstHours: s.evaStartLmst + t / MARS_HOUR_S,
      crewPos: { x, y, heading: Number.isFinite(heading) ? heading : 0 },
      selected: { x, y, label: "Crew position" },
    });
  }), []);

  // Play loop.
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const s = useStore.getState();
      if (s.playing) {
        const plan = activePlanOf(s);
        if (!plan) s.set({ playing: false });
        else {
          const next = s.playheadS + dt * s.speed;
          if (next >= plan.totalS) s.set({ playheadS: plan.totalS, playing: false });
          else s.set({ playheadS: next });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
