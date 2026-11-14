# Mars BEACON: How We Work Together

For Harishik, Sahej and Naomi. Read this once before writing any code. It explains how three people can build separately and still end up with one working app.

## 1. The idea in one picture

The app is a pipeline. Data goes in on the left, the map and panels come out on the right. Each person owns some boxes. The arrows between boxes are the **contracts**.

```
 OFFLINE (Python, run once)                 IN THE BROWSER (TypeScript)
 --------------------------                 ----------------------------------------------

 NASA DEM, HiRISE, CRISM,      bake         public/data/gale/              loader
 THEMIS, RAD, REMS  ---------> scripts ---> height_750.bin, slope...  ---> reads files listed
 (Sahej, Naomi)                (Sahej)      site_manifest.json  [C1]       in the manifest
                                                                               |
                                                                               v
                                             Science functions  [C3]     Store (Zustand)
                                             speed, metabolic, O2,  <--- MissionState  [C2]
                                             Mars24 (Sahej)              (Harishik)
                                                    |                          ^
                                                    v                          |
                                             Worker: reverse Dijkstra,  ---> EnvelopeResult [C2]
                                             dual-tree (Harishik)              |
                                                                               v
                                             3D terrain + envelope shader, panels, tablet, HUD
                                             (Harishik: 3D and views; Naomi: panels and layer cards)
```

- **C1** = `site_manifest.json`: what data files exist and how to read them.
- **C2** = `mission_state.schema.ts`: what the app's live state looks like.
- **C3** = `oracle_test_cases.json`: what numbers the science functions must return.

## 2. What a contract is

A contract is a short file that all three of us agree on **before** anyone writes feature code. It fixes the shape of the data that crosses from one person's work to another's. Think of it as a plug and a socket: if the plug matches the socket, it does not matter who built which side or when.

Because the shape is fixed, nobody has to wait for anybody:

- Harishik can build the 3D terrain today using a **fake** height file with the right shape. When Sahej's real Gale file lands with the same shape, it just works.
- Naomi can build the layer panel today against a **sample** manifest. When the real manifest arrives, the panel fills itself in.
- Sahej can write the science functions today against the **test cases**. When the worker calls them, the numbers are already proven right.

### C1. `site_manifest.json` (written by Sahej and Naomi, read by Harishik's loader and Naomi's panels)

Lists every data file for a site and every layer card. Example of one entry:

```json
{ "name": "height_750.bin", "path": "data/gale/height_750.bin",
  "dtype": "float32", "cols": 750, "rows": 750, "scale": 1, "offset": 0,
  "sha256": "..." }
```

and one layer card:

```json
{ "id": "hirise_dem", "kind": "topographic", "mission": "MRO HiRISE",
  "productId": "...", "resolutionM": 1, "acquired": "2024-..", "tag": "OBSERVED",
  "attribution": "NASA/JPL/UArizona/USGS", "url": "..." }
```

Rule: **the app never hard-codes a file name, a size or a product ID.** It reads them from the manifest. That is also how Jezero loads through the same code: a second manifest, nothing else.

### C2. `mission_state.schema.ts` (written by Harishik, used by everyone in the app)

TypeScript types for the single shared store: crew positions, oxygen and battery spent, events, havens, the current envelope, which layers are on. Every screen (Console, Tablet, HUD, panels) **reads** from this store. Nothing talks to anything else directly.

Rule: if you need a new piece of state, you add a field here first (see section 6), then use it.

### C3. `oracle_test_cases.json` (written by Sahej, checked by tests)

25 cases. Each one is an input and the exact expected output, for example:

```json
{ "id": "o2_conversion_696W", "fn": "o2RateGph", "input": { "M": 696 },
  "expected": 178.0, "tol": 1e-5, "tag": "DERIVED" }
```

The same file is run by Vitest (TypeScript) and Pytest (Python). If both pass, the browser and the offline reference agree. This is Gate G04 and our main proof of validity for judges.

The science functions have **fixed names and inputs** so Harishik's worker can call them before they are finished:

```ts
speed(grade: number, fMob: number): number                 // m/s
metabolicPower(grade, eta, massKg, loadKg, v, kG, mBase): number   // W
o2RateGph(watts: number): number                           // g/h
co2RateGph(o2Gph: number): number                          // g/h
mars24(utcMs: number, lonDeg: number, latDeg: number): { msd, lmst, sunElevDeg, sunAzDeg }
```

Until Sahej's versions land, these exist as **stubs** that return plausible fixed numbers, so nothing upstream is blocked.

## 3. Who owns which folders

Each person works in their own folders. Two people editing the same file is what causes broken merges, so we avoid it.

