// Suited walking and consumables, from 21_Simulation_and_Physics.md section 4.
// Sahaj owns the reference Python and the oracle cases; these must match them.

/** Tobler hiking function shape normalised to flat-ground pace v0 (m/s). */
export function speed(grade: number, v0: number, fMob: number): number {
  return (v0 * fMob * Math.exp(-3.5 * Math.abs(grade + 0.05))) / Math.exp(-0.175);
}

/** Minetti et al. (2002) cost of walking on a gradient, J/(kg m). VERIFY coefficients. */
export function minettiCost(i: number): number {
  const g = Math.max(-0.45, Math.min(0.45, i));
  return 280.5 * g ** 5 - 58.7 * g ** 4 - 76.8 * g ** 3 + 51.9 * g ** 2 + 19.6 * g + 2.5;
}

/** Suited metabolic power, W. */
export function metabolicPower(grade: number, v: number, massKg: number, loadKg: number, kG: number, mRestW: number, eta = 1.2): number {
  return mRestW + kG * eta * minettiCost(grade) * (massKg + loadKg) * v;
}

/** Oxygen use, g/h. 696 W gives about 178 g/h (conversion check only). */
export function o2RateGph(watts: number): number {
  return ((watts * 3600) / 20100) * 1.429;
}
