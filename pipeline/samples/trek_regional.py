"""Regional context around a site bundle from NASA's Mars Trek services (trek.nasa.gov, NASA/JPL).

Writes into <bundle>/regional/:
  mola_160km.f32   MGS MOLA elevation (128/64 ppd merge, NASA) on a 400 x 400 grid, 400 m spacing,
                   site frame (x east, y north, true metres), float32 metres
  ctx_40km.jpg     MRO CTX Gale Crater mosaic (6 m, NASA) resampled to 2048 x 2048 over 40 km, coloured with
                   the Viking MDIM 2.1 colour mosaic (NASA) by ratio sharpening: colour from Viking, detail from CTX
  site_colour.png  Viking colour over the 3 km site box (64 x 64), for tinting the HiRISE greyscale
  regional.json    sources, grids, offsets
Only NASA products are used (the HRSC-blended layers are left out because HRSC is an ESA instrument).

Usage: python trek_regional.py ../../fixtures/bundle/gale-boxwork
"""
import io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter

R = 3396190.0
TREK = "https://trek.nasa.gov/tiles/Mars/EQ"
MOLA_IS = "https://trek.nasa.gov/mars/trekarcgis/rest/services/mola128_mola64_merge_90Nto90S_SimpleC_clon0/ImageServer"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mars-beacon-pipeline"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def wmts_mosaic(layer, ext, z, lon_min, lon_max, lat_min, lat_max):
    """Mosaic of EQ WMTS tiles (level z: 2^(z+1) x 2^z tiles of 256 px) and its lon/lat bounds."""
    tdeg = 180.0 / 2 ** z
    c0, c1 = int((lon_min + 180) // tdeg), int((lon_max + 180) // tdeg)
    r0, r1 = int((90 - lat_max) // tdeg), int((90 - lat_min) // tdeg)
    mos = np.zeros(((r1 - r0 + 1) * 256, (c1 - c0 + 1) * 256, 3), np.float32)
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            try:
                im = Image.open(io.BytesIO(get(f"{TREK}/{layer}/1.0.0/default/default028mm/{z}/{r}/{c}.{ext}"))).convert("RGB")
                mos[(r - r0) * 256:(r - r0 + 1) * 256, (c - c0) * 256:(c - c0 + 1) * 256] = np.asarray(im, np.float32) / 255
            except Exception as e:  # missing tile = no coverage
                print("missing", layer, z, r, c, e)
    bounds = (c0 * tdeg - 180, (c1 + 1) * tdeg - 180, 90 - (r1 + 1) * tdeg, 90 - r0 * tdeg)
    return mos, bounds


def sample(img, bounds, lon, lat):
    """Bilinear sample of a lon/lat image at arrays of lon, lat."""
    lo0, lo1, la0, la1 = bounds
    h, w = img.shape[:2]
    fx = np.clip((lon - lo0) / (lo1 - lo0) * w - 0.5, 0, w - 1.001)
    fy = np.clip((la1 - lat) / (la1 - la0) * h - 0.5, 0, h - 1.001)
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = (fx - x0)[..., None], (fy - y0)[..., None]
    a = img[y0, x0] * (1 - tx) + img[y0, x0 + 1] * tx
    b = img[y0 + 1, x0] * (1 - tx) + img[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


def site_grid(lat0, lon0, half, n):
    """lon, lat arrays for an n x n grid over [-half, half] site metres (row 0 = north)."""
    c = (np.arange(n) + 0.5) / n * 2 * half - half
    x, y = np.meshgrid(c, -c)
    lat = lat0 + np.degrees(y / R)
    lon = lon0 + np.degrees(x / (R * math.cos(math.radians(lat0))))
    return lon, lat


def main():
    bundle = sys.argv[1]
    man = json.load(open(os.path.join(bundle, "manifest.json")))
    lat0, lon0 = man["crs"]["origin"]["lat"], man["crs"]["origin"]["lon"]
    out = os.path.join(bundle, "regional")
    os.makedirs(out, exist_ok=True)
    k = math.cos(math.radians(lat0))
    meta = {"origin": {"lat": lat0, "lon": lon0}, "frame": "site frame: x east, y north, true metres; row 0 = north"}

    # 1. MOLA elevation, 160 km square, 400 m spacing.
    half, n = 80000.0, 400
    dlat, dlon = math.degrees(half / R) * 1.02, math.degrees(half / (R * k)) * 1.02
    bbox = (lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat)
    raw = get(f"{MOLA_IS}/exportImage?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}&size=600,600&format=tiff&pixelType=F32"
              f"&interpolation=RSP_BilinearInterpolation&f=image")
    mola = np.array(Image.open(io.BytesIO(raw)), np.float32)[..., None]
    lon, lat = site_grid(lat0, lon0, half, n)
    z = sample(mola, (bbox[0], bbox[2], bbox[1], bbox[3]), lon, lat)[..., 0].astype("<f4")
    z.tofile(os.path.join(out, "mola_160km.f32"))
    # Offset between MOLA and the site's HiRISE DEM at the box (heights are joined at the seam).
    H = np.fromfile(os.path.join(bundle, man["files"][0]["path"]) if man["files"][0]["name"].startswith("height") else
                    os.path.join(bundle, "height_4m.f32"), "<f4")
    zc = z[n // 2 - 4:n // 2 + 4, n // 2 - 4:n // 2 + 4].mean()
    meta["mola"] = {"path": "regional/mola_160km.f32", "cols": n, "rows": n, "spacingM": 2 * half / n, "extentM": 2 * half,
                    "source": "MGS MOLA 128/64 ppd merged global DEM (NASA), Trek ArcGIS image service mola128_mola64_merge_90Nto90S_SimpleC_clon0",
                    "minM": float(z.min()), "maxM": float(z.max()), "centreM": float(zc), "siteDemMeanM": float(np.nanmean(H)),
                    "offsetToSiteM": float(np.nanmean(H) - zc)}

    # 2. CTX 40 km, coloured with Viking.
    half2, n2 = 20000.0, 2048
    dlat2, dlon2 = math.degrees(half2 / R) * 1.01, math.degrees(half2 / (R * k)) * 1.01
    ctx, cb = wmts_mosaic("Gale_CTX_BlockAdj_dd", "png", 11, lon0 - dlon2, lon0 + dlon2, lat0 - dlat2, lat0 + dlat2)
    vik, vb = wmts_mosaic("Mars_Viking_MDIM21_ClrMosaic_global_232m", "jpg", 7, lon0 - dlon2, lon0 + dlon2, lat0 - dlat2, lat0 + dlat2)
    lon2, lat2 = site_grid(lat0, lon0, half2, n2)
    g = sample(ctx, cb, lon2, lat2).mean(-1)
    v = sample(vik, vb, lon2, lat2)
    gi = Image.fromarray(np.clip(g * 255, 0, 255).astype(np.uint8))
    blur = np.asarray(gi.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255  # about 100 m, near the Viking resolution
    detail = np.clip((g + 0.02) / (blur + 0.02), 0.4, 2.2)[..., None]
    rgb = np.clip(v * detail, 0, 1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(os.path.join(out, "ctx_40km.jpg"), quality=88)
    meta["ctx"] = {"path": "regional/ctx_40km.jpg", "size": n2, "extentM": 2 * half2,
                   "source": "MRO CTX Gale Crater mosaic Gale_CTX_BlockAdj_dd (NASA/JPL/MSSS), coloured by ratio with Viking MDIM 2.1 colour (NASA/USGS), via Mars Trek",
                   "note": "Colour is the Viking orbital colour (about 230 m), detail is CTX (6 m resampled to 20 m). Display only."}

    # 3. Viking colour over the site box, for tinting HiRISE.
    E = man["grid"]["extentM"] / 2
    lon3, lat3 = site_grid(lat0, lon0, E, 64)
    sc = sample(vik, vb, lon3, lat3)
    Image.fromarray((np.clip(sc, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, "site_colour.png"))
    meta["siteColour"] = {"path": "regional/site_colour.png", "meanRGB": [float(x) for x in sc.reshape(-1, 3).mean(0)],
                          "source": "Viking MDIM 2.1 colour mosaic (NASA/USGS) via Mars Trek, about 330 m per pixel at the level used"}
    json.dump(meta, open(os.path.join(out, "regional.json"), "w"), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
