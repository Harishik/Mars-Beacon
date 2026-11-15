// One-way light time between Earth and Mars for a date: heliocentric positions from the JPL approximate
// Keplerian elements (Standish, valid 1800 to 2050), good to well under 1% in distance for this use.
const D2R = Math.PI / 180;
const AU_KM = 149597870.7, C_KMS = 299792.458;

interface El { a: number; e: number; I: number; L: number; w: number; O: number; da: number; de: number; dI: number; dL: number; dw: number; dO: number }
const EARTH: El = { a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166, w: 102.93768193, O: 0, da: 0.00000562, de: -0.00004392, dI: -0.01294668, dL: 35999.37244981, dw: 0.32327364, dO: 0 };
const MARS: El = { a: 1.52371034, e: 0.0933941, I: 1.84969142, L: -4.55343205, w: -23.94362959, O: 49.55953891, da: 0.00001847, de: 0.00007882, dI: -0.00813131, dL: 19140.30268499, dw: 0.44441088, dO: -0.29257343 };

function position(el: El, T: number): [number, number, number] {
  const a = el.a + el.da * T, e = el.e + el.de * T, I = (el.I + el.dI * T) * D2R, L = el.L + el.dL * T, w = el.w + el.dw * T, O = (el.O + el.dO * T) * D2R;
  const om = w * D2R - O;
  let M = ((L - w) % 360) * D2R;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    so * sI * xp + co * sI * yp,
  ];
}

/** Earth-Mars distance (AU) and one-way light time (s) at a UTC time in milliseconds. */
export function earthMarsLightTime(utcMs: number) {
  const T = (utcMs / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const e = position(EARTH, T), m = position(MARS, T);
  const d = Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]);
  return { distanceAU: d, oneWayS: (d * AU_KM) / C_KMS };
}

/**
 * Heliocentric longitude separation (deg, 0 to 180) between Earth and Mars. Solar events in DONKI are
 * seen from near Earth; when Mars sits far around the Sun, an Earth-facing event says little about Mars.
 */
export function earthMarsSeparationDeg(utcMs: number): number {
  const T = (utcMs / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const e = position(EARTH, T), m = position(MARS, T);
  let d = Math.abs(Math.atan2(m[1], m[0]) - Math.atan2(e[1], e[0])) / D2R;
  if (d > 180) d = 360 - d;
  return d;
}
