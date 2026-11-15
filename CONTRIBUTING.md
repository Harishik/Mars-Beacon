# Contributing to Mars BEACON

[Live website](https://mars-beacon.pages.dev/) · [Setup](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Team credits](CONTRIBUTORS.md)

## Team NASHA

| Team member | GitHub | Project contribution areas |
|---|---|---|
| Harishik | [@Harishik](https://github.com/Harishik) | Frontend, interaction/planning integration, terrain reconstruction and project integration. |
| Sahaj | [@sahaj2310-tech](https://github.com/sahaj2310-tech) | Scientific data processing, site bundles, terrain/ML models and simulation calibration. |
| Naomi | [@naomesk](https://github.com/naomesk) | Backend/API, database and deployment integration. |

These are project contribution areas, not exclusive file ownership or commit counts. Shared work and integration may be committed by another teammate. Our explicit [team credits](CONTRIBUTORS.md) recognize that work separately from GitHub's automatic contributor statistics.

## Get started

1. Read the [README](README.md), [setup instructions](docs/SETUP.md), and the relevant component documentation.
2. Clone the repository and enable the existing commit hook:

   ```bash
   git clone https://github.com/Harishik/Mars-Beacon.git
   cd Mars-Beacon
   git config core.hooksPath .githooks
   ```

3. Configure Git with your own name and an email associated with your GitHub account. You can use your exact GitHub-provided private noreply address from your account's email settings. Do not copy another teammate's identity.
4. Create a topic branch from current `main`, make a focused change, and open a pull request describing the problem, implementation and checks.
5. Coordinate changes to shared schemas in `contracts/` and update callers, fixtures and documentation together.

Do not overwrite another teammate's branch or rewrite shared history to change contributor statistics.

## Checks before a pull request

Run checks appropriate to the change and report actual results:

| Change | Checks |
|---|---|
| Frontend/engine | From `frontend/`: `npm run typecheck`, `npm test`, `npm run build`; exercise affected interactions. |
| Backend | From `backend/`, in its Python environment: `python -m pytest -q`; distinguish local tests from live service/database checks. |
| Pipeline/scientific model | Relevant numerical tests, source/product provenance, units, transformations, assumptions and evaluation artifacts; `python -m pytest pipeline/sim/test_sim.py -q` covers the reference simulation. |
| Documentation | Verify relative links, commands, factual claims, source credits and consistency with the deployed behavior. |
| Assets | Record source/tool, rights and modifications; check generated-media labels and prohibited branding. |

Do not describe a smoke test, numerical parity check or successful download as independent scientific validation. Record unresolved issues and negative results in the relevant documentation.

## Data, assets and documentation

- Preserve NASA/product identifiers, attribution, resolution, dates, units and evidence tags. See [Data Sources](docs/DATA_SOURCES.md).
- Keep observations, historical records, derived layers, predictions, assumptions and invented scenarios distinct.
- Update [REFERENCES.md](REFERENCES.md), [asset credits](assets/ASSET_CREDITS.csv) and relevant manifests when sources change.
- Use the existing Git LFS arrangement for model weights. Do not commit raw archives, private data, credentials, populated env files or local databases.
- All frontend `VITE_*` settings are public. Private API/database credentials belong on the backend.
- Keep `demo-video/` and `walkthrough-video/` content-free until the team supplies the videos. Empty `.gitkeep` files only reserve the folders.
- Update [submission text](submission/FORM_COPY.md) when project claims change. Repository updates do not submit or resubmit the official Space Apps form.

## AI assistance and authorship

The team has disclosed **Claude Code**, **Codex** and **Microsoft TRELLIS.2** in [AI_USAGE.md](AI_USAGE.md). Update that disclosure when use changes, including affected components and generated assets.

- The existing commit hook removes AI-assistant `Co-Authored-By` trailers, and CI rejects them. The Claude configuration also disables automatic attribution.
- This commit-message convention does **not** remove the requirement to disclose AI use in the README, AI usage record, submission form and demo.
- Credit actual human authors accurately. Only add human co-author attribution for work they genuinely co-authored, using their agreed GitHub-associated email.
- Label generated images directly and keep labels visible throughout generated video segments. A credits page alone is insufficient.
- Do not put NASA logos, flags or mission identifiers in generated content or imply NASA endorsement.

Original project code uses [Apache 2.0](LICENSE); retain third-party notices and source-specific rights.

## Why an accepted invitation does not show a contributor

Repository collaborator access and GitHub's Contributors graph are different. Accepting an invite grants access; the graph is computed from qualifying commits on the default branch, with author emails linked to GitHub accounts.

For accurate attribution:

1. Author real changes using your own Git identity.
2. Have the relevant work reviewed and merged into `main`; a commit only on a feature branch does not appear in the default-branch contributors graph.
3. If an existing commit is genuinely yours but unlinked, connect its author email to your GitHub account if you control that email.
4. Allow GitHub time to refresh its statistics. Do not create fake commits or assign authorship merely to make a name appear.

See [GitHub's contributor guidance](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors). Our [CONTRIBUTORS.md](CONTRIBUTORS.md) records team credit even when integration commits were authored by someone else.
