# Pipeline validation and limits (Sahaj): numbers for the Validation panel and Project Details

Every number below comes from a script in `pipeline/` and can be reproduced. Tags follow the plan:
OBSERVED, DERIVED, ASSUMPTION, SCENARIO.

## 1. Site and terrain (L0)

| Check | Result | Script |
|---|---|---|
| Box location | Centred on Curiosity's localized boxwork track, sols 4534 to 4844 (lat -4.8031, lon 137.3840). The earlier plan box (4.85 to 4.88 S, 137.30 to 137.33 E) was 5 to 8 km from the drill sites | `build_site.py`, NASA MSL_waypoints.json |
| DEM coverage | 0.000 percent no-data in the 3 x 3 km box (USGS MSL Gale merged DEM 1 m v3) | `build_site.py` |
| Ortho coverage | 0.005 percent no-data (USGS MSL Gale orthophoto 25 cm v3) | `build_site.py` |
| DEM vs ortho co-registration | Phase correlation shift 0 px at 0.73 m/px (hillshade vs ortho, r = 0.48) | co-registration check in this log |
| Curiosity route vs slope | Along the driven route, 4 m slope > 20 deg on 1.5 percent of points; 1 m max slope > 20 deg on 21.6 percent | slope check |
| Conclusion | 1 m max slope is dominated by DEM noise (it marks ground the rover drove as too steep). The hard no-go limit uses the 4 m slope; the 1 m max slope is a cost/hazard term only | |
| Slope uncertainty | 16 DEM realisations, sigma_z 0.25 m, correlation 5 m (ASSUMPTION): cells > 20 deg at 4 m: 23.3 percent deterministic, 23.5 percent P50, 26.8 percent P90 | `ml/slope_montecarlo.py` |
| Second site (generator) | Jezero (Perseverance landing area) built by the same script in 264 s from the Mars 2020 TRN HiRISE DTM and ortho; 0 percent no-data | `build_site.py --site jezero` |

## 2. Impact figure: 2 km walk-back circle vs Return Envelope (Gale)

Budgets are calibrated so that on flat open ground the envelope equals the 2 km circle (same pace, metabolic model,
reserve margin 0.25). Differences therefore come only from real terrain.

| Terrain | Circle area in box | Envelope area | Circle not returnable | Returnable outside circle |
|---|---|---|---|---|
| Median slope | 8.55 km2 | 2.47 km2 | 6.08 km2 (71 percent) | 0 km2 |
| P90 slope | 8.55 km2 | 2.29 km2 | 6.26 km2 (73 percent) | 0 km2 |

Sanity check: Curiosity's actual traverse lies inside the computed envelope.
Limits: single crew, habitat haven, time and O2 only; paths are confined to the 3 km box (conservative near the box
edge); the "2 km circle" is our ASSUMPTION reference rule, not a cited Artemis figure. The result is insensitive
to kG (0.6 gave 71.1 percent, the calibrated 0.78 gives 71.1 percent) because budgets are calibrated on flat ground. Script: `sim/impact_figure.py`; figure `impact_2km_vs_envelope.png`.

## 3. Models

| Model | Metric | Result | Status |
|---|---|---|---|
| M1 terrain segmentation (AI4Mars MSL) | mIoU, pixel accuracy, per-class IoU on the 322-image expert test set, never used for training or model selection | min3: mIoU 0.771, pixel acc 0.979; IoU soil 0.974, bedrock 0.944, sand 0.953, big rock 0.214. min2: mIoU 0.706 (pixel acc 0.956). min1: mIoU 0.663 (pixel acc 0.918). Sol-held-out val mIoU 0.755 | run 1 done (U-Net ResNet-50, 15 epochs, best epoch 14, 2.1 h on RTX 3060). Big rock: recall 0.98 but IoU 0.21, so it is over-predicted (class weighting). ONNX fp32 130 MB, fp16 65 MB; argmax agreement with PyTorch 100 percent / 99.98 percent |
| M1 calibrated (shipped) | same test sets; big-rock logit bias -1.75 chosen on the validation split only (`calibrate_m1.py`) | min3: mIoU 0.806, pixel acc 0.980; IoU soil 0.974, bedrock 0.948, sand 0.954, big rock 0.347 (recall 0.972). min2: mIoU 0.716. min1: mIoU 0.674 | no retraining. Use `m1_terrain_cal_fp16.onnx` (65 MB). Big rock is still the weakest class: treat it as "possible rock", not a hard block |
| M2 rocks (shadow baseline, Gale) | precision / recall vs hand-labelled tiles | pending hand labels; visual review done | 42,685 rocks D >= 0.75 m, median D 1.21 m, Golombek k median 0.10 (likely biased high by residual ridge-highlight false positives) |
| M2 rocks (Jezero) | visual review | UNRELIABLE: aeolian ripple crests are detected as rocks | display only, not used as hard blocks |
| M3 ridge/hollow | relief at the paired drill sites | hollow Valle de la Luna -0.74 m (classified hollow); ridge Nevado Sajama +0.40 m (positive, below the 0.5 m threshold); difference 1.1 m vs ~2 m reported by the Curiosity team | drill positions are end-of-drive waypoints (+/- tens of m); PDS PLACES needed for a real check; hand-polygon IoU pending |

M3 limit: in the boxwork area the merged DEM does not resolve individual ~5 m ridges that are obvious in the 25 cm
orthophoto; the map captures larger ridge/hollow structure only.

## 4. Engine parity

`sim/test_sim.py`: 9 tests pass, including both NASA GISS Mars24 worked examples (Ls, EOT, MST, LTST, declination,
zenith, azimuth to 1e-3 deg or better), the 696 W to 178.1 g/h O2 conversion, exact flat-grid times, blocked knight
corners, uphill/downhill asymmetry and load monotonicity. `sim/oracle_test_cases.json` holds the same cases for
Harishik's Vitest suite (tolerance 1e-5 relative).

## 5. Suit metabolic calibration (kG)

kG = 0.78 (DERIVED), least-squares fit of our walking model to NASA/TM-2010-216138 Figure 10 (IST-1, suited, 121 kg,
29.6 kPa, level treadmill) at 0.32 g, the closest tested level to Mars (0.38 g), walking speeds 0.7 to 1.2 m/s.
Max fit error 1.1 percent; values read by eye from the figure (+/- 6 percent). Slight underestimate for Mars because
cost rises with gravity. The earlier ASSUMPTION default (0.6) underestimated suited walking cost by about 25 percent.
Script: `sim/calibrate_kg.py`, output `sim/kG_calibration.json`.

## 6. Not done / open

- CRISM, THEMIS, USGS geology layers (science value weights w2, w3 = 0 until added).
- Shadow IoU against a single HiRISE observation's geometry (the mosaic mixes images; needs per-image incidence/azimuth).
- kG at exactly 0.38 g (no tested data at Mars gravity in the IST-1 figure).
- Exact drill coordinates from PDS PLACES.
