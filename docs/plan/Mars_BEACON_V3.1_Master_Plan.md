# Mars BEACON V3.1: Master Plan

Team NASHA (Harishik, Sahej, Naomi). NASA Space Apps Challenge 2026, Seoul.
Challenge: Interplanetary Survival Guide: Martian Map.
Status: Saturday 14 November 2026, 18:30 KST. Replaces Gemini's 5-document V3 pack where the two disagree. Everything in V3 not changed here still applies.

Submission: hard deadline Sunday 15 November, 23:59 KST. Team target 22:00 KST. "Submit for Judging" must show "Project Submitted for Judging".

## 0. What changed from Gemini V3

| Area | V3 said | V3.1 decision | Why |
|---|---|---|---|
| 3D assets | Blender low-poly .glb models | Blender dropped. Habitat, rover and two astronauts built directly in Three.js from primitives and physical materials, as part of a realistic digital twin | Team decision. Removes a tool, a pipeline step and an asset handoff |
| Scope | Cut list applied "if something slips" | Nothing else is dropped. Every V3 feature stays in scope. Order of work protects the core first (section 9) | Team decision |
| Physiology claim | "Pandolf-Minetti calibrated within 1.9% of NASA 181.4 g/h" | Claim removed. The 178 vs 181 g/h check only tests the watts-to-oxygen conversion. The model itself gives 296 W (76 g/h) on flat ground with a 104 kg suit and never reaches 696 W below the 20 degree cutoff. New calibration rule in section 4.3 | Was false; a judge could reproduce it in a minute |
| Metabolic equation | eta listed as an input but missing from the formula; called "Pandolf-Minetti" | eta multiplies locomotion power. Named honestly: Minetti gradient cost with a gravity/suit scaling factor. Speed curve credited to Tobler | Correctness and attribution |
| Ambient radiation | ~700 uGy/day | ~210 uGy/day absorbed dose (about 0.64 mSv/day dose equivalent), Curiosity RAD surface average (Hassler et al., Science, 2014) | 700 mixed up grays and sieverts |
| SPE shelter window | 50 min "modeled on RAD" | 50 min kept, tagged SCENARIO. RAD 20 May 2024 figure shown as HISTORICAL context only | The window is our assumption, not a RAD measurement |
| Same-path feasibility | Three separate reverse Dijkstra fields | Dual-tree certification (section 4.5): one search, all resources summed along that same path | Three independent fields cannot prove one path fits every budget |
| P90 uncertainty | 16 realizations of the return field, offline | 16 realizations of the slope and cost rasters, offline; the browser runs the envelope on the median or the P90 raster | Works with a moving rover haven; the old version only worked for a fixed habitat |
| Recompute speed | "< 35 ms" for 750 x 750, 16 neighbours | Measured, not promised. Budget 150 ms desktop, 600 ms phone; progressive 8 m grid while dragging if over budget | 9 million edge relaxations per run is not 35 ms in JavaScript |
| Gates | G04 defined twice, tolerances 1e-5 and 1e-6 | One gate table (section 8), one tolerance per test | Internal contradictions |
| Video card | "Team Seoul" | "Team NASHA" | Wrong name |
| Backend | Optional FastAPI | Not touched in this plan | Team decision |

## 1. Product

Mars BEACON is a hyperlocal, multi-mission map and 3D + time digital twin of one Mars science site, for a two-person crew planning and carrying out a Marswalk. It is a map and planning tool, not a game: no health bars, scores, injuries or death screens.

The first screen is the map: real Gale terrain in 3D, NASA data layers, science targets, the planned route and the live Return Envelope.

Core loop: EXPLORE, INTERPRET, PLAN, SIMULATE, REPLAN, REPLAY, EXPLAIN.

Return Envelope: every terrain cell from which both astronauts can still walk back to an active haven along one path, with reserve margin, given current oxygen, battery, time, suit load, pace, rover position and space weather. It grows, shrinks and splits as those change. This is the central idea and the thing the demo shows.

Terminology: "3D + time spatial-temporal digital twin" or "4D spatial-temporal digital twin" (metric 3D terrain plus a time-indexed state). Never "neural 4D reconstruction".

## 2. Site

Primary (Mission M1): Gale Crater, Mount Sharp boxwork unit, a 3,000 m x 3,000 m box around Curiosity's 2025 to 2026 boxwork campaign (Altadena drill site and the ridge and hollow targets).

