"""Impact figure (plan 00 section 6, 21 section 5.5): plain 2 km walk-back circle vs computed Return Envelope
on the real Gale box.

Fair comparison: budgets are calibrated so that on FLAT, open ground the envelope would be exactly the 2 km
circle (same assumptions, same reserve margin). Any difference is therefore caused by the real terrain:
slope limits, rock blocks, and the extra time and oxygen of walking up and down.
Run on the median (slope4P50) and P90 (slope4P90) terrain for the uncertainty band.
"""
import argparse, json, math, os, sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bundle_io import BundleIO
from walking import Assumptions, speed, metabolic_power, o2_g_per_h
from envelope import envelope


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--radius", type=float, default=2000.0)
    ap.add_argument("--out", required=True)
    a_ = ap.parse_args()
    B = BundleIO(a_.bundle)
    ext, cell, n = B.grid
    z = B.load("height_4m").astype(np.float64)
    hab = next(h for h in B.m["havens"] if h["type"] == "habitat")
    hr, hc = int((ext / 2 - hab["y"]) / cell), int((hab["x"] + ext / 2) / cell)
    A = Assumptions()
    v = speed(0.0, A)
    t_per_m = 1 / v
    o2_per_m = o2_g_per_h(metabolic_power(0.0, A, v)) / 3600 * t_per_m
    k = 1 + (1 + A.reserveM)
    budget_t, budget_o2 = a_.radius * t_per_m * k, a_.radius * o2_per_m * k
    rock = np.nan_to_num(B.load("rockBig")) > 0
    xs = -ext / 2 + cell * (np.arange(n) + 0.5); X, Y = np.meshgrid(xs, xs[::-1])
    circle = np.hypot(X - hab["x"], Y - hab["y"]) <= a_.radius
    res = {"assumptions": A.to_dict(), "budgetTimeS": budget_t, "budgetO2G": budget_o2, "radiusM": a_.radius,
           "haven": hab, "calibration": "budgets make the flat-ground envelope equal the circle", "cases": {}}
    out = {}
    for name, sl in (("median", "slope4P50"), ("p90", "slope4P90")):
        s = B.load(sl)
        blocked = ~np.isfinite(s) | (s > A.slopeLimitDeg) | rock
        blocked[hr, hc] = False
        e = envelope(z, cell, blocked, (hr, hc), A, budget_t, budget_o2)
        ins = e["inside"]
        cell_a = cell * cell / 1e6
        r = {"circleAreaInBoxKm2": float(circle.sum() * cell_a), "envelopeAreaKm2": float(ins.sum() * cell_a),
             "circleNotReturnableKm2": float((circle & ~ins).sum() * cell_a),
             "circleNotReturnableFrac": float((circle & ~ins).sum() / circle.sum()),
             "returnableOutsideCircleKm2": float((~circle & ins).sum() * cell_a),
             "blockedFracInCircle": float((circle & blocked).sum() / circle.sum()),
             "maxTimeToHavenInsideS": float(np.max(e["timeToHaven"][ins])) if ins.any() else 0.0}
        res["cases"][name] = r; out[name] = (e, blocked)
        print(name, json.dumps({k_: round(v_, 4) for k_, v_ in r.items()}), flush=True)
    os.makedirs(a_.out, exist_ok=True)
    json.dump(res, open(os.path.join(a_.out, "impact_2km_vs_envelope.json"), "w"), indent=1)
    np.save(os.path.join(a_.out, "envelope_median.npy"), out["median"][0]["inside"])
    np.save(os.path.join(a_.out, "envelope_p90.npy"), out["p90"][0]["inside"])

    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    gy, gx = np.gradient(z, cell); hs = np.clip((-gx * 0.7 + gy * 0.7 + 1) / np.sqrt(1 + gx ** 2 + gy ** 2), 0, 1)
    fig, ax = plt.subplots(figsize=(10, 9.4))
    e_ext = [-ext / 2, ext / 2, -ext / 2, ext / 2]
    ax.imshow(hs, cmap="gray", extent=e_ext, alpha=0.9)
    ax.imshow(np.ma.masked_where(~out["median"][1], np.ones_like(z)), cmap=ListedColormap(["#7a1f1f"]), extent=e_ext, alpha=0.35)
    band = out["median"][0]["inside"] & ~out["p90"][0]["inside"]
    ax.imshow(np.ma.masked_where(~out["p90"][0]["inside"], np.ones_like(z)), cmap=ListedColormap(["#1f9e89"]), extent=e_ext, alpha=0.45)
    ax.imshow(np.ma.masked_where(~band, np.ones_like(z)), cmap=ListedColormap(["#f2c14e"]), extent=e_ext, alpha=0.6)
    ax.add_patch(plt.Circle((hab["x"], hab["y"]), a_.radius, fill=False, ls="--", lw=2, color="white"))
    route = np.array(B.m["route"]["points"]); ax.plot(route[:, 0], route[:, 1], color="#4cc9f0", lw=1.2, label="Curiosity traverse (HISTORICAL)")
    ax.plot(hab["x"], hab["y"], "s", ms=9, mfc="white", mec="black", label="habitat (ASSUMPTION)")
    for t in B.m["targets"]:
        ax.plot(t["x"], t["y"], "o", ms=7, mfc="none", mec="yellow")
    med, p90 = res["cases"]["median"], res["cases"]["p90"]
    ax.set_xlim(-ext / 2, ext / 2); ax.set_ylim(-ext / 2, ext / 2)
    ax.set_title(f"Gale boxwork: 2 km walk-back circle (dashed) vs Return Envelope\n"
                 f"{med['circleNotReturnableFrac']:.0%} of the circle in the box is not returnable (P90 terrain: {p90['circleNotReturnableFrac']:.0%}); "
                 f"green = returnable (P90), yellow = uncertainty band, red = no-go", fontsize=10)
    ax.set_xlabel("x east (m)"); ax.set_ylabel("y north (m)"); ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(a_.out, "impact_2km_vs_envelope.png"), dpi=130)
    print("figure written")


if __name__ == "__main__":
    main()
