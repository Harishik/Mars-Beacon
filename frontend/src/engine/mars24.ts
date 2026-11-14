// Mars24 sunclock algorithm (Allison 1997; Allison and McEwen 2000, NASA GISS).
// UTC to Mars Sol Date, solar longitude Ls, equation of time, local mean and true
// solar time, solar declination, and the sun's zenith and azimuth at a site.
// Checked against the GISS worked examples in contracts/oracle_test_cases.json.

const D2R = Math.PI / 180;
const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface Mars24Result {
  MSD: number; Ls: number; EOT_deg: number; MST_h: number; LMST_h: number; LTST_h: number;
  declination: number; zenith: number; azimuth: number;
}

const PBS_A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
const PBS_TAU = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
const PBS_PHI = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];

export function mars24(utcMs: number, lonEastDeg: number, latDeg: number, ttMinusUtcS = 69.184): Mars24Result {
  const jdUT = 2440587.5 + utcMs / 86400000;
  const jdTT = jdUT + ttMinusUtcS / 86400;
  const dt = jdTT - 2451545.0;
  const M = mod(19.3871 + 0.52402073 * dt, 360);
  const alphaFMS = mod(270.3871 + 0.524038496 * dt, 360);
  let pbs = 0;
  for (let i = 0; i < 7; i++) pbs += PBS_A[i] * Math.cos(D2R * ((0.985626 * dt) / PBS_TAU[i] + PBS_PHI[i]));
  const nuM = (10.691 + 3.0e-7 * dt) * Math.sin(D2R * M) + 0.623 * Math.sin(D2R * 2 * M) + 0.050 * Math.sin(D2R * 3 * M)
    + 0.005 * Math.sin(D2R * 4 * M) + 0.0005 * Math.sin(D2R * 5 * M) + pbs;
  const Ls = mod(alphaFMS + nuM, 360);
  const EOT = 2.861 * Math.sin(D2R * 2 * Ls) - 0.071 * Math.sin(D2R * 4 * Ls) + 0.002 * Math.sin(D2R * 6 * Ls) - nuM;
  const MSD = (jdTT - 2405522.0028779) / 1.0274912517;
  const MST = mod(24 * (MSD + 0 /* prime meridian */), 24);
  const LMST = mod(MST + lonEastDeg / 15, 24);
  const LTST = mod(LMST + EOT / 15, 24);
  const decl = Math.asin(0.42565 * Math.sin(D2R * Ls)) / D2R + 0.25 * Math.sin(D2R * Ls);
  // Hour angle from the subsolar west longitude (Mars24 convention).
  const lonW = mod(-lonEastDeg, 360);
  const subLonW = mod(MST * 15 + EOT + 180, 360);
  const H = D2R * (lonW - subLonW);
  const phi = D2R * latDeg, d = D2R * decl;
  const cosZ = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(phi) * Math.cos(H);
  const Z = Math.acos(Math.max(-1, Math.min(1, cosZ))) / D2R;
  // Azimuth clockwise from north.
  const az = mod(Math.atan2(Math.sin(H), Math.cos(phi) * Math.tan(d) - Math.sin(phi) * Math.cos(H)) / D2R, 360);
  return { MSD, Ls, EOT_deg: EOT, MST_h: MST, LMST_h: LMST, LTST_h: LTST, declination: decl, zenith: Z, azimuth: az };
}