Science objective: ridge against hollow. Boxwork ridges are thought to record mineral-rich groundwater cementing fractures; hollows are the softer, eroded rock between them. The EVA samples one ridge and one hollow and compares them.

Secondary: Jezero Crater bundle loaded through the same `site_manifest.json` loader, with Perseverance raw images as ground views.

## 3. Data layers

Every layer shows mission, product ID, resolution, acquisition date and a provenance tag: OBSERVED, DERIVED, HISTORICAL, SCENARIO, UNKNOWN.

| # | Kind of data | Layer | Source | Native resolution | Tag |
|---|---|---|---|---|---|
| 1 | Topographic | 3D terrain, slope, no-go cells | MRO HiRISE DEM (USGS Gale merged DEM, or a single HiRISE DTM if coverage fails) | 1 m | OBSERVED / DERIVED |
| 2 | Optical | Draped surface image | MRO HiRISE orthophoto (USGS Gale merged 25 cm mosaic) | 25 cm | OBSERVED |
| 3 | Spectral | Clay and sulfate indicators | MRO CRISM summary parameters | about 18 m | OBSERVED / DERIVED |
| 4 | Thermal | Thermal inertia (loose sand against rock) | Mars Odyssey THEMIS | about 100 m | OBSERVED |
| 5 | Radiation | Ambient dose and the 20 May 2024 storm | MSL Curiosity RAD, with DONKI event record | point, daily | HISTORICAL |
| 6 | Atmospheric | Seasonal temperature and pressure range | MSL Curiosity REMS | point, hourly | HISTORICAL |
| + | Regional context | MOLA colour elevation and CTX inset | JPL Mars Trek (via MGS MOLA, MRO CTX) | 463 m / 6 m | OBSERVED |
| + | Geology | Regional unit boundaries | USGS-NASA Planetary Geologic Mapping Program | map scale | HISTORICAL |
| + | Rover route | Curiosity's real traverse and named regions | Curiosity route map for lower Mount Sharp | route | HISTORICAL |
| + | Ground views | Mastcam / Navcam frames and panorama pinned where taken | MSL Curiosity (Gale), Perseverance raw images (Jezero) | photo | OBSERVED |
| + | Sun and lighting | Sun direction, local solar time, shadows | Mars24 algorithm (Allison and McEwen) | computed | DERIVED |

