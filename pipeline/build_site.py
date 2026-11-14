"""L0 orbital site bundle builder (Mars BEACON, plan files 26 section 3 and 21 section 3).

Reads the USGS MSL Gale merged DEM (1 m) and HiRISE orthophoto (25 cm) remotely with HTTP range
requests (only the box is downloaded; no GDAL needed), reprojects to a local East-North-Up metre grid,
bakes derived rasters and writes a bundle in the format of contracts/site_manifest.example.json.

Source CRS (from the GeoTIFF keys): equirectangular, centre lon 0, standard parallel 0,
Mars 2000 sphere R = 3,396,190 m, so E = R*lon_rad, N = R*lat_rad.
Local frame: x = R*cos(lat0)*(lon-lon0), y = R*(lat-lat0)  (true metres), origin at the box centre.
Grids are north-up: row 0 is the north edge; cell (r, c) centre at
x = -extent/2 + cell*(c+0.5), y = +extent/2 - cell*(r+0.5).

Usage:
  python build_site.py --site gale --out C:/Users/sahaj/MarsBeaconData/bundles/gale
"""
import argparse, hashlib, io, json, math, os, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import tifffile
import imagecodecs
from PIL import Image
from scipy import ndimage

R_MARS = 3396190.0
UA = "Mozilla/5.0 (planetary research data client)"

SITES = {
    "gale": dict(
        name="Gale crater, Mount Sharp boxwork unit",
        # centre of Curiosity's boxwork campaign track (sols 4534-4844, NASA MSL_waypoints.json)
        lat0=-4.8031, lon0=137.3840,
        dem="https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif",
        ortho="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif",
        dem_id="MSL_Gale_DEM_Mosaic_1m_v3", ortho_id="MSL_Gale_Orthophoto_Mosaic_25cm_v3",
        dem_page="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m",
        ortho_page="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm",
        waypoints="https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json",
        rover="MSL", sols=(4400, 4900), hab_sol=4534,
        # Altadena decision end of sols 4534-4570; Valle de la Luna (Monte Grande hollow) ~4708;
        # Nevado Sajama (ridge) 4718 (NASA Curiosity blog). Exact drill coordinates: VERIFY with PDS PLACES.
        targets=[("altadena", "Altadena drill site (approx.)", "drill", 4565),
                 ("valle_de_la_luna", "Valle de la Luna drill, Monte Grande hollow", "hollow", 4708),
                 ("nevado_sajama", "Nevado Sajama drill, boxwork ridge", "ridge", 4718)],
    ),
    "jezero": dict(
        name="Jezero crater, Perseverance landing area (Octavia E. Butler)",
        lat0=18.4447, lon0=77.4509,
        dem="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
        ortho="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif",
        dem_id="JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m (Mars 2020 TRN)",
        ortho_id="JEZ_hirise_soc_006_orthoMosaic_25cm (Mars 2020 TRN)",
        dem_page="https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/",
        ortho_page="https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/",
        waypoints="https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json",
        rover="M2020", sols=(0, 2000), hab_sol=13,
        targets=[("octavia_e_butler", "Octavia E. Butler landing site", "context", 13)],
    ),
}


# ----------------------------------------------------------------------------- remote GeoTIFF access
class HttpFile(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos = url, 0
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"Range": "bytes=0-0", "User-Agent": UA}), timeout=60)
        self.size = int(r.headers["Content-Range"].split("/")[1])

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0:
            return 0
        d = get_range(self.url, self.pos, self.pos + n - 1)
        b[: len(d)] = d
        self.pos += len(d)
        return len(d)


