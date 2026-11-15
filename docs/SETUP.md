# Setup and reproduction

## Frontend

Requirements: Git, Node.js 22.12+ and npm. The locked Vite version also accepts Node 20.19+; use a supported runtime satisfying its engine range. A desktop WebGL-capable browser is recommended.

```bash
git clone https://github.com/Harishik/Mars-Beacon.git
cd Mars-Beacon/frontend
npm ci
npm run dev
```

Open `http://localhost:5173/#/app`. No frontend secrets are needed. The default `gale-boxwork` bundle is served from `fixtures/bundle/`; Jezero is a separate bundle. To use synthetic development terrain explicitly:

```bash
npm run fixture
VITE_SITE_ID=gale-synthetic npm run dev
```

`npm run fixture` generates the synthetic bundle; it does not acquire NASA data or regenerate the real sites.

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` writes `frontend/dist/`. Vite copies the public fixtures into the output. For Cloudflare Pages, use `frontend` as the project root, `npm run build` as build command, and `dist` as output. Set build variables before building. Hash routes such as `#/app` do not require server-side route rendering. This documents build settings, not an independently verified automatic deployment workflow.

## Configuration

Copy `.env.example` to `.env.local` inside `frontend/` if overrides are needed. Vite loads frontend env files. `VITE_BUNDLE_BASE_URL` defaults to `./bundle`; `VITE_SITE_ID` defaults to `gale-boxwork`; `VITE_BEACON_API` defaults to the Azure endpoint in `src/data/api.ts`.

Use `VITE_BEACON_API=/api` with Vite dev: its proxy forwards `/api` to `http://127.0.0.1:8000`. For production use the reachable backend URL. The old `VITE_API_BASE_URL` in historical notes is not the variable read by the current implementation.

The source supports `VITE_NASA_API_KEY` for a direct DONKI fallback, but any `VITE_*` value is public. Do not place a private key there; set `NASA_API_KEY` on the backend. Without it, direct requests may use a shared demo key and be rate-limited.

## Optional local backend

Use Python 3.12, matching the Docker image. In a second terminal from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Without `DATABASE_URL`, the service creates local SQLite `beacon.db`. Set a PostgreSQL URL through your shell/deployment secret store for production. Backend `.env.example` documents configuration; the app does not itself load that file. Export values or configure the process environment. Do not commit populated env files or database files.

```bash
# From backend/, with the virtual environment activated
python -m pytest -q
```

See [backend instructions](../backend/README.md) for API routes, feed TTLs, limits, Azure setup and production health checks. A local SQLite test does not prove production PostgreSQL or external-feed availability.

## Models and optional offline processing

Model weights use Git LFS. Install Git LFS, then run from the repository root:

```bash
git lfs install
git lfs pull
```

The prepared browser bundles do not require retraining. Training data is acquired separately; consult [models/README.md](../models/README.md) and [the M1 model card](../models/m1_terrain/MODEL_CARD.md).

The offline pipeline has separate, potentially large ML dependencies in `pipeline/requirements.txt`. Use a separate Python environment and an appropriate PyTorch build for your hardware. Site construction downloads remote scientific rasters; it is not part of ordinary frontend setup.

```bash
# In the pipeline environment, from repository root
python -m pip install -r pipeline/requirements.txt
python pipeline/build_site.py --site gale --out data/generated/gale-boxwork
python pipeline/build_site.py --site jezero --out data/generated/jezero
python -m pytest pipeline/sim/test_sim.py -q
```

`build_site.py` builds the base terrain bundle; reproducing every published ML, atmosphere, reconstruction and regional layer requires its corresponding pipeline stage and inputs. Do not replace the shipped bundle with an incomplete base build. Training archives linked from historical notes may have separate access or availability requirements.

## Troubleshooting

- **Terrain fails to load:** check the bundle base, site ID, manifest and referenced binary/image files; do not open `index.html` using `file://`.
- **LFS pointer instead of weights:** run `git lfs pull`; the browser demo and model-training workflow have different requirements.
- **Saving unavailable:** check the backend health, CORS and database configuration; local planning can still work.
- **DONKI unavailable/429:** inspect source age/status; configure the backend key rather than embedding a private key in the frontend.
- **REMS marked live but old:** live fetch means current access to the published feed, not a measurement made today.
- **Poor frame rate:** use the 2D map or reduce visual detail; fine imagery and splats can be demanding.
