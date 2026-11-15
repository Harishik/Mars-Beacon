// Ground around the 3 km site from NASA data (Mars Trek): MOLA elevation out to 80 km, so the Gale crater
// rim and Mount Sharp stand on the horizon, and the CTX Gale mosaic coloured with Viking orbital colour
// over the inner 40 km. Heights are joined to the HiRISE site at its edge. Visual context only: no
// planning or data layers run out here. Falls back to a plain continuation when the bundle has no
// regional data (e.g. Jezero).
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { SiteBundle } from "../data/bundle";
import { sampleHeight } from "../data/bundle";
import { VERT_EXAG, makeTerrainMaterial, useTerrainUniforms } from "./Terrain";

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";

interface Regional {
  mola: { path: string; cols: number; rows: number; extentM: number; offsetToSiteM: number };
  ctx: { path: string; extentM: number };
}

function useRegional(bundle: SiteBundle) {
  const [r, setR] = useState<{ meta: Regional; mola: Float32Array } | null>(null);
  useEffect(() => {
    let live = true;
    const base = `${BASE}/${bundle.manifest.siteId}`;
    fetch(`${base}/regional/regional.json`).then((x) => (x.ok ? x.json() : null)).then(async (meta: Regional | null) => {
      if (!meta || !live) return;
      const buf = await fetch(`${base}/${meta.mola.path}`).then((x) => x.arrayBuffer());
      if (live) setR({ meta, mola: new Float32Array(buf) });
    }).catch(() => {});
    return () => { live = false; };
  }, [bundle.manifest.siteId]);
  return r;
}

/** Bilinear MOLA height at site metres, already shifted to the site's datum. */
function molaAt(r: { meta: Regional; mola: Float32Array }, x: number, y: number) {
  const { cols, rows, extentM, offsetToSiteM } = r.meta.mola;
  const fc = Math.min(cols - 1.001, Math.max(0, (x + extentM / 2) / extentM * cols - 0.5));
  const fr = Math.min(rows - 1.001, Math.max(0, (extentM / 2 - y) / extentM * rows - 0.5));
  const c = Math.floor(fc), rr = Math.floor(fr), tx = fc - c, ty = fr - rr, M = r.mola;
  const v = (M[rr * cols + c] * (1 - tx) + M[rr * cols + c + 1] * tx) * (1 - ty) + (M[(rr + 1) * cols + c] * (1 - tx) + M[(rr + 1) * cols + c + 1] * tx) * ty;
  return v + offsetToSiteM;
}

function buildPlane(size: number, seg: number, heightAt: (x: number, y: number) => number, zMid: number) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sm = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const z = heightAt(pos.getX(i), pos.getY(i));
    pos.setZ(i, (z - zMid) * VERT_EXAG);
    sm[i] = z;
  }
  g.computeVertexNormals();
  g.setAttribute("smoothElev", new THREE.BufferAttribute(sm, 1));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // v = 0 at the north edge, like the site rasters
  return g;
}

export function Surroundings({ bundle }: { bundle: SiteBundle }) {
  const { extentM } = bundle.manifest.grid;
  const { min, max } = bundle.manifest.elevation;
  const zMid = (min + max) / 2;
  const half = extentM / 2;
  const reg = useRegional(bundle);

  // Height: inside the box sink below the site; near the box blend from the site edge to MOLA over 1.5 km.
  const heightAt = useMemo(() => (x: number, y: number) => {
    const inner = Math.max(Math.abs(x), Math.abs(y));
    if (inner < half - 250) return min - 60;
    const cx = Math.max(-half + 2, Math.min(half - 2, x)), cy = Math.max(-half + 2, Math.min(half - 2, y));
    const edge = sampleHeight(bundle, cx, cy);
    if (inner < half) return sampleHeight(bundle, x, y) - 8;
    const far = reg ? molaAt(reg, x, y) : zMid;
    const t = Math.min(1, (inner - half) / 1500);
    const s = t * t * (3 - 2 * t);
    return edge * (1 - s) + far * s - 0.6 / VERT_EXAG;
  }, [bundle, half, min, zMid, reg]);

  const inner = useMemo(() => buildPlane(reg ? reg.meta.ctx.extentM : 26000, 256, heightAt, zMid), [heightAt, zMid, reg]);
  // Outer ring: MOLA only, out to 160 km; sinks under the inner 40 km.
  const outer = useMemo(() => {
    if (!reg) return null;
    const ctxHalf = reg.meta.ctx.extentM / 2;
    return buildPlane(reg.meta.mola.extentM, 200, (x, y) => (Math.max(Math.abs(x), Math.abs(y)) < ctxHalf - 900 ? min - 400 : molaAt(reg, x, y) - 3), zMid);
  }, [reg, min, zMid]);

  const matInner = useMemo(() => makeTerrainMaterial(null, min - zMid, max - zMid), [min, max, zMid]);
  const matOuter = useMemo(() => makeTerrainMaterial(null, min - zMid, max - zMid), [min, max, zMid]);
  useTerrainUniforms(matInner, bundle.manifest.crs.origin.lat, false);
  useTerrainUniforms(matOuter, bundle.manifest.crs.origin.lat, false);
  useEffect(() => {
    if (!reg) return;
    const t = new THREE.TextureLoader().load(`${BASE}/${bundle.manifest.siteId}/${reg.meta.ctx.path}`, () => {
      matInner.uniforms.uOrtho.value = t; matInner.uniforms.uHasOrtho.value = 1; matInner.uniforms.uColourMode.value = 1;
    });
    t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    return () => t.dispose();
  }, [reg, matInner, bundle.manifest.siteId]);
  useEffect(() => () => { inner.dispose(); outer?.dispose(); }, [inner, outer]);
  useEffect(() => () => { matInner.dispose(); matOuter.dispose(); }, [matInner, matOuter]);

  return (
    <>
      <mesh geometry={inner} material={matInner} rotation={[-Math.PI / 2, 0, 0]} />
      {outer && <mesh geometry={outer} material={matOuter} rotation={[-Math.PI / 2, 0, 0]} />}
    </>
  );
}
