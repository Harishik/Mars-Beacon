"""Rover point-of-view images at each EVA stop, with M1 terrain classes.

For every target in a site bundle, picks Curiosity Navcam full frames taken where the rover stood at that
workspace (NASA raw image API, public), and runs the M1 terrain model (models/m1_terrain, AI4Mars) on each one.
Writes, into <bundle>/rover/:
  <imageid>.jpg          the Navcam frame, 768 px (NASA/JPL-Caltech)
  <imageid>_m1.png       M1 classes as a transparent overlay (soil, bedrock, sand, possible big rock)
  index.json             stop, sol, LMST, camera azimuth and elevation, source URL, class fractions

Pixels more than 15 m away (looking above -7.2 deg from a 1.9 m mast) are left unclassified: M1 was trained to
30 m, and the distant strips near the horizon are where it confuses classes. Arm-workspace frames are skipped (the arm fills them); the mid-field panorama frames show ground only.

Usage: python rover_views.py ../../fixtures/bundle/gale-boxwork --model ../../models/m1_terrain/m1_terrain_cal_fp16.onnx
"""
import argparse
import io
import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

API = ("https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=200&page=0"
       "&condition_1=msl:mission&condition_2={a}:sol:gte&condition_3={b}:sol:lte&search=NAV_LEFT_B")
# Sol at the workspace for each stop (end-of-drive sol with a full Navcam survey) and the mid-field panorama
# sequences to use. The arm-workspace frames (NCAM00353, about -53 deg) are skipped: the robotic arm fills them
# and M1 labels the hardware as big rock, the failure listed in the model card.
STOPS = {
    "altadena": (4560, ["NCAM00264", "NCAM00265"]),
    "valle_de_la_luna": (4709, ["NCAM00261"]),
    "nevado_sajama": (4711, ["NCAM00265", "NCAM00264"]),
}
# Frames where rover hardware fills part of the view (checked by eye): M1 labels hardware as big rock.
EXCLUDE = {"NLB_815538694EDR_F1200000NCAM00262M", "NLB_815536945EDR_F1200000NCAM00261M", "NLB_815538663EDR_F1200000NCAM00262M"}
CLASSES = ["soil", "bedrock", "sand", "big_rock"]
COLOURS = np.array([[214, 160, 110], [120, 150, 200], [240, 205, 90], [255, 70, 140]], np.uint8)
HFOV = 45.0      # Navcam field of view, degrees
MAST_H = 1.9     # Navcam height above ground, m
NEAR_M = 15.0    # classify ground nearer than this; distant strips near the horizon are where M1 confuses classes


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mars-beacon-pipeline"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def classify(sess, grey):
    x = np.asarray(grey.resize((512, 512), Image.BILINEAR), np.float32) / 255.0
    x = (x - 0.449) / 0.226
    x = np.repeat(x[None, None], 3, axis=1).astype(np.float16 if "16" in sess.get_inputs()[0].type else np.float32)
    logits = sess.run(None, {sess.get_inputs()[0].name: x})[0][0].astype(np.float32)
    p = np.exp(logits - logits.max(0))
    p /= p.sum(0)
    return p.argmax(0), -(p * np.log(p + 1e-9)).sum(0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--model", required=True)
    ap.add_argument("--per-stop", type=int, default=4)
    a = ap.parse_args()
    import onnxruntime as ort
    sess = ort.InferenceSession(a.model, providers=["CPUExecutionProvider"])
    man = json.load(open(os.path.join(a.bundle, "manifest.json")))
    out_dir = os.path.join(a.bundle, "rover")
    os.makedirs(out_dir, exist_ok=True)
    index = []
    for t in man["targets"]:
        if t["id"] not in STOPS:
            continue
        sol, seqs = STOPS[t["id"]]
        items = json.loads(get(API.format(a=sol, b=sol)))["items"]
        full = [i for i in items if i["extended"]["sample_type"] == "full" and i["instrument"] == "NAV_LEFT_B"]
        # Frames looking at nearby ground (elevation -14 to -30 deg), spread in azimuth.
        cand = [i for i in full if any(q in i["imageid"] for q in seqs) and -30 <= float(i["extended"]["mast_el"]) <= -14
                and i["imageid"].rstrip("_") not in EXCLUDE]
        cand.sort(key=lambda i: float(i["extended"]["mast_az"]))
        step = max(1, len(cand) // a.per_stop)
        picks = cand[::step][: a.per_stop]
        for i in picks:
            iid = i["imageid"].rstrip("_")
            img = Image.open(io.BytesIO(get(i["https_url"]))).convert("L")
            img.resize((768, 768), Image.LANCZOS).save(os.path.join(out_dir, f"{iid}.jpg"), quality=86)
            cls, ent = classify(sess, img)
            el0 = float(i["extended"]["mast_el"])
            rows = np.arange(512)
            el = el0 + (0.5 - (rows + 0.5) / 512) * HFOV
            near = (el < -math.degrees(math.atan(MAST_H / NEAR_M)))[:, None].repeat(512, 1)
            rgba = np.zeros((512, 512, 4), np.uint8)
            rgba[..., :3] = COLOURS[cls]
            rgba[..., 3] = np.where(near, 150, 0)
            Image.fromarray(rgba).save(os.path.join(out_dir, f"{iid}_m1.png"), optimize=True)
            frac = {c: round(float(((cls == k) & near).sum() / max(1, near.sum())), 3) for k, c in enumerate(CLASSES)}
            index.append({
                "stop": t["id"], "imageid": iid, "sol": i["sol"], "lmst": i["extended"]["lmst"],
                "azimuth": round(float(i["extended"]["mast_az"]), 1), "elevation": round(el0, 1),
                "camera": "Navcam left (B side)", "image": f"rover/{iid}.jpg", "m1": f"rover/{iid}_m1.png",
                "classFractions": frac, "meanEntropy": round(float(ent[near].mean()) if near.any() else 0.0, 3),
                "source": i["https_url"], "credit": "NASA/JPL-Caltech", "tag": "HISTORICAL",
            })
            print(t["id"], iid, frac)
    json.dump({"note": "Curiosity Navcam frames at each stop; M1 classes are DERIVED (big rock = possible rock).",
               "model": os.path.basename(a.model), "images": index}, open(os.path.join(out_dir, "index.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
