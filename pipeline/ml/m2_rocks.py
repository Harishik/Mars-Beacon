"""M2 baseline: shadow-based rock detection on the 25 cm HiRISE orthophoto (no training).

Method v2 (bright rock + adjacent shadow, after the Golombek shadow approach, simplified):
 1. Rock-scale band-pass (Gaussian 0.25 m minus 1.5 m), normalised by local energy.
 2. Bright blobs (d > k) of 0.1 to 6 m^2, elongation < 2.5 (elongated highlights are boxwork ridge crests).
 3. A dark blob (d < -k) must start within 1.5 m beyond the blob on the anti-sun side, and be at most 3x its area.
 4. Diameter D = blob width perpendicular to the sun; keep 0.75 m <= D <= 4 m (ASSUMPTION limits).
v1 (shadow-only) was rejected after visual review: it fired on hollow floors and ridge shadows.
Sun azimuth (from north, clockwise) estimated by correlating (Gale: 310 deg, r = 0.54) DEM hillshades with the mosaic
(r = 0.54); the mosaic merges several HiRISE images, so this is one effective azimuth (ASSUMPTION).

Outputs (4 m live grid): rocks (cumulative fractional area of detected rocks), rockCount, rockBig (any rock with
D >= 2 m, ASSUMPTION threshold for a hard block), golombekK (k fitted per 100 m block, F(D>=Dmin) = k*exp(-q(k)*Dmin),
q = 1.79 + 0.152/k), and rocks_list.json (x, y, D) for D >= 1 m.
Validation: precision/recall against hand-labelled tiles is pending (Sahaj); quick-look overlays in m2_quicklook.png.
"""
import argparse, json, math, os, sys

import numpy as np
from scipy import ndimage, optimize

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bundle_io import BundleIO

PX = 0.25


def detect(o, sun_az, k_sig, d_min, d_max=4.0, max_gap=6):
    """v2: a rock is a small bright blob (rock-scale band-pass) with a dark shadow blob just beyond it on the
    anti-sun side; shadow not much larger than the rock (else terrain shadow); bright blob not elongated
    (elongated highlights are boxwork ridge crests)."""
    o = o.astype(np.float32)
    valid = o > 0
    dog = ndimage.gaussian_filter(o, 1.0) - ndimage.gaussian_filter(o, 6.0)   # 0.25 m to 1.5 m band
    d = dog / (np.sqrt(ndimage.gaussian_filter(dog ** 2, 40)) + 1.0)
    bright, dark = (d > k_sig) & valid, (d < -k_sig) & valid
    a = math.radians(sun_az)
    sun = np.array([-math.cos(a), math.sin(a)])   # (row, col) step toward the sun
    perp = np.array([sun[1], -sun[0]])
    lab, _ = ndimage.label(bright)
    dlab, _ = ndimage.label(dark)
    dsize = np.bincount(dlab.ravel())
    rocks = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        m = lab[sl] == i
        area = m.sum() * PX * PX
        if not (0.1 <= area <= 6):
            continue
        rr, cc = np.nonzero(m)
        pts = np.stack([rr + sl[0].start, cc + sl[1].start], 1).astype(np.float32)
        cen = pts.mean(0)
        if len(pts) > 3:
            ev = np.sort(np.linalg.eigvalsh(np.cov((pts - cen).T)))
            if ev[0] <= 0 or math.sqrt(ev[1] / ev[0]) > 2.5:
                continue
        reach = ((pts - cen) @ (-sun)).max()
        hit = 0
        for s_ in range(1, max_gap + 1):
            p = cen - sun * (reach + s_)
            r, c = int(round(p[0])), int(round(p[1]))
            if 0 <= r < o.shape[0] and 0 <= c < o.shape[1] and dlab[r, c] > 0:
                hit = dlab[r, c]; break
        if not hit or dsize[hit] * PX * PX > 3 * max(area, 1.0):
            continue
        proj = (pts - cen) @ perp
        D = (proj.max() - proj.min() + 1) * PX
        if d_min <= D <= d_max:
            rocks.append((float(cen[0]), float(cen[1]), float(D)))
    return rocks


def estimate_sun_az(z1, o):
    """Sun azimuth (deg from north, clockwise) that best correlates a DEM hillshade with the ortho (1 m)."""
    n = z1.shape[0]
    o1 = o[: n * 4, : n * 4].reshape(n, 4, n, 4).mean((1, 3)).astype(np.float32)
    gy, gx = np.gradient(ndimage.gaussian_filter(z1, 1.5))
    best = (-2, 0)
    for az in range(0, 360, 10):
        a = math.radians(az); i = math.radians(60)
        sx, sy, sz = math.sin(a) * math.sin(i), math.cos(a) * math.sin(i), math.cos(i)
        hs = (-gx * sx + gy * sy + sz) / np.sqrt(gx ** 2 + gy ** 2 + 1)
        c = np.corrcoef(hs[::3, ::3].ravel(), o1[::3, ::3].ravel())[0, 1]
        best = max(best, (c, az))
    return float(best[1]), float(best[0])


