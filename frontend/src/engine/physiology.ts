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

// Cooling water and suit battery. Both come from the same metabolic power as O2,
// so the cost of any path follows from the O2 and time already summed along it.

/** Latent heat of vaporisation of water near 20 °C, J/g (physical constant). */
export const WATER_LATENT_J_PER_G = 2454;
/** Suit electrical load (fans, pump, radio, displays), W. ASSUMPTION: VERIFY against NASA xEMU figures. */
export const SUIT_ELEC_W = 60;
/** Joules of metabolic energy per gram of O2, the inverse of o2RateGph (20.1 kJ per litre, 1.429 g per litre). */
const J_PER_G_O2 = 20100 / 1.429;

/**
 * Cooling water, g/h. All metabolic heat plus the suit's electrical heat is rejected by
 * evaporating water (membrane evaporator, which works in Mars air). Heat lost through the
 * suit wall is ignored, so this overstates use: the conservative side for a return check.
 */
export function waterRateGph(watts: number): number {
  return ((watts + SUIT_ELEC_W) * 3600) / WATER_LATENT_J_PER_G;
}

/** Cooling water (g) for the O2 (g) used over a stretch of time (s). Exact for this model. */
export function waterFromO2(o2G: number, timeS: number): number {
  return (o2G * J_PER_G_O2 + SUIT_ELEC_W * timeS) / WATER_LATENT_J_PER_G;
}

/** Suit battery energy (Wh) drawn over a stretch of time (s). */
export function batteryWhFor(timeS: number): number {
  return (SUIT_ELEC_W * timeS) / 3600;
}

/** Water and battery left for one suit, from its O2 used and the EVA time so far. */
export function consumablesLeft(c: { o2SpentG: number; waterBudgetG: number; batteryBudgetWh: number }, timeSpentS: number) {
  return {
    waterLeftG: c.waterBudgetG - waterFromO2(c.o2SpentG, timeSpentS),
    batteryLeftWh: c.batteryBudgetWh - batteryWhFor(timeSpentS),
  };
}
