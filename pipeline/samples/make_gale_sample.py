"""Build a small real-data site bundle from the USGS Gale merged products.

Clips a 3 km x 3 km box from the public USGS Astrogeology mosaics (read remotely
with GDAL /vsicurl/, only the needed window is downloaded) and writes it in the
contracts/site_manifest format. Development sample only: Sahaj's build_site.py
is the real pipeline.

  python3 make_gale_sample.py OUT_DIR [--lat -4.865 --lon 137.315]
"""
import argparse, hashlib, json, math, os
import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image
from scipy import ndimage

os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                  GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="2", GDAL_CACHEMAX="1024")
BASE = "/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/"
DEM = "MSL_Gale_DEM_Mosaic_1m_v3.tif"
ORTHO = "MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"
R = 3396190.0  # Mars sphere radius used by both products (eqc, lon_0 = 0)
EXTENT, CELL = 3000, 4
N = EXTENT // CELL


def clip(name, cx, cy, px):
    with rasterio.open(BASE + name) as d:
        r0, c0 = d.index(cx - EXTENT / 2, cy + EXTENT / 2)
        n = int(EXTENT / px)
        return d.read(1, window=Window(c0, r0, n, n)), d.nodata


def horn_slope(z, cell):
    p = np.pad(z, 1, mode="edge")
    dzdx = ((p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])) / (8 * cell)
    dzdy = ((p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])) / (8 * cell)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))