def get_range(url, a, b, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Range": f"bytes={a}-{b}", "User-Agent": UA})
            d = urllib.request.urlopen(req, timeout=120).read()
            if len(d) != b - a + 1:
                raise IOError(f"short read {len(d)} of {b - a + 1}")
            return d
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(1 + 2 * k)


class RemoteStripTiff:
    """Single-page strip GeoTIFF (rowsperstrip=1) read by row ranges."""

    def __init__(self, url):
        self.url = url
        t = tifffile.TiffFile(io.BufferedReader(HttpFile(url), 1 << 20))
        p = t.pages[0]
        assert not p.is_tiled and p.rowsperstrip == 1, "expects 1-row strips"
        self.rows, self.cols = p.shape[:2]
        self.dtype = p.dtype
        self.compression = p.compression
        self.offsets = np.array(p.dataoffsets, np.int64)
        self.counts = np.array(p.databytecounts, np.int64)
        self.scale = p.tags["ModelPixelScaleTag"].value[:2]
        tp = p.tags["ModelTiepointTag"].value
        self.e0, self.n0 = tp[3], tp[4]
        gk = t.geotiff_metadata
        self.is_point = int(gk.get("GTRasterTypeGeoKey", 1)) == 2
        assert gk.get("GeogSemiMajorAxisGeoKey") == R_MARS and gk.get("ProjCenterLongGeoKey", 0) == 0
        assert gk.get("ProjStdParallel1GeoKey", 0) == 0, "expects standard parallel 0"
        try:
            nd = p.tags.get("GDAL_NODATA")
            self.nodata = float(str(nd.value).strip().strip(chr(0))) if nd else None
        except Exception:
            self.nodata = -3.4028226550889045e38 if np.dtype(self.dtype).kind == "f" else None

    def pixel_center(self, row, col):
        """Projected (E, N) of a pixel centre."""
        sx, sy = self.scale
        half = 0.0 if self.is_point else 0.5
        return self.e0 + (col + half) * sx, self.n0 - (row + half) * sy

    def read_window(self, r0, r1, c0, c1, row_step=1, col_step=1, workers=24, label=""):
        rows = np.arange(r0, r1, row_step)
        out = np.empty((len(rows), len(range(c0, c1, col_step))), self.dtype)
        done = [0]; lock = threading.Lock()
        isz = np.dtype(self.dtype).itemsize

        def fetch(chunk):
            idx, rr = chunk
            if self.compression == 1 and row_step == 1:  # uncompressed: fetch only needed bytes per row
                for i, r in zip(idx, rr):
                    a = self.offsets[r] + c0 * isz
                    d = get_range(self.url, a, a + (c1 - c0) * isz - 1)
                    out[i] = np.frombuffer(d, self.dtype)[::col_step]
            else:
                a, b = self.offsets[rr[0]], self.offsets[rr[-1]] + self.counts[rr[-1]] - 1
                contiguous = row_step == 1 and np.all(self.offsets[rr[1:]] == self.offsets[rr[:-1]] + self.counts[rr[:-1]])
                blob = get_range(self.url, a, b) if contiguous else None
                for i, r in zip(idx, rr):
                    raw = blob[self.offsets[r] - a: self.offsets[r] - a + self.counts[r]] if contiguous else \
                        get_range(self.url, self.offsets[r], self.offsets[r] + self.counts[r] - 1)
                    row = None
                    for attempt in range(3):
                        try:
                            dec = imagecodecs.lzw_decode(raw) if self.compression == 5 else (
                                imagecodecs.zlib_decode(raw) if self.compression in (8, 32946) else raw)
                            row = np.frombuffer(dec, self.dtype, count=self.cols)
                            break
                        except Exception:
                            raw = get_range(self.url, self.offsets[r], self.offsets[r] + self.counts[r] - 1)
                    if row is None:
                        print(f"  WARNING undecodable strip row {r}; set to nodata", flush=True)
                        out[i] = self.nodata if self.nodata is not None else 0
                    else:
                        out[i] = row[c0:c1:col_step]
            with lock:
                done[0] += len(rr)
                if done[0] % 2000 < len(rr):
                    print(f"  {label} {done[0]}/{len(rows)} rows", flush=True)

        n = 64 if self.compression != 1 else 16
        chunks = [(np.arange(i, min(i + n, len(rows))), rows[i: i + n]) for i in range(0, len(rows), n)]
        with ThreadPoolExecutor(workers) as ex:
            list(ex.map(fetch, chunks))
        return out


# ----------------------------------------------------------------------------- geometry helpers
def local_to_proj(x, y, lat0, lon0):
    """Local ENU metres -> source projected E, N."""
    lat = lat0 + np.degrees(y / R_MARS)
    lon = lon0 + np.degrees(x / (R_MARS * math.cos(math.radians(lat0))))
    return R_MARS * np.radians(lon), R_MARS * np.radians(lat)


def proj_to_local(E, N, lat0, lon0):
    lat = np.degrees(np.asarray(N) / R_MARS); lon = np.degrees(np.asarray(E) / R_MARS)
    return R_MARS * math.cos(math.radians(lat0)) * np.radians(lon - lon0), R_MARS * np.radians(lat - lat0)


def grid_centres(extent, cell):
    n = int(round(extent / cell))
    c = -extent / 2 + cell * (np.arange(n) + 0.5)
    return c, c[::-1].copy(), n  # xs (west->east), ys (north->south)


def resample_to_local(src, tif, r0, c0, step, extent, cell, lat0, lon0, order=1, nodata=None):
    """Sample a projected-window array onto the local north-up grid (bilinear by default)."""
    xs, ys, n = grid_centres(extent, cell)
    e_first, n_first = tif.pixel_center(r0, c0)
    a = src.astype(np.float32, copy=False)
    bad = None
    if nodata is not None:
        bad = (src == nodata) | ~np.isfinite(a)
        if a.dtype.kind == "f":
            bad |= a < -1e30
        a = np.where(bad, 0.0, a).astype(np.float32)
        bad = bad.astype(np.float32)
    out = np.empty((n, n), np.float32)
    chunk = max(1, 4_000_000 // n)  # rows per chunk, bounds memory for 25 cm grids
    for i in range(0, n, chunk):
        X, Y = np.meshgrid(xs, ys[i: i + chunk])
        E, N = local_to_proj(X, Y, lat0, lon0)
        coords = np.stack([(n_first - N) / (tif.scale[1] * step), (E - e_first) / (tif.scale[0] * step)]).astype(np.float32)
        o = ndimage.map_coordinates(a, coords, order=order, mode="nearest")
        if bad is not None:
            o[ndimage.map_coordinates(bad, coords, order=1, mode="nearest") > 0.01] = np.nan
        out[i: i + chunk] = o
    return out


def window_for(tif, extent, lat0, lon0, pad=8):
    xs = np.array([-extent / 2, extent / 2, extent / 2, -extent / 2])
    ys = np.array([extent / 2, extent / 2, -extent / 2, -extent / 2])
    E, N = local_to_proj(xs, ys, lat0, lon0)
    e_first, n_first = tif.pixel_center(0, 0)
    c0 = int(math.floor((E.min() - e_first) / tif.scale[0])) - pad
    c1 = int(math.ceil((E.max() - e_first) / tif.scale[0])) + pad
    r0 = int(math.floor((n_first - N.max()) / tif.scale[1])) - pad
    r1 = int(math.ceil((n_first - N.min()) / tif.scale[1])) + pad
    assert 0 <= r0 and r1 <= tif.rows and 0 <= c0 and c1 <= tif.cols, "box outside raster"
    return r0, r1, c0, c1


# ----------------------------------------------------------------------------- terrain derivatives
def horn_slope_deg(z, cell):
    zp = np.pad(z, 1, mode="edge")
    a, b, c = zp[:-2, :-2], zp[:-2, 1:-1], zp[:-2, 2:]
    d, f = zp[1:-1, :-2], zp[1:-1, 2:]
    g, h, i = zp[2:, :-2], zp[2:, 1:-1], zp[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))), dzdx, -dzdy  # -dzdy: rows run north->south


