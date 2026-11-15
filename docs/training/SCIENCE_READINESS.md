# Scientific readiness after completed dataset acquisition

Acquisition is complete for the key terrain/rover/REMS inputs used here. Training and calibration are evaluated separately from acquisition.

| Layer | Current evidence | Supported use | Remaining gate |
|---|---|---|---|
| Orbital elevation | USGS 1 m Gale DEM, source hash matches acquisition manifest | Metre-grid base mapping; same-frame derived slope/normals | Visually verify orthophoto co-registration, match exact mission footprint; independent survey accuracy is not inferred from splat scores |
| Orbital appearance | Real DEM/ortho → 120 calibrated renders → surface-constrained 30k model | Compact 256 m scene rendering; reserved synthetic-view test 39.46 dB / 0.990 SSIM | Independent viewer checks, source-consistent browser axes, checkpoint backup |
| Rover geometry | 32 XYZ maps pass labelled CAHV reprojection after rover-to-site transform, worst per-product P95 0.426 pixels | Measured near-field point clouds within each site frame | Register site frame to orbital reference, report correction and residual; exclude four empty products |
| Rover appearance | Altadena 112 RAS frames; 60 train, 12 validation, 40 separate-drive test, with only XYZ-supported regions scored | Local reconstruction experiments with a common display transfer | 30k completed, selected 20k: validation 32.92 dB / 0.728; unseen-drive test 24.58 dB / 0.439 on 12 supported views of 40. Novel-drive quality gate not met; improve coverage/registration, retain measured geometry as fallback |
| Dust | Measured 440/880 nm column opacity through sol 3953; chronological train/validation/test | Historical replay; fitted seasonal context with uncertainty | Later-campaign observations absent from these opacity files; no spatial dust gradients inferred |
| Pressure | 278 REMS products; 8,615,413 rows; 8,612 retained half-hour bins after quality screening | Rover-local measured replay over campaign sols 4534–4811 | Spatial extrapolation and an independently validated predictive model |
| Pressure forecast | Empirical tidal+linear trend fails later-sol test: MAE 190.58 Pa vs constant 53.64 Pa | Retained negative diagnostic only | Reject deployment; do not tune repeatedly against the already inspected test split |
| Ground thermal | Zero samples pass this implementation's strict all-good GTS bit selection | Preserve missing status and raw source availability | Review product-specific instrument quality guidance with a justified rule; do not silently loosen flags or equate brightness with kinetic temperature |
| Solar field | Slope-normal incidence, spherical air mass and local DEM skyline; 12 invariant checks | Explicit scenario visualization | Dated ephemerides, wavelength-dependent radiative transfer and observational validation; current direct-only grey field is not calibrated broadband irradiance |
| Radiation / wheel-soil | Source documents and candidate physical formulations | Explicitly labelled future scenario models | Response kernels, material parameters and held-out validation; not trainable from RGB/DEM alone |

## Atmospheric training results

Both wavelength-specific seasonal fits beat constant and coarse seasonal-bin baselines on later held-out sols. Test MAE is 0.2227 optical depth at 440 nm and 0.2239 at 880 nm. These errors are material: the fits supply seasonal context, not precise storm prediction. Empirical uncertainty-band coverage is recorded in each model JSON; nominal 90% bands are not assumed to generalize unchanged.

`physics/observed_environment.py` returns missing values outside measured support rather than borrowing a distant observation. `opacity_replay(4714)` is missing because the downloaded opacity series does not extend to that sol. `pressure_replay(4714, 12)` returns a measured time bin if one is close enough, including sample count and time offset.

## Evidence and reproducibility

Local code, extracted sources, hashes, splits, calibration checks, models, predictions and plots are under this folder. GPU checkpoint/PLY archives remain in the active Colab runtime until a user-downloaded copy is checksum verified. Browser automation was denied permission to download a data-URL archive; no alternative transport was used to bypass that denial.

Image PSNR/SSIM, imposed geometry constraints, observed atmospheric values, empirical predictions and numerical physics checks are different evidence types. Their validity must remain visible in the shared mission-state frontend.
