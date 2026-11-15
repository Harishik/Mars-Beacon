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
/** Walking by hand in the eye-level views: -1 back, 0 stand, +1 forward along the planned route; fast = hold Shift. */
export const walkInput = { dir: 0, fast: false };
/** Real seconds of mission time per real second when walking by hand: true pace, or a brisk 4x with Shift. */
const WALK_RATE = 1, WALK_FAST = 4;
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
  // Standing still (a stop, or the end): keep the direction they arrived from instead of snapping to north.
  let hx = nx - ax, hy = ny - ay;
  if (hx === 0 && hy === 0) {
    for (let j = k; j > 0; j--) {
      const [px, py] = xy(plan.samples[j - 1].cell), [qx, qy] = xy(plan.samples[j].cell);
      if (px !== qx || py !== qy) { hx = qx - px; hy = qy - py; break; }
    }
    if (hx === 0 && hy === 0 && plan.samples.length > 1) { const [qx, qy] = xy(plan.samples[1].cell); hx = qx - ax; hy = qy - ay; }
  }
  const heading = Math.atan2(hx, hy) * 180 / Math.PI;
  return {
    x, y, heading: Number.isFinite(heading) ? heading : 0,
    o2Left: [a.o2Left[0] + (n.o2Left[0] - a.o2Left[0]) * f, a.o2Left[1] + (n.o2Left[1] - a.o2Left[1]) * f],
  };
}

/** True while the 3D view should follow the live clock: a rehearsal playing or a hand walk in progress. */
export function isLive() { return useStore.getState().playing || walkInput.dir !== 0; }

/** Crew pose for the 3D view this frame: from the live clock while playing, otherwise the shared state. */
export function liveCrewPose(): { x: number; y: number; heading: number } | null {
  const s = useStore.getState();
  if ((s.playing || walkInput.dir !== 0) && s.bundle) {
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
      if (wasPlaying && !s.playing && walkInput.dir === 0 && s.playheadS === loopCommitT && liveClock.t !== s.playheadS) {
        loopCommitT = liveClock.t; s.set({ playheadS: liveClock.t });
      }
      wasPlaying = s.playing || walkInput.dir !== 0;
      if (walkInput.dir !== 0 && !s.playing) {
        const plan = activePlanOf(s);
        if (plan) {
          liveClock.t = Math.max(0, Math.min(plan.totalS, liveClock.t + dt * walkInput.dir * (walkInput.fast ? WALK_FAST : WALK_RATE)));
          if (now - lastCommit >= 1000 / UI_HZ) { loopCommitT = liveClock.t; s.set({ playheadS: liveClock.t }); lastCommit = now; }
        }
      } else if (s.playing) {
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

/** Hold W or the up arrow to walk forward along the route at true pace, S or down to step back, Shift for 4x. */
export function useWalkKeys(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const keys = new Set<string>();
    const update = (e: KeyboardEvent) => {
      const f = keys.has("w") || keys.has("arrowup"), b = keys.has("s") || keys.has("arrowdown");
      walkInput.dir = f && !b ? 1 : b && !f ? -1 : 0;
      walkInput.fast = e.shiftKey;
      if (walkInput.dir !== 0 && useStore.getState().playing) useStore.getState().set({ playing: false });
    };
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (!["w", "s", "arrowup", "arrowdown", "shift"].includes(k)) return;
      if (k !== "shift") { keys.add(k); e.preventDefault(); }
      update(e);
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); update(e); };
    const blur = () => { keys.clear(); walkInput.dir = 0; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); blur(); };
  }, [enabled]);
}
