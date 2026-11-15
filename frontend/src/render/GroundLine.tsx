import { useEffect, useLayoutEffect, useMemo } from "react";
import type * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

interface Props {
  points: THREE.Vector3[];
  color: string;
  lineWidth?: number;    // screen pixels
  transparent?: boolean;
  opacity?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
}

/**
 * Wide line drawn on the terrain (same look as drei's <Line>, same three.js Line2 underneath).
 *
 * drei's <Line> disposes its material whenever the points change, so every update recompiled the line shader
 * (tens of milliseconds each). The route home changes on every frame of a rehearsal, which made playback stall.
 * Here the material lives as long as the component; a points change only swaps the vertex buffer.
 */
export function GroundLine({ points, color, lineWidth = 1, transparent = false, opacity = 1, dashed = false, dashSize = 1, gapSize = 1 }: Props) {
  const size = useThree((s) => s.size);
  const line = useMemo(() => new Line2(), []);
  const material = useMemo(() => new LineMaterial(), []);
  const geometry = useMemo(() => {
    const g = new LineGeometry();
    const xyz = new Float32Array(points.length * 3);
    points.forEach((p, i) => { xyz[3 * i] = p.x; xyz[3 * i + 1] = p.y; xyz[3 * i + 2] = p.z; });
    g.setPositions(xyz);
    return g;
  }, [points]);

  useLayoutEffect(() => {
    line.geometry = geometry;
    line.material = material;
    if (dashed) line.computeLineDistances();
  }, [line, geometry, material, dashed]);

  useLayoutEffect(() => {
    material.color.set(color);
    material.linewidth = lineWidth;
    material.transparent = transparent;
    material.opacity = opacity;
    material.dashed = dashed;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.resolution.set(size.width, size.height);
  }, [material, color, lineWidth, transparent, opacity, dashed, dashSize, gapSize, size.width, size.height]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <primitive object={line} />;
}