def block(a, k, fn):
    n = a.shape[0] // k
    return fn(a[: n * k, : n * k].reshape(n, k, n, k), axis=(1, 3))


def plane_rms(z1, k):
    """RMS residual of a least-squares plane fitted to each k x k block of the 1 m DEM."""
    n = z1.shape[0] // k
    b = z1[: n * k, : n * k].reshape(n, k, n, k).transpose(0, 2, 1, 3).reshape(n, n, k * k)
    u, v = np.meshgrid(np.arange(k) - (k - 1) / 2, np.arange(k) - (k - 1) / 2)
    A = np.stack([u.ravel(), v.ravel(), np.ones(k * k)], 1)
    P = A @ np.linalg.pinv(A)
    res = b - b @ P.T
    return np.sqrt((res ** 2).mean(-1))


def horizon_angles(z, cell, n_az=32, max_dist=None, device=None):
    """Max elevation angle (deg, >= 0) toward each of n_az azimuths (0 = north, clockwise).
    Uses geometric distance steps; runs on GPU with torch if available."""
    import torch
    dev = device or ("cuda" if torch.cuda.is_available() else "cpu")
    H, W = z.shape
    max_dist = max_dist or cell * max(H, W)
    d, dists = cell, []
    while d < max_dist:
        dists.append(d); d = max(d + cell, d * 1.04)
    zt = torch.tensor(np.nan_to_num(z, nan=float(np.nanmin(z))), dtype=torch.float32, device=dev)[None, None]
    ys, xs = torch.meshgrid(torch.arange(H, device=dev, dtype=torch.float32), torch.arange(W, device=dev, dtype=torch.float32), indexing="ij")
    out = np.zeros((n_az, H, W), np.float32)
    for k in range(n_az):
        az = 2 * math.pi * k / n_az
        dx, dy = math.sin(az), -math.cos(az)  # east, and rows increase southward
        best = torch.zeros(H, W, device=dev)
        for dist in dists:
            px = xs + dx * dist / cell; py = ys + dy * dist / cell
            inside = (px >= 0) & (px <= W - 1) & (py >= 0) & (py <= H - 1)
            if not inside.any():
                break
            grid = torch.stack([px / (W - 1) * 2 - 1, py / (H - 1) * 2 - 1], -1)[None]
            zz = torch.nn.functional.grid_sample(zt, grid, mode="bilinear", align_corners=True)[0, 0]
            ang = torch.atan((zz - zt[0, 0]) / dist)
            best = torch.where(inside, torch.maximum(best, ang), best)
        out[k] = np.degrees(best.cpu().numpy())
    return out


