// Surface temperature over the sol: the thermal layer of the team's physics notes and the
// "transient Fourier heat conduction" step of the architecture deck.
//
//   rho c dT/dt = d/dz (k dT/dz)                       1D conduction into the regolith
//   k dT/dz|0 = (1 - A) S_slope(t) + eps L_down - eps sigma T^4     surface energy balance
//   S_slope = I_dir cos(i) + I_dif (1 + cos g) / 2,   cos(i) = cos z cos g + sin z sin g cos(az_sun - aspect)
//   thermal inertia I = sqrt(k rho c), skin depth d = sqrt(k P / (pi rho c))
//
// Solved for a set of slope and aspect classes (explicit finite differences, run to a repeating
// sol), then looked up per terrain cell. Sun from Mars24, dust from the same tau as the lighting.

import { sunMars24 } from "./sun";
import { airMass, toaIrradiance } from "./environment";

const D2R = Math.PI / 180;
const SIGMA = 5.670374e-8;
export const SOL_S = 88775.244;

export interface ThermalParams {
  lsDeg: number;
  tau: number;            // column dust optical depth at the site
  latDeg: number;
  lonEastDeg: number;
  inertia: number;        // J m^-2 K^-1 s^-1/2
  albedo: number;
  emissivity: number;
}

/** Defaults for the Gale boxwork site. All are inputs the ledger shows and tags. */
export const THERMAL_DEFAULTS = {
  inertia: 350,   // ASSUMPTION within the 265 to 450 range retrieved from REMS ground temperature along Curiosity's traverse
  albedo: 0.22,   // ASSUMPTION: typical Gale floor and Mount Sharp bright-dust albedo (TES range 0.15 to 0.25)
  emissivity: 0.98, // ASSUMPTION
  rhoC: 1.2e6,    // ASSUMPTION: volumetric heat capacity of regolith, J m^-3 K^-1
  atmIR: 0.04,    // ASSUMPTION: down-welling sky infrared as a fraction of noon insolation (KRC convention)
};

export const STEPS_PER_SOL = 384;              // one step every 231 s
export const SLOPES = [0, 6, 12, 18, 24, 32];  // degrees
export const ASPECTS = 8;                      // N, NE, E, SE, S, SW, W, NW (downslope direction)

export interface ThermalTable {
  /** Kelvin, [slopeIdx][aspectIdx][step]; slope 0 repeats the flat result in every aspect. */
  T: Float32Array;
  /** Absorbed-before-albedo insolation per sol on each class, Wh/m^2. */
  insolation: Float32Array;
  params: ThermalParams;
  flatMinK: number; flatMaxK: number;
}

interface SunStep { cz: number; sz: number; az: number; dir: number; dif: number }

/** Sun position and beam/diffuse irradiance for every step of one sol. */
function sunSteps(p: ThermalParams): SunStep[] {
  const out: SunStep[] = [];
  const toa = toaIrradiance(p.lsDeg);
  for (let k = 0; k < STEPS_PER_SOL; k++) {
    const lmst = (24 * k) / STEPS_PER_SOL;
    const s = sunMars24(p.lsDeg, lmst, p.latDeg, p.lonEastDeg);
    const el = s.elevationDeg;
    if (el <= 0) { out.push({ cz: 0, sz: 1, az: 0, dir: 0, dif: 0 }); continue; }
    const z = (90 - el) * D2R;
    const cz = Math.cos(z);
    const beam = toa * Math.exp(-p.tau * airMass(90 - el));   // normal to the beam
    // Diffuse sky light: dust scatters strongly forward with single-scattering albedo about 0.9,
    // so about three quarters of the light removed from the beam still reaches the ground (ASSUMPTION).
    const dif = Math.max(0, 0.75 * toa * cz * (1 - Math.exp(-p.tau * airMass(90 - el))));
    out.push({ cz, sz: Math.sin(z), az: s.azimuthDeg * D2R, dir: beam, dif });
  }
  return out;
}

