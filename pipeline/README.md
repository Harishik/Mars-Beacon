# pipeline/

Owner: **Sahaj**

Offline Python pipeline that turns NASA/USGS data into site bundles, plus terrain reconstruction and ML training.

- `build_site.py`: L0 orbital terrain (USGS Gale 1 m DEM, 25 cm orthophoto) and derived rasters, written in the format of `contracts/site_manifest.example.json`.
- Reconstruction: L1 rover stereo fusion (PDS Navcam XYZ or Ames Stereo Pipeline, Open3D ICP, Poisson meshing), L2 Gaussian splats (gsplat / Nerfstudio) with orbital priors.
- ML: terrain segmentation (AI4Mars), rock detection, ridge and hollow mapping.

Rules: large data never goes into Git (bundles go to the storage bucket); clip rasters remotely with GDAL `/vsicurl/`; no PRC-origin models or code; log every licence.
