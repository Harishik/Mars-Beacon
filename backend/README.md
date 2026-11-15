# backend/

Mars BEACON API: FastAPI + PostgreSQL. Matches `contracts/api_contract.yaml` (plus `/weather/rems`).

## What runs where

The browser runs the terrain engine, the Return Envelope and the planner, so every slider responds
instantly and the app keeps working if this service is down. The server does what a static site cannot:

| Endpoint | What it does | Storage |
|---|---|---|
| `POST /plans`, `GET /plans/{id}` | Save a mission or debrief, reopen it from a share link | `plans` table |
| `GET /spaceweather?kind=FLR\|SEP\|CME\|GST\|notifications` | NASA DONKI, fetched on the server once per 15 min for everyone. Keyless CCMC first, then api.nasa.gov with `NASA_API_KEY`. Badge `LIVE`, `STALE` (last good copy, with age) or `UNAVAILABLE` | `feed_cache` |
| `GET /weather/rems` | Curiosity REMS daily weather from the NASA/JPL feed, cached 1 h | `feed_cache` |
| `GET /conditions?site=&utc=` | Mars24 time and sun, Earth-Mars light time, latest REMS sol | none |
| `GET /sites`, `/sites/{id}/manifest`, `/sites/{id}/targets`, `/datasets`, `/rover-images` | Same bundles the frontend uses, so ids and the `siteHash` match | files |
| `GET /trek/layers` | NASA Mars Trek WMTS templates | none |
| `GET /health` | Status, database kind and reachability, whether a NASA key is set | none |

Saves are limited to 64 KB and 30 per hour per address; the NASA key never appears in a response.

## Run locally

```bash
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # SQLite file beacon.db
DATABASE_URL=postgresql://user:pass@host:5432/beacon uvicorn app.main:app   # PostgreSQL
python -m pytest -q                       # 12 tests; TEST_DATABASE_URL=postgresql://... to run them on Postgres
```

The tables are created on first start (`CREATE TABLE IF NOT EXISTS`).

## Configuration (environment variables; never commit secrets)

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes in production | `postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require` (Azure needs `sslmode=require`) |
| `NASA_API_KEY` | recommended | Free key from https://api.nasa.gov, second DONKI source and higher rate limit |
| `ALLOWED_ORIGINS` | recommended | Comma-separated site origins, e.g. `https://mars-beacon.example.app`; default `*` |
| `BUNDLE_DIR` | no | Defaults to `../fixtures/bundle` (the Docker image sets `/srv/bundle`) |
| `SITES` | no | Default `gale-boxwork,jezero` |

## Deploy on the existing Azure App Service (Naomi)

The App Service that serves `beacon-api-naomi42.azurewebsites.net` already reaches the team's Azure PostgreSQL.

1. **Container** (simplest): from the repository root, `docker build -f backend/Dockerfile -t mars-beacon-api .`, push it to
   Azure Container Registry or Docker Hub, and point the App Service at the image. Set `WEBSITES_PORT=8000`.
2. **Or code deploy**: deploy the whole repository and set the startup command to
   `cd backend && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers`.
3. In Configuration → Application settings set `DATABASE_URL`, `NASA_API_KEY`, `ALLOWED_ORIGINS`.
4. Turn on **Always On** (otherwise the first request after idle takes many seconds).
5. Check: `GET /health` shows `"db":"postgresql","dbOk":true,"donkiKey":true`, and
   `GET /spaceweather?kind=FLR` shows `"badge":"LIVE"`.

The frontend reads the API address from `VITE_BEACON_API` at build time
(`VITE_BEACON_API=https://... npm run build`).