/** Flux on a slope (W/m^2) for one step. aspect = downslope azimuth, clockwise from north. */
function slopeFlux(s: SunStep, slopeDeg: number, aspectRad: number): number {
  if (s.dir === 0 && s.dif === 0) return 0;
  const g = slopeDeg * D2R;
  const cosi = s.cz * Math.cos(g) + s.sz * Math.sin(g) * Math.cos(s.az - aspectRad);
  return s.dir * Math.max(0, cosi) + s.dif * (1 + Math.cos(g)) / 2;
}

/** 1D column to a repeating sol. Returns surface temperature per step. */
function column(flux: Float32Array, p: ThermalParams, noonFlat: number): Float32Array {
  const rhoC = THERMAL_DEFAULTS.rhoC;
  const k = (p.inertia * p.inertia) / rhoC;
  const dt = SOL_S / STEPS_PER_SOL;
  const skin = Math.sqrt((k * SOL_S) / (Math.PI * rhoC));
  // Layers to 6 skin depths; dz chosen for explicit stability (r = k dt / (rhoC dz^2) <= 0.45).
  const dzMin = Math.sqrt((k * dt) / (rhoC * 0.45));
  const N = Math.max(12, Math.ceil((6 * skin) / dzMin));
  const dz = (6 * skin) / N;
  const r = (k * dt) / (rhoC * dz * dz);
  const Lsky = THERMAL_DEFAULTS.atmIR * noonFlat;
  // Start from radiative equilibrium with the mean flux.
  let mean = 0; for (let i = 0; i < flux.length; i++) mean += flux[i];
  mean /= flux.length;
  const T0 = Math.pow(((1 - p.albedo) * mean + p.emissivity * Lsky) / (p.emissivity * SIGMA), 0.25);
  const T = new Float64Array(N + 1).fill(T0);
  const Tn = new Float64Array(N + 1);
  const out = new Float32Array(STEPS_PER_SOL);
  const SOLS = 12;
  for (let sol = 0; sol < SOLS; sol++) {
    for (let st = 0; st < STEPS_PER_SOL; st++) {
      // Interior: explicit heat equation. Bottom: zero flux.
      for (let j = 1; j < N; j++) Tn[j] = T[j] + r * (T[j + 1] - 2 * T[j] + T[j - 1]);
      Tn[N] = Tn[N - 1];
      // Surface: half-cell energy balance (net radiative flux minus conduction down).
      const qNet = (1 - p.albedo) * flux[st] + p.emissivity * Lsky - p.emissivity * SIGMA * Math.pow(T[0], 4);
      const qCond = (k * (T[0] - T[1])) / dz;
      Tn[0] = T[0] + ((qNet - qCond) * dt) / (rhoC * dz * 0.5);
      for (let j = 0; j <= N; j++) T[j] = Tn[j];
      if (sol === SOLS - 1) out[st] = T[0];
    }
  }
  return out;
}

export function thermalTable(p: ThermalParams): ThermalTable {
  const sun = sunSteps(p);
  const noonFlat = sun.reduce((m, s) => Math.max(m, slopeFlux(s, 0, 0)), 0);
  const nS = SLOPES.length;
  const T = new Float32Array(nS * ASPECTS * STEPS_PER_SOL);
  const insolation = new Float32Array(nS * ASPECTS);
  const dtH = 24.6597 / STEPS_PER_SOL;
  for (let si = 0; si < nS; si++) {
    for (let ai = 0; ai < ASPECTS; ai++) {
      if (si === 0 && ai > 0) {
        T.copyWithin((si * ASPECTS + ai) * STEPS_PER_SOL, 0, STEPS_PER_SOL);
        insolation[ai] = insolation[0];
        continue;
      }
      const asp = (ai * 360) / ASPECTS * D2R;
      const flux = new Float32Array(STEPS_PER_SOL);
      let wh = 0;
      for (let st = 0; st < STEPS_PER_SOL; st++) { flux[st] = slopeFlux(sun[st], SLOPES[si], asp); wh += flux[st] * dtH; }
      T.set(column(flux, p, noonFlat), (si * ASPECTS + ai) * STEPS_PER_SOL);
      insolation[si * ASPECTS + ai] = wh;
    }
  }
  let mn = Infinity, mx = -Infinity;
  for (let st = 0; st < STEPS_PER_SOL; st++) { mn = Math.min(mn, T[st]); mx = Math.max(mx, T[st]); }
  return { T, insolation, params: p, flatMinK: mn, flatMaxK: mx };
}

