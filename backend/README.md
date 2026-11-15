# backend/

Owner: **Naomi**. The API must match `contracts/api_contract.yaml`: change the contract first (announce it in the team chat), then the code.

FastAPI service that adds live and shared features to the Mars BEACON app: site catalogue and manifests, a data provenance registry, Mars24 conditions, a cached NASA DONKI space-weather feed, a rover image proxy, saved and shared plans, and Site Generator job requests.

**Design rule:** the front end works fully from the static site bundle. This API is optional. Every response that can be live or stale says so (`cached: true/false` and a `LIVE` / `CACHED` badge), and the app falls back to the bundled copy if the API is down.

## What is in this folder

| File | Purpose |
|---|---|
| `main.py` | The whole API: models, seed data, Mars24, all endpoints |
| `sources_registry.json` | Provenance registry. Drives `/datasets` and the References page text |
| `trek_layers.json` | Mars Trek tile layers returned by `/trek/layers` (URLs still to fill) |
| `references.py` | Prints the References and Space Agency Data page text from the registry |
| `schema.sql` | Postgres DDL generated from the models (the app also creates tables on startup) |
| `api_contract.generated.yaml` | OpenAPI export, for diffing against `contracts/api_contract.yaml` |
| `tests/test_api.py` | Pytest suite (runs in fixture mode, no network) |
| `Dockerfile` | Container image used for deployment |

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | status, version, fixture mode |
| GET | `/sites` | list of sites |
| GET | `/sites/{id}/manifest` | catalogue view of a site's layers |
| GET | `/sites/{id}/targets` | targets as GeoJSON |
| GET | `/datasets?site=&kind=` | provenance registry |
| GET | `/conditions?site=&utc=` | Mars24 solar time, Ls, sun elevation and azimuth |
| GET | `/spaceweather?kind=&start=&end=` | DONKI events (`FLR`, `CME`, `SEP`, `notifications`), cached per day |
| GET | `/rover-images?site=&near=x,y&radius=&sol=` | seeded POV pins plus the cached raw-image feed |
| POST | `/plans` | save a plan, returns `share_id` |
| GET | `/plans/{share_id}` | load a plan |
| POST | `/jobs/generate-site` | queue a Site Generator job (box max 5 km, L0 only) |
| GET | `/jobs/{id}` | job status |
| GET | `/trek/layers?site=` | Mars Trek tile layers |

Interactive docs are at `/docs` and the OpenAPI file at `/openapi.json` on any running instance.

## Configuration

Environment variables only. Never commit secrets.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | local SQLite file | Postgres URL, e.g. `postgresql://user:pass@host/db` (`postgres://` is also accepted) |
| `FIXTURE_MODE` | `0` | `1` = never call external services; serve seeded data |
| `BUNDLE_BASE_URL` | empty | Root of the storage bucket that holds the site bundles |
| `ALLOWED_ORIGINS` | `*` | Comma-separated app and landing-page origins. Set this before the demo |
| `NASA_API_KEY` | `DEMO_KEY` | Only used for the `api.nasa.gov` DONKI address. DEMO_KEY is rate limited |
| `DONKI_BASE_URLS` | `ccmc.gsfc.nasa.gov/DONKI-API/get`, then the older `DONKI/WS/get` and `api.nasa.gov` patterns | Tried in order; the response's `sourceUrl` shows which one worked |
| `RAW_IMAGES_FEED` | mars.nasa.gov raw-image feed | Override if the feed address changes (verify at build time) |

## Run locally

Requires Python 3.9 or newer (the container uses 3.11).

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
FIXTURE_MODE=1 uvicorn main:app --reload --port 8000
```

On Windows PowerShell set the variable first: `$env:FIXTURE_MODE="1"`.

Open http://localhost:8000/health and http://localhost:8000/docs. Without `DATABASE_URL` it creates a local `beacon.db` SQLite file and seeds it on first start. Delete that file to reseed.

Run the tests (no network needed):

```bash
pip install pytest
pytest -q
```

## Deploy to Azure App Service

Container Apps needs cloud container builds, which some student subscriptions block (`TasksOperationsNotAllowed`), so this service runs on App Service, which needs no container registry. Needs an Azure subscription and the Azure CLI (or Cloud Shell at portal.azure.com).

### 1. First deploy

Run from inside the `backend` folder. The app name becomes the address, so pick a unique one.

```bash
az provider register --namespace Microsoft.Web --wait
cd backend
az webapp up --name <app-name> --resource-group beacon-rg --location koreacentral --runtime "PYTHON:3.11" --sku F1
```

If the runtime format is rejected use `"PYTHON|3.11"`. If there is no quota for `F1` (free), use `--sku B1`.

### 2. Settings and start command

```bash
az webapp config appsettings set -g beacon-rg -n <app-name> --settings \
  FIXTURE_MODE=1 WEBSITES_PORT=8000 SCM_DO_BUILD_DURING_DEPLOYMENT=true DATABASE_URL=sqlite:////home/beacon.db
