import { useEffect } from "react";
import { useStore } from "../store/store";
import type { Plan } from "./planner";
import type { SiteBundle } from "../data/bundle";

/** One Mars hour of local solar time in SI seconds (sol / 24). */
export const MARS_HOUR_S = 88775.2 / 24;

export function activePlanOf(s: { plans: Plan[]; activePlan: Plan["id"] }): Plan | undefined {
  return s.plans.find((p) => p.id === s.activePlan) ?? s.plans[0];
}

/**
 * Live mission clock for the 3D view. While a rehearsal plays it advances every animation frame, whereas the
 * shared store is updated at UI_HZ; the crew figures and the eye-level cameras read this every frame so motion
 * stays smooth while the panels (text, charts) re-render only as often as anyone can read them.
 */
export const liveClock = { t: 0 };
const UI_HZ = 20;
let loopCommitT = NaN; // last playhead the play loop itself wrote; any other change is a seek

export interface CrewPose { x: number; y: number; heading: number; o2Left: [number, number] }

/** Crew position, heading and O2 left at time t (seconds since egress) on a plan, interpolated between samples. */
export function crewPoseAt(plan: Plan, b: SiteBundle, tIn: number): CrewPose | null {
  if (plan.samples.length === 0) return null;
  const t = Math.max(0, Math.min(plan.totalS, tIn));
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
  return {
    x, y, heading: Number.isFinite(heading) ? heading : 0,
    o2Left: [a.o2Left[0] + (n.o2Left[0] - a.o2Left[0]) * f, a.o2Left[1] + (n.o2Left[1] - a.o2Left[1]) * f],
  };
}

/** Crew pose for the 3D view this frame: from the live clock while playing, otherwise the shared state. */
export function liveCrewPose(): { x: number; y: number; heading: number } | null {
  const s = useStore.getState();
  if (s.playing && s.bundle) {
    const plan = activePlanOf(s);
    if (plan) return crewPoseAt(plan, s.bundle, liveClock.t);
  }
  return s.crewPos;
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
    // A playhead the loop did not write (scrub, restart, plan change, shared mission): the live clock jumps to it.
    if (s.playheadS !== loopCommitT) liveClock.t = s.playheadS;
    const plan = activePlanOf(s);
    const b = s.bundle;
    if (!plan || !b || plan.samples.length === 0) return;
    const t = Math.max(0, Math.min(plan.totalS, s.playheadS));
    const pose = crewPoseAt(plan, b, t)!;
    const spent = [Math.max(0, Math.round(s.crew[0].o2BudgetG - pose.o2Left[0])), Math.max(0, Math.round(s.crew[1].o2BudgetG - pose.o2Left[1]))];
    // Keep the same crew object while the whole-gram O2 readings are unchanged, so readers of the crew
    // (panels, envelope inputs) do not re-render needlessly.
    const crew = spent[0] === s.crew[0].o2SpentG && spent[1] === s.crew[1].o2SpentG
      ? s.crew
      : s.crew.map((c, i) => ({ ...c, o2SpentG: spent[i] })) as typeof s.crew;
    useStore.setState({
      timeSpentS: t, crew,
      lmstHours: s.evaStartLmst + t / MARS_HOUR_S,
      crewPos: { x: pose.x, y: pose.y, heading: pose.heading },
      selected: { x: pose.x, y: pose.y, label: "Crew position" },
    });
  }), []);

  // Play loop: the live clock every frame, the shared state at UI_HZ.
  useEffect(() => {
    let raf = 0, last = performance.now(), lastCommit = 0, wasPlaying = false;
    liveClock.t = useStore.getState().playheadS;
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now; // a hidden tab resumes without a jump
      const s = useStore.getState();
      // Paused between two commits: write the exact live time so the panels and the 3D view agree.
      if (wasPlaying && !s.playing && s.playheadS === loopCommitT && liveClock.t !== s.playheadS) {
        loopCommitT = liveClock.t; s.set({ playheadS: liveClock.t });
      }
      wasPlaying = s.playing;
      if (s.playing) {
        const plan = activePlanOf(s);
        if (!plan) s.set({ playing: false });
        else {
          liveClock.t = Math.min(plan.totalS, liveClock.t + dt * s.speed);
          if (liveClock.t >= plan.totalS) { loopCommitT = plan.totalS; s.set({ playheadS: plan.totalS, playing: false }); lastCommit = now; }
          else if (now - lastCommit >= 1000 / UI_HZ) { loopCommitT = liveClock.t; s.set({ playheadS: liveClock.t }); lastCommit = now; }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