/** Slope (deg) and downslope aspect (rad, clockwise from north) per cell from the height grid. Row 0 is north. */
export function slopeAspect(height: Float32Array, cols: number, rows: number, cellM: number) {
  const slope = new Float32Array(cols * rows), aspect = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cl = Math.max(0, c - 1), cr = Math.min(cols - 1, c + 1), ru = Math.max(0, r - 1), rd = Math.min(rows - 1, r + 1);
    const dzdx = (height[r * cols + cr] - height[r * cols + cl]) / ((cr - cl) * cellM);      // east
    const dzdy = (height[ru * cols + c] - height[rd * cols + c]) / ((rd - ru) * cellM);      // north
    const i = r * cols + c;
    slope[i] = Math.atan(Math.hypot(dzdx, dzdy)) / D2R;
    // Downslope direction points along -grad.
    aspect[i] = Math.atan2(-dzdx, -dzdy);
    if (aspect[i] < 0) aspect[i] += 2 * Math.PI;
  }
  return { slope, aspect };
}

function classWeights(slopeDeg: number, aspectRad: number) {
  const s = Math.min(slopeDeg, SLOPES[SLOPES.length - 1]);
  let si = 0; while (si < SLOPES.length - 2 && s > SLOPES[si + 1]) si++;
  const ts = (s - SLOPES[si]) / (SLOPES[si + 1] - SLOPES[si]);
  const af = (aspectRad / (2 * Math.PI)) * ASPECTS;
  const a0 = Math.floor(af) % ASPECTS, a1 = (a0 + 1) % ASPECTS, ta = af - Math.floor(af);
  return { si, ts, a0, a1, ta };
}

/** Surface temperature (K) of every cell at a local mean solar time. */
export function temperatureField(tab: ThermalTable, slope: Float32Array, aspect: Float32Array, lmstH: number, out?: Float32Array): Float32Array {
  const res = out ?? new Float32Array(slope.length);
  const f = ((lmstH / 24) * STEPS_PER_SOL) % STEPS_PER_SOL;
  const k0 = Math.floor(f), k1 = (k0 + 1) % STEPS_PER_SOL, tk = f - k0;
  const at = (si: number, ai: number) => {
    const b = (si * ASPECTS + ai) * STEPS_PER_SOL;
    return tab.T[b + k0] * (1 - tk) + tab.T[b + k1] * tk;
  };
  for (let i = 0; i < slope.length; i++) {
    const { si, ts, a0, a1, ta } = classWeights(slope[i], aspect[i]);
    const lo = at(si, a0) * (1 - ta) + at(si, a1) * ta;
    const hi = at(si + 1, a0) * (1 - ta) + at(si + 1, a1) * ta;
    res[i] = lo * (1 - ts) + hi * ts;
  }
  return res;
}

/** Insolation per sol (Wh/m^2) of every cell, before albedo: solar energy available to a panel lying on the ground. */
export function insolationField(tab: ThermalTable, slope: Float32Array, aspect: Float32Array): Float32Array {
  const res = new Float32Array(slope.length);
  for (let i = 0; i < slope.length; i++) {
    const { si, ts, a0, a1, ta } = classWeights(slope[i], aspect[i]);
    const g = (s: number, a: number) => tab.insolation[s * ASPECTS + a];
    res[i] = (g(si, a0) * (1 - ta) + g(si, a1) * ta) * (1 - ts) + (g(si + 1, a0) * (1 - ta) + g(si + 1, a1) * ta) * ts;
  }
  return res;
}

/** Flat-ground temperature curve over the sol (K), for charts. */
export function flatCurve(tab: ThermalTable): Float32Array {
  return tab.T.slice(0, STEPS_PER_SOL);
}
