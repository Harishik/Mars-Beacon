"""Run M1 on Navcam images: per-pixel class probabilities (soil, bedrock, sand, big rock) and normalised entropy.

For each input image writes <stem>_probs.png (RGBA = soil, bedrock, sand, big rock probabilities x 255),
<stem>_entropy.png (H / log 4 x 255) and <stem>_overlay.jpg (colour overlay for POV pins / the browser demo).
These per-pixel maps are what Harishik projects through the matching XYZ products into the site frame
(plan 24 section 3: rasterise at 0.25 m, summarise to 4 m class_probs + entropy).

Usage: python infer_m1.py --run C:/Users/sahaj/MarsBeaconData/runs/m1_run1 --out OUT image1.jpg image2.png ...
"""
import argparse, os

import numpy as np
import torch
from PIL import Image
import segmentation_models_pytorch as smp

from train_m1 import MEAN, STD, NUM_CLASSES, CLASS_NAMES

COLORS = np.array([[201, 160, 110], [120, 120, 140], [235, 205, 90], [200, 60, 50]], np.float32)  # soil, bedrock, sand, big rock


def load_model(run, dev):
    from torch.torch_version import TorchVersion
    with torch.serialization.safe_globals([TorchVersion]):
        ck = torch.load(os.path.join(run, "best.pt"), map_location=dev, weights_only=True)
    cfg = ck["cfg"]
    m = getattr(smp, cfg["arch"])(encoder_name=cfg["encoder"], encoder_weights=None, classes=NUM_CLASSES)
    m.load_state_dict(ck["model"])
    return m.to(dev).eval()


def load_bias(run, dev):
    """Big-rock logit bias from calibrate_m1.py (zeros if the run was not calibrated)."""
    p = os.path.join(run, "m1_calibration.json")
    b = __import__("json").load(open(p))["logit_bias"] if os.path.exists(p) else [0.0] * NUM_CLASSES
    return torch.tensor(b, dtype=torch.float32, device=dev).view(1, -1, 1, 1)


@torch.no_grad()
def predict(model, img, dev, bias=0.0):
    a = (np.asarray(img.convert("L"), np.float32) / 255.0 - MEAN) / STD
    h, w = a.shape
    ph, pw = (32 - h % 32) % 32, (32 - w % 32) % 32  # encoder stride
    a = np.pad(a, ((0, ph), (0, pw)), mode="reflect")
    x = torch.from_numpy(a)[None, None].expand(1, 3, -1, -1).to(dev)
    with torch.autocast("cuda", dtype=torch.float16, enabled=dev == "cuda"):
        p = (model(x).float() + bias).softmax(1)[0, :, :h, :w].cpu().numpy()
    ent = -(p * np.log(np.clip(p, 1e-8, 1))).sum(0) / np.log(NUM_CLASSES)
    return p, ent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("images", nargs="+")
    a = ap.parse_args()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_model(a.run, dev)
    bias = load_bias(a.run, dev)
    os.makedirs(a.out, exist_ok=True)
    for path in a.images:
        img = Image.open(path)
        p, ent = predict(model, img, dev, bias)
        stem = os.path.splitext(os.path.basename(path))[0]
        Image.fromarray(np.round(np.moveaxis(p, 0, -1) * 255).astype(np.uint8), "RGBA").save(os.path.join(a.out, stem + "_probs.png"))
        Image.fromarray(np.round(ent * 255).astype(np.uint8)).save(os.path.join(a.out, stem + "_entropy.png"))
        g = np.asarray(img.convert("RGB"), np.float32)
        col = COLORS[p.argmax(0)]
        Image.fromarray(np.clip(0.6 * g + 0.4 * col, 0, 255).astype(np.uint8)).save(os.path.join(a.out, stem + "_overlay.jpg"), quality=90)
        frac = {c: round(float((p.argmax(0) == i).mean()), 3) for i, c in enumerate(CLASS_NAMES)}
        print(stem, "class fractions", frac, "mean entropy %.3f" % ent.mean(), flush=True)


if __name__ == "__main__":
    main()
