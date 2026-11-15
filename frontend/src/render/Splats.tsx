// Gaussian splat reconstructions from rover images (Codex training), placed on the map with a measured
// registration. Loaded lazily (Spark renderer, MIT) and only in the full-detail tier. The orbital terrain
// stays underneath everywhere, so a weak reconstruction never leaves a hole.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { SiteBundle } from "../data/bundle";
import { VERT_EXAG } from "./Terrain";

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";

export interface SplatEntry {
  id: string; name: string; path: string; bytes: number;
  siteX: number; siteY: number; elevation: number; scaleX: number;
  registration: { dx: number; dy: number; rmseM: number; rmse0M: number };
  quality: { validationPSNR: number; validationSSIM: number; newDrivePSNR: number; newDriveSSIM: number; note: string };
  source: string;
}

export function splatsOf(b: SiteBundle): SplatEntry[] {
  return (b.manifest as unknown as { splats?: SplatEntry[] }).splats ?? [];
}

export function Splats({ bundle }: { bundle: SiteBundle }) {
  const { gl, scene } = useThree();
  const list = splatsOf(bundle);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!list.length) return;
    let live = true;
    const added: THREE.Object3D[] = [];
    import("@sparkjsdev/spark").then(({ SparkRenderer, SplatMesh }) => {
      if (!live) return;
      const spark = new SparkRenderer({ renderer: gl });
      scene.add(spark); added.push(spark);
      const { min, max } = bundle.manifest.elevation;
      const zMid = (min + max) / 2;
      for (const s of list) {
        const mesh = new SplatMesh({ url: `${BASE}/${bundle.manifest.siteId}/${s.path}` });
        // Splat frame: x east, y north, z up. Scene: x east, y up, z south.
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        // Navcam is greyscale: tint toward the terrain colour so the patch does not read as snow (display only).
        mesh.recolor = new THREE.Color(1.0, 0.7, 0.5);
        mesh.scale.set(s.scaleX, 1, VERT_EXAG);
        // Lift 0.3 m: the 4 m terrain mesh sits above the rover ground in places (registration RMSE about 0.34 m).
        mesh.position.set(s.siteX, (s.elevation - zMid) * VERT_EXAG + 0.3, -s.siteY);
        scene.add(mesh); added.push(mesh);
      }
      setReady(true);
    }).catch(() => {});
    return () => {
      live = false;
      for (const o of added) { scene.remove(o); (o as unknown as { dispose?: () => void }).dispose?.(); }
    };
  }, [gl, scene, bundle, list]);
  void ready;
  return null;
}
