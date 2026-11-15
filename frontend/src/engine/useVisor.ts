// Shared visor state for the 3D path layer and the helmet overlay, recomputed when the crew moves a few metres.
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/store";
import { loadRocks } from "../data/rocks";
import { forwardPath, pathHazards, suitNow, type Hazard3D, type PathPoint } from "./visor";
import { activePlanOf } from "./useMission";

export interface VisorData {
  path: PathPoint[];
  hazards: Hazard3D[];
  next: { name: string; x: number; y: number; dist: number; bearing: number; rel: number; etaS: number | null; isHome: boolean } | null;
  home: { x: number; y: number; dist: number; bearing: number };
  suit: ReturnType<typeof suitNow> | null;
  rocks: Float32Array | null;
}

export function useVisor(): VisorData | null {
  const bundle = useStore((s) => s.bundle);
  const [rocks, setRocks] = useState<Float32Array | null>(null);
  useEffect(() => { if (bundle) loadRocks(bundle).then(setRocks); }, [bundle]);
  // Re-run when the crew has moved about 2 m, the heading changed, or the plan changed.
  const key = useStore((s) => s.crewPos ? `${Math.round(s.crewPos.x / 2)}|${Math.round(s.crewPos.y / 2)}|${Math.round(s.crewPos.heading / 5)}|${s.activePlan}|${s.plans.length}|${Math.round(s.playheadS / 20)}` : "");
  return useMemo(() => {
    const s = useStore.getState();
    const plan = activePlanOf(s);
    const pos = s.crewPos;
    if (!bundle || !plan || !pos) return null;
    const path = forwardPath(bundle, plan, pos);
    const hazards = pathHazards(path, rocks);
    const hab = bundle.manifest.havens.find((h) => h.type === "habitat")!;
    const nextEv = plan.events.find((e) => e.kind === "arrive" && e.t > s.playheadS);
    const tgt = nextEv ? bundle.manifest.targets.find((t) => t.id === nextEv.stop) : null;
    const goal = tgt ? { name: tgt.name, x: tgt.x, y: tgt.y, isHome: false } : { name: "Habitat airlock", x: hab.x, y: hab.y, isHome: true };
    const brg = (x: number, y: number) => ((Math.atan2(x - pos.x, y - pos.y) * 180) / Math.PI + 360) % 360;
    const b = brg(goal.x, goal.y);
    const t = s.playheadS;
    const atStop = plan.events.some((e, i) => e.kind === "arrive" && e.t <= t && (plan.events[i + 1]?.t ?? Infinity) > t);
    const walking = !atStop && t < plan.totalS;
    const c = s.crew[0];
    return {
      path, hazards, rocks,
      next: { ...goal, dist: Math.hypot(goal.x - pos.x, goal.y - pos.y), bearing: b, rel: ((b - pos.heading + 540) % 360) - 180, etaS: nextEv ? nextEv.t - s.playheadS : plan.totalS - s.playheadS },
      home: { x: hab.x, y: hab.y, dist: Math.hypot(hab.x - pos.x, hab.y - pos.y), bearing: brg(hab.x, hab.y) },
      suit: suitNow(bundle, pos, walking, { v0: s.v0, fMob: c.fMob, massKg: s.bodyMassKg, loadKg: c.loadKg, kG: s.kG, mRestW: s.mRestW }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, rocks, key]);
}
