"""Read and extend an existing site bundle (manifest.json + raw rasters)."""
import hashlib, json, os

import numpy as np


class BundleIO:
    def __init__(self, path):
        self.path = path
        self.m = json.load(open(os.path.join(path, "manifest.json")))
        self.work = os.path.join(path, "_work")

    @property
    def grid(self):
        g = self.m["grid"]; return g["extentM"], g["liveM"], g["rows"]

    def load(self, name):
        f = next(f for f in self.m["files"] if f["name"] == name)
        a = np.fromfile(os.path.join(self.path, f["path"]), f["dtype"])
        a = a.reshape(-1, f["rows"], f["cols"]).squeeze()
        if f["dtype"] == "uint8" and "nodata" in f:
            a = np.where(a == f["nodata"], np.nan, a * f["scale"] + f["offset"])
        return a

    def put_u8(self, name, arr, scale, offset=0.0, nodata=255, meta=None):
        q = np.round((arr - offset) / scale)
        q = np.where(np.isfinite(arr), np.clip(q, 0, 254), nodata).astype(np.uint8)
        p = f"{name}.u8"
        q.tofile(os.path.join(self.path, p))
        e = {"name": name, "path": p, "dtype": "uint8", "cols": int(q.shape[-1]), "rows": int(q.shape[-2]),
             "scale": scale, "offset": offset, "nodata": nodata, "sha256": _sha(os.path.join(self.path, p))}
        if q.ndim == 3:
            e["bands"] = int(q.shape[0]); e["layout"] = "band-major [band][row][col]"
        e.update(meta or {})
        self.m["files"] = [f for f in self.m["files"] if f["name"] != name] + [e]
        return e

    def put_layer(self, layer):
        self.m["layers"] = [l for l in self.m["layers"] if l["id"] != layer["id"]] + [layer]

    def save(self):
        self.m["siteHash"] = hashlib.sha256("".join(f["sha256"] for f in self.m["files"]).encode()).hexdigest()[:16]
        json.dump(self.m, open(os.path.join(self.path, "manifest.json"), "w"), indent=1)
        return self.m["siteHash"]


def _sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()
