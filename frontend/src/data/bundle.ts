// Site bundle loader. Reads the manifest (contracts/site_manifest.example.json
// format) and the typed-array rasters it lists. Nothing here hard-codes a file
// name, size or product ID: everything comes from the manifest.

export type Tag = "OBSERVED" | "DERIVED" | "HISTORICAL" | "PREDICTED" | "SCENARIO" | "ASSUMPTION";

export interface ManifestFile {
  name: string; path: string; dtype: "float32" | "uint8" | "uint16" | "image";
  cols: number; rows: number; scale: number; offset: number; sha256: string;
}
export interface ManifestLayer {
  id: string; kind: string; mission: string; instrument?: string; productId: string;
  resolutionM: number; acquired: string; tag: Tag; attribution: string; url: string;
}
export interface ManifestPoint { id: string; x: number; y: number }
export interface Manifest {
  siteId: string; name: string; body: string; version: string; siteHash: string;
  synthetic?: boolean; notice?: string;
  display?: { verticalExaggeration?: number };
  /** Site text shown in the app (science objective and the rover campaign it follows). */
  site?: { name: string; objective: string; objectiveSource: string; rover: string; roverSols: string };
  /** False when the boulder layer is display-only (Jezero: ripple crests detected as rocks). */
  rocksReliable?: boolean;
  crs: { proj4: string; origin: { lat: number; lon: number } };
  grid: { liveM: number; cols: number; rows: number; extentM: number };
  elevation: { min: number; max: number };
  files: ManifestFile[];
  layers: ManifestLayer[];
  havens: (ManifestPoint & { type: "habitat" | "rover" | "shelter" })[];
  targets: (ManifestPoint & { name: string; type: "ridge" | "hollow" | "drill" | "custom"; sol: number | null; source: string })[];
  povImages: unknown[];
  route: { source: string; points: [number, number][]; sols?: number[] };
}

export interface SiteBundle {
  manifest: Manifest;
  height: Float32Array;   // metres, row 0 = north edge
  slopeDeg: Float32Array; // degrees
  slopeP90?: Float32Array;
  rocks?: Float32Array;    // cumulative fractional area covered by rocks >= 0.75 m (M2, HiRISE shadows)
  rockBig?: Float32Array;  // 1 where a rock of 2 m or more was detected // 90th percentile slope from DEM realisations (uncertainty band)
  science?: Float32Array;  // science value 0..1 (pipeline science layer)
  orthoUrl?: string;      // greyscale orthophoto, if the bundle has one
  normalUrl?: string;     // 1 m normal map, if the bundle has one
}

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";
export const DEFAULT_SITE = (import.meta.env.VITE_SITE_ID as string | undefined) ?? "gale-boxwork";
export const SITES = [
  { id: "gale-boxwork", label: "Gale, Mount Sharp boxwork" },
  { id: "jezero", label: "Jezero, crater floor" },
];
/** Site from the address (?site=jezero), else the default. */
export function siteFromUrl(): string {
  const q = new URLSearchParams(window.location.search || window.location.hash.split("?")[1] || "");
  const id = q.get("site");
  return id && SITES.some((s) => s.id === id) ? id : DEFAULT_SITE;
}
export function siteText(m: Manifest) {
  return m.site ?? { name: m.name, objective: "", objectiveSource: "", rover: "the rover", roverSols: "" };
}

async function readRaster(base: string, f: ManifestFile): Promise<Float32Array> {
  const res = await fetch(`${base}/${f.path}`);
  if (!res.ok) throw new Error(`Could not download ${f.path} (HTTP ${res.status}).`);
  const buf = await res.arrayBuffer();
  const n = f.cols * f.rows;
  const raw =
    f.dtype === "float32" ? new Float32Array(buf) :
    f.dtype === "uint16" ? new Uint16Array(buf) :
    new Uint8Array(buf);
  if (raw.length !== n) {
    throw new Error(`${f.path} has ${raw.length} values but the manifest says ${f.cols} x ${f.rows}. Check the bundle version.`);
  }
  const out = new Float32Array(n);
  const nodata = (f as ManifestFile & { nodata?: number }).nodata;
  for (let i = 0; i < n; i++) out[i] = nodata !== undefined && raw[i] === nodata ? (f.name.toLowerCase().includes("slope") ? 90 : NaN) : raw[i] * f.scale + f.offset;
  return out;
}

