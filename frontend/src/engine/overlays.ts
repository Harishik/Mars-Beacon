// Data overlays drawn on the terrain one at a time (the deck's "toggle RGB, thermal, hazard,
// topography by shader channel swapping"). Each overlay is a 0..1 field plus a legend.

import type { SiteBundle } from "../data/bundle";
import type { Tag } from "../data/bundle";
import { slopeAspect, thermalTable, temperatureField, insolationField, THERMAL_DEFAULTS, type ThermalTable } from "./thermal";

export type OverlayId = "none" | "thermal" | "solar" | "science" | "rocks";

export interface OverlayInfo {
  id: Exclude<OverlayId, "none">;
  name: string;
  unit: string;
  min: number; max: number;
  fmt: (v: number) => string;
  tag: Tag;
  source: string;
  /** 0 thermal ramp, 1 solar, 2 science, 3 hazard */
  ramp: number;
}

export const OVERLAYS: OverlayInfo[] = [
  { id: "thermal", name: "Surface temperature", unit: "°C", min: -100, max: 10, fmt: (v) => `${Math.round(v)}`, tag: "DERIVED", ramp: 0,
    source: "1D heat conduction on every slope and aspect, Mars24 sun, dust τ; thermal inertia 350 (REMS range at Gale)" },
  { id: "solar", name: "Solar energy per sol", unit: "kWh/m²", min: 0, max: 5, fmt: (v) => v.toFixed(1), tag: "DERIVED", ramp: 1,
    source: "Direct and diffuse sunlight on the local slope over the chosen sol, through the dust" },
  { id: "science", name: "Science value", unit: "0 to 1", min: 0, max: 1, fmt: (v) => v.toFixed(2), tag: "DERIVED", ramp: 2,
    source: "Pipeline (Sahaj): 0.6 ridge and hollow contrast + 0.4 rover context; spectral and geology terms not yet added" },
  { id: "rocks", name: "Boulder cover", unit: "% area", min: 0, max: 30, fmt: (v) => v.toFixed(0), tag: "DERIVED", ramp: 3,
    source: "M2 boulder detector on HiRISE shadows (rocks of 0.75 m or more); precision not yet measured" },
];

interface Cache {
  bundle: SiteBundle | null;
  slope?: Float32Array; aspect?: Float32Array;
  tableKey?: string; table?: ThermalTable;
  temp?: Float32Array; tempLmst?: number;
  solar?: Float32Array;
}
const cache: Cache = { bundle: null };

function terrain(bundle: SiteBundle) {
  if (cache.bundle !== bundle) {
    const g = bundle.manifest.grid;
    const sa = slopeAspect(bundle.height, g.cols, g.rows, g.liveM);
    Object.assign(cache, { bundle, slope: sa.slope, aspect: sa.aspect, tableKey: undefined, table: undefined, temp: undefined, solar: undefined });
  }
  return { slope: cache.slope!, aspect: cache.aspect! };
}

function table(bundle: SiteBundle, lsDeg: number, tau: number): ThermalTable {
  const key = `${Math.round(lsDeg)}|${tau.toFixed(2)}`;
  if (cache.tableKey !== key || !cache.table) {
    const o = bundle.manifest.crs.origin;
    cache.table = thermalTable({ lsDeg, tau, latDeg: o.lat, lonEastDeg: o.lon, inertia: THERMAL_DEFAULTS.inertia, albedo: THERMAL_DEFAULTS.albedo, emissivity: THERMAL_DEFAULTS.emissivity });
    cache.tableKey = key; cache.temp = undefined; cache.solar = undefined;
  }
  return cache.table;
}

/** Physical values of an overlay field (°C, kWh/m², 0..1, % area), or null if the bundle lacks it. */
export function overlayValues(id: OverlayId, bundle: SiteBundle, lsDeg: number, tau: number, lmstH: number): Float32Array | null {
  if (id === "none") return null;
  if (id === "science") return bundle.science ?? null;
  if (id === "rocks") {
    if (!bundle.rocks) return null;
    const out = new Float32Array(bundle.rocks.length);
    for (let i = 0; i < out.length; i++) out[i] = bundle.rocks[i] * 100;
    return out;
  }
  const { slope, aspect } = terrain(bundle);
  const tab = table(bundle, lsDeg, tau);
  if (id === "thermal") {
    if (!cache.temp || cache.tempLmst !== lmstH) {
      cache.temp = temperatureField(tab, slope, aspect, lmstH, cache.temp);
      for (let i = 0; i < cache.temp.length; i++) cache.temp[i] -= 273.15;
      cache.tempLmst = lmstH;
    }
    return cache.temp;
  }
  if (!cache.solar) {
    cache.solar = insolationField(tab, slope, aspect);
    for (let i = 0; i < cache.solar.length; i++) cache.solar[i] /= 1000;
  }
  return cache.solar;
}

/** The current thermal table (for the flat-ground curve in the legend). */
export function currentThermalTable(): ThermalTable | undefined { return cache.table; }

/** Encode values into 0..255 for the overlay texture (255 = no data). */
export function encodeOverlay(values: Float32Array, info: OverlayInfo, out?: Uint8Array): Uint8Array {
  const res = out ?? new Uint8Array(values.length);
  const span = info.max - info.min;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    res[i] = Number.isFinite(v) ? Math.round(Math.max(0, Math.min(1, (v - info.min) / span)) * 254) : 255;
  }
  return res;
}

/** Surface temperature (°C) at one point and time, without touching the cached map field. */
export function temperatureAt(bundle: SiteBundle, lsDeg: number, tau: number, lmstH: number, cell: number): number {
  const { slope, aspect } = terrain(bundle);
  const tab = table(bundle, lsDeg, tau);
  return temperatureField(tab, slope.subarray(cell, cell + 1), aspect.subarray(cell, cell + 1), lmstH)[0] - 273.15;
}
