"""L1 rover stereo fusion at a waypoint (26_Terrain_Reconstruction.md, L1).

Reads Curiosity Navcam XYZ RDR products (stereo-derived 3D points, PDS Imaging
Node), moves them from the rover's SITE frame into the site bundle's map frame
using the PDS PLACES site origin, measures agreement with the HiRISE terrain,
and writes a high-resolution ground patch into the bundle.

Frames:
  MSL SITE frame: X north, Y east, Z down, metres, origin at the site.
  PLACES gives each site origin as easting/northing (eqc, R = 3396190 m) and
  elevation, the same projection as the USGS Gale mosaics, so no extra
  registration step is needed; a residual vertical offset is measured and reported.

  python3 fuse_navcam_xyz.py BUNDLE_DIR --places localized_pos.csv --xyz a.IMG [b.IMG ...]
"""
import argparse, json, math, os, re, sys
import numpy as np

R = 3396190.0


def read_pds3_xyz(path):
    """Minimal PDS3/VICAR reader for MSL XYZ RDRs (3 bands, float32). Returns (xyz[3,L,S], label dict)."""
    raw = open(path, "rb").read()
    head = raw[:200000].decode("latin-1", "ignore")
    blk = re.search(r"^OBJECT\s*=\s*IMAGE\s*$(.*?)^END_OBJECT\s*=\s*IMAGE\s*$", head, re.M | re.S)
    img = blk.group(1) if blk else head
    def num(key, default=None, src=None):
        m = re.search(rf"^\s*{key}\s*=\s*([0-9.+-]+)", src if src is not None else head, re.M)
        return float(m.group(1)) if m else default
    def txt(key):
        m = re.search(rf'^\s*{key}\s*=\s*"?([A-Z0-9_ ]+)"?', head, re.M)
        return m.group(1).strip() if m else None
    rec = int(num("RECORD_BYTES"))
    ptr = re.search(r"^\s*\^IMAGE\s*=\s*\(?\s*\"?[^\",)]*\"?\s*,?\s*([0-9]+)\s*(<BYTES>)?", head, re.M)
    m = re.search(r"^\s*\^IMAGE\s*=\s*([0-9]+)\s*(<BYTES>)?", head, re.M)
    if m:
        off = int(m.group(1)) - 1 if not m.group(2) else int(m.group(1)) - 1
        off = off * rec if not m.group(2) else int(m.group(1)) - 1
    elif ptr:
        off = (int(ptr.group(1)) - 1) * rec
    else:
        raise ValueError("no ^IMAGE pointer")
    L, S, B = int(num("LINES", src=img)), int(num("LINE_SAMPLES", src=img)), int(num("BANDS", 1, src=img))
    m2 = re.search(r'^\s*SAMPLE_TYPE\s*=\s*"?([A-Z_]+)', img, re.M)
    stype = m2.group(1) if m2 else "IEEE_REAL"
    dt = np.dtype("<f4") if stype.startswith("PC") else np.dtype(">f4")
    prefix = int(num("LINE_PREFIX_BYTES", 0, src=img) or 0)
    if prefix:
        arr = np.frombuffer(raw, dtype=np.uint8, count=B * L * (S * 4 + prefix), offset=off).reshape(B, L, S * 4 + prefix)[:, :, prefix:]
        data = np.frombuffer(arr.tobytes(), dtype=dt).reshape(B, L, S)
    else:
        data = np.frombuffer(raw, dtype=dt, count=B * L * S, offset=off).reshape(B, L, S)
    d = re.search(r"GROUP\s*=\s*DERIVED_IMAGE_PARMS(.*?)END_GROUP\s*=\s*DERIVED_IMAGE_PARMS", head, re.S)
    dg = d.group(1) if d else head
    fm = re.search(r'REFERENCE_COORD_SYSTEM_NAME\s*=\s*"([A-Z_]+)"', dg)
    im = re.search(r"REFERENCE_COORD_SYSTEM_INDEX\s*=\s*\(?\s*([0-9]+)", dg)
    frame = fm.group(1) if fm else None
    site = int(im.group(1)) if im else None
    return data.astype(np.float64), {"frame": frame, "site": site, "lines": L, "samples": S}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--places", required=True)
    ap.add_argument("--xyz", nargs="+", required=True)
    ap.add_argument("--res", type=float, default=0.25, help="patch grid spacing, metres")
    ap.add_argument("--size", type=float, default=64.0, help="patch side, metres")
    ap.add_argument("--max-range", type=float, default=30.0, help="ignore points farther than this from the rover")
    ap.add_argument("--register", help="JSON with dx, dy (m) and rmse/rmse0 from a registration search against the 1 m DEM")
    a = ap.parse_args()

    man = json.load(open(os.path.join(a.bundle, "manifest.json")))
    lat0, lon0 = man["crs"]["origin"]["lat"], man["crs"]["origin"]["lon"]
    cx, cy = R * math.radians(lon0), R * math.radians(lat0)
    g = man["grid"]
    h4 = np.fromfile(os.path.join(a.bundle, "height_4m.f32"), dtype=np.float32).reshape(g["rows"], g["cols"])

    import csv
    rows = list(csv.DictReader(open(a.places)))
    sites = {int(r["site"]): r for r in rows if r["frame"] == "SITE"}

    pts = []
    meta = []
    for f in a.xyz:
        xyz, lab = read_pds3_xyz(f)
        if lab["frame"] != "SITE_FRAME" and not (lab["frame"] or "").startswith("SITE"):
            print(f"skip {os.path.basename(f)}: frame {lab['frame']}", file=sys.stderr); continue
        so = sites.get(lab["site"])
        if not so:
            print(f"skip {os.path.basename(f)}: site {lab['site']} not in PLACES", file=sys.stderr); continue
        X, Y, Z = xyz[0].ravel(), xyz[1].ravel(), xyz[2].ravel()
        ok = (X != 0) | (Y != 0) | (Z != 0)
        ok &= np.isfinite(X) & np.isfinite(Y) & np.isfinite(Z) & (np.hypot(X, Y) < 1e5)
        E = float(so["easting"]) + Y[ok]
        Nn = float(so["northing"]) + X[ok]
        H = float(so["elevation"]) - Z[ok]
        pts.append(np.stack([E - cx, Nn - cy, H], 1))
        meta.append({"file": os.path.basename(f), "site": lab["site"], "points": int(ok.sum())})
    if not pts:
        raise SystemExit("no usable XYZ products")
    P = np.concatenate(pts)

    reg = json.load(open(a.register)) if a.register else None
    if reg:
        P[:, 0] += reg["dx"]; P[:, 1] += reg["dy"]
    # Rover position = site origin of the first product, in the bundle frame.
    so = sites[meta[0]["site"]]
    rx, ry = float(so["easting"]) - cx + (reg["dx"] if reg else 0), float(so["northing"]) - cy + (reg["dy"] if reg else 0)
    near = np.hypot(P[:, 0] - rx, P[:, 1] - ry) < a.max_range
    P = P[near]

    # HiRISE height at each point (bilinear on the 4 m grid).
    def dem(x, y):
        fc = np.clip((x + g["extentM"] / 2) / g["liveM"] - 0.5, 0, g["cols"] - 1.001)
        fr = np.clip((g["extentM"] / 2 - y) / g["liveM"] - 0.5, 0, g["rows"] - 1.001)
        c, r = np.floor(fc).astype(int), np.floor(fr).astype(int)
        tx, ty = fc - c, fr - r
        return (h4[r, c] * (1 - tx) + h4[r, c + 1] * tx) * (1 - ty) + (h4[r + 1, c] * (1 - tx) + h4[r + 1, c + 1] * tx) * ty
    res = P[:, 2] - dem(P[:, 0], P[:, 1])
    offset = float(np.median(res))
    rmse = float(np.sqrt(np.mean((res - offset) ** 2)))
    mad = float(np.median(np.abs(res - offset)))

    # Patch: median rover height per cell, offset removed; gaps filled from HiRISE.
    n = int(a.size / a.res)
    x0, y0 = rx - a.size / 2, ry - a.size / 2
    ci = ((P[:, 0] - x0) / a.res).astype(int)
    ri = ((y0 + a.size - P[:, 1]) / a.res).astype(int)
    keep = (ci >= 0) & (ci < n) & (ri >= 0) & (ri < n)
    patch = np.full((n, n), np.nan)
    from collections import defaultdict
    buckets = defaultdict(list)
    for r_, c_, z in zip(ri[keep], ci[keep], P[keep, 2] - offset):
        buckets[(r_, c_)].append(z)
    for (r_, c_), zs in buckets.items():
        patch[r_, c_] = np.median(zs)
    cover = float(np.isfinite(patch).mean())
    gx = x0 + (np.arange(n) + 0.5) * a.res
    gy = y0 + a.size - (np.arange(n) + 0.5) * a.res
    GX, GY = np.meshgrid(gx, gy)
    base = dem(GX.ravel(), GY.ravel()).reshape(n, n)
    filled = np.where(np.isfinite(patch), patch, base).astype(np.float32)
    weight = np.isfinite(patch).astype(np.uint8) * 255

    pid = f"l1_sol{meta[0]['site']}"
    filled.tofile(os.path.join(a.bundle, f"{pid}_height.f32"))
    weight.tofile(os.path.join(a.bundle, f"{pid}_mask.u8"))
    entry = {"id": pid, "kind": "stereo", "x0": round(x0, 2), "y0": round(y0, 2), "size": a.size, "res": a.res, "cols": n, "rows": n,
             "height": f"{pid}_height.f32", "mask": f"{pid}_mask.u8",
             "validation": {"verticalOffsetM": round(offset, 3), "rmseM": round(rmse, 3), "madM": round(mad, 3), "points": int(len(P)), "coverage": round(cover, 3),
                            **({"horizontalShiftM": [reg["dx"], reg["dy"]], "rmse1mBeforeM": round(reg["rmse0"], 3), "rmse1mAfterM": round(reg["rmse"], 3)} if reg else {})},
             "source": "MSL Navcam XYZ RDR, PDS Imaging Node; site origin from PDS PLACES", "products": meta, "tag": "DERIVED"}
    man["patches"] = [p for p in man.get("patches", []) if p.get("id") != pid] + [entry]
    json.dump(man, open(os.path.join(a.bundle, "manifest.json"), "w"), indent=2)
    print(json.dumps(entry["validation"]), "rover at", round(rx), round(ry))


if __name__ == "__main__":
    main()
