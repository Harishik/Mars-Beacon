"""Science value map (plan 21 section 8), transparent weighted sum on the 4 m grid:

  S(x) = w1*ridgeHollowContrast + w2*spectralIndex + w3*nearContact + w4*roverContext

Components written separately so the app can re-weight live (the formula is shown in the app):
  rhContrast   from M3 (already in the bundle)
  roverContext exp(-d^2 / (2*150^2)), d = distance to the nearest Curiosity drill target (ASSUMPTION scale)
  spectralIndex, nearContact: CRISM and USGS unit contacts are not in the bundle yet, so w2 = w3 = 0 and the
  manifest says so. Default weights w1 = 0.6, w4 = 0.4 (ASSUMPTION, set by the ridge-vs-hollow objective).
"""
import argparse, os, sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bundle_io import BundleIO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--w1", type=float, default=0.6)
    ap.add_argument("--w4", type=float, default=0.4)
    ap.add_argument("--context-scale", type=float, default=150.0)
    a = ap.parse_args()
    B = BundleIO(a.bundle)
    ext, cell, n = B.grid
    xs = -ext / 2 + cell * (np.arange(n) + 0.5)
    X, Y = np.meshgrid(xs, xs[::-1])
    d2 = np.full((n, n), np.inf)
    for t in B.m["targets"]:
        d2 = np.minimum(d2, (X - t["x"]) ** 2 + (Y - t["y"]) ** 2)
    ctx = np.exp(-d2 / (2 * a.context_scale ** 2))
    rh = np.nan_to_num(B.load("rhContrast"))
    S = (a.w1 * rh + a.w4 * ctx) / (a.w1 + a.w4)
    B.put_u8("roverContext", ctx, 1 / 254, meta={"units": "0-1", "method": f"exp(-d^2/(2*{a.context_scale}^2)) to nearest drill target"})
    B.put_u8("science", S, 1 / 254, meta={"units": "0-1", "formula": "S = w1*rhContrast + w2*spectralIndex + w3*nearContact + w4*roverContext, normalised by sum of weights",
                                          "weights": {"w1": a.w1, "w2": 0.0, "w3": 0.0, "w4": a.w4},
                                          "note": "w2 (CRISM) and w3 (USGS contacts) are 0 until those layers are added; weights are ASSUMPTION sliders"})
    B.put_layer({"id": "science", "kind": "operations", "mission": "MRO + MSL", "instrument": "derived (M3 + rover context)",
                 "productId": "science, roverContext, rhContrast", "resolutionM": 4, "acquired": "n/a", "tag": "DERIVED",
                 "attribution": "Mars BEACON pipeline/ml/science_value.py", "url": ""})
    print("science: mean %.3f, p90 %.3f; siteHash %s" % (S.mean(), np.percentile(S, 90), B.save()))


if __name__ == "__main__":
    main()
