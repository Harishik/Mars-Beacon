# Published bundles and development fixtures

This folder contains both real processed scientific bundles and explicitly synthetic development data. Vite serves it as the public directory; production builds copy it into the static output.

| Path | Meaning |
|---|---|
| `bundle/gale-boxwork/` | Current primary Gale site: processed NASA/USGS terrain, imagery, derived layers and rover detail. |
| `bundle/jezero/` | Second site processed through the site pipeline; accuracy limitations differ from Gale. |
| `bundle/gale-synthetic/` | Synthetic development data, not NASA observations. |
| `bundle/gale-boxwork-2025/` | Older bundle retained for development/history; not the current default. |
| `models/` | Astronaut/habitat/rover concept GLBs; see the team's TRELLIS.2 disclosure. |
| `regional/` | Regional context assets; distinguish these from generated concept models. |

Per-site `manifest.json` files record products, coordinate conventions, file scales and source credits. See [Data Sources](../docs/DATA_SOURCES.md), [asset credits](../assets/ASSET_CREDITS.csv), and [AI_USAGE.md](../AI_USAGE.md). File presence does not establish independent scientific validation.
