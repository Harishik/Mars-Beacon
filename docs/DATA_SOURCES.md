# NASA and space-agency data sources

The live app uses prepared data bundles; it does not download the complete NASA/PDS archives on every visit. The source inventory below describes repository evidence, not a blanket claim that every layer is scientifically validated.

## Products and transformations

| Source | Product / access | Use and transformation | Attribution / terms |
|---|---|---|---|
| USGS / MRO HiRISE Gale DEM | [MSL Gale merged DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m), `MSL_Gale_DEM_Mosaic_1m_v3` | Reprojected to local metres; 4 m routing heights; slopes, roughness, normals, horizon, sky-view and radio geometry. | USGS Astrogeology; NASA/JPL/University of Arizona. Preserve product credits; see linked product and [USGS terms](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits). |
| USGS / MRO HiRISE Gale orthophoto | [25 cm mosaic](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm), `MSL_Gale_Orthophoto_Mosaic_25cm_v3` | Overview and zoom tiles; input to shadow-based boulder detection. | NASA/JPL/University of Arizona; USGS Astrogeology. Source-specific credits/terms. |
| Mars 2020 TRN / USGS | [HiRISE DTM/orthomosaic collection](https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/), `JEZ_hirise_soc_006` products | Jezero site via the same base builder. | NASA/JPL/University of Arizona; USGS. Exact filenames in Jezero manifest. |
| Curiosity localized waypoints | [MSL_waypoints.json](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json) | Historical traverse; approximate campaign/drill targets. | NASA/JPL-Caltech; retain original credits and usage conditions. Last waypoint before a drill is not exact drill localization. |
| Perseverance localized waypoints | [M20_waypoints.json](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json) | Jezero route/target context. | NASA/JPL-Caltech; source conditions apply. |
| Curiosity Navcam and XYZ | [PDS Imaging Node](https://pds-imaging.jpl.nasa.gov/) | Rover frames, stereo surface and derived Altadena splats. | NASA/JPL-Caltech and product labels. Exact XYZ filenames appear in the Gale manifest; rover frame IDs accompany the bundle. |
| AI4Mars | [Dataset record](https://zenodo.org/records/15995036) | M1 soil/bedrock/sand/big-rock segmentation training and expert-test evaluation. | Swan et al.; NASA/JPL contributors. Repository model card records CC BY 4.0; preserve attribution and dataset terms. |
| Curiosity REMS | [NASA/JPL feed](https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json), historical PDS products | Cached/latest-published rover weather and historical pressure context. | REMS: Centro de Astrobiología for NASA/JPL; source/product terms. Instrument observations are rover-local and may lag publication. |
| Curiosity dust opacity | Bundled `atmosphere/opacity_climatology.json` and [PDS Atmospheres](https://atmos.nmsu.edu/) source records | Seasonal context fitted from historical optical depth. | Preserve original observation/product attribution. Full input product/citation mapping must accompany any new fit. |
| Curiosity RAD | [Hassler et al. 2014](https://doi.org/10.1126/science.1244797) | Historical surface average used in `environment.ts`. | Cite original paper; article copyright is separate from project code. Not a personal-dose map. |
| NASA DONKI / WSA-ENLIL | [CCMC DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/), [NASA API documentation](https://api.nasa.gov/) | Event context, cached feed and Mars-directed arrival-model information when available. | NASA/CCMC and contributor/model attribution; preserve timestamps and modelling status. |
| NASA GISS Mars24 | [Algorithm and worked examples](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) | Implemented time/sun calculations and reference cases. | NASA GISS; cite algorithm and [credits](https://www.giss.nasa.gov/tools/mars24/help/credits.html). |
| JPL Mars Trek | [Mars Trek](https://trek.nasa.gov/mars/) | MOLA, CTX and Viking regional setting. | Respect each layer's mission/instrument attribution; coarse context does not become fine-resolution evidence by rendering. |

Machine-readable per-layer product IDs, resolutions, tags and URLs are in [DATA_SOURCE_REGISTER.csv](DATA_SOURCE_REGISTER.csv), extracted from the shipped Gale/Jezero manifests. That register preserves missing URLs and broad acquisition dates rather than inventing details. The manifests also contain per-file hashes, transformations, coordinate definitions and caveats.

## Evidence tags

- **OBSERVED / HISTORICAL:** instrument or mission records, with original spatial/temporal support.
- **DERIVED:** processed terrain, classifiers, reconstruction or model calculations; cite inputs and methods.
- **PREDICTED:** model-based values, not observations.
- **ASSUMPTION:** chosen parameters, thresholds or simplifications.
- **SCENARIO:** invented mission events, crew/hardware locations or budgets for rehearsal.

Do not use Gale observations as Jezero measurements. The 4 m route grid and 25 cm imagery do not establish 25 cm route safety. The manifest flags vertical datum and approximate target-coordinate checks as unresolved.

## Challenge-resource requirement

The guide requires at least one NASA resource from the chosen challenge's Resources for Global Awards. The project uses NASA resources, but this documentation review could not retrieve the official challenge page to verify that exact list. Before submission, match a resource actually used above to the [challenge Resources tab](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources) and state the match in the form. Do not claim this eligibility check is already completed.

## Rights and attribution

Original code's Apache 2.0 licence does not relicense scientific source products, articles, third-party logos or generation inputs. Consult source product notices and [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Preserve third-party credits where indicated; NASA imagery does not grant endorsement or permission to use NASA branding in generated assets.
