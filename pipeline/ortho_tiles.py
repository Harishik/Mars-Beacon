"""Cut the 25 cm HiRISE orthophoto quadtree tiles for an existing site bundle (the step build_site.py runs,
without rebuilding the rest). Reads only the site window from the USGS mosaic with HTTP range requests.

  python pipeline/ortho_tiles.py --site gale-boxwork [--max-level 5]
"""
import argparse, json, os, sys, time
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import build_site as BS  # noqa: E402

SOURCES = {"gale-boxwork": "gale", "jezero": "jezero"}

ap = argparse.ArgumentParser()
ap.add_argument("--site", default="gale-boxwork")
ap.add_argument("--bundle-root", default=os.path.join(os.path.dirname(__file__), "..", "fixtures", "bundle"))
ap.add_argument("--max-level", type=int, default=5)
ap.add_argument("--work", default="/var/tmp/beacon_ortho")
a = ap.parse_args()

out = os.path.join(a.bundle_root, a.site)
man_p = os.path.join(out, "manifest.json")
m = json.load(open(man_p))
lat0, lon0, ext = m["crs"]["origin"]["lat"], m["crs"]["origin"]["lon"], m["grid"]["extentM"]
S = BS.SITES[SOURCES[a.site]]
os.makedirs(a.work, exist_ok=True)
t0 = time.time()
orth = BS.RemoteStripTiff(S["ortho"])
cache = os.path.join(a.work, f"{a.site}_ortho_clip.npz")
if os.path.exists(cache):
    q = np.load(cache); ow, raw = tuple(q["win"]), q["raw"]
else:
    ow = BS.window_for(orth, ext, lat0, lon0)
    print(f"window rows {ow[0]}:{ow[1]} cols {ow[2]}:{ow[3]}", flush=True)
    raw = orth.read_window(*ow, workers=48, label="ortho")
    np.savez(cache, win=np.array(ow), raw=raw)
print(f"read {raw.shape} in {time.time()-t0:.0f}s", flush=True)
o = BS.resample_to_local(raw, orth, ow[0], ow[2], 1, ext, 0.25, lat0, lon0, nodata=orth.nodata)
o8 = np.nan_to_num(o, nan=0).clip(0, 255).astype(np.uint8)
del o, raw
# Same pixels as the shipped overview? Correlate against ortho_4096.jpg.
ov = np.asarray(Image.open(os.path.join(out, "ortho_4096.jpg")).convert("L"), np.float32)
mine = np.asarray(Image.fromarray(o8).resize((4096, 4096), Image.BILINEAR), np.float32)
r = float(np.corrcoef(ov[::4, ::4].ravel(), mine[::4, ::4].ravel())[0, 1])
print(f"correlation with the shipped overview: {r:.4f}", flush=True)
assert r > 0.95, "tiles do not line up with the bundle's overview"


class _B:  # minimal Bundle stand-in for write_ortho_tiles
    def __init__(self, out): self.out = out


entry = BS.write_ortho_tiles(_B(out), o8, ext, max_level=a.max_level)
entry["overviewCorrelation"] = round(r, 4)
m["orthoTiles"] = entry  # siteHash covers the raster files, not the tiles, so it is unchanged
json.dump(m, open(man_p, "w"), indent=1)
print(f"wrote {entry['count']} tiles in {time.time()-t0:.0f}s", flush=True)
