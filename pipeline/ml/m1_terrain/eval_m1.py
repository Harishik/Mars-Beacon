"""M1 final evaluation on the AI4Mars expert-labelled MSL test sets (322 images; min1/min2/min3 =
at least 1/2/3 experts agree) and ONNX export for the browser demo (onnxruntime-web, opset 17).

Writes into the run folder: metrics.json, confusion_<split>.png, m1_terrain.onnx, MODEL_CARD.md.
Usage: python eval_m1.py --data C:/Users/sahaj/MarsBeaconData/ai4mars --run C:/Users/sahaj/MarsBeaconData/runs/m1_run1
"""
import argparse, hashlib, json, os

import numpy as np
import torch
from torch.utils.data import DataLoader
import segmentation_models_pytorch as smp

from train_m1 import AI4Mars, CLASS_NAMES, IGNORE, NUM_CLASSES


@torch.no_grad()
def confusion(model, loader, dev):
    cm = torch.zeros(NUM_CLASSES, NUM_CLASSES, dtype=torch.int64, device=dev)
    for x, y in loader:
        x, y = x.to(dev), y.to(dev)
        with torch.autocast("cuda", dtype=torch.float16):
            pred = model(x).argmax(1)
        m = y != IGNORE
        cm += torch.bincount(y[m] * NUM_CLASSES + pred[m], minlength=NUM_CLASSES ** 2).view(NUM_CLASSES, NUM_CLASSES)
    return cm.cpu().numpy()


def scores(cm):
    cm = cm.astype(np.float64)
    tp = np.diag(cm)
    iou = tp / np.maximum(cm.sum(0) + cm.sum(1) - tp, 1)
    return {"mIoU": float(iou.mean()), "pixel_accuracy": float(tp.sum() / cm.sum()),
            "per_class_IoU": dict(zip(CLASS_NAMES, map(float, iou))),
            "per_class_recall": dict(zip(CLASS_NAMES, map(float, tp / np.maximum(cm.sum(1), 1)))),
            "confusion_rows_true_cols_pred": cm.astype(int).tolist()}


