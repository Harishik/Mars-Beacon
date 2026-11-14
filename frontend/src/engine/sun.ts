// Sun position for a season (solar longitude Ls) and local solar time.
// Declination from Ls; local mean time used as true solar time (equation of time not yet applied).
// The full Mars24 port (Sahaj) replaces this. Tagged ASSUMPTION in the UI.

export interface Sun { elevationDeg: number; azimuthDeg: number; dir: [number, number, number] }

export function sunAt(lmstHours: number, latDeg: number, declDeg = 0): Sun {
  const d2r = Math.PI / 180;
  const H = (lmstHours - 12) * 15 * d2r;           // hour angle
  const lat = latDeg * d2r, dec = declDeg * d2r;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI; // from north, clockwise
  // Scene axes: x east, y up, z south (three.js convention with north = -z).
  const x = Math.cos(el) * Math.sin(az);
  const z = -Math.cos(el) * Math.cos(az);
  return { elevationDeg: el / d2r, azimuthDeg: ((az / d2r) + 360) % 360, dir: [x, Math.sin(el), z] };
}

export function formatLmst(h: number): string {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}

import { mars24 } from "./mars24";

const SOL_MS = 88775.244 * 1000;
const lsDateCache = new Map<number, number>();

/** First UTC date from 15 Nov 2026 onward at which Mars reaches solar longitude `ls` (whole degrees). */
export function dateForLs(ls: number): number {
  const key = Math.round(ls) % 360;
  const hit = lsDateCache.get(key);
  if (hit !== undefined) return hit;
  const start = Date.UTC(2026, 10, 15);
  let best = start, bestErr = 1e9;
  for (let d = 0; d < 700; d++) {
    const t = start + d * 86400000;
    const L = mars24(t, 0, 0).Ls;
    const err = Math.abs(((L - key + 540) % 360) - 180);
    if (err < bestErr) { bestErr = err; best = t; }
  }
  lsDateCache.set(key, best);
  return best;
}

/**
 * Sun for the app's time controls using Mars24: the season slider picks a real date
 * (first date with that Ls), and the clock is local mean solar time at the site.
 */
export function sunMars24(lsDeg: number, lmstHours: number, latDeg: number, lonEastDeg: number): Sun & { ltstH: number; utcMs: number; ls: number } {
  let t = dateForLs(lsDeg);
  // Move within the sol so the site's LMST matches the clock.
  for (let k = 0; k < 2; k++) {
    const m = mars24(t, lonEastDeg, latDeg);
    let dh = lmstHours - m.LMST_h;
    if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
    t += (dh / 24) * SOL_MS;
  }
  const m = mars24(t, lonEastDeg, latDeg);
  const el = (90 - m.zenith) * Math.PI / 180, az = m.azimuth * Math.PI / 180;
  return {
    elevationDeg: 90 - m.zenith, azimuthDeg: m.azimuth,
    dir: [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)],
    ltstH: m.LTST_h, utcMs: t, ls: m.Ls,
  };
}
