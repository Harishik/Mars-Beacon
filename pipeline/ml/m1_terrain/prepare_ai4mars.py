"""Extract the AI4Mars MSL split from parquet into image/label files for M1 training.

Source: AI4Mars (Swan et al. 2021), official record https://zenodo.org/records/15995036 (CC-BY-4.0).
Downloaded from the Hugging Face mirror hassanjbara/AI4MARS for speed (same MSL split:
16,064 labelled train images, 322 expert-labelled test images at min1/min2/min3 agreement).

Label classes: 0 soil, 1 bedrock, 2 sand, 3 big rock, 255 = no label.
Pixels on the rover body (rover_mask) or beyond 30 m (range_mask) are set to 255 (ignored),
following the AI4Mars paper.

Output layout (OUT/<split>/):  <stem>.jpg (original bytes, unmodified)  <stem>_lbl.png
Also writes OUT/splits.json with a sol-grouped train/val split (val ~5 percent of sols),
so near-duplicate frames from one sol never straddle train and val.

Usage: python prepare_ai4mars.py --src C:/Users/sahaj/MarsBeaconData/ai4mars_parquet --out C:/Users/sahaj/MarsBeaconData/ai4mars
"""
import argparse, glob, io, json, os, random, re
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import polars as pl
from PIL import Image

MSL_SOL_S = 88775.244  # seconds per sol (Allison and McEwen 2000)


def decode(v):
    if v is None or v.get("bytes") is None:
        return None
    return np.array(Image.open(io.BytesIO(v["bytes"])))


def process_file(args):
    path, out_dir = args
    os.makedirs(out_dir, exist_ok=True)
    df = pl.read_parquet(path)
    stems = []
    for r in df.iter_rows(named=True):
        if not r["has_labels"]:
            continue
        name = os.path.basename(r["image"]["path"])
        stem = os.path.splitext(name)[0]
        lbl = decode(r["label_mask"]).astype(np.uint8)
        if lbl.ndim == 3:
            lbl = lbl[..., 0]
        for k in ("rover_mask", "range_mask"):
            m = decode(r[k])
            if m is not None:
                if m.ndim == 3:
                    m = m[..., 0]
                lbl[m > 0] = 255
        with open(os.path.join(out_dir, stem + ".jpg"), "wb") as f:
            f.write(r["image"]["bytes"])
        Image.fromarray(lbl).save(os.path.join(out_dir, stem + "_lbl.png"))
        stems.append(stem)
    return out_dir, stems


def sol_of(stem):
    m = re.match(r"N[LR][A-Z]_(\d{9})", stem)  # spacecraft clock seconds in the PDS product id
    return int(int(m.group(1)) // MSL_SOL_S) if m else -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--val-frac", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()

    jobs = []
    for p in sorted(glob.glob(os.path.join(a.src, "*.parquet"))):
        split = os.path.basename(p).split("-")[0]  # train, test_min1, test_min2, test_min3
        jobs.append((p, os.path.join(a.out, split)))
    found = {}
    with ProcessPoolExecutor(a.workers) as ex:
        for out_dir, stems in ex.map(process_file, jobs):
            found.setdefault(os.path.basename(out_dir), []).extend(stems)
            print(out_dir, len(stems), flush=True)

    train = sorted(found["train"])
    sols = sorted({sol_of(s) for s in train})
    rng = random.Random(a.seed)
    val_sols = set(rng.sample(sols, max(1, int(len(sols) * a.val_frac))))
    splits = {
        "train": [s for s in train if sol_of(s) not in val_sols],
        "val": [s for s in train if sol_of(s) in val_sols],
        **{k: sorted(v) for k, v in found.items() if k.startswith("test")},
        "seed": a.seed,
        "note": "val = held-out sols from the AI4Mars train split; test_* untouched until final evaluation",
    }
    with open(os.path.join(a.out, "splits.json"), "w") as f:
        json.dump(splits, f)
    print({k: len(v) for k, v in splits.items() if isinstance(v, list)})


if __name__ == "__main__":
    main()
