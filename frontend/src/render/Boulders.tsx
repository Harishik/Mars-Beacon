// Boulders at their detected positions and sizes (M2 boulder detector on HiRISE shadows, Sahaj).
// Real data drives where each rock is and how big; the rock shape itself is a generic low-poly form.
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SiteBundle } from "../data/bundle";
import { sampleHeight } from "../data/bundle";
import { loadRocks } from "../data/rocks";
import { useStore } from "../store/store";
import { VERT_EXAG } from "./Terrain";


/** Deterministic pseudo-random in [0, 1) per index, so rocks keep their shape between loads. */
const rnd = (i: number, k: number) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

function rockGeometry() {
  // Lumpy, flattened icosphere: a generic boulder shape.
  // 20 triangles per rock: 42,685 rocks stay under a million triangles for phones and integrated graphics.
  const g = new THREE.IcosahedronGeometry(1, 0);
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

/** Boulders are under a pixel from far away: skip drawing them when the camera is high above the site. */
function BoulderLod({ mesh }: { mesh: THREE.InstancedMesh }) {
  useFrame(({ camera }) => { mesh.visible = camera.position.y < 900; });
  return <primitive object={mesh} />;
}

export function Boulders({ bundle }: { bundle: SiteBundle }) {
  const show = useStore((s) => s.layers.boulders);
  const [rocks, setRocks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let live = true;
    loadRocks(bundle).then((r) => { if (live) setRocks(r); });
    return () => { live = false; };
  }, [bundle]);

  const geometry = useMemo(rockGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, metalness: 0, flatShading: true }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  const mesh = useMemo(() => {
    if (!rocks) return null;
    const n = rocks.length / 3;
    const m = new THREE.InstancedMesh(geometry, material, n);
    const { min, max } = bundle.manifest.elevation;
    const zMid = (min + max) / 2;
    const E = bundle.manifest.grid.extentM / 2;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = rocks[i * 3], y = rocks[i * 3 + 1], d = rocks[i * 3 + 2];
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
  }, [rocks, geometry, material, bundle]);
  useEffect(() => () => { mesh?.dispose(); }, [mesh]);

  if (!mesh || !show) return null;
  return <BoulderLod mesh={mesh} />;
}
