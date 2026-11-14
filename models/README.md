# models/

Trained models from the pipeline (owner: Sahaj). Weights are stored with Git LFS: run `git lfs pull` after cloning.

| Model | File | What it does | Test result | How to use |
|---|---|---|---|---|
| M1 terrain segmentation | `m1_terrain/m1_terrain_cal_fp16.onnx` (65 MB, browser) and `best.pt` (PyTorch) | Per-pixel soil, bedrock, sand, big rock on Curiosity Navcam images | Expert test set (3 experts agree): mIoU 0.806, pixel accuracy 0.980; big rock IoU 0.347, recall 0.972, precision about 0.35 | Big rock is "possible rock", a soft cost, never a hard block. Mask rover hardware first. See `m1_terrain/MODEL_CARD.md` |

Training data is not stored here. M1 was trained on AI4Mars (Swan et al. 2021, NASA JPL, CC-BY-4.0,
https://zenodo.org/records/15995036). `pipeline/ml/m1_terrain/prepare_ai4mars.py` rebuilds the training set from that record.
