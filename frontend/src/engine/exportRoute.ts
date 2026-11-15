// Route export: the active plan as GeoJSON (Mars 2000 sphere, planetocentric east longitude) and as a CSV of
// waypoints about every 10 m, each with elevation, slope, elapsed time, oxygen left and the walk-home need.
import type { SiteBundle } from "../data/bundle";
import type { Plan } from "./planner";

const R_MARS = 3396190;
export const WAYPOINT_SPACING_M = 10;

export function cellXY(b: SiteBundle, cell: number): [number, number] {
  const g = b.manifest.grid, E = g.extentM;
  const r = Math.floor(cell / g.cols), c = cell % g.cols;
  return [-E / 2 + g.liveM * (c + 0.5), E / 2 - g.liveM * (r + 0.5)];
}

export function lonLat(b: SiteBundle, x: number, y: number): [number, number] {
  const o = b.manifest.crs.origin;
  const lat = o.lat + (y / R_MARS) * (180 / Math.PI);
  const lon = o.lon + (x / (R_MARS * Math.cos((o.lat * Math.PI) / 180))) * (180 / Math.PI);
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

export interface Waypoint { n: number; tS: number; distM: number; x: number; y: number; lon: number; lat: number; elevM: number; slopeDeg: number; o2E1G: number; o2E2G: number; timeLeftS: number; walkHomeNeedS: number }

export function waypoints(b: SiteBundle, plan: Plan): Waypoint[] {
  const out: Waypoint[] = [];
  let lastD = -Infinity;
  plan.samples.forEach((s, i) => {
    const last = i === plan.samples.length - 1;
    if (s.distM - lastD < WAYPOINT_SPACING_M && !last) return;
    lastD = s.distM;
    const [x, y] = cellXY(b, s.cell);
    const [lon, lat] = lonLat(b, x, y);
    out.push({ n: out.length + 1, tS: Math.round(s.t), distM: Math.round(s.distM), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, lon, lat,
      elevM: Math.round(b.height[s.cell] * 10) / 10, slopeDeg: Math.round(b.slopeDeg[s.cell] * 10) / 10,
      o2E1G: Math.round(s.o2Left[0]), o2E2G: Math.round(s.o2Left[1]), timeLeftS: Math.round(s.timeLeft), walkHomeNeedS: Math.round(s.returnNeedS) });
  });
  return out;
}

export function routeGeoJSON(b: SiteBundle, plan: Plan, label: string) {
  const m = b.manifest;
  const line = plan.legs.flatMap((l) => l.cells).map((c) => lonLat(b, ...cellXY(b, c)));
  const stop = (id: string) => m.targets.find((t) => t.id === id);
  const hab = m.havens.find((h) => h.type === "habitat")!;
  return {
    type: "FeatureCollection",
    crs: { type: "name", properties: { name: "IAU_2015:49900 (Mars 2000 sphere, planetocentric, east longitude)" } },
    properties: { app: "Mars BEACON", site: m.siteId, siteHash: m.siteHash, plan: label, totalS: Math.round(plan.totalS), distanceM: Math.round(plan.distM),
      minMargin: Math.round(plan.minMargin * 100) / 100, o2UsedG: plan.o2UsedG.map(Math.round), exported: new Date().toISOString(),
      note: "Route from the Mars BEACON engine on the USGS/HiRISE DEM. Planning aid, not a certified traverse." },
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: { kind: "route" } },
      { type: "Feature", geometry: { type: "Point", coordinates: lonLat(b, hab.x, hab.y) }, properties: { kind: "habitat", name: "Habitat" } },
      ...plan.order.map((id, i) => { const t = stop(id)!; return { type: "Feature", geometry: { type: "Point", coordinates: lonLat(b, t.x, t.y) }, properties: { kind: "stop", order: i + 1, id, name: t.name, sol: t.sol } }; }),
    ],
  };
}

export function waypointsCSV(wps: Waypoint[]): string {
  const head = "n,t_s,dist_m,lon_e_deg,lat_deg,x_m,y_m,elev_m,slope_deg,o2_e1_g,o2_e2_g,time_left_s,walk_home_need_s";
  return [head, ...wps.map((w) => [w.n, w.tS, w.distM, w.lon, w.lat, w.x, w.y, w.elevM, w.slopeDeg, w.o2E1G, w.o2E2G, w.timeLeftS, w.walkHomeNeedS].join(","))].join("\n") + "\n";
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
