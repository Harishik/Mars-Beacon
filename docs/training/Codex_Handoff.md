# Mars BEACON — saved work, remaining tasks and integration instructions

Prepared 15 November 2026, Asia/Seoul. Frontend implementation is paused at the user's request. This is a handoff, not a claim that the whole mission map or all scientific validation is finished.

## 1. Where everything is saved

Project archive: [Nasa Space Apps Challenge / Codex_Training_and_Reconstruction_2026-11-15](https://drive.google.com/drive/folders/1Qav7F-pwNR9TuWRKFpqLphVif99o0DNT).

- `Saved_Colab_Outputs/baseline_backups/`: selected orbital terrain and real rover checkpoint/export ZIPs, plus their original backup manifest.
- `Saved_Colab_Outputs/rock_improvement/m1_precision/`: fine-tuned candidate checkpoint, exact evaluation metrics and image/split manifest. Candidate is experimental, not the new default.
- `Saved_Colab_Outputs/rock_improvement/boulder/`: orbital boulder best checkpoint, inference model and evaluation metrics.
- `Saved_Colab_Outputs/nasa_mesh_experiment/`: Pahrump best checkpoint, raw PLY, SPLAT, comparison images, metrics, environment record, code and input archive.
- `Local_Inputs_Code_and_Reports/`: local training input bundles, code/data/evidence archive, atmospheric models and observations, NASA supplied original models/textures, browser-ready NASA derivatives and the exact reviewed Sahaj package.
- `COLAB_BACKUP_AUDIT.json`: per-file SHA256 inventory of the 59 existing Colab backup files copied and verified in this session (228,904,455 bytes). This count excludes later local uploads and the notebook copy.
- `LOCAL_UPLOAD_MANIFEST.json` and `LOCAL_UPLOAD_VERIFICATION.json`: inventory of later local inputs/archives and their Drive verification; consult these for final archive completeness.
- `Mars_BEACON_Executed_Colab_Archive_2026-11-15.ipynb`: copied executed notebook. The live original notebook remains [here](https://colab.research.google.com/drive/1kM5BOkPkkkBmmi60NVMM5xCPXFmXRD7q).

Earlier backups remain at My Drive / Mars_BEACON_Training. They were copied, not moved. Teammate folders and the latest frontend repository were not modified. The original project folder also contains Sahaj's own share archive; its filename/version differs from the exact local package reviewed here.

Local workspace: the team member's local research folder.
Full downloaded NASA dataset library: a local `Mars_BEACON_Datasets` folder (set `MARS_BEACON_DATA` to its path).

### Important preservation limitation

The current Colab runtime has reset: the former `/content/mars_beacon_terrain`, `/content/mars_beacon_rover`, `/content/rock_improvement` and `/content/nasa_mesh_experiment` working directories are absent. The selected terrain/rover models and later best models survived in previously verified Drive backups. This session re-verifies and consolidates those files.

**Not every intermediate checkpoint from every earlier run was preserved.** In particular, do not assume all 1k/5k/10k/30k checkpoints, optimizer histories, or every temporary preview image exists. The executed notebook retains printed progress/results, but text output is not a replacement for absent weight files. No retraining was performed to pretend to recover those exact historical artifacts.

Training inputs, scripts and manifests are preserved to support reproducible reruns; exact binary identity of a fresh GPU run is not guaranteed. The complete original NASA download library has not been mirrored wholesale into Drive. Selected inputs actually used in these experiments, code and provenance are archived; the larger source library remains on the local computer.

## 2. What is completed, and what each result means

| Work | Completed result | Limitation / decision |
|---|---|---|
| Orbital surface splats | 30,000 training steps; selected 25,000. Validation 38.46 dB / 0.9884 SSIM; reserved synthetic test 39.46 dB / 0.9900. Export 1.36 MB SPLAT. | A 256 m engineering preview of source DEM/orthophoto. Not the full mission area, not newly inferred centimetre terrain. |
| Real rover splats | Altadena 30k run; selected 20k. Validation 32.92 dB / 0.728. Separate-drive test 24.58 dB / 0.439 on 12 supported frames of 40. Export 8.42 MB SPLAT. | Novel-drive quality gate not met. Do not present as uniformly photoreal reconstruction. |
| Rover camera/XYZ checks | 32 of 36 products pass reprojection checks; four empty XYZ products excluded. Worst retained per-product P95 about 0.426 pixels. | Camera/coordinate mechanics within local support; orbital registration and dense surface accuracy remain unresolved. |
| Gale elevation reproduction | All 562,500 4 m cells independently reproduced from source DEM; maximum numerical difference 0.000562 m. | Conversion/source consistency, not millimetre Mars survey accuracy. |
| Sahaj M1 original | Reviewed original U-Net ResNet50 / ONNX package, hashes and execution smoke. | Exact original split file, immutable dataset revision and environment lock still needed for full original training reproduction. |
| M1 calibration / fine-tune | On 139 scorable MER expert test frames, original confidence filter: big-rock precision 44.59% → 58.34%, recall 98.72% → 97.18%, IoU 44.34% → 57.37%. | Threshold result, not a weight-training gain; this subset/resolution is not Sahaj's original full-resolution MSL test. Candidate fine-tune loses overall against calibrated original; retain original weights. |
| Orbital boulder model | 120 epochs on 39/6/4 NASA-affiliated HiRISE benchmark patches. Test pixel precision 48.89%, recall 63.15%, IoU 38.04%. | Experimental; partitions share four parent observations, not independent Gale-site evidence. |
| Existing M2 boulder heuristic | Untuned external object test: precision 35.22%, recall 32.42%; projected-equivalent diameter ≥2 m recall 19.86%. | Keep advisory. Pixel and object metrics are different; neither is validated physical obstacle size. |
| Pahrump known-mesh splat | 90 calibrated synthetic views; 5,000 T4 steps; test 31.82 dB / 0.9751 SSIM. Fixed centres, 624 KB pruned SPLAT. | Known-mesh compression test with illustrative untextured shading, not new real rover accuracy. Post-pruning browser SPLAT rendering untested. |
| NASA meshes | Three GLBs: Gale 3.78 MB, Pahrump 5.04 MB, Block Island 2.52 MB. All three load and switch in a local browser. | Normalized display coordinates, no geodetic registration. Gale's documented 3x exaggeration corrected. Originals unchanged. |
| Dust | Fitted 440/880 nm seasonal opacity; later-sol held-out MAE 0.2227 / 0.2239. | Historical rover-column context with uncertainty; not a high-resolution spatial dust forecast. |
| Pressure | Quality-screened REMS observations, historical replay and explicit missing support. | Empirical trend forecast failed and was rejected. Do not deploy it. |
| Thermal / radiation | Source review, scenario code and numerical checks exist. | No calibrated spatial thermal/radiation map established. Ground thermal data had zero samples passing the strict quality rule used. |

The orbital and rover final ZIPs contain selected `.pt`, raw `.ply`, exported `.splat`, selected metrics/environment/code material. They do not contain the entire historical run tree. Inspect their internal paths before integrating; do not rely on the former ephemeral `/content` path.

## 3. Frontend integration instructions — first work after this handoff

1. Work from the latest team frontend branch. At inspection, repository was `Harishik/Mars-Beacon`, branch `v6/frontend-prototype`, commit `0a0f603891ea2f3731ac4ef7b7307079a3877b99`. Refresh it before editing; this snapshot can become stale. The local checkout under `Mars-Beacon/` has no application-code changes from this implementation attempt. A dependency install was started; no build or UI/device validation was completed in that checkout.
2. Check the data-loading module before building. The inspected checkout imports `src/data/bundle` but that directory was absent; the broad `data/` ignore rule may have excluded source code. Restore/recover the intended loader and types with the team rather than silently inventing a different site contract. This is a source inspection finding, not a recorded build error.
3. Load the real, full-site Gale bundle as the continuous base: 3 km × 3 km, 750 × 750 cells at 4 m. Use the provided DEM, orthophoto, origin, axis convention and source hashes. Do not replace it with the 256 m splat preview or the unregistered Pahrump printing mesh.
4. Keep one versioned mission state: site hash, coordinate frame, plan version, timestamps, crew/resources, assumptions and events. Habitat/tablet/visor, 2D/3D renderers and route calculations read it. A lower device quality tier changes rendering only.
5. Attach high-detail rover/splat assets only after their transform/footprint is validated. Retain a continuous orbital base everywhere; avoid holes or abrupt floating patches. Show original rover POV images where reconstruction quality is weak.
6. Load static exported assets in production. The hosted website must not depend on Colab, a training job or GPU inference. Google Drive is the archive, not the production tile/CDN service.

## 4. Optimization priorities and acceptance tests

### Priority A — lightweight core and consistent map

- Make map, scientific layers, route selection, Return Envelope, crew resources and replay usable without splats or a dedicated GPU.
- Deliver an actual Canvas/SVG 2D map for WebGL failure. It uses the same terrain fields and planning results, not separately simplified physical rules.
- Lazy-load the 3D renderer. Avoid importing Three.js from the core mission store merely to set display scale; move renderer state to a small dependency-free module or adapter.
- Review the existing renderer's high-performance GPU preference, DPR up to 2, 448-segment terrain, shader ray marching and linked multi-view rendering before enabling them on phones. Use bounded detail/pixel ratio and optional effects. Do not alter physical grid resolution to change route results for a slower device.
- Keep initial transfer small: planning fields and a low-resolution map first, then viewport tiles and selected destination detail. Version/cache tiles, bound GPU textures and evict unused scenes.
- Keep expensive graph work in a worker with stale-result protection, one job in flight and the latest request queued. Profile the existing 750²-grid worker on ordinary devices before changing algorithms.
- Test on actual phone/tablet and an integrated-graphics laptop. Record hardware, browser, cold/warm load, interaction latency and memory where available. Viewport emulation is useful but is not a real low-power hardware test.
- Force WebGL failure/context loss and complete the same planning flow. Compare route and envelope results across all display modes for identical state.

### Priority B — spatial registration and real reconstruction quality

- Confirm exact full-site footprint and DEM/orthophoto co-registration.
- Register rover XYZ/site coordinates to the orbital frame with constrained alignment; report transforms and independent residuals.
- Check boundary height, normals and appearance where rover detail joins the orbital surface. Preserve measured source resolution, no invented high-frequency geometry or sharpening presented as observation.
- Improve image/drive coverage and introduce validated depth constraints where appropriate; inspect fixed real camera renders and novel viewpoints.
- Use a fresh held-out set for a changed training protocol. Previously inspected final tests must not become a repeated optimization target.
- Do not blindly run more iterations on the weak rover model. First resolve pose, coverage, support masks and registration; then define the purpose and success/failure gate of another run.

### Priority C — semantic and physical obstacle validation

- Obtain independent Gale rock/non-rock and ridge/hollow labels; preserve observation-disjoint validation/test partitions where possible.
- Measure false positives on bright bedrock, shadows and dunes, plus missed rocks.
- Establish metric dimensions from calibrated stereo. A semantic big-rock label or orbital shadow candidate is not a measured physical hazard.
- Keep original M1 as the baseline; opt-in confidence threshold 0.70 is experimental until target-domain evaluation. Do not promote the losing fine-tune or the small orbital benchmark model to the main model.
- Request Sahaj's exact split/revision/environment files. Keep ambiguous/Mastcam geology label vocabularies separate from NAV classes.

### Priority D — temporal and environment support

- Retain fixed terrain with date/sol-indexed observations and physically computed lighting where validated.
- Separate observed historical values, derived predictions, assumptions and scenario events in both data and UI. Missing observations stay missing.
- Validate timestamps, Mars local time, sun directions and DEM shadow conventions. Current numerical invariants alone do not validate broadband irradiance or a thermal field.
- Time-conditioned appearance is an optional future experiment with observed time coverage and reserved time/view tests. A deformable moving-geometry 4D Gaussian model has not been trained and is not a prerequisite imposed by the challenge.
- Do not deploy the rejected pressure trend; do not fill missing thermal/radiation measurements with unlabeled estimates or turn rover-local pressure/opacity into spatially measured rasters.

### Priority E — hosting and offline reliability

- Publish a static versioned frontend and immutable scientific assets with correct CORS, compression and cache headers.
- Keep core planning functional when optional APIs fail; display data age and missing status.
- Support offline reload/replay after a deliberate mission-package download, then test with network unavailable. First-time use without any prior downloaded data is not promised.
- Test public logged-out access to the landing page, map, data, source links and exports on desktop and phone; record failed as well as passed cases.
- Test exported SPLAT pruning/quantization fidelity and an independent browser viewer before claiming its quality or performance. Current GLB tests do not validate SPLAT performance.

## 5. Constraints to keep throughout

Use NASA-origin or demonstrably NASA-affiliated datasets only, with original product IDs, licenses, credits and download-host distinction. AI4Mars is NASA/JPL; Mars-Bench boulder labels are a NASA-affiliated research derivative using HiRISE with JPL/Caltech contributors. Hosting on Hugging Face/Zenodo alone is not affiliation evidence. Source records are in the archive.

The challenge's focus is integrated hyperlocal science and safe exploration. Tablet/visor displays, static/interactive formats and time modes are suggestions in the supplied screenshots; the user's lightweight device requirement is a firm project constraint. Do not invent an official requirement for Gaussian splatting, universal GPU features or a learned dynamic 4D model.

Do not claim the entire project is done because individual training runs completed. Do not describe imposed source-surface constraints as independent terrain accuracy, benchmark pixel precision as metre-scale hazard accuracy, synthetic render fidelity as real rover reconstruction quality, or scenario replay as an observed future Mars environment.

## 6. Resume instruction for another developer or agent

> Read this handoff and the two archive verification manifests first. Preserve the official M1 baseline and all negative results. Work in the latest team frontend checkout; restore the intended site loader if missing. Integrate the full real Gale base and one shared mission state first, with an actual low-power 2D mode and optional lazy 3D detail. Align rover detail before overlaying it. Verify phone/laptop, fallback, offline and hosting behavior. Plan further training only after identifying an actual coverage/pose/data issue and a fresh evaluation gate. Do not claim full-map fusion or validated dynamic 4D reconstruction is already complete. Before any future Colab reset, write checkpoints, logs, splits and exports directly to the project Drive archive and verify hashes.

No further frontend editing, model training, publishing or messages to teammates were performed as part of this save-and-handoff task.
