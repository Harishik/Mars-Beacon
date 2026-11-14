// PLACEHOLDER sun position until Sahaj's Mars24 port lands (21_Simulation_and_Physics.md section 7).
// Assumes solar declination 0 (equinox) and LMST = true solar time. Tagged ASSUMPTION in the UI.

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