def sha(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--lat", type=float, default=-4.865)
    ap.add_argument("--lon", type=float, default=137.315)
    ap.add_argument("--dem-npy", help="reuse an already clipped 3000x3000 DEM (.npy)")
    ap.add_argument("--ortho-png", help="reuse an already clipped 12000x12000 orthophoto (.png)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cx, cy = R * math.radians(a.lon), R * math.radians(a.lat)

    dem = np.load(a.dem_npy) if a.dem_npy else clip(DEM, cx, cy, 1.0)[0]
    dem = dem.astype(np.float32)
    if (dem < -30000).any():
        raise SystemExit("No-data cells in the clip; choose another box (voids are never interpolated).")
    ortho = np.array(Image.open(a.ortho_png)) if a.ortho_png else clip(ORTHO, cx, cy, 0.25)[0]

    h4 = dem.reshape(N, CELL, N, CELL).mean(axis=(1, 3)).astype(np.float32)
    s4 = horn_slope(h4, CELL)
    s1 = horn_slope(dem, 1.0)
    s1max = s1.reshape(N, CELL, N, CELL).max(axis=(1, 3))
    q = lambda s: np.clip(np.round(s / 0.25), 0, 255).astype(np.uint8)
    slope_u8, smax_u8 = q(s4), q(s1max)
    h4.tofile(os.path.join(a.out, "height_4m.f32"))
    slope_u8.tofile(os.path.join(a.out, "slope_4m.u8"))
    smax_u8.tofile(os.path.join(a.out, "slopemax1m_4m.u8"))

    # Orthophoto at 4096 px (73 cm/px), greyscale as observed.
    Image.fromarray(ortho).resize((4096, 4096), Image.LANCZOS).save(os.path.join(a.out, "ortho_4096.jpg"), quality=88)
    # Normal map from the 1 m DEM, so 1 m relief shows on the 4 m mesh. Tangent space: x east, y north, z up.
    d2 = np.array(Image.fromarray(dem).resize((2048, 2048), Image.BILINEAR), dtype=np.float32)
    px = EXTENT / 2048
    gy, gx = np.gradient(d2, px)
    nx, ny, nz = -gx, gy, np.ones_like(gx)  # row index runs south, so north gradient = -gy
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(a.out, "normal_2048.jpg"), quality=92)

    # Placeholder havens and stops on walkable ground, chosen from the terrain itself.
    flat = ndimage.uniform_filter((s4 < 12).astype(np.float32), 15)
    relief = h4 - ndimage.gaussian_filter(h4, 12)
    def to_xy(r, c):
        return {"x": round((c + 0.5) * CELL - EXTENT / 2), "y": round(EXTENT / 2 - (r + 0.5) * CELL)}
    def best(score, r0, r1, c0, c1):
        sub = score[r0:r1, c0:c1]
        r, c = np.unravel_index(np.nanargmax(sub), sub.shape)
        return r0 + r, c0 + c
    hab = best(flat, 300, 450, 250, 450)
    rov = best(flat, 180, 330, 420, 600)
    walk = (s4 < 18).astype(float)
    ring = lambda r, c, lo, hi: np.fromfunction(lambda i, j: ((np.hypot(i - r, j - c) > lo) & (np.hypot(i - r, j - c) < hi)).astype(float), (N, N))
    ra = best(np.where((walk > 0) & (ring(*hab, 30, 75) > 0), relief, -1e9), 0, N, 0, N)
    ho = best(np.where((walk > 0) & (np.hypot(*(np.indices((N, N)) - np.array(ra)[:, None, None])) < 25), -relief, -1e9), 0, N, 0, N)
    rb = best(np.where((walk > 0) & (ring(*rov, 30, 75) > 0), relief, -1e9), 0, N, 0, N)
    dr = best(np.where((walk > 0) & (ring(*hab, 70, 130) > 0), flat, -1e9), 0, N, 0, N)

    m = {
        "siteId": os.path.basename(os.path.normpath(a.out)),
        "name": "Gale crater, lower Mount Sharp (3 km sample clip)",
        "body": "Mars", "version": "0.1.0-sample", "synthetic": False,
        "notice": "Real USGS HiRISE elevation and imagery. Havens and stops are placeholder locations picked on walkable ground, not mission sites.",
        "siteHash": sha(h4)[:16],
        "crs": {"proj4": "+proj=eqc +R=3396190 +lon_0=0 (USGS source); local ENU metres from box centre",
                "origin": {"lat": a.lat, "lon": a.lon}, "datum": "sphere R=3396190 m", "lonDomain": "-180..180"},
        "grid": {"liveM": CELL, "cols": N, "rows": N, "extentM": EXTENT},
        "elevation": {"min": round(float(h4.min()), 2), "max": round(float(h4.max()), 2), "datum": "Mars areoid (USGS)"},
        "display": {"verticalExaggeration": 1.0},
        "files": [
            {"name": "height", "path": "height_4m.f32", "dtype": "float32", "cols": N, "rows": N, "scale": 1, "offset": 0, "sha256": sha(h4)},
            {"name": "slope", "path": "slope_4m.u8", "dtype": "uint8", "cols": N, "rows": N, "scale": 0.25, "offset": 0, "sha256": sha(slope_u8)},
            {"name": "slopemax1m", "path": "slopemax1m_4m.u8", "dtype": "uint8", "cols": N, "rows": N, "scale": 0.25, "offset": 0, "sha256": sha(smax_u8)},
            {"name": "ortho", "path": "ortho_4096.jpg", "dtype": "image", "cols": 4096, "rows": 4096, "scale": 1, "offset": 0, "sha256": ""},
            {"name": "normal", "path": "normal_2048.jpg", "dtype": "image", "cols": 2048, "rows": 2048, "scale": 1, "offset": 0, "sha256": ""},
        ],
        "layers": [
            {"id": "dem", "kind": "topographic", "mission": "MRO", "instrument": "HiRISE (+CTX, HRSC, MOLA), USGS merged DEM", "productId": "MSL_Gale_DEM_Mosaic_1m_v3", "resolutionM": 1, "acquired": "various", "tag": "OBSERVED", "attribution": "USGS Astrogeology Science Center; NASA/JPL/University of Arizona", "url": "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m"},
            {"id": "ortho", "kind": "optical", "mission": "MRO", "instrument": "HiRISE", "productId": "MSL_Gale_Orthophoto_Mosaic_25cm_v3", "resolutionM": 0.25, "acquired": "various", "tag": "OBSERVED", "attribution": "NASA/JPL/University of Arizona; USGS Astrogeology", "url": "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm"},
            {"id": "slope", "kind": "topographic", "mission": "Derived", "instrument": "Horn 3x3 on the 4 m DEM", "productId": "slope_4m", "resolutionM": 4, "acquired": "computed", "tag": "DERIVED", "attribution": "Mars BEACON pipeline", "url": ""},
            {"id": "envelope", "kind": "operations", "mission": "Engine", "instrument": "Reverse Dijkstra, paired crew", "productId": "live", "resolutionM": 4, "acquired": "live", "tag": "DERIVED", "attribution": "Mars BEACON engine", "url": ""},
        ],
        "patches": [], "splats": [],
        "havens": [{"id": "hab", "type": "habitat", **to_xy(*hab)}, {"id": "rover", "type": "rover", **to_xy(*rov)}],
        "targets": [
            {"id": "ridge-a", "name": "Ridge A", "type": "ridge", **to_xy(*ra), "sol": None, "source": "placeholder location (local relief high)"},
            {"id": "hollow-a", "name": "Hollow A", "type": "hollow", **to_xy(*ho), "sol": None, "source": "placeholder location (local relief low)"},
            {"id": "ridge-b", "name": "Ridge B", "type": "ridge", **to_xy(*rb), "sol": None, "source": "placeholder location (local relief high)"},
            {"id": "drill", "name": "Survey site", "type": "drill", **to_xy(*dr), "sol": None, "source": "placeholder location"},
        ],
        "povImages": [], "route": {"source": "pending", "points": []},
    }
    json.dump(m, open(os.path.join(a.out, "manifest.json"), "w"), indent=2)
    print("wrote", a.out, m["elevation"], [h["x"] for h in m["havens"]])


if __name__ == "__main__":
    main()
