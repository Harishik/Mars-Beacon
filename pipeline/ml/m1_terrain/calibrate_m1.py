"""Post-hoc calibration of M1: a per-class logit bias that reduces big-rock over-prediction (no retraining).

Median-frequency class weights make big rock high-recall but low-precision. We add a constant b to the big-rock
logit (b <= 0) and choose b by maximising mIoU on the sol-held-out VALIDATION split only. The test sets are then
scored once with the chosen b (they are never used to choose it).

Writes into the run folder: m1_calibration.json (logit_bias, val/test before and after), and re-exports
m1_terrain_cal.onnx / m1_terrain_cal_fp16.onnx with the bias baked into the logits.
Usage: python calibrate_m1.py --data C:/Users/sahaj/MarsBeaconData/ai4mars --run C:/Users/sahaj/MarsBeaconData/runs/m1_run1
"""
import argparse, json, os

import numpy as np
import torch
from torch.utils.data import DataLoader

from train_m1 import AI4Mars, CLASS_NAMES, IGNORE, NUM_CLASSES
from eval_m1 import scores
from infer_m1 import load_model

BIG = CLASS_NAMES.index("big_rock")
GRID = [0.0, -0.25, -0.5, -0.75, -1.0, -1.25, -1.5, -1.75, -2.0, -2.5, -3.0, -3.5, -4.0, -5.0]


@torch.no_grad()
def confusions(model, loader, dev):
    """One pass over the data; one confusion matrix per bias value in GRID."""
    cms = torch.zeros(len(GRID), NUM_CLASSES, NUM_CLASSES, dtype=torch.int64, device=dev)
    for x, y in loader:
        x, y = x.to(dev), y.to(dev)
        with torch.autocast("cuda", dtype=torch.float16):
            lg = model(x).float()
        m = y != IGNORE
        yt = y[m]
        for k, b in enumerate(GRID):
            l2 = lg.clone(); l2[:, BIG] += b
            p = l2.argmax(1)[m]
            cms[k] += torch.bincount(yt * NUM_CLASSES + p, minlength=NUM_CLASSES ** 2).view(NUM_CLASSES, NUM_CLASSES)
    return cms.cpu().numpy()


class Biased(torch.nn.Module):
    def __init__(self, m, bias):
        super().__init__(); self.m = m
        self.register_buffer("bias", torch.tensor(bias, dtype=torch.float32).view(1, -1, 1, 1))

    def forward(self, x):
        return self.m(x) + self.bias


def short(s):
    return {"mIoU": round(s["mIoU"], 4), "pixel_accuracy": round(s["pixel_accuracy"], 4),
            "IoU": {k: round(v, 3) for k, v in s["per_class_IoU"].items()},
            "recall": {k: round(v, 3) for k, v in s["per_class_recall"].items()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--run", required=True)
    a = ap.parse_args()
    dev = "cuda"
    model = load_model(a.run, dev)
    splits = json.load(open(os.path.join(a.data, "splits.json")))

    val = confusions(model, DataLoader(AI4Mars(a.data, "train", splits["val"], train=False), 4, num_workers=4), dev)
    val_m = [scores(c)["mIoU"] for c in val]
    for b, s in zip(GRID, val_m):
        print(f"bias {b:+.2f} val mIoU {s:.4f} bigrock IoU {scores(val[GRID.index(b)])['per_class_IoU']['big_rock']:.3f}", flush=True)
    k = int(np.argmax(val_m)); b = GRID[k]
    print("chosen bias", b, flush=True)

    res = {"method": "constant added to the big_rock logit, chosen by max mIoU on the sol-held-out validation split",
           "grid": GRID, "val_mIoU_by_bias": [round(v, 4) for v in val_m], "big_rock_logit_bias": b,
           "val": {"before": short(scores(val[0])), "after": short(scores(val[k]))}, "test": {}}
    for sp in ("test_min1", "test_min2", "test_min3"):
        cm = confusions(model, DataLoader(AI4Mars(a.data, sp, splits[sp], train=False), 4, num_workers=4), dev)
        res["test"][sp] = {"before": short(scores(cm[0])), "after": short(scores(cm[k]))}
        print(sp, "before", res["test"][sp]["before"]["mIoU"], "after", res["test"][sp]["after"]["mIoU"],
              res["test"][sp]["after"]["IoU"], flush=True)

    bias = [0.0] * NUM_CLASSES; bias[BIG] = b
    res["logit_bias"] = bias
    m_cpu = Biased(model.float().cpu(), bias).eval()
    p32 = os.path.join(a.run, "m1_terrain_cal.onnx")
    torch.onnx.export(m_cpu, torch.zeros(1, 3, 512, 512), p32, opset_version=17,
                      input_names=["image"], output_names=["logits"], dynamo=False)
    import onnx
    from onnxconverter_common import float16
    p16 = os.path.join(a.run, "m1_terrain_cal_fp16.onnx")
    onnx.save(float16.convert_float_to_float16(onnx.load(p32), keep_io_types=True), p16)
    res["onnx"] = {"fp32": os.path.basename(p32), "fp16": os.path.basename(p16),
                   "fp16_MB": round(os.path.getsize(p16) / 1e6, 1)}
    json.dump(res, open(os.path.join(a.run, "m1_calibration.json"), "w"), indent=2)
    print("written m1_calibration.json and calibrated ONNX", flush=True)


if __name__ == "__main__":
    main()
