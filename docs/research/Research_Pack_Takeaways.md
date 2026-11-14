# Research pack: what we take and where it goes

Sources: the 2DGS architecture report (docx), the "Martian 4D Digital Twin" slide deck (PDF), the two NotebookLM explainers ("Mars BEACON: Architecture" and "4D Mars Digital Twin"), the three dashboard concept images, and the physics notes for the four layers (dust, thermal, radiation, traversability).

The pack is read as one body of ideas. Each source fills a different gap; together they give a fuller picture than any one of them.

## 1. Already built from the pack (frontend branch `v6/frontend-prototype`)

| Idea | Source | In the app |
|---|---|---|
| Season-aware sun: declination from solar longitude, δ = asin(sin 25.19° · sin Ls) | Physics notes, layer 2 | Season slider (Ls) in the time bar; sun, shadows and sky follow it |
| Dust column opacity scaled by elevation, τ(z) = τ_ref · e^(-z/H), H = 11.1 km | Physics notes, layer 1 | Dust optical depth drives sunlight, sky brightness and haze |
| Curved-atmosphere air mass, m(θz) = √((R/H·cosθz)² + 2R/H + 1) − R/H·cosθz | Physics notes, layer 1 | Low sun loses more light through the dust; storms flatten the light |
| Direct irradiance with orbital distance, S0 = 590 W/m², e = 0.0934, Ls,p = 251° | Physics notes, layer 1 | "W/m² direct" readout in the time bar |
| Mean quality factor Q ≈ 3.05 on the RAD surface dose | Physics notes, layer 3 | "Dose this EVA" in mSv in the crew panel; storm scenario raises it |
| Pack time-varying fields into GPU textures and interpolate in the shader | Report (RGBA16F data textures), deck (shader interpolation) | Envelope, slope and height fields are textures; time changes need no mesh rebuild |
| Static mesh as the always-works path, splats as the high-fidelity layer | Report (static geometry path vs dynamic splat path) | Real HiRISE terrain mesh is the base; splats join later as an extra layer |
| Heavy work offline, light artifacts in the browser | Deck ("asymmetric compute"), twin video | `pipeline/` bakes the bundle; the browser only loads manifest, rasters and images |
| One mission state, display adapts to where the astronaut is | Architecture video | Console, tablet and helmet views from one store |
| Panels fall back to cached data when the API is down | Architecture video | Space weather shows its feed state; full CACHED pattern comes with Naomi's API |

## 2. Next, in priority order

1. **Thermal layer (layer 2 of the physics notes).** Surface temperature per hour from slope-aware insolation, cos θi = cos θz cos γ + sin θz sin γ cos(ψsun − ψs), thermal inertia from THEMIS and the 1D heat equation (skin depth δs = √(k·P/(π·ρ·c))). Run the column model offline for a few thermal-inertia classes (Sahaj), look it up per pixel in the shader. Feeds suit thermal power and the "Thermal" layer card.
2. **Terrain factor from thermal inertia.** The traversability notes map thermal inertia to soil strength. The same idea sets the walking terrain factor η (loose sand vs bedrock) in our metabolic model, which the V6 plan already needs.
3. **Rover haven placement (layer 4).** The Bekker sinkage and drawbar-pull model scores where the support rover can drive and park. A simple traversability index T ∈ [0, 1] from slope, slip and sinkage decides which parking spots the app offers.
4. **Storm scenario as a timeline.** The storm plume model (fast rise, exponential decay of Δτ, expanding radius) turns the storm toggle into an event on the mission timeline: τ rises over minutes, the light fades, the shelter boundary appears.
5. **Splats at waypoints.** gsplat (Nerfstudio) for rover-photo scenes; the report's normal-consistency and depth-distortion ideas help keep the reconstructed surface flat and aligned with the HiRISE terrain.

## 3. GUI ideas from the dashboard concepts

The concept images are strong references for layout and density. Adopting:

- **Mode tabs**: Explore, Plan, Rehearse, Execute, Debrief across the top (also in the V6 plan).
- **Status chips** in the header: LMST, sun elevation, season Ls, space weather (live or cached), light-time.
- **Mission timeline** along the bottom with numbered waypoints, EVA events and a play button with speed.
- **Numbered waypoints** on the route in 3D, matching the timeline.
- **Plan cards** (max science, max margin, balanced) with science value, minimum margin, time, O₂ per crew, comm shadow.
- **Resources over time** chart per crew with the reserve line.
- **Terrain profile** of the planned route.
- **Regional inset** of Gale crater with the 3 km box.
- **Risk chips** (slope, rocks, dose, comm) and a **data sources** list with live or cached state.
- **2D/3D toggle, compass and scale bar** on the map.

When we build these, the numbers come from the engine and the bundle, with provenance tags, so every value on screen can be traced.

## 4. Process notes from the architecture video

The video describes the workflow the team is using: contracts first, fixtures so nobody waits, short branches, CI on every merge, cached fallback, a hard feature freeze at 12:00 and a calm finish. It is a good outline for the 3-minute walkthrough and the "Project Details" text.
