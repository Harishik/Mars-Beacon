// Boulders at their detected positions and sizes (M2 boulder detector on HiRISE shadows, Sahaj).
// Real data drives where each rock is and how big; the rock shape itself is a generic low-poly form.
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { SiteBundle } from "../data/bundle";
import { sampleHeight } from "../data/bundle";
import { useStore } from "../store/store";
import { VERT_EXAG } from "./Terrain";

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";

interface RocksList { path: string; count: number }

/** Deterministic pseudo-random in [0, 1) per index, so rocks keep their shape between loads. */
const rnd = (i: number, k: number) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

function rockGeometry() {
  // Lumpy, flattened icosphere: a generic boulder shape.
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = 0.78 + 0.22 * Math.sin(v.x * 5.1 + 1.3) * Math.cos(v.z * 4.3 - 0.7) + 0.12 * Math.sin(v.y * 9.7 + v.x * 3.1);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function Boulders({ bundle }: { bundle: SiteBundle }) {
  const show = useStore((s) => s.layers.boulders);
  const list = (bundle.manifest as unknown as { rocksList?: RocksList }).rocksList;
  const [data, setData] = useState<DataView | null>(null);
  useEffect(() => {
    if (!list) return;
    let live = true;
    fetch(`${BASE}/${bundle.manifest.siteId}/${list.path}`).then((r) => r.arrayBuffer()).then((b) => { if (live) setData(new DataView(b)); }).catch(() => {});
    return () => { live = false; };
  }, [bundle.manifest.siteId, list]);

  const geometry = useMemo(rockGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, metalness: 0, flatShading: true }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  const mesh = useMemo(() => {
    if (!data || !list) return null;
    const n = Math.min(list.count, Math.floor(data.byteLength / 5));
    const m = new THREE.InstancedMesh(geometry, material, n);
    const { min, max } = bundle.manifest.elevation;
    const zMid = (min + max) / 2;
    const E = bundle.manifest.grid.extentM / 2;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = data.getInt16(i * 5, true) / 4, y = data.getInt16(i * 5 + 2, true) / 4, d = data.getUint8(i * 5 + 4) / 20;
      if (Math.abs(x) > E - 2 || Math.abs(y) > E - 2) continue;
      const r = d / 2;
      const h = (sampleHeight(bundle, x, y) - zMid) * VERT_EXAG;
      // Height about 0.6 of the radius, partly buried, as boulders sit on regolith.
      o.position.set(x, h + r * 0.18, -y);
      o.rotation.set((rnd(i, 1) - 0.5) * 0.5, rnd(i, 2) * Math.PI * 2, (rnd(i, 3) - 0.5) * 0.5);
      o.scale.set(r * (0.85 + 0.3 * rnd(i, 4)), r * (0.5 + 0.25 * rnd(i, 5)), r * (0.85 + 0.3 * rnd(i, 6)));
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
      // Slight tone variation between rocks.
      col.setRGB(0.62 + 0.14 * rnd(i, 7), 0.45 + 0.08 * rnd(i, 7), 0.34 + 0.06 * rnd(i, 8));
      m.setColorAt(k, col);
      k++;
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }, [data, list, geometry, material, bundle]);
  useEffect(() => () => { mesh?.dispose(); }, [mesh]);

  if (!mesh || !show) return null;
  return <primitive object={mesh} />;
}
