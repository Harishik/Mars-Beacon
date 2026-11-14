# Gale L0 bundle v0.2.0 (Sahaj to Harishik)

Built by `pipeline/build_site.py --site gale`. Everything is described in `manifest.json`; read scale/offset/nodata per file from there, not from the old contract example.

## Changes from `contracts/site_manifest.example.json` (please ack in the contracts thread)

1. **Box centre moved** to Curiosity's real boxwork track: lat -4.8031, lon 137.3840 (NASA MSL_waypoints.json, sols 4534-4844). The plan's 4.85-4.88 S / 137.30-137.33 E is 5-8 km off the drill sites.
2. **Slopes use scale 0.25 deg** (u8 0..63.5 deg), not 0.1, because 23 percent of 4 m cells exceed 25.5 deg (butte flanks). value = stored * scale + offset; 255 = nodata.
3. **Normal map is PNG** (`normal_2048.png`), RGB = (n*0.5+0.5)*255, x east, y north, z up.
4. **New files:** `relief_4m.u8` (scale 0.1, offset -12.7, m), `slopeP50.u8`, `slopeP90.u8` (placeholders until the Monte Carlo band), `ortho_4096.jpg` (single overview texture).
5. **`orthoTiles`** block: quadtree `ortho/{level}/{row}_{col}.jpg`, 512 px, levels 0-5, tile extent 3000/2^level m, north-up.
6. `horizon_32az.u8` is band-major [32][750][750], scale 0.5 deg, azimuth k*11.25 deg clockwise from north. Includes far terrain to 15 km (Mount Sharp).

## Grid convention

x east, y north (metres), origin at box centre. Rasters are north-up: row 0 = north edge.
Cell centre: x = -1500 + 4*(c+0.5), y = 1500 - 4*(r+0.5).

## Added after v0.2.0 (same folder, manifest updated)

- `slope4P50.u8`, `slope4P90.u8`: **use these for the hard no-go limit** (median and P90 envelope). Do NOT use
  `slopeMax1m_4m` or `slopeP50/P90` (1 m max) as hard blocks: they mark 22 percent of Curiosity's real driven route
  as > 20 deg (DEM noise). Use them as a cost/hazard term only.
- `rocks.u8` (cumulative fractional area), `rockCount.u8`, `rockBig.u8` (1 = rock D >= 2 m, hard block),
  `golombekK.u8`, `rocks_list.json` (x, y, D in site metres). M2 shadow baseline.
- `ridgeHollow_1m.u8` (3000 x 3000, 0 none / 1 ridge / 2 hollow / 3 excluded), `ridgeFrac.u8`, `hollowFrac.u8`,
  `rhContrast.u8` (M3).
- `science.u8` and its parts `roverContext.u8`, `rhContrast.u8`; formula and weights are in the manifest entry.
- Python envelope twin agrees with the impact figure: 71 percent of the 2 km circle in the box is not returnable.
  Shared oracle cases for Vitest: `pipeline/sim/oracle_test_cases.json` on branch sahaj/l0-terrain.

## Still missing

class_probs and entropy from M1 (need your L1 rover patches to project onto; `eval_m1.py` exports the ONNX model),
CRISM, THEMIS, geology. Targets use the last localized waypoint before each drill sol (VERIFY with PDS PLACES).
Jezero bundle: `bundles/jezero/` (L0 only; its rock layers are flagged unreliable because of ripples).
