# pipeline/

Offline Python work that turns NASA/USGS data into site bundles.

| Part | Owner | Contents |
|---|---|---|
| Orbital data (L0) | **Sahaj** | `build_site.py`: USGS Gale 1 m DEM and 25 cm orthophoto, reprojected to the local grid, plus derived rasters (slope, roughness, horizon map, sky view factor, viewsheds), written in the format of `contracts/site_manifest.example.json` |
| ML models | **Sahaj** | Terrain segmentation (AI4Mars), rock detection, ridge and hollow mapping, science value layer |
| 3D terrain reconstruction | **Harishik** | `reconstruction/`: L1 rover stereo fusion (PDS Navcam XYZ or Ames Stereo Pipeline, Open3D ICP, Poisson meshing) and L2 Gaussian splats (gsplat / Nerfstudio) with orbital depth priors |

Rules: large data never goes into Git (bundles go to the storage bucket); clip rasters remotely with GDAL `/vsicurl/`; no PRC-origin models or code; log every licence.
