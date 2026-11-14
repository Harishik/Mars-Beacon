"""Calibrate kG (gravity + suit factor) in M = mRest + kG * eta * Cw(i) * (W + L) * v  (plan 21 section 4.2).

Data: NASA/TM-2010-216138 (Chappell, Norcross et al. 2010), Figure 10: IST-1 suited metabolic rate (VO2, ml/min/kg)
versus speed at gravity levels 0.12 to 0.32 g, constant suited mass 121 kg, 29.6 kPa, level treadmill, 2nd-order fits.
NTRS: https://ntrs.nasa.gov/citations/20110001417
Values below are read BY EYE from the 0.32 g fit curve (the closest tested level to Mars, 0.38 g), at walking
speeds only (running starts above about 1.5 m/s). Reading error about +/- 1 ml/min/kg (+/- 6 percent).
Because metabolic rate rises with gravity in that figure, a fit at 0.32 g is a slight UNDERestimate for Mars.

Conversion: P [W] = VO2 [ml/min/kg] * W_body [kg] / 1000 * 20100 [J/L O2] / 60, with W_body = 80 kg (VO2 is per kg
of body mass). Level treadmill: i = 0, eta = 1.0 (hard surface).
"""
import json, os, sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from walking import Assumptions, cost_of_walking

POINTS_032G = [(0.7, 14.0), (1.0, 18.5), (1.2, 21.0)]  # (speed m/s, VO2 ml/min/kg) read from Fig. 10, 0.32 g fit


def main():
    A = Assumptions()
    W, L, cw0 = A.bodyMassKg, A.loadKg, cost_of_walking(0.0)
    rows = []
    for v, vo2 in POINTS_032G:
        P = vo2 * W / 1000 * 20100 / 60
        kg = (P - A.mRestW) / (1.0 * cw0 * (W + L) * v)
        rows.append({"speed": v, "vo2_ml_min_kg": vo2, "power_W": round(P, 1), "kG": round(kg, 4)})
    ks = np.array([r["kG"] for r in rows])
    # least-squares single kG over the points
    X = np.array([cw0 * (W + L) * v for v, _ in POINTS_032G])
    Y = np.array([r["power_W"] - A.mRestW for r in rows])
    k_ls = float((X @ Y) / (X @ X))
    pred = A.mRestW + k_ls * X
    rel = float(np.max(np.abs(pred - np.array([r["power_W"] for r in rows])) / np.array([r["power_W"] for r in rows])))
    res = {"source": "NASA/TM-2010-216138 Fig. 10, IST-1, 0.32 g fit, read by eye", "gravityLevel_g": 0.32,
           "points": rows, "kG_leastSquares": round(k_ls, 3), "kG_range_points": [float(ks.min()), float(ks.max())],
           "maxRelativeFitError": round(rel, 3), "readingError": "+/- 6 percent in VO2",
           "note": "0.32 g is the closest tested level to Mars (0.38 g); Mars cost is expected to be slightly higher. "
                   "Previous ASSUMPTION default 0.6 underestimated suited walking cost by about 25 percent."}
    out = os.path.join(os.path.dirname(__file__), "kG_calibration.json")
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
