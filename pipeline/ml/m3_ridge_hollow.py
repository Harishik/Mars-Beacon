"""M3: boxwork ridge and hollow map from the 1 m DEM local relief model (plan 24/25, section M3).

Method (classical, no training):
  relief = DEM - Gaussian(DEM, sigma)            sigma = 12 m (ASSUMPTION; hollows 10-20 m wide)
  ridge  = relief > +t,  hollow = relief < -t      t = 0.5 m (ASSUMPTION; boxwork relief 1-2 m)
  excluded where the regional slope (DEM smoothed 30 m) > 15 deg: there relief tracks butte scarps, not boxwork
  morphological opening, then drop ridges < 15 m^2 and hollows < 40 m^2.
Limits (stated in the manifest): the merged DEM's effective resolution is coarser than its 1 m posting, so
individual ~5 m wide boxwork ridges are often not resolved; the map captures larger ridge/hollow structure.
Validation available now: relief at the paired drill sites (hollow Valle de la Luna vs ridge Nevado Sajama,
~2 m apart in height per the Curiosity team). Hand-labelled IoU is pending.

Outputs into the bundle: ridgeHollow_1m (0 none, 1 ridge, 2 hollow, 3 excluded; 3000x3000),
ridgeFrac / hollowFrac at 4 m, rhContrast at 4 m (both ridge and hollow within 20 m).
"""
import argparse, json, os, sys

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bundle_io import BundleIO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--sigma", type=float, default=12.0)
    ap.add_argument("--t", type=float, default=0.5)
    ap.add_argument("--max-regional-slope", type=float, default=15.0)
    a = ap.parse_args()
    B = BundleIO(a.bundle)
    ext, cell, n = B.grid
    z = np.load(os.path.join(B.work, "dem_1m_local.npy")).astype(np.float64)

    relief = z - ndimage.gaussian_filter(z, a.sigma, mode="nearest")
    zs = ndimage.gaussian_filter(z, 30, mode="nearest")
    gy, gx = np.gradient(zs)
    reg_slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    excl = reg_slope > a.max_regional_slope

    ridge = ndimage.binary_opening((relief > a.t) & ~excl, iterations=1)
    hollow = ndimage.binary_opening((relief < -a.t) & ~excl, iterations=1)
    for mask, min_area in ((ridge, 15), (hollow, 40)):
        lab, k = ndimage.label(mask)
        sizes = ndimage.sum(mask, lab, range(1, k + 1))
        mask[np.isin(lab, np.where(sizes < min_area)[0] + 1)] = False

    rh = np.zeros(z.shape, np.uint8); rh[ridge] = 1; rh[hollow] = 2; rh[excl] = 3
    p = "ridgeHollow_1m.u8"; rh.tofile(os.path.join(B.path, p))
    from bundle_io import _sha
    B.m["files"] = [f for f in B.m["files"] if f["name"] != "ridgeHollow_1m"] + [{
        "name": "ridgeHollow_1m", "path": p, "dtype": "uint8", "cols": rh.shape[1], "rows": rh.shape[0], "scale": 1, "offset": 0,
        "sha256": _sha(os.path.join(B.path, p)), "classes": {"0": "none", "1": "ridge", "2": "hollow", "3": "excluded (regional slope)"},
        "resolutionM": 1.0}]

    k = int(cell)
    blk = lambda m: m[: n * k, : n * k].reshape(n, k, n, k).mean((1, 3))
    rf, hf = blk(ridge.astype(np.float32)), blk(hollow.astype(np.float32))
    rad = int(round(20 / cell))
    yy, xx = np.mgrid[-rad:rad + 1, -rad:rad + 1]; disk = (xx ** 2 + yy ** 2) <= rad ** 2
    near_r = ndimage.maximum_filter(rf, footprint=disk); near_h = ndimage.maximum_filter(hf, footprint=disk)
    contrast = np.minimum(near_r, near_h) / max(1e-6, np.percentile(np.minimum(near_r, near_h), 99))
    contrast = np.clip(contrast, 0, 1)
    meta = {"method": f"M3 local relief sigma {a.sigma} m, t {a.t} m, regional slope < {a.max_regional_slope} deg (ASSUMPTION thresholds)"}
    B.put_u8("ridgeFrac", rf, 1 / 254, meta={**meta, "units": "fraction of 4 m cell"})
    B.put_u8("hollowFrac", hf, 1 / 254, meta={**meta, "units": "fraction of 4 m cell"})
    B.put_u8("rhContrast", contrast, 1 / 254, meta={**meta, "units": "0-1, ridge and hollow both within 20 m"})
    B.put_layer({"id": "ridge_hollow", "kind": "geomorphology", "mission": "MRO", "instrument": "derived from HiRISE DEM (M3)",
                 "productId": "ridgeHollow_1m, ridgeFrac, hollowFrac, rhContrast", "resolutionM": 1, "acquired": "various",
                 "tag": "DERIVED", "attribution": "Mars BEACON pipeline/ml/m3_ridge_hollow.py", "url": "",
                 "limits": "DEM effective resolution is coarser than 1 m; narrow (~5 m) boxwork ridges often unresolved. Thresholds are ASSUMPTION."})

    # validation at the drill pair
    val = {}
    for t in B.m["targets"]:
        c, r = int(t["x"] + ext / 2), int(ext / 2 - t["y"])
        win = relief[r - 10: r + 11, c - 10: c + 11]
        val[t["id"]] = {"type": t["type"], "relief_at_point_m": round(float(relief[r, c]), 2),
                        "relief_min_max_within_10m": [round(float(win.min()), 2), round(float(win.max()), 2)],
                        "class_at_point": ["none", "ridge", "hollow", "excluded"][rh[r, c]]}
    stats = {"ridge_area_frac": float(ridge.mean()), "hollow_area_frac": float(hollow.mean()), "excluded_frac": float(excl.mean()),
             "drill_sites": val, "params": vars(a),
             "note": "Drill coordinates are end-of-drive waypoints (+/- tens of m); PDS PLACES needed for a real check."}
    json.dump(stats, open(os.path.join(B.path, "m3_validation.json"), "w"), indent=1)
    print(json.dumps(stats, indent=1)); print("siteHash", B.save())


if __name__ == "__main__":
    main()
