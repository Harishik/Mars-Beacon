// L1 rover stereo patches: high-resolution ground at waypoints, from Curiosity
// Navcam stereo fused onto the HiRISE terrain (pipeline/reconstruction).
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { SiteBundle } from "../data/bundle";
import { useStore } from "../store/store";
import { VERT_EXAG, makeTerrainMaterial, useTerrainUniforms } from "./Terrain";

/** Must match the console Terrain segment count in Scene.tsx. */
const TERRAIN_SEGMENTS = 448;

export interface PatchEntry {
  id: string; x0: number; y0: number; size: number; res: number; cols: number; rows: number;
  height: string; mask: string;
  validation: { verticalOffsetM: number; rmseM: number; madM: number; points: number; coverage: number };
}

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";

function Patch({ bundle, p, ortho }: { bundle: SiteBundle; p: PatchEntry; ortho: THREE.Texture | null }) {
  const [h, setH] = useState<Float32Array | null>(null);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let live = true;
    const base = `${BASE}/${bundle.manifest.siteId}`;
    fetch(`${base}/${p.height}`).then((r) => r.arrayBuffer()).then((b) => { if (live) setH(new Float32Array(b)); });
    fetch(`${base}/${p.mask}`).then((r) => r.arrayBuffer()).then((b) => { if (live) setMask(new Uint8Array(b)); });
    return () => { live = false; };
  }, [bundle.manifest.siteId, p.height, p.mask]);

  const { min, max } = bundle.manifest.elevation;
  const zMid = (min + max) / 2;
  const E = bundle.manifest.grid.extentM;
  // Height of the rendered terrain mesh (same sampling as Terrain: raster bilinear at the
  // mesh vertices, then linear between vertices), so the patch meets it without a step.
  const meshH = useMemo(() => {
    const seg = TERRAIN_SEGMENTS, step = E / seg;
    const { cols, rows, liveM } = bundle.manifest.grid;
    const ras = (x: number, y: number) => {
      const fc = Math.min(cols - 1.001, Math.max(0, (x + E / 2) / liveM - 0.5));
      const fr = Math.min(rows - 1.001, Math.max(0, (E / 2 - y) / liveM - 0.5));
      const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, ty = fr - r, H = bundle.height;
      return (H[r * cols + c] * (1 - tx) + H[r * cols + c + 1] * tx) * (1 - ty) + (H[(r + 1) * cols + c] * (1 - tx) + H[(r + 1) * cols + c + 1] * tx) * ty;
    };
    return (x: number, y: number) => {
      const gx = (x + E / 2) / step, gy = (y + E / 2) / step;
      const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
      const X0 = ix * step - E / 2, Y0 = iy * step - E / 2;
      const a = ras(X0, Y0), b = ras(X0 + step, Y0), c = ras(X0, Y0 + step), d = ras(X0 + step, Y0 + step);
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  }, [bundle, E]);

  const geometry = useMemo(() => {
    if (!h || !mask) return null;
    // Feathered weight: rover heights inside the stereo coverage, mesh heights outside.
    const w = new Float32Array(p.cols * p.rows);
    const R = 6;
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      let acc = 0, k = 0;
      for (let dr = -R; dr <= R; dr += 2) for (let dc = -R; dc <= R; dc += 2) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= p.rows || cc >= p.cols) { k++; continue; }
        acc += mask[rr * p.cols + cc] / 255; k++;
      }
      const edge = Math.min(r, c, p.rows - 1 - r, p.cols - 1 - c) / R;
      w[r * p.cols + c] = Math.min(acc / k, Math.min(1, edge)) * (mask[r * p.cols + c] ? 1 : 0.6);
    }
    const step = 2; // render at 2 x res (50 cm) to keep the vertex count modest
    const nc = Math.floor(p.cols / step), nr = Math.floor(p.rows / step);
    const g = new THREE.PlaneGeometry(p.size, p.size, nc - 1, nr - 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const sm = new Float32Array(pos.count);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const i = r * nc + c;
      const x = p.x0 + pos.getX(i) + p.size / 2, y = p.y0 + pos.getY(i) + p.size / 2;
      const k = (r * step) * p.cols + c * step;
      const z = w[k] * h[k] + (1 - w[k]) * meshH(x, y);
      pos.setZ(i, (z - zMid) * VERT_EXAG + 0.06);
      sm[i] = z;
      // UVs into the site orthophoto so the same HiRISE albedo drapes the patch.
      uv.setXY(i, (x + E / 2) / E, (E / 2 - y) / E);
    }
    g.setAttribute("smoothElev", new THREE.BufferAttribute(sm, 1));
    g.computeVertexNormals();
    return g;
  }, [h, mask, p, zMid, E, meshH]);

  const material = useMemo(() => {
    const m = makeTerrainMaterial(null, min - zMid, max - zMid);
    m.uniforms.uShowEnvelope.value = 0;
    m.uniforms.uShadows.value = 0;
    return m;
  }, [min, max, zMid]);
  useEffect(() => { material.uniforms.uOrtho.value = ortho; material.uniforms.uHasOrtho.value = ortho ? 1 : 0; }, [material, ortho]);
  // Same Viking colour tint as the site terrain, so the patch does not show as a differently coloured square.
  useEffect(() => {
    const t = new THREE.TextureLoader().load(`${BASE}/${bundle.manifest.siteId}/regional/site_colour.png`, () => {
      material.uniforms.uColourMap.value = t; material.uniforms.uColourMode.value = 2;
    }, undefined, () => {});
    t.colorSpace = THREE.NoColorSpace;
    return () => t.dispose();
  }, [material, bundle.manifest.siteId]);
  useTerrainUniforms(material, bundle.manifest.crs.origin.lat, false);
  useEffect(() => () => { material.dispose(); geometry?.dispose(); }, [material, geometry]);

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[p.x0 + p.size / 2, 0, -(p.y0 + p.size / 2)]} />;
}

export function Patches({ bundle }: { bundle: SiteBundle }) {
  const show = useStore((s) => s.layers.patches);
  const patches = (bundle.manifest as unknown as { patches?: PatchEntry[] }).patches ?? [];
  const [ortho, setOrtho] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!bundle.orthoUrl || !patches.length) return;
    const t = new THREE.TextureLoader().load(bundle.orthoUrl, () => setOrtho(t));
    t.colorSpace = THREE.NoColorSpace;
    return () => t.dispose();
  }, [bundle.orthoUrl, patches.length]);
  if (!show) return null;
  return <>{patches.map((p) => <Patch key={p.id} bundle={bundle} p={p} ortho={ortho} />)}</>;
}