def fit_k(cfa_obs, d_min):
    if cfa_obs <= 0:
        return 0.0
    f = lambda k: k * math.exp(-(1.79 + 0.152 / k) * d_min) - cfa_obs
    try:
        return optimize.brentq(f, 1e-4, 0.6)
    except ValueError:
        return float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--sun-az", default="auto", help="degrees, or auto (DEM hillshade vs ortho correlation)")
    ap.add_argument("--k", type=float, default=1.5)
    ap.add_argument("--d-min", type=float, default=0.75)
    ap.add_argument("--d-big", type=float, default=2.0)
    ap.add_argument("--tile", type=int, default=2000)
    a = ap.parse_args()
    B = BundleIO(a.bundle)
    ext, cell, n = B.grid
    o = np.load(os.path.join(B.work, "ortho_025m_local.npy"), mmap_mode="r")
    H = o.shape[0]
    if a.sun_az == "auto":
        a.sun_az, corr = estimate_sun_az(np.load(os.path.join(B.work, "dem_1m_local.npy")), o)
        print(f"sun azimuth estimate {a.sun_az} deg (hillshade/ortho r = {corr:.2f})", flush=True)
    a.sun_az = float(a.sun_az)
    rocks, pad = [], 64
    for r0 in range(0, H, a.tile):
        for c0 in range(0, H, a.tile):
            ra, ca = max(0, r0 - pad), max(0, c0 - pad)
            sub = np.array(o[ra: min(H, r0 + a.tile + pad), ca: min(H, c0 + a.tile + pad)])
            for r, c, D in detect(sub, a.sun_az, a.k, a.d_min):
                R, C = r + ra, c + ca
                if r0 <= R < r0 + a.tile and c0 <= C < c0 + a.tile:
                    rocks.append((R, C, D))
        print(f"  rows {r0}: {len(rocks)} rocks", flush=True)
    rocks = np.array(rocks) if rocks else np.zeros((0, 3))
    # rasterise to 4 m
    cpp = int(cell / PX)
    ri, ci = (rocks[:, 0] // cpp).astype(int), (rocks[:, 1] // cpp).astype(int)
    count = np.zeros((n, n), np.float32); area = np.zeros((n, n), np.float32); big = np.zeros((n, n), np.float32)
    np.add.at(count, (ri, ci), 1)
    np.add.at(area, (ri, ci), math.pi / 4 * rocks[:, 2] ** 2)
    np.add.at(big, (ri, ci), (rocks[:, 2] >= a.d_big).astype(np.float32))
    cfa = np.clip(area / (cell * cell), 0, 1)
    blk = int(100 / cell)
    kmap = np.full((n, n), np.nan, np.float32)
    ks = []
    for r in range(0, n, blk):
        for c in range(0, n, blk):
            cf = area[r: r + blk, c: c + blk].sum() / (blk * cell) ** 2
            kk = fit_k(cf, a.d_min); kmap[r: r + blk, c: c + blk] = kk; ks.append(kk)
    meta = {"method": f"M2 shadow baseline, sun az {a.sun_az}, k {a.k}, Dmin {a.d_min} m (ASSUMPTION parameters)"}
    B.put_u8("rocks", cfa, 1 / 254, meta={**meta, "units": "cumulative fractional area of detected rocks D>=Dmin"})
    B.put_u8("rockCount", np.minimum(count, 254), 1.0, meta={**meta, "units": "rocks per 4 m cell"})
    B.put_u8("rockBig", (big > 0).astype(np.float32), 1.0, meta={**meta, "units": f"1 if a rock with D >= {a.d_big} m (hard block, ASSUMPTION)"})
    B.put_u8("golombekK", kmap, 0.002, meta={**meta, "units": "Golombek k per 100 m block (fraction)"})
    B.put_layer({"id": "rocks", "kind": "geophysical", "mission": "MRO", "instrument": "derived from HiRISE 25 cm ortho (M2)",
                 "productId": "rocks, rockCount, rockBig, golombekK", "resolutionM": 4, "acquired": "various", "tag": "DERIVED",
                 "attribution": "Mars BEACON pipeline/ml/m2_rocks.py", "url": "",
                 "limits": "Shadow baseline; rocks under ~1 m not detected; precision/recall vs hand labels pending."})
    x = -ext / 2 + (rocks[:, 1] + 0.5) * PX; y = ext / 2 - (rocks[:, 0] + 0.5) * PX
    json.dump({"crs": "site frame metres", "dMin": a.d_min, "rocks": [[round(float(u), 2), round(float(v), 2), round(float(D), 2)] for u, v, D in zip(x, y, rocks[:, 2])]},
              open(os.path.join(B.path, "rocks_list.json"), "w"))
    kv = np.array([k for k in ks if np.isfinite(k) and k > 0])
    stats = {"n_rocks": int(len(rocks)), "n_big": int((rocks[:, 2] >= a.d_big).sum()),
             "D_percentiles_m": np.percentile(rocks[:, 2], [50, 90, 99]).round(2).tolist() if len(rocks) else [],
             "golombek_k_median": float(np.median(kv)) if len(kv) else None,
             "golombek_k_p90": float(np.percentile(kv, 90)) if len(kv) else None, "params": vars(a)}
    json.dump(stats, open(os.path.join(B.path, "m2_stats.json"), "w"), indent=1)
    print(json.dumps(stats, indent=1)); print("siteHash", B.save())


if __name__ == "__main__":
    main()
