"""M1: AI4Mars terrain segmentation (soil, bedrock, sand, big rock) on the GPU.

Plan: 25_Model_Training.md section 2. U-Net with ImageNet ResNet-50 encoder
(segmentation_models_pytorch, MIT; torchvision weights, BSD). CE with class weights + Dice,
ignore index 255. AdamW lr 3e-4 cosine, wd 1e-4, batch 8, AMP fp16, 512 px random crops.
The expert test sets are NOT read here; see eval_m1.py.

Note: do not convert to channels_last; on this torch/cuDNN build it is ~6x slower.

Usage: python train_m1.py --data C:/Users/sahaj/MarsBeaconData/ai4mars --out C:/Users/sahaj/MarsBeaconData/runs/m1_run1
       add --resume to continue from last.pt; --epochs 1 --limit 200 for a smoke test.
"""
import argparse, csv, json, math, os, random, time

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageFilter
from torch.utils.data import DataLoader, Dataset
import segmentation_models_pytorch as smp

NUM_CLASSES = 4
CLASS_NAMES = ["soil", "bedrock", "sand", "big_rock"]
IGNORE = 255
MEAN, STD = 0.449, 0.226  # ImageNet grey equivalent; Navcam is greyscale replicated to 3 channels


class AI4Mars(Dataset):
    def __init__(self, root, split_dir, stems, crop=512, train=True):
        self.dir = os.path.join(root, split_dir)
        self.stems, self.crop, self.train = stems, crop, train

    def __len__(self):
        return len(self.stems)

    def __getitem__(self, i):
        s = self.stems[i]
        img = Image.open(os.path.join(self.dir, s + ".jpg")).convert("L")
        lbl = Image.open(os.path.join(self.dir, s + "_lbl.png"))
        if self.train:
            w, h = img.size
            c = self.crop
            for _ in range(10):  # prefer crops with some labelled pixels
                x, y = random.randint(0, w - c), random.randint(0, h - c)
                l = np.array(lbl.crop((x, y, x + c, y + c)))
                if (l != IGNORE).mean() > 0.05:
                    break
            img = img.crop((x, y, x + c, y + c))
            if random.random() < 0.5:
                img = img.transpose(Image.FLIP_LEFT_RIGHT); l = l[:, ::-1]
            if random.random() < 0.2:
                img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3, 1.2)))
            a = np.asarray(img, np.float32) / 255.0
            a = (a - a.mean()) * random.uniform(0.75, 1.25) + a.mean() + random.uniform(-0.1, 0.1)
            a = np.clip(a, 0, 1)
        else:
            a = np.asarray(img, np.float32) / 255.0
            l = np.array(lbl)
        a = (a - MEAN) / STD
        x = torch.from_numpy(np.ascontiguousarray(a))[None].expand(3, -1, -1).clone()
        return x, torch.from_numpy(np.ascontiguousarray(l).astype(np.int64))


def class_weights(ds, n=600):
    counts = np.zeros(NUM_CLASSES)
    for s in random.Random(0).sample(ds.stems, min(n, len(ds.stems))):
        l = np.array(Image.open(os.path.join(ds.dir, s + "_lbl.png")))
        counts += np.bincount(l[l != IGNORE].ravel(), minlength=NUM_CLASSES)[:NUM_CLASSES]
    freq = counts / counts.sum()
    w = np.median(freq) / np.maximum(freq, 1e-6)  # median-frequency balancing, clipped
    return np.clip(w, 0.2, 5.0), freq


def dice_loss(logits, target):
    valid = (target != IGNORE)
    t = torch.where(valid, target, 0)
    p = logits.float().softmax(1) * valid[:, None]
    oh = F.one_hot(t, NUM_CLASSES).permute(0, 3, 1, 2).float() * valid[:, None]
    inter = (p * oh).sum((0, 2, 3)); den = p.sum((0, 2, 3)) + oh.sum((0, 2, 3))
    return 1 - ((2 * inter + 1) / (den + 1)).mean()