| Folder | Owner | What lives there |
|---|---|---|
| `contracts/` | All three, frozen | The three contract files. Changes only by agreement (section 6) |
| `app/src/render/`, `app/src/views/` | Harishik | Terrain, sky, sun, habitat, rover, astronauts, Console, Tablet, HUD, 2D fallback |
| `app/src/worker/`, `app/src/store/` | Harishik | Reverse Dijkstra, dual-tree, Zustand store |
| `app/src/science/`, `science_py/` | Sahej | Speed, metabolic, O2, CO2, Mars24 in TS and Python |
| `bake/` | Sahej | Python scripts that turn NASA products into `public/data/<site>/` files |
| `app/src/panels/` | Naomi | Layer drawer, layer cards, RAD/REMS/DONKI cards, assumptions, lineage, guided tour |
| `data/sources_registry.json` | Naomi | Every source, product ID, credit and verified sol |
| `tests/` | Sahej (oracle), Naomi (QA checks) | Vitest and Pytest |

`app/src/App.tsx` (the file that puts the pieces on screen) is Harishik's. Naomi and Sahej export a component or a function; Harishik wires it in, or asks one of them to add one import line.

## 4. Daily Git routine (simple version)

Everyone works on their own branch and merges into `main` **often**: every 1 to 2 hours, not once at the end. Small merges are easy; one giant merge at 03:00 is how teams lose the night.

```bash
# start of each work block
git checkout main
git pull
git checkout -b sahej/metabolic      # name/what-you-are-doing

# ...work, then save
git add app/src/science science_py
git commit -m "Metabolic power in TS and Python, 8 oracle cases pass"
git push -u origin sahej/metabolic
# open a pull request into main on GitHub; tests run automatically
```

Merge rule: a pull request goes into `main` only if the tests pass and the app still starts (`npm run dev` shows the map, even if parts are stubs). `main` must always run. Anyone can merge their own PR once tests are green; ping the owner if you touched their folder.

If you get a conflict and are unsure, stop and ask in the team chat. Do not force-push.

## 5. How it comes together: the checkpoints

Integration is not a separate step at the end. It happens at three checkpoints, and `main` is always the joined-up app.

| Checkpoint | What must be true on `main` |
|---|---|
| **Gate A: contracts frozen** | The three contract files are in `contracts/`. A sample manifest and fake 750 x 750 files load. Science stubs exist. App starts and shows a flat test terrain |
| **Gate 1: live envelope on real Gale** | Sahej's real Gale files and manifest replace the fake ones. Worker runs on them. Envelope draws on the terrain. At least 10 oracle cases pass |
| **Gate 2: feature freeze (Sun 12:00)** | Every feature merged. All 25 oracle cases pass. Naomi runs G01 to G13 on desktop and phone. After this only fixes |

At each checkpoint, all three open the latest `main` on their own machine and click through it together (10 minutes). Anything broken gets an owner right then.

## 6. Changing a contract

Contracts are frozen, not carved in stone. If you need a change:

1. Post in the team chat: what field, why, who is affected.
2. The other two say OK (or suggest a better shape).
3. The person asking makes the change in one small PR that also updates the sample files and any code that reads the field.
4. Everyone pulls `main`.

Adding a new optional field is cheap. Renaming or removing a field is expensive; avoid it after Gate 1.

## 7. Your first hour, concretely

**Harishik**
1. Scaffold `app/` (Vite, React, R3F, worker) and push to `main`.
2. Write `contracts/mission_state.schema.ts`.
3. Write a script that makes fake `height_750.bin` and a sample `site_manifest.json` so others can test.
4. Add science stubs in `app/src/science/` with the signatures above (Sahej then replaces the insides).
5. Time the reverse Dijkstra on the fake 750 x 750 grid and post the number.

**Sahej**
1. Confirm the USGS DEM and orthophoto cover the boxwork box; choose the product.
2. Write `contracts/oracle_test_cases.json` (start with 10 cases, reach 25 by Gate 2).
3. Start the bake script; first output is real `height_750.bin` plus manifest file entries.
4. Replace the science stubs with real functions, TS and Python, until the oracle passes.

**Naomi**
1. Work through the verification list in the master plan (section 9) and fill `data/sources_registry.json`.
2. Write the `layers` part of the manifest (product IDs, dates, resolution, tag, credit) with Sahej.
3. Build the layer drawer and layer card in `app/src/panels/` against the sample manifest.

## 8. Rules everyone follows

- Every number on screen comes from the manifest, the store or a science function, and carries a provenance tag.
- No file names, sizes or product IDs typed directly into UI code.
- Raw NASA downloads never go into Git. Only baked files under `public/data/` (keep each under about 20 MB).
- No PRC-origin models, tools, code or data. No em-dashes in docs or UI text.
- Backend is not touched.
- Stuck for more than 20 minutes? Say so in the team chat. Silence is the most expensive bug.
