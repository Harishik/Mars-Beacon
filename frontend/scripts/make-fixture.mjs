// Writes a SYNTHETIC placeholder site bundle in the format of
// contracts/site_manifest.example.json, so the app runs before Sahaj's real
// Gale bundle exists. The terrain is invented (boxwork-like ridges on a
// north-facing slope). It is NOT Mars data and the manifest says so.
//
// Usage: npm run fixture   (writes ../fixtures/bundle/gale-synthetic/)

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "fixtures", "bundle", "gale-synthetic");
mkdirSync(out, { recursive: true });

const N = 750;          // cells per side
const CELL = 4;         // metres
const EXTENT = N * CELL;

// Seeded PRNG (mulberry32) so the fixture is identical on every machine.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261115);

// Value noise with smooth interpolation.
function makeNoise(size) {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd() * 2 - 1;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const at = (i, j) => g[((j % size + size) % size) * size + ((i % size + size) % size)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
  };
}
const n1 = makeNoise(256), n2 = makeNoise(256), n3 = makeNoise(256);
const fbm = (x, y) => n1(x, y) * 0.5 + n2(x * 2.1, y * 2.1) * 0.25 + n3(x * 4.3, y * 4.3) * 0.125;

// Boxwork: a polygonal network of thin ridges. Approximate with the distance
// to the nearest edge of a jittered Voronoi diagram (F2 - F1).
const SITES = [];
const GRID = 28; // about 107 m spacing
for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
  SITES.push([(i + 0.15 + rnd() * 0.7) / GRID * EXTENT, (j + 0.15 + rnd() * 0.7) / GRID * EXTENT]);
}
function voronoiEdge(x, y) {
  const gi = Math.floor(x / EXTENT * GRID), gj = Math.floor(y / EXTENT * GRID);
  let f1 = Infinity, f2 = Infinity;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const i = gi + di, j = gj + dj;
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
    const [sx, sy] = SITES[j * GRID + i];
    const d = Math.hypot(x - sx, y - sy);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}

const height = new Float32Array(N * N);
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const x = (c + 0.5) * CELL;           // east
    const y = (N - r - 0.5) * CELL;       // north (row 0 is the north edge)
    // Regional slope rising to the south (toward the mountain), plus broad swells.
    let z = -3620 + (EXTENT - y) * 0.055 + fbm(x / 600, y / 600) * 38;
    // A scarp and a channel give the planner something to route around.
    const scarp = Math.tanh((y - 1650 - 140 * Math.sin(x / 420)) / 22);
    z += scarp * 9;
    z -= Math.exp(-(((x - 2150 - 90 * Math.sin(y / 300)) / 60) ** 2)) * 14;
    // Boxwork ridges: about 5 m wide, 1 to 2.5 m high, in the middle band.
    const band = Math.exp(-(((y - 1500) / 900) ** 2));
    const e = voronoiEdge(x, y);
    z += band * (1.0 + 1.5 * (0.5 + 0.5 * n2(x / 90, y / 90))) * Math.exp(-((e / 4.5) ** 2));
    // Small-scale roughness.
    z += fbm(x / 40, y / 40) * 0.8;
    height[r * N + c] = z;
  }
}
// A few steep buttes (blocked ground).
for (let k = 0; k < 6; k++) {
  const bx = 300 + rnd() * 2400, by = 300 + rnd() * 2400, br = 40 + rnd() * 70;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = (c + 0.5) * CELL, y = (N - r - 0.5) * CELL;
    const d = Math.hypot(x - bx, y - by) / br;
    if (d < 1.6) height[r * N + c] += 30 / (1 + Math.exp((d - 1) * 9));
  }
}

// Slope (degrees) by Horn's method, stored as uint8 with scale 0.1 deg.
const slope = new Uint8Array(N * N);
const H = (r, c) => height[Math.min(N - 1, Math.max(0, r)) * N + Math.min(N - 1, Math.max(0, c))];
let zmin = Infinity, zmax = -Infinity;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const z = height[r * N + c]; if (z < zmin) zmin = z; if (z > zmax) zmax = z;
  const dzdx = ((H(r - 1, c + 1) + 2 * H(r, c + 1) + H(r + 1, c + 1)) - (H(r - 1, c - 1) + 2 * H(r, c - 1) + H(r + 1, c - 1))) / (8 * CELL);
  const dzdy = ((H(r + 1, c - 1) + 2 * H(r + 1, c) + H(r + 1, c + 1)) - (H(r - 1, c - 1) + 2 * H(r - 1, c) + H(r - 1, c + 1))) / (8 * CELL);
  const deg = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
  slope[r * N + c] = Math.min(255, Math.round(deg / 0.1 > 255 ? 255 : deg / 0.1));
}