Resources tab (all five used and named in the submission's Space Agency Data field): JPL Mars Trek, USGS-NASA Planetary Geologic Mapping Program, the Curiosity lower Mount Sharp route map, NASA Worldview (design model for the time slider, layer drawer and shareable URLs), Mars Perseverance Raw Images.

Coarse layers (CRISM, THEMIS) are shown at their real resolution and never resampled to look sharper than they are.

## 4. Science engine

Runs in a TypeScript Web Worker on the client. No GPU or server needed for any number. An offline Python copy checks it.

### 4.1 Grids

- Offline reference grid: 2 m, 1500 x 1500.
- Live worker grid: 4 m, 750 x 750 (562,500 cells).
- Progressive grid while a slider is being dragged, used only if the 4 m grid misses its time budget: 8 m, 375 x 375. Full 4 m result replaces it on release.
- Frame: local East-North-Up, metres, origin and CRS recorded in `site_manifest.json`.

### 4.2 Terrain

- Slope: Horn 3 x 3 on the 4 m grid. The 1 m slope maximum per 4 m cell is also baked offline, so steep 1 m features inside a cell are not smoothed away.
- Hard block: any edge entering or crossing a cell with slope above 20 degrees, or with no-data elevation, costs infinity. No interpolation across voids.
- Lattice: 16 neighbours (8 plus 8 knight moves), intermediate cells checked so no edge cuts a blocked corner.
- Edge geometry: horizontal distance d_xy, signed rise dz, surface length d_s = sqrt(d_xy^2 + dz^2), grade i = dz / d_xy.
- Roughness: RMS residual in a 3 x 3 window at 1 m, baked per 4 m cell.
- Substrate factor eta: bedrock 1.10, regolith 1.20, loose sand 2.10, uncertain 1.45 + 0.35 x H (H = class entropy, 0 to 1). Class from THEMIS thermal inertia plus orthophoto texture, UNKNOWN where they disagree.

### 4.3 Suited walking

Speed (Tobler hiking function, normalised to 0.56 m/s, about 2 km/h, on flat ground):

```
v(i, f_mob) = 0.56 * f_mob * exp(-3.5 * |i + 0.05|) / exp(-0.175)     [m/s]
dt = d_s / v                                                         [s]
```

f_mob = 1.0 nominal, 0.45 reduced pace.

Metabolic power:

```
C(i) = 280.5 i^5 - 58.7 i^4 - 76.8 i^3 + 51.9 i^2 + 19.6 i + 2.5    [J/(kg m)]  (Minetti et al., 2002)
M    = M_base + k_g * eta * C(i) * (W + L) * v                       [W]
```

- M_base = 100 W, W = 80 kg, L = 104 kg nominal or 186 kg heavy load.
- k_g = gravity and suit scaling factor. Default 0.76, tagged ASSUMPTION until calibrated.
- Calibration rule: Sahej finds a published suited-walking metabolic measurement with its test speed, grade, suit mass and gravity, runs the model at exactly those conditions, and fits k_g. Pass if within 10%. If no source is found by Gate 1, k_g stays ASSUMPTION and the app says so.
- Conversion check (separate test): O2 (g/h) = M x 3.6 / 20.1 x 1.429. At 696 W this gives 178 g/h. This tests the conversion only and is described that way.

Consumables:

```
O2  (g/h)  = M * 3.6 / 20.1 * 1.429
CO2 (g/h)  = 0.85 * O2 / 1.429 * 1.977
P_elec (W) = 115 + P_thermal(T_amb, sun elevation)
```

P_thermal is a stepped table by REMS seasonal temperature band and sun up or down, tagged ASSUMPTION.

Default suit budgets (SCENARIO, replace with cited values if found): usable O2 per suit, battery energy per suit, EVA time limit, reserve margin m = 0.25.

### 4.4 Havens and reverse search

Active havens H(t): habitat airlock always; support rover when parked and working. A rover outage removes it and marks every route that depended on it as stale.

Reverse Dijkstra from all havens at once (binary min-heap, typed arrays), walking edges backwards with the forward cost.

### 4.5 Dual-tree certification (same-path, paired crew)

1. Tree T: one reverse search minimising pair time, where each edge takes dt_pair = max(dt_A, dt_B) (the pair walks at the slower astronaut's pace). Along each cell's path to a haven, sum O2_A, O2_B, E_A, E_B and time.
2. Tree O: a second reverse search minimising the larger of the two astronauts' O2 use at pair pace. Sum the same quantities along its paths.
3. A cell is inside the Return Envelope if either tree's path satisfies, for both astronauts and every resource:

```
Spent(t) + (1 + m) * PathCost + FixedReserve <= Budget
```

4. During a solar storm scenario add: (1 + m) x pair return time <= 3,000 s (50 min, SCENARIO).

This is conservative: it can miss a feasible cell, never certify an infeasible one. The app states that.

### 4.6 Uncertainty (P90)

Offline: 16 spatially correlated perturbations of the DEM (sigma_z about 0.35 m, value to be checked against the DEM's stated precision). For each, recompute slope and blocked cells. Per cell, store the median and 90th-percentile slope.

Browser: run the envelope on the median raster and on the P90 raster. Draw both boundaries and shade the band between them. Because this is per cell, not per path, it works with any haven, including a freshly parked rover.

### 4.7 Time

- Simulation clock in seconds from egress, driven by a seeded event log.
- Mars24: Mars Sol Date, LMST at the site longitude, solar declination, hour angle, sun elevation and azimuth every simulated minute. Drives the 3D sun, shadows and night deadlines.
- Replay: positions and resources interpolated between logged states at 60 fps, no re-search per frame.
- Same site hash + assumptions + seed + event log reproduces the same ledger and view after reload.

### 4.8 Scenario events (all SCENARIO)

Oxygen change, suit load change (104 to 186 kg), pace reduction, rover park, rover outage, solar storm start. Each marks routes stale and recomputes from the crew's current position. A "No verified return path" state is shown honestly when it happens.

### 4.9 Performance budget (measured in the first build hour)

| Step | Desktop | Phone |
|---|---|---|
| Full 4 m two-tree recompute | 150 ms or less | 600 ms or less |
| Envelope redraw after recompute | under 1 ms (shader reads a DataTexture) | same |
| Frame rate, high tier | 60 fps | 30 fps or more |

If the 4 m grid misses budget, use the 8 m progressive grid while dragging.

## 5. Realistic digital twin in Three.js (no Blender)

Stack: Vite, React, TypeScript, Three.js through React Three Fiber, drei helpers, Zustand store, Web Worker. Static hosting.

### 5.1 Terrain

- Mesh displaced from `height_750.bin`: 512 x 512 vertices on high tier, 256 x 256 on standard.
- Normal map baked offline from the 1 m DEM, so 1 m relief shows on a 4 m mesh.
- HiRISE orthophoto draped as the albedo. HiRISE greyscale gets a Mars colour ramp; the ramp is labelled as visualisation, not measured colour.
- Close-range detail texture blended in only under about 50 m camera distance, labelled procedural.
- Envelope, slope, CRISM and THEMIS overlays drawn in the terrain shader from DataTextures, no geometry rebuild.

### 5.2 Sky, light, atmosphere

- Sun direction from Mars24; directional light with shadow map; hemisphere fill light.
- Mars sky shader: butterscotch daytime sky, bluish glow around the sun near sunset (dust scattering), labelled visual approximation.
- Distance haze and light dust particles.
- ACES tone mapping. High tier adds ambient occlusion; standard tier skips post effects.

### 5.3 Habitat, rover, astronauts (built in code)

- Habitat: regolith-bermed module from cylinder and lathe geometry, airlock, beacon light. Physical materials.
- Support rover: chassis from extruded shapes, six wheels that sample terrain height each frame, body tilt from wheel heights, headlights. Parks as a haven.
- Two astronauts: suit from capsules and spheres, backpack, tinted visor, beacon colour (Crew A cyan, Crew B amber). Procedural walk cycle with step length tied to the speed model, so a heavier load or steeper grade visibly slows them.
- No NASA logos, flags or mission marks on any model.

### 5.4 Views from one store

One state store, one engine:

- Habitat Console: full 3D map, layer drawer, analytics panels, timeline.
- Field Tablet: compact 2D map, next waypoint, return margin cards, large touch targets.
- Helmet Visor HUD: first-person camera at 1.7 m eye height on the terrain, horizon line, heading chevrons, envelope boundary line, O2 and time arcs.

Fallback: if WebGL fails, a 2D Canvas shaded-relief map with the same envelope from the same buffers.

## 6. Frozen contracts (first deliverable, before feature code)

### 6.1 `site_manifest.json`

```
siteId, name, body: "Mars"
crs, origin { lat, lon }, gridSizeM, cols, rows, extentM
elevation { min, max, datum }
files: [{ name, path, dtype, cols, rows, sha256, scale, offset }]
  height_750.bin (Float32), slope_750.bin, slope_p90_750.bin, slope_max1m_750.bin,
  eta_750.bin, rough_750.bin (Uint8 quantised), ortho_2048.webp, normal_2048.webp,
  crism_256.png, themis_256.png
layers: [{ id, kind, mission, productId, resolutionM, acquired, tag, attribution, url }]
havens: [{ id, type: "habitat" | "rover", x, y }]
targets: [{ id, name, type: "ridge" | "hollow" | "drill", x, y, sol, tag, source }]
povImages: [{ id, x, y, headingDeg, sol, instrument, credit, url }]
route: { source, points: [[x, y]] }
siteHash
```

### 6.2 `mission_state.schema.ts`

```
Assumptions { kG, mBase, bodyMassKg, loadKg: { A, B }, fMob: { A, B }, reserveM,
              budgets: { o2G, energyWh, timeS } per crew, speCeilingS, slopeLimitDeg }
CrewState { id, x, y, o2SpentG, energySpentWh, timeS, loadKg, fMob }
Event { t, type: "o2" | "load" | "pace" | "roverPark" | "roverOut" | "spe", payload }
MissionState { siteHash, seed, t, crew: [A, B], havens, events, routes, stale, view, layers }
EnvelopeResult { gridM, inside: Uint8Array, inside90: Uint8Array, timeToHaven: Float32Array, tree: "T" | "O" }
Tag = "OBSERVED" | "DERIVED" | "HISTORICAL" | "SCENARIO" | "UNKNOWN" | "ASSUMPTION"
```

### 6.3 `oracle_test_cases.json`

25 cases, each with inputs and expected outputs, run in Vitest and Pytest:

- Flat bedrock, nominal load.
- Uphill and downhill at 5, 10, 18 degrees on soil and sand.
- 21 degree edge (blocked).
- No-data cell (blocked).
- Knight-move edge across a blocked corner (blocked).
- Heavy load against nominal.
- Pair with one reduced pace (pair time uses the slower one).
- Two havens, envelope splits.
- Rover outage removes a haven.
- Storm ceiling cuts a far cell.
- A case where the time-best path fails O2 and the O2-best path passes (tests dual-tree).
- Watts-to-O2 conversion at 696 W.
- Mars24 sun elevation at a known date and Gale longitude against the published Mars24 output.

Tolerance: TS against Python 1e-5 relative. Hand-worked small graph: exact path and cost to 1e-6.

## 7. Judging story

- Impact: on real Gale terrain, what share of a plain 2 km walk-back circle is actually unreachable or unsafe, and how much extra science ground a parked rover opens.
- Creativity: a live Return Envelope that breathes with oxygen, load, pace, rover and storm.
- Validity: equations shown in the app, oracle parity, P90 band, an assumptions and limitations panel, honest "no verified return" states, no inflated calibration claims.
- Relevance: every objective and consideration in the brief mapped to a feature (section 10).
- Presentation: map-first screen, 90-second guided tour, 30-second video.

Lineage panel: Apollo walk-back limits, the Artemis 2 km planning circle, MIT SEXTANT path planning, NASA Worldview time and layer controls.

## 8. Gates (one table)

| Gate | Check | Pass rule |
|---|---|---|
| G01 | Provenance | Two or more NASA missions and one or more Resources-tab tools visible, every layer with product ID, date, resolution, tag |
| G02 | Alignment | DEM and orthophoto registered within one 1 m pixel |
| G03 | No-data | Voids blocked and tagged UNKNOWN, never interpolated |
| G04 | Oracle parity | All 25 cases pass in Vitest and Pytest at 1e-5; hand graph exact |
| G05 | Physiology | Model at benchmark test conditions within 10% of the cited measurement, or k_g shown as ASSUMPTION |
| G06 | Paired crew | Pair pace = slower astronaut; O2, energy, time per suit |
| G07 | Monotonicity | More dwell time or more load never increases remaining margin |
| G08 | Replanning | Pace drop or rover outage marks routes stale and recomputes from current position |
| G09 | Replay | Same hash, assumptions, seed and events give identical ledger after reload |
| G10 | Honest failure | Nominal, degraded and impossible scenarios run with no scripted overrides |
| G11 | Devices | Desktop and phone usable; 2D fallback works with WebGL disabled; budgets in 4.9 met or progressive grid used |
| G12 | Public access | App and video open in an incognito window; NASA and AI disclosures present |
| G13 | Attribution | Every Curiosity image and geology claim matches a verified sol, instrument and location |

## 9. Schedule (KST) and owners

Owners shift slightly from V3 to balance load: Sahej owns the pure science functions (metabolic, Mars24) in both TypeScript and Python, so the oracle is one person's job. Harishik owns the renderer, worker search and store. Naomi owns data provenance, panels, Jezero imagery, QA and submission.

| Window | Harishik | Sahej | Naomi |
|---|---|---|---|
| Sat 18:30 to 20:00 | Scaffold repo (Vite, R3F, worker); write `mission_state.schema.ts`; benchmark reverse Dijkstra on a synthetic 750 x 750 grid | Confirm DEM and orthophoto actually cover the boxwork box; pick the product; start download and clip | Verification list (below); claim global offers; start `sources_registry.json` |
| 20:00 | **Gate A: contracts frozen.** Manifest fields, schema, 25 oracle cases agreed. DEM product chosen | | |
| 20:00 to 22:30 | Terrain mesh from real `height_750.bin`; ortho and normal maps; envelope shader; worker single-tree search | Bake height, slope, slope max, eta, roughness, normal map; write metabolic and Mars24 in TS and Python; oracle passing | Mars Trek inset, USGS units, Curiosity route, POV images pinned with sols |
| 21:15 | Team meeting (confirm time) | | |
| 22:30 | **Gate 1: live Return Envelope on real Gale terrain** | | |
| 22:30 to 03:00 | Dual-tree certification, paired crew, suit load, rover park and outage, storm ceiling; sky, sun, shadows; habitat, rover, astronaut models | 16 DEM perturbations and P90 slope raster; 2 km circle comparison numbers; k_g calibration source | CRISM and THEMIS layers; RAD, REMS, DONKI cards; draft project page and save progress |
| 03:00 to 07:00 | Rest (staggered, Naomi 00:30 to 05:30, Harishik 03:00 to 07:00, Sahej 04:00 to 08:00) | Jezero bundle through the same loader | Rest, then check-in window |
| 07:00 to 12:00 | Replay timeline, scenario events, Field Tablet and Helmet HUD views, 2D fallback, M1 guided route | AI4Mars terrain card (offline, Kaggle or Colab, non-PRC backbone) with frozen test metrics; validation table | Lineage panel, assumptions panel, guided tour text; run G01 to G13 on desktop and phone |
| 12:00 | **Gate 2: feature freeze.** Team reviews what is not done and decides; nothing is cut before this point | | |
| 12:00 to 16:00 | Fixes, performance, deploy public static build | Audit every number and ID against the manifest and sources | Screen capture, 30-second video with English subtitles |
| 16:00 to 20:00 | Zero console errors, README, license | Sign off validation and limitations panel | Upload video, test every link logged out, check-in window |
| 20:00 to 22:00 | Final walkthrough | Final disclosure check | Fill all fields, tick both boxes, Submit for Judging, screenshot confirmation |

Order of work inside each window protects the core first: real terrain, live envelope, multi-mission layers, validation numbers, 2D fallback, video and public link come before the rest.

### Verification list (first hour, Naomi with Sahej)

1. USGS Gale merged 1 m DEM and 25 cm mosaic coverage over the boxwork area. If not covered, the HiRISE DTM that is.
2. Names, sols and coordinates of Altadena and the ridge and hollow targets used in the app, including "Nevado Sajama", from NASA or JPL pages.
3. Panorama ID (V3 cites PIA26696) and its credit line.
4. Exact wording and units of the RAD 20 May 2024 storm figure (8,100 micrograys) from the NASA source.
5. A published suited-walking metabolic measurement for k_g calibration.
6. Curiosity traverse data source and format.
7. CRISM and THEMIS product IDs over the box.

## 10. Brief coverage

| Brief item | Feature |
|---|---|
| Layered, integrated view of a location or route | 3D map with layer drawer, route, envelope |
| Data from multiple NASA missions | MRO, Mars Odyssey, MGS, MSL Curiosity, Perseverance, plus DONKI |
| Routes, destinations, current conditions | Targets, planned route, conditions strip (LMST, sun, REMS range, RAD, storm state) |
| Science goal and location | Ridge against hollow in the Mount Sharp boxwork |
| At least three kinds of data (suggested) | Six: topographic, optical, spectral, thermal, radiation, atmospheric |
| Astronaut safety, radiation, space weather | Return Envelope, storm ceiling, RAD and DONKI cards |
| Suits and equipment affect mobility | Load and pace change speed, power, consumables and the envelope |
| Route avoiding large rock formations | Slope block, roughness, 1 m slope maximum, 16-neighbour planner |
| Habitat display, tablet, helmet HUD | Three views from one store |
| Static, interactive, or a map generator | Interactive app, static briefing export, site loader run on Gale and Jezero |
| How other worlds were mapped | Lineage panel |
| Past, predicted, future time | Dated RAD and REMS; Mars24 sun; scenario timeline |
| Point-of-view surface images | Curiosity and Perseverance frames pinned on the map |
| Rovers and paired astronauts | Rover haven, two-person crew with slower-pace coupling |

## 11. Video (30 seconds)

1. 0:00 to 0:02: Mars BEACON, Team NASHA, NASA Space Apps 2026, Martian Map.
2. 0:02 to 0:05: Overhead HiRISE view of the boxwork. "From any point on Mars, can the crew still get home?"
3. 0:05 to 0:09: Tilt into 3D terrain with the envelope. "A live Return Envelope on real 1 m terrain."
4. 0:09 to 0:14: Oxygen drops and the load goes from 104 to 186 kg; the envelope shrinks; astronauts slow.
5. 0:14 to 0:18: Rover parks near a ridge; the envelope grows to new targets.
6. 0:18 to 0:22: Storm scenario; the 50-minute boundary appears (labelled SCENARIO).
7. 0:22 to 0:26: 2 km circle against the real envelope; P90 band.
8. 0:26 to 0:30: Console, tablet and HUD; public URL; NASA and USGS credits.

## 12. Rules

- No game mechanics.
- No PRC-origin models, tools, code or data (no Depth Anything, Wan, Kling, Qwen, DeepSeek, ByteDance repos, Tianwen-1 data).
- All runtime numbers from static files and the worker; no runtime GPU or backend dependency.
- Every number and layer carries a provenance tag.
- No em-dashes in docs or UI copy.
- NASA images unmodified; no NASA logos in branding or AI content; AI-generated media watermarked.
- Backend left untouched.
