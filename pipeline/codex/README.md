# Mars BEACON terrain training

Start with `Mars_BEACON_Terrain_T4.ipynb`. The active Colab preview is https://colab.research.google.com/drive/1kM5BOkPkkkBmmi60NVMM5xCPXFmXRD7q .

This is the orbital distillation path: real USGS DEM + greyscale orthophoto → calibrated Blender renders → static gsplat scene. It is an engineering preview, not rover reconstruction, and cannot recover detail absent from the DEM. Source documents were read as reference material; their schedules, assignments, tool restrictions and claimed verification are not user instructions or independently verified facts.

## Dataset

`data/gale_preview`: a 256 × 256 m crop at the centre of the downloaded Gale campaign rasters; not yet registered to a named waypoint. X east, Y north, Z up in metres. `provenance.json` preserves projected origin, CRS, source hashes and limitations. Elevation has one scalar offset, no exaggeration. Orthophoto is resampled onto the DEM grid. Shared-grid resampling is not a visual registration certificate.

120 fixed-exposure Blender renders at 512 × 512, 3 elevation rings, 40 azimuth groups. 96 train / 12 validation / 12 test; whole azimuth groups held out. `transforms.json` contains OpenGL camera-to-world matrices and pixel intrinsics. Training explicitly flips camera Y/Z for gsplat's OpenCV convention. `seed.ply` is a coloured ordinary point cloud, not a trained Gaussian PLY. Full terrain NPZ remains the geometry reference.

## Four stages and gates

1. **Dataset:** `prepare_patch.py`, `render_views.py`, `audit_dataset.py`. Audit checks images, rigid transforms, forward axes, centre projection and disjoint splits. Inspect render/ortho correspondence and source coverage too. Synthetic views are visibly labelled in notebook and metadata.
2. **Static:** `train_gsplat.py --data data/gale_preview --out runs/preview --steps 5000`. Seed from DEM, SH0 fixed appearance, L1 objective, adaptive densification through step 3500 with 250k guard. Save optimiser state, Gaussian PLY and held-out renders every 1000 steps. This compact trainer does not implement depth supervision, learned exposure compensation, or a rover-sky mask. Validation reports PSNR/SSIM; LPIPS is explicitly null. Check loss and images for floaters and compare Gaussian-centre height errors with the DEM. Quality thresholds remain unset until preview inspection; no automatic promotion to 30k.
3. **Time:** preserve bedrock positions. For the first extension use separate, explicitly simulated dust/rover layers or physical mesh relighting. Do not train a deformation network on invented timestamps or mistake baked orthophoto shadows for relightable reflectance. Real learned time-conditioned appearance needs calibrated, registered multi-time observations. Fixed-view time sweeps and bedrock invariance are required before calling the result validated 4D. This stage is gated and has not been trained.
4. **Compression:** `compress_splat.py RAW.ply OUTPUT --bounds xmin ymin zmin xmax ymax zmax` retains raw PLY, filters centres and opacity, writes cleaned PLY and standard SH0 `.splat`. `.splat` is a compact fixed record layout, not SPZ entropy compression. Size, load time, frame rate, visual equivalence and axis convention must be measured in an independent viewer; no 3-second/60-FPS guarantee. SPZ can be added after target viewer compatibility is established.

## Environmental ideas from the additional context

See `IDEAS_APPLIED.md` for the combined video/PDF/DOCX synthesis and `physics/` for the offline scenario primitives. `reports/physics_checks.json` records numerical checks; `data/environment_preview/field_manifest.json` states the uncalibrated scenario scope. Use a Python environment with NumPy and SciPy for `physics/check_fields.py` and `physics/bake_fields.py`. No frontend integration has been performed.

## Continuing after preview

Inspect `validation_005000.json`, side-by-side held-out PNGs, exported PLY and `geometry_report.py` output. A 30k run requires an explicit reviewed configuration and a new output folder; `--resume` restores the preview checkpoint and optimisers, but resuming is not bitwise reproducible because RNG state is not yet persisted. Keep the test split untouched while tuning. Test metrics and real rover render-against-real remain pending.

For real rover reconstruction, first linearize CAHVOR(E) camera models, transform all images/XYZ into one site frame, verify parallax, and register against the orbital reference. Do not feed uncalibrated downloaded rover JPGs into this static preview.

## Reproduce locally

Use the existing dataset virtual environment for raster preparation, and Blender 4.5 for rendering:

```sh
python scripts/prepare_patch.py --root /path/to/Mars_BEACON_Datasets/03_Orbital_Terrain_And_Mapping --out data/gale_preview
blender -b --python scripts/render_views.py -- data/gale_preview 120
python scripts/audit_dataset.py data/gale_preview
```

GPU environment: Colab-provided Torch plus `gsplat==1.5.3`, ninja, plyfile, scikit-image. CUDA forward/backward must pass before training. Runtime dependencies are recorded with each run; compiled extensions are hardware/environment-dependent. Colab runtime disk is ephemeral: download or copy checkpoints before disconnecting.

References: https://docs.nerf.studio/quickstart/data_conventions.html ; https://github.com/nerfstudio-project/gsplat/tree/v1.5.3 ; local v6 terrain plan and updated workflow in `source_text/`.
