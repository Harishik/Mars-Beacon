# fixtures/api

Example responses from the backend running in fixture mode (`FIXTURE_MODE=1`), in the shapes defined by `contracts/api_contract.yaml`. Use them to build the front end without a server. They are **fake or placeholder data**: Gale coordinates, targets and the space-weather payload are not real results, and `fetchedAt`/`createdAt` times are snapshots.

| File | Endpoint |
|---|---|
| `health.json` | `GET /health` |
| `sites.json` | `GET /sites` |
| `manifest_gale-boxwork.json`, `manifest_jezero.json` | `GET /sites/{siteId}/manifest` |
| `targets_gale-boxwork.json` | `GET /sites/{siteId}/targets` |
| `datasets.json` | `GET /datasets` |
| `conditions_gale-boxwork.json` | `GET /conditions?site=gale-boxwork&utc=2026-11-15T00:00:00Z` |
| `spaceweather_CME.json` | `GET /spaceweather?kind=CME` |
| `rover-images_gale-boxwork.json` | `GET /rover-images?site=gale-boxwork` (a bare list; live or cached status is in the `X-Data-Status` response header) |
| `trek_layers_gale-boxwork.json` | `GET /trek/layers?site=gale-boxwork` (a bare list; tile URLs still null) |
| `plans_post_request.json`, `plans_post_response.json`, `plans_get_response.json` | `POST /plans`, `GET /plans/{shareId}` |
| `jobs_post_response.json`, `jobs_get_response.json` | `POST /jobs/generate-site`, `GET /jobs/{jobId}` |

Regenerate by running the backend with `FIXTURE_MODE=1` and saving each response.
