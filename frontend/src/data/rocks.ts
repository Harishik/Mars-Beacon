// Detected boulders (M2 on HiRISE shadows), shared by the 3D boulders, the visor hazards and the radar.
import type { SiteBundle } from "./bundle";

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";
interface RocksList { path: string; count: number }
const cache = new Map<string, Promise<Float32Array | null>>();

/** Flat array x, y, diameter (site metres) per boulder, or null when the site has no list. */
export function loadRocks(bundle: SiteBundle): Promise<Float32Array | null> {
  const list = (bundle.manifest as unknown as { rocksList?: RocksList }).rocksList;
  const id = bundle.manifest.siteId;
  if (!list) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, fetch(`${BASE}/${id}/${list.path}`).then((r) => r.arrayBuffer()).then((b) => {
      const dv = new DataView(b);
      const n = Math.min(list.count, Math.floor(b.byteLength / 5));
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        out[i * 3] = dv.getInt16(i * 5, true) / 4;
        out[i * 3 + 1] = dv.getInt16(i * 5 + 2, true) / 4;
        out[i * 3 + 2] = dv.getUint8(i * 5 + 4) / 20;
      }
      return out;
    }).catch(() => null));
  }
  return cache.get(id)!;
}
