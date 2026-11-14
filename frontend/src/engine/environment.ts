// Atmosphere, sunlight and radiation for the time controls.
// Equations checked from the team's physics notes; values tagged in the UI.

const D2R = Math.PI / 180;
export const MARS_RADIUS_KM = 3389.5;
export const SCALE_HEIGHT_KM = 11.1;       // atmospheric scale height
export const OBLIQUITY_DEG = 25.19;
export const ECCENTRICITY = 0.0934;
export const LS_PERIHELION_DEG = 251;
export const SOLAR_MEAN_WM2 = 590;         // mean solar constant at 1.524 AU

/** Solar declination from solar longitude Ls (degrees). */
export function declinationDeg(lsDeg: number): number {
  return Math.asin(Math.sin(OBLIQUITY_DEG * D2R) * Math.sin(lsDeg * D2R)) / D2R;
}

/** Top-of-atmosphere irradiance for the Sun-Mars distance at Ls (W/m2). */
export function toaIrradiance(lsDeg: number): number {
  const f = (1 + ECCENTRICITY * Math.cos((lsDeg - LS_PERIHELION_DEG) * D2R)) / (1 - ECCENTRICITY * ECCENTRICITY);
  return SOLAR_MEAN_WM2 * f * f;
}

/** Relative air mass with planetary curvature (spherical shell, scale height H). */
export function airMass(zenithDeg: number): number {
  const r = MARS_RADIUS_KM / SCALE_HEIGHT_KM;
  const c = Math.cos(zenithDeg * D2R);
  return Math.sqrt((r * c) ** 2 + 2 * r + 1) - r * c;
}

/** Column dust optical depth at a surface elevation (km relative to the datum). */
export function tauAtElevation(tauRef: number, elevKm: number): number {
  return tauRef * Math.exp(-elevKm / SCALE_HEIGHT_KM);
}

/** Direct-beam irradiance on a horizontal surface (W/m2). Zero below the horizon. */
export function directIrradiance(lsDeg: number, sunElevDeg: number, tau: number): number {
  if (sunElevDeg <= 0) return 0;
  const z = 90 - sunElevDeg;
  return toaIrradiance(lsDeg) * Math.cos(z * D2R) * Math.exp(-tau * airMass(z));
}

/** Fraction of the direct beam that survives the dust (0..1), used for lighting. */
export function beamTransmission(sunElevDeg: number, tau: number): number {
  if (sunElevDeg <= 0) return 0;
  return Math.exp(-tau * airMass(90 - sunElevDeg));
}

// Radiation: Curiosity RAD surface average (Hassler et al., Science 2014):
// about 0.21 mGy/day absorbed, mean quality factor about 3.05 (about 0.64 mSv/day).
export const RAD_GY_PER_DAY = 0.21e-3;
export const RAD_QUALITY = 3.05;
export const SOL_SECONDS = 88775.2;

/** Dose equivalent (mSv) for a time outside, with an optional storm multiplier (SCENARIO). */
export function evaDoseMsv(seconds: number, stormMultiplier = 1): number {
  const days = seconds / 86400;
  return RAD_GY_PER_DAY * days * RAD_QUALITY * 1000 * stormMultiplier;
}
