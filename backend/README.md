# backend/

Owner: **Naomi**

FastAPI + PostgreSQL/PostGIS API: site catalogue, manifests, provenance registry, live conditions (Mars24, DONKI space weather cache), rover image proxy, saved and shared plans, Site Generator jobs.

The API must match `contracts/api_contract.yaml`. Change the contract first (announce it in the team chat), then the code.

Deploy: Google Cloud Run; every merge to `main` redeploys at the same URL.

Configuration (environment variables, never commit secrets): `DATABASE_URL`, `DONKI_BASE_URLS`, `BUNDLE_BASE_URL`, `ALLOWED_ORIGINS`.
