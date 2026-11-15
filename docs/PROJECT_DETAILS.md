# Project Details — Mars BEACON

## Problem and audience

A Marswalk needs more than a destination: the crew must understand whether both astronauts can still return as terrain, pace, equipment load and consumables change. Earth cannot provide immediate intervention because of communications delay. Mars BEACON explores a map-based planning and rehearsal interface for a paired crew and habitat team.

## Science objective and location

The main scenario covers a 3 × 3 km Gale crater boxwork area centred near 4.8031° S, 137.3840° E. Its science objective is to compare a resistant ridge with a neighbouring hollow, following the context of Curiosity's boxwork campaign. Historical rover waypoints locate approximate stops; they are not exact drill-bit coordinates. Habitat, support rover, fictional crew and mission budgets are scenario elements.

## Solution

The Return Envelope replaces a single distance radius with a terrain-dependent field of model-feasible return routes. Users choose stops, compare science/margin trade-offs, change suit loads or pace, and rehearse the walk. A habitat console, mission control, field tablet, EVA/visor view, rover display and linked views share one state. Route exports and backend mission sharing make the plan inspectable.

## Design choices

- A browser Web Worker keeps the route calculation close to the interface and reduces dependence on backend uptime.
- A 4 m planning grid bounds computation while retaining source-product provenance. Fine imagery is a visual layer, not evidence that the routing model resolves every small obstacle.
- Pair speed is constrained by the slower astronaut, with resources evaluated for each suit along the same path.
- The support rover can act as another modelled haven. Its availability and location are assumptions rather than actual deployed hardware.
- Observed, historical, derived, predicted, assumed and scenario values are labelled so users can distinguish evidence types.
- A Jezero bundle demonstrates reuse of the pipeline; it does not establish identical model accuracy at a second site.

## NASA data and tools

USGS/NASA HiRISE topography and orthophotos supply the local terrain. Curiosity waypoints, Navcam imagery and PDS XYZ geometry provide mission history and near-field detail. AI4Mars supports rover-image terrain classification. REMS, dust opacity and RAD supply environmental context; Mars24 supplies time/sun calculations; DONKI supplies event/model context when available. MOLA, CTX and Viking services provide regional context. See [Data Sources](DATA_SOURCES.md) and [References](../REFERENCES.md).

The application uses React, TypeScript, Three.js/React Three Fiber, Zustand, Vite and Web Workers; the backend uses Python/FastAPI and SQLite/PostgreSQL; offline processing uses Python scientific and ML libraries. Exact frontend package versions and licences are recorded in the lockfile and [dependency inventory](DEPENDENCIES.csv).

## AI use

Claude Code and Codex assisted development. Codex also assisted documentation, with training/reconstruction involvement recorded in the repository. Microsoft TRELLIS.2 generated 3D concept-model assets. See [AI_USAGE.md](../AI_USAGE.md) for scope, metadata and media-labelling requirements.

## Evidence, evolution and limitations

The repository documents numerical/oracle checks, terrain processing, classifier training/calibration, and reconstruction diagnostics. M1's reported calibrated min3 mIoU is 0.806, but big-rock IoU is 0.347. M2 hand-label validation is pending and Jezero detections are unreliable. Narrow ridges are not consistently resolved in the DEM. A rover-splat novel-drive quality gate remains unmet. These results support bounded prototype claims, not operational safety.

Live feeds may be stale or unavailable. Thermal, radiation, storm, resource and shelter assumptions require further validation. The model's feasible-return region is not a guarantee. Full limitations and next validation steps are in [Validation and Limitations](VALIDATION_AND_LIMITATIONS.md).

## Potential impact and next steps

The prototype makes a return decision visible across multiple crew interfaces and lets users inspect why the boundary changes. Next steps are independent route/resource validation, annotated boulder/ridge evaluation, better uncertainty calibration, improved rover-to-orbital registration and unseen-view reconstruction, clearer generated-asset labels, and robust feed/service testing. No real mission use, field trial or safety approval is claimed.