def viewshed(z, cell, r0, c0, h_obs, h_tgt=1.7):
    """Boolean line of sight from (r0, c0) at h_obs above ground to every cell (target h_tgt above ground)."""
    H, W = z.shape
    rr, cc = np.mgrid[0:H, 0:W].astype(np.float32)
    zo = z[r0, c0] + h_obs
    dr, dc = rr - r0, cc - c0
    L = np.hypot(dr, dc); L[r0, c0] = 1
    n_s = 256
    vis = np.ones((H, W), bool)
    tz = z + h_tgt
    for s in np.linspace(0.02, 0.98, n_s):
        pr, pc = r0 + dr * s, c0 + dc * s
        zs = ndimage.map_coordinates(z, [pr, pc], order=1, mode="nearest")
        line = zo + (tz - zo) * s
        vis &= zs <= line + 0.05
    return vis


# ----------------------------------------------------------------------------- writers
class Bundle:
    def __init__(self, out):
        self.out, self.files = out, []
        os.makedirs(out, exist_ok=True)

    def raw(self, name, arr, dtype, scale=1.0, offset=0.0, extra=None):
        path = name
        a = np.ascontiguousarray(arr.astype(dtype))
        a.tofile(os.path.join(self.out, path))
        e = {"name": name.split(".")[0], "path": path, "dtype": np.dtype(dtype).name,
             "cols": int(arr.shape[-1]), "rows": int(arr.shape[-2]), "scale": scale, "offset": offset,
             "sha256": sha(os.path.join(self.out, path))}
        if arr.ndim == 3:
            e["bands"] = int(arr.shape[0]); e["layout"] = "band-major [band][row][col]"
        if extra:
            e.update(extra)
        self.files.append(e)
        return e

    def q8(self, name, arr, scale, offset=0.0, nodata=255, extra=None):
        """Quantise to uint8: value = stored*scale + offset; NaN -> nodata."""
        q = np.round((arr - offset) / scale)
        q = np.where(np.isfinite(arr), np.clip(q, 0, 254 if nodata == 255 else 255), nodata)
        return self.raw(name, q, np.uint8, scale, offset, {"nodata": nodata, **(extra or {})})

    def image(self, name, img, extra=None):
        p = os.path.join(self.out, name)
        os.makedirs(os.path.dirname(p) or self.out, exist_ok=True)
        img.save(p, quality=88) if name.endswith((".webp", ".jpg")) else img.save(p)
        e = {"name": os.path.splitext(name)[0], "path": name, "dtype": "image", "cols": img.width,
             "rows": img.height, "scale": 1, "offset": 0, "sha256": sha(p)}
        if extra:
            e.update(extra)
        self.files.append(e)
        return e


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def normal_map(z, cell):
    _, gx, gy = horn_slope_deg(z, cell)
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.round((n * 0.5 + 0.5) * 255).astype(np.uint8))


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="gale", choices=list(SITES))
    ap.add_argument("--out", required=True)
    ap.add_argument("--extent", type=float, default=3000.0)
    ap.add_argument("--margin", type=float, default=500.0, help="extra DEM around the box for horizons")
    ap.add_argument("--ring-km", type=float, default=15.0, help="coarse distant-terrain ring radius for horizons")
    ap.add_argument("--live-cell", type=float, default=4.0)
    ap.add_argument("--no-ortho", action="store_true")
    ap.add_argument("--work", default=None, help="cache dir for clipped rasters")
    ap.add_argument("--hab-x", type=float, default=None); ap.add_argument("--hab-y", type=float, default=None)
    a = ap.parse_args()
    S = SITES[a.site]
    lat0, lon0, ext, cell = S["lat0"], S["lon0"], a.extent, a.live_cell
    work = a.work or os.path.join(a.out, "_work"); os.makedirs(work, exist_ok=True)
    B = Bundle(a.out)
    t0 = time.time()

    # ---- DEM clip (box + margin) at 1 m
    dem = RemoteStripTiff(S["dem"])
    big = ext + 2 * a.margin
    cache = os.path.join(work, "dem_clip.npz")
    if os.path.exists(cache):
        z = np.load(cache); dem_win, dem_raw = tuple(z["win"]), z["raw"]
    else:
        dem_win = window_for(dem, big, lat0, lon0)
        r0, r1, c0, c1 = dem_win
        print(f"DEM window rows {r0}:{r1} cols {c0}:{c1}", flush=True)
        dem_raw = dem.read_window(r0, r1, c0, c1, label="DEM")
        np.savez(cache, win=np.array(dem_win), raw=dem_raw)
    r0, r1, c0, c1 = dem_win
    z1_big = resample_to_local(dem_raw, dem, r0, c0, 1, big, 1.0, lat0, lon0, nodata=dem.nodata)
    m = int(a.margin)
    z1 = z1_big[m: m + int(ext), m: m + int(ext)]
    nodata_frac = float(np.isnan(z1).mean())
    print(f"DEM clipped: {z1.shape}, nodata {nodata_frac:.4%}, z {np.nanmin(z1):.1f}..{np.nanmax(z1):.1f} m ({time.time()-t0:.0f}s)", flush=True)
    assert nodata_frac < 0.02, "too much DEM no-data in the box"
    z1f = np.where(np.isnan(z1), np.nanmean(z1), z1)
    z1_bigf = np.where(np.isnan(z1_big), np.nanmean(z1_big), z1_big)
    np.save(os.path.join(work, "dem_1m_local.npy"), z1f.astype(np.float32))  # for ML layers (M2, M3)

    # ---- distant ring (decimated DEM rows) for horizons, e.g. Mount Sharp to the south
    ring_cell = 32.0
    ring_ext = 2 * a.ring_km * 1000
    rc = os.path.join(work, "dem_ring.npz")
    try:
        if os.path.exists(rc):
            q = np.load(rc); ring_win, ring_raw = tuple(q["win"]), q["raw"]
        else:
            rr0, rr1, rc0, rc1 = window_for(dem, ring_ext, lat0, lon0, pad=40)
            ring_win = (rr0, rr1, rc0, rc1)
            ring_raw = dem.read_window(rr0, rr1, rc0, rc1, row_step=32, col_step=32, label="ring")
            np.savez(rc, win=np.array(ring_win), raw=ring_raw)
        z_ring = resample_to_local(ring_raw, dem, ring_win[0], ring_win[2], 32, ring_ext, ring_cell, lat0, lon0, nodata=dem.nodata)
        z_ring = np.where(np.isnan(z_ring), np.nanmin(z_ring), z_ring)
    except AssertionError:
        z_ring = None
        print("ring outside DEM; horizons use the local margin only", flush=True)

    # ---- live grid rasters (4 m)
    k = int(cell)
    z4 = block(z1f, k, np.mean)
    n4 = z4.shape[0]
    slope4, _, _ = horn_slope_deg(z4, cell)
    slope1, _, _ = horn_slope_deg(z1f, 1.0)
    smax = block(slope1, k, np.max)
    p50 = block(slope1, k, np.median)
    p90 = block(slope1, k, lambda x, axis: np.percentile(x, 90, axis=axis))
    rough = plane_rms(z1f, k)
    relief1 = z1f - ndimage.gaussian_filter(z1_bigf, 15.0)[m: m + int(ext), m: m + int(ext)]
    relief4 = block(relief1, k, np.mean)
    nod4 = block(np.isnan(z1).astype(np.float32), k, np.max) > 0
    for arr in (slope4, smax, p50, p90, rough, relief4):
        arr[nod4] = np.nan

    B.raw("height_4m.f32", z4, np.float32, extra={"units": "m", "datum": "DEM heights as stored by USGS (see manifest.elevation.note)"})
    B.q8("slope_4m.u8", slope4, 0.25, extra={"units": "deg", "method": "Horn 1981 on 4 m grid"})
    B.q8("slopeMax1m_4m.u8", smax, 0.25, extra={"units": "deg", "method": "max Horn slope of 1 m DEM inside each 4 m cell"})
    B.q8("slopeP50.u8", p50, 0.25, extra={"units": "deg", "method": "median 1 m slope per 4 m cell (placeholder until Monte Carlo band)"})
    B.q8("slopeP90.u8", p90, 0.25, extra={"units": "deg", "method": "90th percentile 1 m slope per 4 m cell (placeholder until Monte Carlo band)"})
    B.q8("rough_4m.u8", rough, 0.01, extra={"units": "m", "method": "RMS residual of plane fit to 1 m DEM in 4x4 block"})
    B.q8("relief_4m.u8", relief4, 0.1, offset=-12.7, extra={"units": "m", "method": "1 m DEM minus Gaussian(sigma 15 m), block mean"})
    print(f"live rasters done ({time.time()-t0:.0f}s)", flush=True)

    # ---- horizon map: local margin DEM at 4 m, merged with the coarse ring for far terrain
    zb4 = block(z1_bigf, k, np.mean)
    hz_local = horizon_angles(zb4, cell, 32, max_dist=a.margin + ext)
    mb = int(a.margin / cell)
    hz = hz_local[:, mb: mb + n4, mb: mb + n4]
    if z_ring is not None:
        hz_ring = horizon_angles(z_ring, ring_cell, 32)
        # sample ring horizons at live-cell centres
        xs, ys, _ = grid_centres(ext, cell)
        X, Y = np.meshgrid(xs, ys)
        rr = (ring_ext / 2 - Y) / ring_cell - 0.5; cc = (X + ring_ext / 2) / ring_cell - 0.5
        for kk in range(32):
            hz[kk] = np.maximum(hz[kk], ndimage.map_coordinates(hz_ring[kk], [rr, cc], order=1))
    B.q8("horizon_32az.u8", hz, 0.5, nodata=None or 255, extra={
        "units": "deg", "azimuths": "32, k*11.25 deg clockwise from north", "method": "max elevation angle; local 4 m DEM to box+margin, plus 32 m ring to %.0f km" % a.ring_km})
    svf = np.mean(np.cos(np.radians(hz)) ** 2, axis=0)
    B.q8("svf.u8", svf, 1 / 254, extra={"units": "fraction", "method": "SVF = mean cos^2(h_k) (Dozier and Frew 1990 style)"})
    print(f"horizons done ({time.time()-t0:.0f}s)", flush=True)

    # ---- habitat haven: flattest 4 m cell within 300 m of campaign entry point, unless given
    wp = load_waypoints(S["waypoints"], work)
    def ll_local(p):  # from lat/lon fields: easting/northing conventions differ between rover map files
        return (R_MARS * math.cos(math.radians(lat0)) * math.radians(p["lon"] - lon0), R_MARS * math.radians(p["lat"] - lat0))
    track = [(p["sol"], *ll_local(p), p["site"], p["drive"]) for p in wp if S["sols"][0] <= p["sol"] <= S["sols"][1]]
    track = [t for t in track if abs(t[1]) < ext / 2 and abs(t[2]) < ext / 2]
    def rc_of(x, y): return int((ext / 2 - y) / cell), int((x + ext / 2) / cell)
    if a.hab_x is not None:
        hx, hy = a.hab_x, a.hab_y
    else:
        entry = min(track, key=lambda t: abs(t[0] - S["hab_sol"]))
        er, ec = rc_of(entry[1], entry[2])
        rad = int(300 / cell)
        sub = ndimage.uniform_filter(np.nan_to_num(smax, nan=90), 5)
        r_lo, c_lo = max(0, er - rad), max(0, ec - rad)
        win = sub[r_lo: er + rad, c_lo: ec + rad]
        rr_, cc_ = np.unravel_index(np.argmin(win), win.shape)
        hr, hc = r_lo + rr_, c_lo + cc_
        hx, hy = -ext / 2 + cell * (hc + 0.5), ext / 2 - cell * (hr + 0.5)
    hr, hc = rc_of(hx, hy)
    vis = viewshed(z4, cell, hr, hc, h_obs=3.0)
    B.q8("viewshed_hab.u8", vis.astype(np.float32), 1.0, extra={"units": "0/1", "method": "line of sight from habitat antenna 3 m (ASSUMPTION) to 1.7 m eye height"})

    # ---- normal map (2048) from the 1 m DEM
    zN = ndimage.zoom(z1f, 2048 / z1f.shape[0], order=1)
    B.image("normal_2048.png", normal_map(zN, ext / 2048), extra={"encoding": "RGB = (n*0.5+0.5)*255, x east, y north, z up"})

    # ---- ortho: 25 cm clip, local grid at 0.25 m, quadtree tiles + overview
    ortho_entry = None
    if not a.no_ortho:
        oc = os.path.join(work, "ortho_clip.npz")
        orth = RemoteStripTiff(S["ortho"])
        if os.path.exists(oc):
            q = np.load(oc); ow, oraw = tuple(q["win"]), q["raw"]
        else:
            ow = window_for(orth, ext, lat0, lon0)
            print(f"ortho window rows {ow[0]}:{ow[1]} cols {ow[2]}:{ow[3]}", flush=True)
            oraw = orth.read_window(*ow, workers=48, label="ortho")
            np.savez(oc, win=np.array(ow), raw=oraw)
        o = resample_to_local(oraw, orth, ow[0], ow[2], 1, ext, 0.25, lat0, lon0, nodata=orth.nodata)
        print(f"ortho clipped {o.shape}, nodata {np.isnan(o).mean():.3%} ({time.time()-t0:.0f}s)", flush=True)
        o8 = np.nan_to_num(o, nan=0).clip(0, 255).astype(np.uint8)
        np.save(os.path.join(work, "ortho_025m_local.npy"), o8)  # for ML layers (M2, M3)
        ortho_entry = write_ortho_tiles(B, o8, ext)
        B.image("ortho_4096.jpg", Image.fromarray(o8).resize((4096, 4096), Image.LANCZOS), extra={"units": "greyscale DN", "resolutionM": ext / 4096})

    # ---- manifest
    targets, route = site_targets(track, S)
    manifest = {
        "siteId": f"{a.site}-boxwork" if a.site == "gale" else a.site,
        "name": S["name"], "body": "Mars", "version": "0.2.0",
        "crs": {"proj4": f"+proj=eqc +lat_ts={lat0} +lat_0={lat0} +lon_0={lon0} +x_0=0 +y_0=0 +R={R_MARS:.0f} +units=m +no_defs",
                "origin": {"lat": lat0, "lon": lon0}, "datum": f"sphere R={R_MARS:.0f} m (Mars 2000, IAU)", "lonDomain": "-180..180",
                "axes": "x east, y north, metres; rasters north-up, row 0 = north edge; cell centre x=-extent/2+cell*(c+0.5), y=extent/2-cell*(r+0.5)",
                "source": "USGS equirectangular clon 0, lat_ts 0 (E=R*lon, N=R*lat), resampled bilinear to true local metres"},
        "grid": {"liveM": cell, "cols": n4, "rows": n4, "extentM": ext},
        "elevation": {"min": float(np.nanmin(z4)), "max": float(np.nanmax(z4)),
                      "note": "USGS merged DEM heights (relative to the Mars areoid per USGS product description; VERIFY). Relative relief is what the engine uses.",
                      "nodataFraction": nodata_frac},
        "files": B.files,
        "orthoTiles": ortho_entry,
        "layers": layers_for(S),
        "patches": [], "splats": [],
        "havens": [{"id": "hab", "type": "habitat", "x": round(hx, 1), "y": round(hy, 1), "note": "ASSUMPTION: flattest cell near the campaign entry point"}],
        "targets": targets,
        "povImages": [],
        "route": route,
        "build": {"script": "pipeline/build_site.py", "args": vars(a), "seconds": round(time.time() - t0)},
    }
    manifest["siteHash"] = hashlib.sha256("".join(f["sha256"] for f in B.files).encode()).hexdigest()[:16]
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"bundle written to {a.out} in {time.time()-t0:.0f}s, siteHash {manifest['siteHash']}", flush=True)