const sha = (buf) => createHash("sha256").update(Buffer.from(buf.buffer)).digest("hex");
writeFileSync(join(out, "height_4m.f32"), Buffer.from(height.buffer));
writeFileSync(join(out, "slope_4m.u8"), Buffer.from(slope.buffer));

const toXY = (c, r) => ({ x: Math.round((c + 0.5) * CELL - EXTENT / 2), y: Math.round(EXTENT / 2 - (r + 0.5) * CELL) });
const manifest = {
  siteId: "gale-synthetic",
  name: "Synthetic placeholder (Gale boxwork layout)",
  body: "Mars",
  version: "0.0.1-fixture",
  synthetic: true,
  notice: "Invented terrain for development only. Replace with Sahaj's real Gale bundle. Not Mars data.",
  siteHash: sha(height).slice(0, 16),
  crs: { proj4: "local ENU, metres, origin at box centre (fixture)", origin: { lat: -4.86, lon: 137.32 }, datum: "sphere R=3396190 m", lonDomain: "-180..180" },
  grid: { liveM: CELL, cols: N, rows: N, extentM: EXTENT },
  elevation: { min: Number(zmin.toFixed(2)), max: Number(zmax.toFixed(2)) },
  files: [
    { name: "height", path: "height_4m.f32", dtype: "float32", cols: N, rows: N, scale: 1, offset: 0, sha256: sha(height) },
    { name: "slope", path: "slope_4m.u8", dtype: "uint8", cols: N, rows: N, scale: 0.1, offset: 0, sha256: sha(slope) }
  ],
  layers: [
    { id: "dem", kind: "topographic", mission: "MRO", instrument: "HiRISE (USGS merged DEM)", productId: "MSL_Gale_DEM_Mosaic_1m_v3 (pending)", resolutionM: 1, acquired: "various", tag: "SCENARIO", attribution: "Placeholder until USGS Astrogeology product is baked", url: "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" },
    { id: "slope", kind: "topographic", mission: "Derived", instrument: "Horn 3x3 on the DEM", productId: "slope_4m", resolutionM: 4, acquired: "computed", tag: "DERIVED", attribution: "Mars BEACON pipeline", url: "" },
    { id: "ortho", kind: "optical", mission: "MRO", instrument: "HiRISE", productId: "MSL_Gale_Orthophoto_Mosaic_25cm_v3 (pending)", resolutionM: 0.25, acquired: "various", tag: "SCENARIO", attribution: "NASA/JPL/University of Arizona; USGS", url: "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm" },
    { id: "envelope", kind: "operations", mission: "Engine", instrument: "Reverse Dijkstra, paired crew", productId: "live", resolutionM: 4, acquired: "live", tag: "DERIVED", attribution: "Mars BEACON engine", url: "" }
  ],
  patches: [],
  splats: [],
  havens: [
    { id: "hab", type: "habitat", ...toXY(250, 600) },
    { id: "rover", type: "rover", ...toXY(520, 300) }
  ],
  targets: [
    { id: "ridge-a", name: "Ridge A (placeholder)", type: "ridge", ...toXY(330, 470), sol: null, source: "fixture" },
    { id: "hollow-a", name: "Hollow A (placeholder)", type: "hollow", ...toXY(350, 455), sol: null, source: "fixture" },
    { id: "ridge-b", name: "Ridge B (placeholder)", type: "ridge", ...toXY(560, 260), sol: null, source: "fixture" },
    { id: "drill", name: "Drill site (placeholder)", type: "drill", ...toXY(410, 380), sol: null, source: "fixture" }
  ],
  povImages: [],
  route: { source: "fixture", points: [] }
};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote synthetic bundle to ${out}  z ${zmin.toFixed(1)}..${zmax.toFixed(1)} m`);
