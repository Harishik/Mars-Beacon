# Continuation plan, 15 Nov 2026 (later)

Follows `Handoff_2026-11-15.md`. Work moves from the cloud session to a local machine.

Branch `claude/vigilant-meitner-7a256r`, built on top of `v6/frontend-prototype` (draft PR #4). Frontend 49 tests passing, production build passing.

## Get it running locally

```bash
git clone https://github.com/Harishik/Mars-Beacon.git
cd Mars-Beacon
git checkout claude/vigilant-meitner-7a256r
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (landing page; the map is at `#/app`).

- Every bundle file is in Git (`fixtures/bundle/`, about 160 MB, including the 25 cm HiRISE tiles), so the clone is complete. No bucket download needed.
- `npm test` runs the engine tests. `npm run build` then `npm run preview` serves the production build.
- Live feeds without a backend: REMS (mars.nasa.gov) is blocked by CORS from the browser and DONKI comes through the backend, so panels show snapshot or offline data. To get them live, run the backend locally (`backend/README.md`, uvicorn on port 8000) and start the frontend with `VITE_BEACON_API=/api npm run dev`; the dev server proxies `/api` to it.

## Done in this session: water and suit battery alongside O₂

- `frontend/src/engine/physiology.ts`
  - Cooling water: `waterRateGph(M) = (M + P_elec) · 3600 / 2454` g/h. All metabolic and suit electrical heat is rejected by evaporating water (latent heat 2454 J/g near 20 °C). Heat leak through the suit wall is ignored, so the figure overstates use, which is the safe side.
  - Battery: `batteryWhFor(t) = P_elec · t / 3600`, with `SUIT_ELEC_W = 60` W (ASSUMPTION, VERIFY against NASA xEMU figures).
  - `waterFromO2(o2G, t)`: water and O₂ are both linear in metabolic power, so the water for any path follows exactly from that path's O₂ and time. Because of this, the envelope's Dijkstra loop is unchanged; water and battery are certified on the same tree path after the search.
  - `consumablesLeft(crew, timeSpentS)`: water and battery used are not stored. They are derived from O₂ used and EVA time, so the sliders, the playhead and saved missions all stay consistent.
- `envelope.ts`: optional per-suit `waterBudgetG/waterSpentG/batteryBudgetWh/batterySpentWh`. Margin is now the minimum over time, O₂, water and battery. Left out, behaviour is exactly as before (oracle parity untouched).
- `planner.ts`: optional `waterBudgetG`, `batteryBudgetWh`; certification at every stop and at the airlock includes them; samples carry `waterLeft` and `batteryLeftWh`.
- `query.ts`: `waterHomeG`, `batteryHomeWh`; `limitedBy` can now be `EV1 water`, `EV2 water`, `EV1 battery`, `EV2 battery`.
- Store: `Crew` gains `waterBudgetG: 3600` and `batteryBudgetWh: 400` (SCENARIO placeholders, in `DEFAULT_CREW`). Shared missions saved before this change are filled with these defaults on load (`data/api.ts`).
- UI: Crew panel (water and battery under the O₂ meter), Visor (time left now takes the tightest of time, O₂, water and battery; suit detail rows), Mission control crew card, Mission panel ("Water, battery to get home"), Field tablet card, Ledger (two equations and the budget row).
- Tests: `src/test/consumables.test.ts` (7 tests: conversions, generous budgets change nothing, low battery shrinks the envelope and certifies on the same path, one suit short of water limits the pair).

Checked in a headless browser: the readings show in Rehearse and Execute, with no new console errors. Not yet checked by eye on every view.

## Next, in order

1. **Look at the new readings locally** on every view (Habitat, Control, Tablet, EVA, Visor, Rover, Linked), both sites, and fix any layout crowding, especially the Visor card and the Field tablet at laptop widths.
2. **Cite the suit figures** and replace the placeholders, keeping provenance tags: water budget (3.6 kg), battery budget (400 Wh), electrical load (60 W), and the O₂ budget (1000 g). NASA or NASA-affiliated sources only (xEMU and EMU documents on NTRS). Update the Ledger notes when they change from SCENARIO or ASSUMPTION.
3. **Tell Sahaj**: the Python reference (`pipeline/sim/envelope.py`) should gain the same water and battery terms so the oracle cases cover them. The TypeScript formulas above are the spec.
4. Optional: put `waterBudgetG` into `contracts/mission_state.schema.ts` `ResourceBudget` (it already has `energyWh` and `energySpentWh`). This is a contract change, so agree it with the team first.
5. Carry on with the earlier list from `Handoff_2026-11-15.md`:
   - Naomi deploys `backend/` and sets `DATABASE_URL`, `NASA_API_KEY`, `ALLOWED_ORIGINS`, Always On; verify `/health`, `/spaceweather?kind=FLR`, `/weather/rems`.
   - Build with `VITE_BEACON_API=<her address>`, full sweep, save-and-share round trip.
   - Host the frontend on a static host that serves all bundle files.
   - Slopes checked against Curiosity's measured tilt; UI polish; load and FPS tests on a phone and a laptop; astronaut and scout rover models when the assets arrive.

## Rules (unchanged)
- No AI attribution in commits or PRs.
- NASA or NASA-affiliated data only.
- Provenance tags on every number.
- No em-dashes in copy.
- Nothing about other teams in the repo.
