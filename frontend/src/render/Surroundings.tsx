// Low-detail ground around the 3 km site so the box does not end in a cliff.
// Heights continue the site's edge values outward and relax to the mean, with
// gentle procedural swell. Visual context only: no data is shown out here.
import { useMemo } from "react";
import * as THREE from "three";
import type { SiteBundle } from "../data/bundle";
import { sampleHeight } from "../data/bundle";
import { VERT_EXAG, makeTerrainMaterial, useTerrainUniforms } from "./Terrain";

export function Surroundings({ bundle }: { bundle: SiteBundle }) {
  const { extentM } = bundle.manifest.grid;
  const { min, max } = bundle.manifest.elevation;
  const zMid = (min + max) / 2;
  const half = extentM / 2;

  const geometry = useMemo(() => {
    const size = 26000;
    const g = new THREE.PlaneGeometry(size, size, 220, 220);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const cx = Math.max(-half + 2, Math.min(half - 2, x));
      const cy = Math.max(-half + 2, Math.min(half - 2, y));
      const edgeZ = sampleHeight(bundle, cx, cy);
      const d = Math.max(Math.abs(x) - half, Math.abs(y) - half, 0);
      const t = 1 - Math.exp(-d / 2500);
      const swell = Math.sin(x / 1900) * Math.cos(y / 2300) * 60 + Math.sin((x + y) / 4100) * 90;
      let z = edgeZ * (1 - t) + (zMid + swell) * t;
      const inner = Math.max(Math.abs(x), Math.abs(y));
      if (inner < half) z = sampleHeight(bundle, x, y) - 8;   // just under the site edge band
      if (inner < half - 250) z = min - 60;                   // well under the site
      pos.setZ(i, (z - zMid) * VERT_EXAG - 0.6);
    }
    g.computeVertexNormals();
    const sm = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) sm[i] = pos.getZ(i) / VERT_EXAG + zMid;
    g.setAttribute("smoothElev", new THREE.BufferAttribute(sm, 1));
    return g;
  }, [bundle, half, min, zMid]);

  // Same shader as the site so colour, light and haze match at the seam.
  const material = useMemo(() => makeTerrainMaterial(null, min - zMid, max - zMid), [min, max, zMid]);
  useTerrainUniforms(material, bundle.manifest.crs.origin.lat, false);

  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} />;
}