def write_ortho_tiles(B, o8, ext, tile=512, max_level=5):
    """Quadtree: level L has 2^L x 2^L tiles, each covering ext/2^L metres, 512 px, north-up, tiles/L/row_col.jpg"""
    H = o8.shape[0]
    img = Image.fromarray(o8)
    n_files = 0
    for L in range(max_level + 1):
        n = 2 ** L
        size = n * tile
        lvl = img.resize((size, size), Image.LANCZOS) if size != H else img
        for r in range(n):
            for c in range(n):
                t = lvl.crop((c * tile, r * tile, (c + 1) * tile, (r + 1) * tile))
                p = os.path.join(B.out, "ortho", str(L), f"{r}_{c}.jpg")
                os.makedirs(os.path.dirname(p), exist_ok=True)
                t.save(p, quality=85); n_files += 1
    return {"path": "ortho/{level}/{row}_{col}.jpg", "tileSize": tile, "maxLevel": max_level,
            "tileExtentM": f"{ext}/2^level", "nativeResolutionM": 0.25, "count": n_files,
            "note": "greyscale HiRISE orthophoto; colour mosaic not used yet"}


def load_waypoints(url, work):
    p = os.path.join(work, os.path.basename(url))
    if not os.path.exists(p):
        with open(p, "wb") as f:
            f.write(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read())
    return [ft["properties"] for ft in json.load(open(p))["features"]]


