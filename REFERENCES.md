# References, software and asset attribution

## Scientific data

The [Data Sources table](docs/DATA_SOURCES.md) records provider, product/source URL, use and rights notes. The [manifest layer register](docs/DATA_SOURCE_REGISTER.csv) preserves per-site product IDs. Exact input files and processing details are retained in site manifests, the [M1 model card](models/m1_terrain/MODEL_CARD.md), [pipeline validation](pipeline/VALIDATION.md), and training records. These linked records form part of this reference inventory.

## Methods and design references

| Reference | Where used | Rights / attribution |
|---|---|---|
| [NASA GISS Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) and [credits](https://www.giss.nasa.gov/tools/mars24/help/credits.html) | Mars time, solar geometry, worked-example tests. | Cite NASA GISS and original algorithm references. |
| [NASA/TM-2010-216138](https://ntrs.nasa.gov/search?q=NASA%2FTM-2010-216138) | Suit metabolic-factor calibration described in `pipeline/VALIDATION.md`. | NASA report; figure-read values and gravity extrapolation have uncertainty. |
| [Minetti et al., 2002, Energy cost of walking and running at extreme uphill and downhill slopes](https://doi.org/10.1152/japplphysiol.01177.2001) | Gradient-dependent walking cost, `frontend/src/engine/physiology.ts`. | Cite the publication; no full article is redistributed here. |
| Tobler hiking-function shape | `frontend/src/engine/physiology.ts`, normalized to selected flat-ground pace. | Method attribution; exact primary bibliographic record remains to be completed. This is not a validated suited-Mars mobility law. |
| Horn slope; Dozier/Frew-style sky-view geometry | `pipeline/build_site.py` and manifest method fields. | Method names retained from implementation; full bibliographic records remain to be completed. |
| [Hassler et al., 2014, Mars' surface radiation environment](https://doi.org/10.1126/science.1244797) | Historical dose-rate context. | Cite authors/publication; article rights remain with their owners. |
| [NASA-STD-3001](https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-1) | Career-dose reference displayed in Control. | Educational comparison; standard reference does not validate the app's dose or safety estimates. |
| [AI4Mars dataset](https://zenodo.org/records/15995036), Swan et al. | M1 training, calibration and expert-test evaluation. | CC BY 4.0 per the stored model card; retain source attribution. |
| [JPL Mars Trek](https://trek.nasa.gov/mars/), [NASA Worldview](https://worldview.earthdata.nasa.gov/), [Experience Curiosity](https://eyes.nasa.gov/curiosity/) | Regional data and interaction/design precedents acknowledged on the landing page. | Reference/inspiration is not endorsement or blanket permission to copy branding/assets. |

The landing page also acknowledges Apollo traverse maps and Artemis surface planning as design precedents. Exact documents for those precedents should be added if they are used to justify numerical requirements; the prototype's 2 km reference circle is explicitly an assumption, not a cited Artemis rule.

## Software

Resolved frontend dependency names, versions, registry URLs and licence fields are recorded in [DEPENDENCIES.csv](docs/DEPENDENCIES.csv), generated from `frontend/package-lock.json`. This includes transitive packages; upstream package licence texts remain authoritative.

| Software | Use | Source / licence reference |
|---|---|---|
| React; React DOM | UI | [React](https://github.com/facebook/react), MIT |
| Three.js | 3D rendering | [Three.js](https://github.com/mrdoob/three.js), MIT |
| React Three Fiber; drei; Zustand | Rendering integration/helpers and state | [pmndrs](https://github.com/pmndrs), package-specific MIT notices |
| Spark | Gaussian-splat display | [Spark](https://github.com/sparkjsdev/spark), MIT per lockfile |
| Vite; TypeScript; Vitest | Build, type checking, tests | [Vite](https://github.com/vitejs/vite) MIT; [TypeScript](https://github.com/microsoft/TypeScript) Apache 2.0; [Vitest](https://github.com/vitest-dev/vitest) MIT |
| FastAPI; Uvicorn; HTTPX | API and HTTP feeds | [FastAPI](https://github.com/fastapi/fastapi) MIT; [Uvicorn](https://github.com/encode/uvicorn) BSD-3-Clause; [HTTPX](https://github.com/encode/httpx) BSD-3-Clause |
| Psycopg / psycopg-pool; PostgreSQL; SQLite | Persistence | [Psycopg](https://www.psycopg.org/) package-specific LGPL notices; [PostgreSQL](https://www.postgresql.org/about/licence/); [SQLite](https://www.sqlite.org/copyright.html) public domain |
| PyTorch; torchvision; segmentation-models-pytorch | M1 training/inference | [PyTorch](https://github.com/pytorch/pytorch), [torchvision](https://github.com/pytorch/vision) BSD-style notices; [SMP](https://github.com/qubvel-org/segmentation_models.pytorch) MIT |
| NumPy; SciPy; Pillow; tifffile; imagecodecs; Polars; Matplotlib; ONNX; pytest | Offline scientific processing, images, export and tests | Exact requested packages in `pipeline/requirements.txt`; retain each installed distribution's licence/NOTICE. A resolved Python transitive licence inventory is not yet included. |
| gsplat / reconstruction tooling | Recorded reconstruction experiments | [gsplat](https://github.com/nerfstudio-project/gsplat), Apache 2.0; see training artifacts for actual run environments and additional tools. |
| Claude Code; Codex; Microsoft TRELLIS.2 | AI-assisted development/documentation and generated concept models | [AI_USAGE.md](AI_USAGE.md). [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) publishes an MIT licence; input-image and generated-output rights must be checked separately. |

Services used by the project include Cloudflare Pages (frontend hosting), Azure App Service/PostgreSQL (configured backend), and GitHub (source hosting). These service names are acknowledgements, not claims of affiliation.

## Assets and remaining attribution checks

See [ASSET_CREDITS.csv](assets/ASSET_CREDITS.csv) and [AI_METADATA.json](assets/AI_METADATA.json). The original event banner and team logos remain in the repository; this README does not use the NASA event banner as project branding. The old README attributed the event image to Seoul organizers, but its exact original URL/permission record is not present.

Outstanding items are explicit: input rights and per-file generation mapping for concept models; original sources/terms for team/event artwork; full bibliography for method-only citations; resolved Python transitive licence inventory; matching a used resource to the official challenge list; visible labels on generated-media exports. This inventory is not a claim that every external-resource clearance is complete.
