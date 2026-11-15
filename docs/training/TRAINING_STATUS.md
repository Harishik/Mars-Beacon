# Training status, 2026-11-15

Two 30k GPU training paths completed in Colab: surface-preserving orbital terrain and measured-image Altadena reconstruction. Two wavelength-specific opacity climatologies and a REMS pressure model were fitted locally. All results and failure gates are recorded, not promoted by image score alone.

- Orbital reserved test: 39.46 dB PSNR / 0.990 SSIM, on synthetic renders of source terrain. 1.36 MB SPLAT. This validates display distillation, not new terrain detail.
- Rover validation: 32.92 dB / 0.728; separate-drive test: 24.58 dB / 0.439. Twelve of 40 test images have supported XYZ footprints; all counts retained. Novel-drive realism remains insufficient.
- Opacity: held-out MAE 0.2227 at 440 nm and 0.2239 at 880 nm; useful seasonal context. The supplied observations stop at sol 3953, before this campaign.
- REMS: 8.62m rows processed, pressure replay ready. Extrapolating trend model rejected. No GTS samples meet the strict all-good policy used here; no calibrated thermal map is claimed.
- Rover XYZ: 32/36 camera reprojection checks pass, up to 0.426 px P95; four empty maps excluded. Site-to-orbital registration remains pending.

## Save the checkpoint archives

In the active Colab Files panel, user-download:

1. `/content/Mars_BEACON_Surface_Final.zip` (14,072,762 bytes); SHA-256 `c9ee40e1038bb9ff8776a70b485ca18821108c1c7a5325d92bf522949c6dce6a`.
2. `/content/Mars_BEACON_Rover_Final.zip` (68,528,640 bytes); SHA-256 `04baba49e92efa48322e7f6e9dfd7cc03321cf79b3ee331ed4f56f423e0b750f`.

No copy has yet been found in local Downloads. Automated download was blocked by browser policy; local checksum verification remains pending. Keep the runtime available until backup completes. The code/context/atmosphere artifacts are already local.

## Next scientific gates

Improve multi-drive coverage and geometry/depth constraints using a revised protocol with a fresh final hold-out. Register measured rover patches to the orbital site, with an independent residual check. Calibrate thermal/radiation/spatial atmospheric fields only where supporting instrument observations and physical parameters exist. The current fitted opacity is a rover-column climatology; pressure replay is rover-local. Do not silently turn either into measured high-resolution atmospheric rasters.

Original reserved test sets have now been evaluated and must not be repeatedly used for tuning. Frontend, independent viewer performance, and validated temporal reconstruction are not completed by these training runs.