export async function loadSite(siteId = DEFAULT_SITE): Promise<SiteBundle> {
  const base = `${BASE}/${siteId}`;
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) throw new Error(`No manifest found for site "${siteId}" at ${base}.`);
  const manifest = (await res.json()) as Manifest;
  // Accept both naming styles (fixture: "height"/"slope"; pipeline L0: "height_4m"/"slope4P50"...).
  const find = (...names: string[]) => names.map((n) => manifest.files.find((x) => x.name === n)).find(Boolean);
  const file = (...names: string[]) => {
    const f = find(...names);
    if (!f) throw new Error(`The manifest for ${siteId} has none of: ${names.join(", ")}.`);
    return f;
  };
  // No-go uses the 4 m median slope (Sahaj's rule); the P90 run uses the 90th percentile slope.
  const p90 = find("slope4P90");
  const big = find("rockBig");
  const sci = find("science");
  const rk = find("rocks");
  const [height, slopeDeg, slopeP90, rockBig, science, rocks] = await Promise.all([
    readRaster(base, file("height", "height_4m")),
    readRaster(base, file("slope4P50", "slope", "slope_4m")),
    p90 ? readRaster(base, p90) : Promise.resolve(undefined),
    big ? readRaster(base, big) : Promise.resolve(undefined),
    sci ? readRaster(base, sci) : Promise.resolve(undefined),
    rk ? readRaster(base, rk) : Promise.resolve(undefined),
  ]);
  // Boulders are advisory, not hard blocks: on an independent NASA-affiliated test (Mars-Bench HiRISE boulder
  // polygons) the M2 detector found 20% of boulders of 2 m or more at 49% precision, which does not support
  // blocking routes. They stay visible (3D, map layer, risk summary). Slope remains the hard no-go limit.
  const img = (name: string) => { const f = manifest.files.find((x) => x.name === name); return f ? `${base}/${f.path}` : undefined; };
  const imgAny = (...n: string[]) => n.map(img).find(Boolean);
  return { manifest, height, slopeDeg, slopeP90, science, rocks, rockBig, orthoUrl: imgAny("ortho", "ortho_4096"), normalUrl: imgAny("normal", "normal_2048") };
}

/** Site-frame metres (x east, y north, origin at box centre) to grid column and row. */
export function toCell(m: Manifest, x: number, y: number): [number, number] {
  const { liveM, cols, rows, extentM } = m.grid;
  const c = Math.round((x + extentM / 2) / liveM - 0.5);
  const r = Math.round((extentM / 2 - y) / liveM - 0.5);
  return [Math.min(cols - 1, Math.max(0, c)), Math.min(rows - 1, Math.max(0, r))];
}

/** Bilinear terrain height at site-frame metres. */
export function sampleHeight(b: SiteBundle, x: number, y: number): number {
  const { liveM, cols, rows, extentM } = b.manifest.grid;
  const fc = Math.min(cols - 1.001, Math.max(0, (x + extentM / 2) / liveM - 0.5));
  const fr = Math.min(rows - 1.001, Math.max(0, (extentM / 2 - y) / liveM - 0.5));
  const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, ty = fr - r;
  const h = b.height;
  const a = h[r * cols + c], bb = h[r * cols + c + 1], cc = h[(r + 1) * cols + c], d = h[(r + 1) * cols + c + 1];
  return (a * (1 - tx) + bb * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty;
}
