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
