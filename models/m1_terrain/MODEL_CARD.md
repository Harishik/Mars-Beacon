# Model card: M1 terrain segmentation (Mars BEACON)

- **Task:** per-pixel terrain class on Curiosity Navcam images: soil, bedrock, sand, big_rock.
- **Architecture:** Unet with resnet50 encoder (segmentation_models_pytorch, MIT; ImageNet encoder weights from torchvision/timm).
- **Training data:** AI4Mars MSL split (Swan et al. 2021, CVPRW), 15274 crowd-labelled train images, 790 validation images held out by sol. Source record: https://zenodo.org/records/15995036 (CC-BY-4.0).
- **Training:** 15 epochs max, AdamW lr 0.0003 cosine, batch 8, 512 px crops, CE (median-frequency class weights) + Dice, mixed precision, seed 42, GPU NVIDIA GeForce RTX 3060. Best epoch 14.
- **Test (never used for training or model selection):** 322 expert-labelled images. Agreement level min3 (3 experts agree): mIoU 0.771, pixel accuracy 0.979. Per-class IoU: soil 0.974, bedrock 0.944, sand 0.953, big_rock 0.214. min1 and min2 results in metrics.json.
- **Use in the map:** class probabilities and entropy on rover images at waypoints, feeding the substrate factor and uncertainty penalty (tag DERIVED).
- **Limits:** trained on Navcam greyscale only; ignores pixels on the rover and beyond 30 m; big rock is rare (under 1 percent of labelled pixels) and the weakest class: class weighting gives high recall but many false positives, so treat it as "possible rock", not a hard block; predictions on rover hardware are meaningless (rover pixels were ignored in training) and must be masked; crowd labels are noisy. Not a safety certification.
- **ONNX:** m1_terrain.onnx, opset 17, input 1x3x512x512 (grey replicated, normalised (x/255-0.449)/0.226), output logits; sha256 5a347c1e35fd23fe7a6852a76e05842ac419b07f1f9f6c6151260e3454778af8.
- **Reproduce:** pipeline/ml/m1_terrain/prepare_ai4mars.py, train_m1.py, eval_m1.py with config.json in the run folder.

## Calibration (shipped version)

Big-rock over-prediction was reduced without retraining: a constant -1.75 is added to the big-rock logit, chosen by
maximising mIoU on the sol-held-out validation split only (`calibrate_m1.py`, results in `m1_calibration.json`).
Test min3 after calibration: mIoU 0.806 (was 0.771), pixel accuracy 0.980; IoU soil 0.974, bedrock 0.948,
sand 0.954, big rock 0.347 (was 0.214), big-rock recall 0.972 (was 0.979). min2 0.716, min1 0.674.
Browser model with the bias built in: `m1_terrain_cal_fp16.onnx` (65 MB, same input/output as before).
