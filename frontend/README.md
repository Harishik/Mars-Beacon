# frontend/

Owner: **Harishik**

React Three Fiber web app: Habitat Console, Field Tablet and Helmet HUD, all driven by one mission state, plus the planning engine in a Web Worker.

Planned stack: Vite, React, TypeScript, three.js via React Three Fiber, drei, Spark (Gaussian splats), Zustand, Comlink Web Worker, Leaflet (Mars Trek inset), Vitest.

Configuration (environment variables, never commit secrets):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL from Naomi's Cloud Run deploy (or local) |
| `VITE_BUNDLE_BASE_URL` | Where site bundles live (bucket URL, or `/fixtures` in dev) |

The app must work with the backend down: panels fall back to cached data from the bundle.

## Run it

```bash
cd frontend
npm install
npm run fixture   # writes the synthetic placeholder bundle to ../fixtures/bundle/gale-synthetic/
npm run dev       # http://localhost:5173  (landing page; the map is at #/app)
npm test          # engine tests, including a 750 x 750 timing run
```

In development the app reads bundles from `../fixtures/bundle/<siteId>/`. To use Sahaj's real bundle, set `VITE_BUNDLE_BASE_URL` to the bucket folder that holds `<siteId>/manifest.json` and `VITE_SITE_ID` to its site id. No code changes.

## What is built so far

| Part | Where | State |
|---|---|---|
| Bundle loader (manifest + typed rasters, size checks) | `src/data/bundle.ts` | Working |
| Return Envelope engine: multi-haven reverse Dijkstra, 16 neighbours, paired-crew pace, O2 per suit on the same path, reserve margin | `src/engine/envelope.ts`, `worker.ts` | Working (tree T only; tree O and P90 band next) |
| Walking and oxygen model (Tobler speed, Minetti cost, O2 conversion) | `src/engine/physiology.ts` | Working; Sahaj's oracle cases to confirm |
| Sun position | `src/engine/sun.ts` | Placeholder (declination 0) until the Mars24 port |
| Terrain shader: envelope boundary, no-go hatch, contours, grid, sun light, haze | `src/render/Terrain.tsx` | Working |
| Mars sky, habitat, rover, two astronauts, target pins | `src/render/` | Working, built in code |
| Landing page, console, layer drawer with source cards, crew panel, time bar, instrument strip | `src/views/`, `src/panels/` | Working |
| Field tablet and helmet display | `src/render/Scene.tsx`, `src/panels/Chrome.tsx` | First version |

Design rules and references: `docs/design/Design_System.md`.
