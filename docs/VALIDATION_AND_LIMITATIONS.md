# Validation and limitations

Documentation review: 15 November 2026. Source snapshot: `01a90d506eead51c911f708e6ed51c24a63666a2` on `main`. The deployed site was inspected separately; its exact deployed commit was not independently identified.

## What was checked for this documentation update

- Read the public repository metadata and current source, manifests, setup instructions, model card and evidence notes.
- Opened the public landing page, mission map and Control display without a site login. The map showed the terrain-dependent return state, two crew members, resource controls and rehearsal timeline.
- The Control display showed DONKI unavailable, with HTTP 429 in the fetch log. REMS displayed sol 4995, dated 2026-08-25, explicitly marked as 82 days old. These are observations from one session, not permanent service status.
- Did not create a saved mission, run a full end-to-end operational evaluation, retrain models, or independently re-run every reported scientific result. Setup commands are based on current scripts/configuration; this documentation pass is not a clean-machine installation certification.

## Repository-reported evidence

| Component | Evidence | Interpretation and remaining limits |
|---|---|---|
| Terrain processing | [Pipeline validation](../pipeline/VALIDATION.md) reports coverage, co-registration checks and terrain sensitivity. | Reprojection consistency is not independent ground-truth accuracy. Effective DEM resolution differs from pixel spacing; vertical datum note remains marked VERIFY in the manifest. |
| M1 segmentation | [Model card](../models/m1_terrain/MODEL_CARD.md): calibrated min3 mIoU 0.806, pixel accuracy 0.980 on 322 expert images; big-rock IoU 0.347. | Reported from stored experiment artifacts, not rerun here. Agreement variants are not independent datasets. Weak big-rock classification is not a validated obstacle guarantee. |
| M2 boulders | Shadow-based candidate detections on HiRISE imagery. | Hand-labelled precision/recall pending; Jezero ripple crests generate false positives. Candidate sizes and positions are derived estimates. |
| M3 ridge/hollow | Relief-based structure and comparisons near historical drill stops. | Narrow ridges may be unresolved; exact drill positions and annotated-map IoU remain incomplete. |
| Return engine | Vitest numerical/oracle tests and Python reference checks are present. | Numerical agreement checks implementation consistency, not human EVA validity. Time-optimal return trees do not exhaust all resource-optimal routes. |
| P90 band | Slopes from 16 DEM realizations with assumed vertical noise/correlation. | Sensitivity to those assumptions, not a calibrated 90% safety bound. |
| Rover reconstruction | [Scientific readiness](training/SCIENCE_READINESS.md) and manifest report held-out-view diagnostics. | Novel-drive quality gate not met. Render quality and fitted registration residuals are not independent terrain truth. |
| Dust/pressure | Historical observations and stored fits, with readiness notes. | Observation support is spatially/temporally bounded. A rejected pressure forecast must not be presented as a validated prediction. |
| Radiation and thermal | Historical RAD context and explicit simplified models. | Not personal dosimetry, validated shielding, or a forecast of local storm exposure. Ground temperature in the interface is a model output. |

## Meaning of “safe”, “GO” and “certified”

These UI terms refer to model checks with selected assumptions. There is no operational safety certification or NASA endorsement. Suit budgets, reserve, physiology, injury/scenario controls, shelter effectiveness, radio antenna heights and scenario-event warning times require validation before real use.

The 25% reserve parameter multiplies estimated return requirements by 1.25. Do not interpret it as an independently justified mission standard. Routes are bounded by the site grid. A rendered boulder or rock-free cell is not proof of traversability.

The RAD-derived average and comparison to a career-dose reference are educational context; they do not establish that a particular EVA is safe. Near-Earth flare/SEP observations are not direct measurements of conditions at the Mars site. DONKI model outputs, historical measurements and invented scenarios must remain distinguishable.

## Reproduction checks

From `frontend/`: `npm run typecheck`, `npm test`, `npm run build`. From `backend/`, in its environment: `python -m pytest -q`. From the root in the pipeline environment: `python -m pytest pipeline/sim/test_sim.py -q`. These commands are documented entry points; no new pass counts are claimed here.

The older training documents contain chronology-specific paths and availability notes. Preserve their negative evidence, but use current manifests and files to establish what is actually shipped.

## Next validation steps

1. Independent route/resource comparisons and paired-crew scenarios, including boundary cases and alternative paths.
2. Human-labelled boulder/ridge evaluation across both sites.
3. Independent registration/terrain checks and reconstruction evaluation from unseen drives.
4. Calibrated uncertainty and instrument-aware environmental validation.
5. Multi-device usability, backend persistence and live-feed recovery tests.
6. Per-asset generation/input provenance and visible labels for generated-media exports.
