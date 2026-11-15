import { useMemo } from "react";
import { GroundLine } from "./GroundLine";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { reportAt } from "../engine/query";
import type { SiteBundle } from "../data/bundle";
import { toScene } from "./Assets";

/** The certified route home from the selected point, drawn on the ground, plus a marker. */
export function RouteHome({ bundle, marker = true }: { bundle: SiteBundle; marker?: boolean }) {
  const s = useStore(useShallow((st) => ({
    selected: st.selected, envelope: st.envelope, timeSpentS: st.timeSpentS, timeBudgetS: st.timeBudgetS, reserveM: st.reserveM, crew: st.crew,
  })));
  const data = useMemo(() => {
    if (!s.selected) return null;
    const r = reportAt(bundle, s, s.selected.x, s.selected.y);
    if (!r) return null;
    // Thin the polyline (every 3rd cell) and lift it just above the ground.
    const pts = r.route.filter((_, k) => k % 3 === 0 || k === r.route.length - 1).map(([x, y]) => toScene(bundle, x, y, 2.2));
    return { pts, ok: r.reachable && r.inside && r.stayMin >= 0, reachable: r.reachable };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, s.selected, s.envelope.version, s.timeSpentS, s.timeBudgetS, s.reserveM, s.crew]);

  if (!s.selected) return null;
  const p = toScene(bundle, s.selected.x, s.selected.y);
  const col = !data?.reachable ? "#ff7357" : data.ok ? "#cfe1ff" : "#f4c552";
  return (
    <group>
      {data && data.pts.length > 1 && (
        <>
          <GroundLine points={data.pts} color="#3f74b8" lineWidth={7} transparent opacity={0.45} />
          <GroundLine points={data.pts} color={col} lineWidth={2.5} dashed dashSize={14} gapSize={7} />
        </>
      )}
      {marker && <group position={p} ref={(g) => g?.traverse((o) => o.layers.set(1))}>
        <mesh position={[0, 9, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 18, 6]} />
          <meshBasicMaterial color={col} />
        </mesh>
        <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[7, 9, 40]} />
          <meshBasicMaterial color={col} transparent opacity={0.85} />
        </mesh>
      </group>}
    </group>
  );
}
