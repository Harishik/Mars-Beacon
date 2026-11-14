import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { useStore } from "../store/store";
import type { SiteBundle } from "../data/bundle";
import { Label, toScene } from "./Assets";

/** Curiosity's real traverse from PDS PLACES localizations (HISTORICAL). */
export function CuriosityTraverse({ bundle }: { bundle: SiteBundle }) {
  const show = useStore((s) => s.layers.traverse);
  const route = bundle.manifest.route as { points: [number, number][]; sols?: number[] };
  const pts = useMemo(() => route.points.map(([x, y]) => toScene(bundle, x, y, 1.2)), [bundle, route.points]);
  if (!show || pts.length < 2) return null;
  const last = route.points[route.points.length - 1];
  return (
    <group>
      <Line points={pts} color="#c9b18a" lineWidth={2} dashed dashSize={10} gapSize={6} />
      <group position={toScene(bundle, last[0], last[1])}>
        <Label text={`Curiosity, sol ${route.sols?.[1] ?? ""}`} color="#c9b18a" y={14} />
      </group>
    </group>
  );
}
