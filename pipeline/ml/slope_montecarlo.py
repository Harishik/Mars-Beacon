"""Monte Carlo slope band (plan 21 section 5.4).

N DEM realisations: z + e, with e a Gaussian random field (white noise filtered in Fourier space with a Gaussian
kernel of correlation length L, rescaled to std sigma_z). sigma_z = 0.25 m (ASSUMPTION; typical HiRISE stereo
vertical precision, VERIFY against the USGS product's stated value), L = 5 m (ASSUMPTION).
Per realisation: max 1 m Horn slope inside each 4 m cell. Per cell: median and 90th percentile across realisations.
Writes slopeP50.u8 and slopeP90.u8 (replacing the build_site placeholders); the app runs the envelope on both.
"""
import argparse, os, sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bundle_io import BundleIO
from build_site import horn_slope_deg, block


def grf(shape, L, sigma, rng):
    w = rng.standard_normal(shape)
    ky = np.fft.fftfreq(shape[0])[:, None]; kx = np.fft.rfftfreq(shape[1])[None, :]
    filt = np.exp(-2 * (np.pi * L) ** 2 * (kx ** 2 + ky ** 2))
    f = np.fft.irfft2(np.fft.rfft2(w) * filt, s=shape)
    return f / f.std() * sigma


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--n", type=int, default=16)
    ap.add_argument("--sigma", type=float, default=0.25)
    ap.add_argument("--L", type=float, default=5.0)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    B = BundleIO(a.bundle)
    ext, cell, n = B.grid
    z = np.load(os.path.join(B.work, "dem_1m_local.npy")).astype(np.float32)
    rng = np.random.default_rng(a.seed)
    stack = np.empty((a.n, n, n), np.float32)
    stack4 = np.empty((a.n, n, n), np.float32)
    for i in range(a.n):
        zr = z + grf(z.shape, a.L, a.sigma, rng).astype(np.float32)
        s1, _, _ = horn_slope_deg(zr, 1.0)
        stack[i] = block(s1, int(cell), np.max)
        stack4[i] = horn_slope_deg(block(zr, int(cell), np.mean), cell)[0]
        print(f"  realisation {i + 1}/{a.n}", flush=True)
    p50, p90 = np.median(stack, 0), np.percentile(stack, 90, axis=0)
    meta4 = {"units": "deg", "method": f"4 m Horn slope over {a.n} DEM realisations, sigma_z {a.sigma} m, L {a.L} m (ASSUMPTION), seed {a.seed}",
             "use": "hard no-go limit for the envelope (median and P90 boundaries)"}
    B.put_u8("slope4P50", np.median(stack4, 0), 0.25, meta=meta4)
    B.put_u8("slope4P90", np.percentile(stack4, 90, axis=0), 0.25, meta=meta4)
    base = block(horn_slope_deg(z, 1.0)[0], int(cell), np.max)
    meta = {"units": "deg", "method": f"max 1 m slope per 4 m cell over {a.n} DEM realisations, sigma_z {a.sigma} m, L {a.L} m (ASSUMPTION), seed {a.seed}"}
    B.put_u8("slopeP50", p50, 0.25, meta=meta)
    B.put_u8("slopeP90", p90, 0.25, meta=meta)
    for lim in (15, 20, 25):
        print(f"cells over {lim} deg: deterministic {np.mean(base > lim):.3%}, P50 {np.mean(p50 > lim):.3%}, P90 {np.mean(p90 > lim):.3%}")
    print("siteHash", B.save())


if __name__ == "__main__":
    main()