def plot_cm(cm, path, title):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    n = cm / np.maximum(cm.sum(1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(5, 4.4))
    ax.imshow(n, cmap="Blues", vmin=0, vmax=1)
    for i in range(NUM_CLASSES):
        for j in range(NUM_CLASSES):
            ax.text(j, i, f"{n[i, j]:.2f}", ha="center", va="center", color="white" if n[i, j] > 0.5 else "black")
    ax.set_xticks(range(NUM_CLASSES), CLASS_NAMES); ax.set_yticks(range(NUM_CLASSES), CLASS_NAMES)
    ax.set_xlabel("predicted"); ax.set_ylabel("expert label"); ax.set_title(title, fontsize=9)
    fig.tight_layout(); fig.savefig(path, dpi=150); plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--run", required=True)
    ap.add_argument("--onnx-size", type=int, default=512, help="ONNX input size (browser demo)")
    a = ap.parse_args()
    dev = "cuda"
    from torch.torch_version import TorchVersion  # stored in cfg by early runs; safe to allowlist
    with torch.serialization.safe_globals([TorchVersion]):
        ck = torch.load(os.path.join(a.run, "best.pt"), map_location=dev, weights_only=True)
    cfg = ck["cfg"]
    model = getattr(smp, cfg["arch"])(encoder_name=cfg["encoder"], encoder_weights=None, classes=NUM_CLASSES).to(dev).eval()
    model.load_state_dict(ck["model"])
    splits = json.load(open(os.path.join(a.data, "splits.json")))

    res = {"checkpoint_epoch": ck["epoch"], "val_mIoU": ck["val_mIoU"], "test": {}}
    for sp in ("test_min1", "test_min2", "test_min3"):
        dl = DataLoader(AI4Mars(a.data, sp, splits[sp], train=False), 4, num_workers=4)
        cm = confusion(model, dl, dev)
        res["test"][sp] = scores(cm)
        plot_cm(cm, os.path.join(a.run, f"confusion_{sp}.png"), f"M1 on AI4Mars MSL expert test ({sp}, n=322)")
        s = res["test"][sp]
        print(sp, f"mIoU {s['mIoU']:.4f} pixacc {s['pixel_accuracy']:.4f}", {k: round(v, 3) for k, v in s["per_class_IoU"].items()}, flush=True)
    json.dump(res, open(os.path.join(a.run, "metrics.json"), "w"), indent=2)

    # ONNX export (fp32), fixed 1x3xSxS input, logits out
    onnx_path = os.path.join(a.run, "m1_terrain.onnx")
    m_cpu = model.float().cpu()
    torch.onnx.export(m_cpu, torch.zeros(1, 3, a.onnx_size, a.onnx_size), onnx_path, opset_version=17,
                      input_names=["image"], output_names=["logits"], dynamo=False)
    h = hashlib.sha256(open(onnx_path, "rb").read()).hexdigest()
    print("onnx", onnx_path, os.path.getsize(onnx_path) // 1e6, "MB sha256", h[:16], flush=True)

    # fp16 copy for the browser (about half the size) + parity check against PyTorch with onnxruntime
    try:
        import onnx, onnxruntime as ort
        from onnxconverter_common import float16
        fp16_path = os.path.join(a.run, "m1_terrain_fp16.onnx")
        onnx.save(float16.convert_float_to_float16(onnx.load(onnx_path), keep_io_types=True), fp16_path)
        ds = AI4Mars(a.data, "test_min3", splits["test_min3"][:8], train=False)
        agree32, agree16 = [], []
        s32 = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        s16 = ort.InferenceSession(fp16_path, providers=["CPUExecutionProvider"])
        S = a.onnx_size
        for i in range(len(ds)):
            x = ds[i][0][None, :, :S, :S]
            ref = m_cpu(x).argmax(1).numpy()
            agree32.append((s32.run(None, {"image": x.numpy()})[0].argmax(1) == ref).mean())
            agree16.append((s16.run(None, {"image": x.numpy()})[0].argmax(1) == ref).mean())
        res["onnx"] = {"fp32_MB": round(os.path.getsize(onnx_path) / 1e6, 1), "fp16_MB": round(os.path.getsize(fp16_path) / 1e6, 1),
                       "argmax_agreement_fp32": float(np.mean(agree32)), "argmax_agreement_fp16": float(np.mean(agree16))}
        json.dump(res, open(os.path.join(a.run, "metrics.json"), "w"), indent=2)
        print("onnx parity", res["onnx"], flush=True)
    except Exception as e:
        print("fp16/parity step skipped:", e, flush=True)

    t = res["test"]["test_min3"]
    card = f"""# Model card: M1 terrain segmentation (Mars BEACON)

- **Task:** per-pixel terrain class on Curiosity Navcam images: {", ".join(CLASS_NAMES)}.
- **Architecture:** {cfg['arch']} with {cfg['encoder']} encoder (segmentation_models_pytorch, MIT; ImageNet encoder weights from torchvision/timm).
- **Training data:** AI4Mars MSL split (Swan et al. 2021, CVPRW), {cfg['n_train']} crowd-labelled train images, {cfg['n_val']} validation images held out by sol. Source record: https://zenodo.org/records/15995036 (CC-BY-4.0).
- **Training:** {cfg['epochs']} epochs max, AdamW lr {cfg['lr']} cosine, batch {cfg['batch']}, 512 px crops, CE (median-frequency class weights) + Dice, mixed precision, seed {cfg['seed']}, GPU {cfg['gpu']}. Best epoch {ck['epoch']}.
- **Test (never used for training or model selection):** 322 expert-labelled images. Agreement level min3 (3 experts agree): mIoU {t['mIoU']:.3f}, pixel accuracy {t['pixel_accuracy']:.3f}. Per-class IoU: {", ".join(f"{k} {v:.3f}" for k, v in t['per_class_IoU'].items())}. min1 and min2 results in metrics.json.
- **Use in the map:** class probabilities and entropy on rover images at waypoints, feeding the substrate factor and uncertainty penalty (tag DERIVED).
- **Limits:** trained on Navcam greyscale only; ignores pixels on the rover and beyond 30 m; big rock is rare (under 1 percent of labelled pixels) and the weakest class: class weighting gives high recall but many false positives, so treat it as "possible rock", not a hard block; predictions on rover hardware are meaningless (rover pixels were ignored in training) and must be masked; crowd labels are noisy. Not a safety certification.
- **ONNX:** m1_terrain.onnx, opset 17, input 1x3x{a.onnx_size}x{a.onnx_size} (grey replicated, normalised (x/255-0.449)/0.226), output logits; sha256 {h}.
- **Reproduce:** pipeline/ml/m1_terrain/prepare_ai4mars.py, train_m1.py, eval_m1.py with config.json in the run folder.
"""
    open(os.path.join(a.run, "MODEL_CARD.md"), "w").write(card)
    print("model card written", flush=True)


if __name__ == "__main__":
    main()