@torch.no_grad()
def evaluate(model, loader, dev):
    model.eval()
    cm = torch.zeros(NUM_CLASSES, NUM_CLASSES, dtype=torch.int64, device=dev)
    for x, y in loader:
        x, y = x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.float16):
            pred = model(x).argmax(1)
        m = y != IGNORE
        cm += torch.bincount(y[m] * NUM_CLASSES + pred[m], minlength=NUM_CLASSES ** 2).view(NUM_CLASSES, NUM_CLASSES)
    cm = cm.cpu().double()
    iou = cm.diag() / (cm.sum(0) + cm.sum(1) - cm.diag()).clamp(min=1)
    return iou.mean().item(), iou.tolist(), (cm.diag().sum() / cm.sum()).item()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--arch", default="Unet")
    ap.add_argument("--encoder", default="resnet50")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--crop", type=int, default=512)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--patience", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0, help="debug: cap train/val images")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--resume", action="store_true")
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
    torch.backends.cudnn.benchmark = True
    assert torch.cuda.is_available(), "CUDA GPU required"
    dev = "cuda"

    splits = json.load(open(os.path.join(a.data, "splits.json")))
    tr, va = splits["train"], splits["val"]
    if a.limit:
        tr, va = tr[: a.limit], va[: max(20, a.limit // 10)]
    train_ds = AI4Mars(a.data, "train", tr, a.crop, train=True)
    val_ds = AI4Mars(a.data, "train", va, train=False)
    tl = DataLoader(train_ds, a.batch, shuffle=True, num_workers=a.workers, pin_memory=True,
                    drop_last=True, persistent_workers=a.workers > 0)
    vl = DataLoader(val_ds, 4, num_workers=a.workers, pin_memory=True, persistent_workers=a.workers > 0)

    w, freq = class_weights(train_ds)
    cfg = {**vars(a), "class_weights": w.tolist(), "class_freq": freq.tolist(), "classes": CLASS_NAMES,
           "n_train": len(tr), "n_val": len(va), "torch": str(torch.__version__), "gpu": torch.cuda.get_device_name(0),
           "dataset": "AI4Mars MSL (Swan et al. 2021), zenodo.org/records/15995036, CC-BY-4.0"}
    json.dump(cfg, open(os.path.join(a.out, "config.json"), "w"), indent=2)
    print(json.dumps({k: cfg[k] for k in ("n_train", "n_val", "class_weights", "class_freq", "gpu")}), flush=True)

    model = getattr(smp, a.arch)(encoder_name=a.encoder, encoder_weights="imagenet", classes=NUM_CLASSES).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=a.wd)
    steps = a.epochs * len(tl)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 500) * 0.5 * (1 + math.cos(math.pi * min(s, steps) / steps)))
    scaler = torch.amp.GradScaler()
    cw = torch.tensor(w, dtype=torch.float32, device=dev)

    start, best, bad = 0, -1.0, 0
    last = os.path.join(a.out, "last.pt")
    if a.resume and os.path.exists(last):
        ck = torch.load(last, map_location=dev, weights_only=True)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); sched.load_state_dict(ck["sched"])
        scaler.load_state_dict(ck["scaler"]); start, best, bad = ck["epoch"] + 1, ck["best"], ck["bad"]
        print(f"resumed at epoch {start}, best val mIoU {best:.4f}", flush=True)

    log_path = os.path.join(a.out, "log.csv")
    new_log = not os.path.exists(log_path) or not a.resume
    logf = open(log_path, "w" if new_log else "a", newline="")
    log = csv.writer(logf)
    if new_log:
        log.writerow(["epoch", "train_loss", "val_mIoU", "val_pixacc", *[f"iou_{c}" for c in CLASS_NAMES], "lr", "minutes"])

    for ep in range(start, a.epochs):
        model.train(); t0 = time.time(); tot = 0.0
        for i, (x, y) in enumerate(tl):
            x, y = x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)
            opt.zero_grad(set_to_none=True)
            with torch.autocast("cuda", dtype=torch.float16):
                out = model(x)
                loss = F.cross_entropy(out, y, weight=cw, ignore_index=IGNORE) + dice_loss(out, y)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update(); sched.step()
            tot += loss.item()
            if i % 200 == 0:
                print(f"ep {ep} it {i}/{len(tl)} loss {loss.item():.4f} {(i + 1) * a.batch / (time.time() - t0):.1f} img/s", flush=True)
        miou, ious, pacc = evaluate(model, vl, dev)
        mins = (time.time() - t0) / 60
        log.writerow([ep, tot / len(tl), miou, pacc, *ious, sched.get_last_lr()[0], round(mins, 2)]); logf.flush()
        print(f"== epoch {ep} loss {tot / len(tl):.4f} val mIoU {miou:.4f} pixacc {pacc:.4f} "
              f"ious {[round(v, 3) for v in ious]} ({mins:.1f} min)", flush=True)
        if miou > best:
            best, bad = miou, 0
            torch.save({"model": model.state_dict(), "cfg": cfg, "epoch": ep, "val_mIoU": miou}, os.path.join(a.out, "best.pt"))
        else:
            bad += 1
        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(),
                    "scaler": scaler.state_dict(), "epoch": ep, "best": best, "bad": bad}, last)
        if bad >= a.patience:
            print(f"early stop: no val gain for {a.patience} epochs", flush=True)
            break
    print(f"done. best val mIoU {best:.4f}", flush=True)


if __name__ == "__main__":
    main()
