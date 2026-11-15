# Mars BEACON frontend

React/TypeScript browser application with Three.js, React Three Fiber, drei, Spark, Zustand and a Web Worker planning engine. The deployed app is https://mars-beacon.pages.dev/.

```bash
cd frontend
npm ci
npm run dev
# http://localhost:5173/#/app
```

Use Node.js 22.12+. Run `npm run typecheck`, `npm test`, and `npm run build` from this directory. Full instructions: [Setup](../docs/SETUP.md).

| Variable | Default | Meaning |
|---|---|---|
| `VITE_BUNDLE_BASE_URL` | `./bundle` | Parent of site folders; Vite serves `../fixtures` as public files. |
| `VITE_SITE_ID` | `gale-boxwork` | Initial site. |
| `VITE_BEACON_API` | Azure URL in `src/data/api.ts` | Backend; `/api` selects the local Vite proxy to port 8000. |

All frontend variables are public. Keep private keys on the server. See [.env.example](.env.example).

## Code map

- `src/data/`: bundle loading and backend access.
- `src/store/`: shared mission state.
- `src/engine/`: Return Envelope, routes, consumables, Mars24, environment, thermal model and live feeds.
- `src/render/`: terrain, procedural objects, rover detail and displays.
- `src/panels/`, `src/views/`: planning workflow, source information and user interfaces.
- `src/test/`: numerical and behavior tests.

Current behavior includes P90 slope sensitivity, Mars24 time/sun calculations, water/battery budgets and multiple crew displays. Earlier prototype notes describing these as future work are historical. See [architecture](../docs/ARCHITECTURE.md) and [limitations](../docs/VALIDATION_AND_LIMITATIONS.md).

The browser engine can continue using loaded bundles if the API fails. Mission persistence and fresh feeds still need a reachable backend. `npm run fixture` creates synthetic data only; do not confuse it with real site generation.

AI-assisted development and TRELLIS.2 concept assets are disclosed in [AI_USAGE.md](../AI_USAGE.md).