def site_targets(track, S):
    """Targets at the last localized waypoint at or before each target sol (rover end-of-drive positions)."""
    out = []
    for tid, name, typ, sol in S["targets"]:
        prior = [t for t in track if t[0] <= sol] or track
        t = max(prior, key=lambda t: t[0])
        out.append({"id": tid, "name": name, "type": typ, "x": round(float(t[1]), 1), "y": round(float(t[2]), 1),
                    "sol": sol, "source": f"{os.path.basename(S['waypoints'])}, last localized waypoint at or before sol {sol} (sol {t[0]}, site {t[3]} drive {t[4]}); VERIFY with PDS PLACES"})
    route = {"source": f"NASA/JPL {os.path.basename(S['waypoints'])} (mars.nasa.gov MMGIS), sols {S['sols'][0]}-{S['sols'][1]} inside the box",
             "points": [[round(float(t[1]), 1), round(float(t[2]), 1)] for t in track],
             "sols": [int(t[0]) for t in track]}
    return out, route


def layers_for(S):
    return [
        {"id": "ortho", "kind": "optical", "mission": "MRO", "instrument": "HiRISE", "productId": S["ortho_id"],
         "resolutionM": 0.25, "acquired": "various", "tag": "OBSERVED", "attribution": "NASA/JPL/University of Arizona; USGS Astrogeology", "url": S["ortho_page"]},
        {"id": "dem", "kind": "topographic", "mission": "MRO", "instrument": "HiRISE (+CTX, HRSC, MOLA)", "productId": S["dem_id"],
         "resolutionM": 1, "acquired": "various", "tag": "OBSERVED", "attribution": "USGS Astrogeology; NASA/JPL/University of Arizona", "url": S["dem_page"]},
        {"id": "slope", "kind": "topographic", "mission": "MRO", "instrument": "derived from HiRISE DEM", "productId": "slope_4m, slopeMax1m_4m",
         "resolutionM": 4, "acquired": "various", "tag": "DERIVED", "attribution": "Mars BEACON pipeline/build_site.py", "url": ""},
        {"id": "roughness", "kind": "topographic", "mission": "MRO", "instrument": "derived from HiRISE DEM", "productId": "rough_4m",
         "resolutionM": 4, "acquired": "various", "tag": "DERIVED", "attribution": "Mars BEACON pipeline/build_site.py", "url": ""},
        {"id": "relief", "kind": "topographic", "mission": "MRO", "instrument": "derived from HiRISE DEM", "productId": "relief_4m",
         "resolutionM": 4, "acquired": "various", "tag": "DERIVED", "attribution": "Mars BEACON pipeline/build_site.py", "url": ""},
        {"id": "illumination", "kind": "illumination", "mission": "MRO", "instrument": "horizon map from HiRISE DEM", "productId": "horizon_32az, svf",
         "resolutionM": 4, "acquired": "n/a", "tag": "DERIVED", "attribution": "Mars BEACON pipeline/build_site.py", "url": ""},
        {"id": "rover_route", "kind": "rover", "mission": S["rover"], "instrument": "localized waypoints", "productId": os.path.basename(S["waypoints"]),
         "resolutionM": 1, "acquired": f"sols {S['sols'][0]}-{S['sols'][1]}", "tag": "HISTORICAL", "attribution": "NASA/JPL-Caltech", "url": S["waypoints"]},
    ]


if __name__ == "__main__":
    main()
