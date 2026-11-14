import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { useStore } from "../store/store";
import type { SiteBundle } from "../data/bundle";
import { activePlanOf } from "../engine/useMission";
import { Label, toScene } from "./Assets";

/** The active plan drawn on the terrain: route line and numbered stops. Same in every display. */
export function PlanRoute({ bundle }: { bundle: SiteBundle }) {
  const plans = useStore((s) => s.plans);
  const activeId = useStore((s) => s.activePlan);
  const plan = activePlanOf({ plans, activePlan: activeId });
  const { cols, liveM, extentM } = bundle.manifest.grid;
  const pts = useMemo(() => {
    if (!plan) return [];
    const cells = plan.legs.flatMap((l, i) => (i ? l.cells.slice(1) : l.cells));
    return cells.filter((_, k) => k % 3 === 0 || k === cells.length - 1).map((c) => {
      const r = Math.floor(c / cols), cc = c - r * cols;
      return toScene(bundle, (cc + 0.5) * liveM - extentM / 2, extentM / 2 - (r + 0.5) * liveM, 1.6);
    });
  }, [plan, bundle, cols, liveM, extentM]);
  if (!plan || pts.length < 2) return null;
  const targets = bundle.manifest.targets;
  return (
    <group>
      <Line points={pts} color="#0b1730" lineWidth={6} transparent opacity={0.55} />
      <Line points={pts} color="#f3efe6" lineWidth={2.2} />
      {plan.order.map((id, i) => {
        const t = targets.find((x) => x.id === id);
        if (!t) return null;
        return <group key={id} position={toScene(bundle, t.x, t.y)}><Label text={`${i + 1}`} color="#f3efe6" y={22} /></group>;
      })}
    </group>
  );
}