az webapp config set -g beacon-rg -n <app-name> --startup-file "python -m uvicorn main:app --host 0.0.0.0 --port 8000"
```

Check `https://<app-name>.azurewebsites.net/health` (first start takes 1-3 minutes). `az webapp log tail -g beacon-rg -n <app-name>` shows logs.

### 3. Move to Postgres (and PostGIS)

1. Create a free Supabase (or Neon) project and copy the **Session pooler** connection string (the direct address is IPv6-only and may not be reachable from App Service).
2. Set it on the app and restart. Do not commit or paste the password anywhere:

```bash
az webapp config appsettings set -g beacon-rg -n <app-name> --settings DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
az webapp restart -g beacon-rg -n <app-name>
```

The API accepts `postgres://` and `postgresql://` and always connects with the `psycopg2` driver. It creates its tables on startup.

3. PostGIS is optional. In Supabase go to Database, Extensions and enable `postgis` (or run `create extension if not exists postgis;`), then restart the app. On startup the API adds geometry columns and spatial indexes for sites and targets (SRID 0, because Mars has no Earth CRS) and keeps them in step with the plain coordinates. `/health` then reports `"postgis": "<version>"`. Without PostGIS everything still works on plain columns.

### 4. Go live and redeploy

- At Gate 1 set `FIXTURE_MODE=0` the same way as above, plus `NASA_API_KEY` and `ALLOWED_ORIGINS`.
- To redeploy by hand, rerun the `az webapp up` command from step 1 inside `backend`.
- Automatic: `.github/workflows/backend.yml` tests and deploys on every push to `main` that touches `backend/`. Add a GitHub secret named `AZURE_WEBAPP_PUBLISH_PROFILE`: in the portal open the App Service, Overview, **Get publish profile**, and paste the whole file. If the download is greyed out, enable **SCM Basic Auth Publishing Credentials** under Settings, Configuration, General settings.

The `Dockerfile` is kept for hosts that run containers.

## Before the demo checklist

- `/health` answers on the public address, opened in a private window.
- `FIXTURE_MODE=0`, and `/spaceweather` returns `"badge": "LIVE"` (or `CACHED` with a recent `fetched_at`).
- `/health` shows `"db": "postgresql"`, and a saved plan can be loaded back.
- `ALLOWED_ORIGINS` lists the real app and landing page origins.
- Open the address a few minutes before any recording. The free plan sleeps when idle, so the first request can be slow.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `{"detail":"Not Found"}` | The server is running but that path has no route. Use `/health` or `/docs` |
| Database connection refused from App Service | Use the Supabase Session pooler address, not the direct one |
| `/spaceweather` always `CACHED` | The live call failed. Check `source_url` and `NASA_API_KEY`, or that `FIXTURE_MODE` is `0` |
| `/rover-images` returns `items: []` | The raw-image feed address may have changed. Set `RAW_IMAGES_FEED` |
| Browser blocks calls from the app | Add the app's origin to `ALLOWED_ORIGINS` |
| App shows an error page right after deploy | Wait 2-3 minutes for the first build, then check `az webapp log tail` |

## Known limits and placeholders

- Gale and Jezero centre coordinates in `SEED_SITES` are placeholders until the real drill-site coordinates are set.
- `trek_layers.json` tile URLs are empty until filled from the Mars Trek API documentation.
- `/conditions` returns `null` for light-time and the REMS band for now.
- Mars24 is coded from the published formulas and only loosely checked. Compare against the official Mars24 tool before relying on it.
- `/jobs/generate-site` only records the request. The worker that runs the pipeline script is not connected, and must allowlist the DEM and orthophoto hosts when it is.
- Licence fields in `sources_registry.json` are blank until checked at each source.
