# Use of AI / Attribution

Disclosure updated 15 November 2026 from the team's explicit confirmation and repository records.

| Tool | Use | Attribution scope |
|---|---|---|
| [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) | AI coding assistance during project development | Project-level: frontend, backend, pipeline and associated development documentation. Exact per-file allocation between assistants is not recorded. |
| [OpenAI Codex](https://openai.com/codex/) | AI coding assistance; repository records also document training/reconstruction work; README and submission-document drafting | Project-level development; `docs/training/`; this README and supporting documentation. |
| [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | Generation of 3D model assets, confirmed by the team | Concept-model asset collection in `fixtures/models/`; exact input-image provenance and per-file generation records remain to be recorded. |

This disclosure does not assert that every file was generated, that the scientific method was independently validated, or that every generated output has already passed human review. The team is responsible for final review, source selection, model assumptions, scientific interpretation, licensing and submission accuracy. Tests and numerical checks are described separately in [Validation and Limitations](docs/VALIDATION_AND_LIMITATIONS.md).

## Generated assets and scientific data

The repository contains astronaut, habitat and rover GLB concept models under `fixtures/models/`. The collection is attributed to TRELLIS.2 at project level; confirm the mapping and original input rights per asset before making a stronger authorship statement. Procedural meshes also exist in `frontend/src/render/Assets.tsx`; do not assume every scene object is loaded from a GLB.

NASA/USGS orbital imagery, rover observations and PDS geometry are external scientific sources. M1 segmentation overlays and Gaussian splats are derived/model outputs, not raw observations. TRELLIS.2 concept models do not establish Martian geometry, real hardware performance or scientific evidence.

See [asset credits](assets/ASSET_CREDITS.csv) and the [machine-readable AI record](assets/AI_METADATA.json). This documentation update does not modify GLB metadata or add labels to the deployed renderer.

## Labels required before using generated media in a submission

- Put a clearly visible label on each generated image, including a render/screenshot featuring generated concept assets: **AI-generated 3D assets using Microsoft TRELLIS.2**.
- Keep that label visible throughout video segments showing generated assets. Credit additional image/video tools if used later.
- A separate credit page, filename or image description is not a substitute for a visible label.
- Acknowledge any generated audio, code or data in descriptive text and metadata. This file and `assets/AI_METADATA.json` provide the repository-level record; source manifests provide derived-data provenance.
- Do not include NASA logos, flags, mission identifiers or other NASA branding in generated content.
- The team has not supplied a demo or walkthrough video for this update. Both video folders remain content-free; no claims about future narration or footage are made.

## Submission wording

> We used Anthropic Claude Code and OpenAI Codex as AI coding assistants during development. Codex also assisted documentation and submission-text drafting, and repository records document Codex-assisted training/reconstruction work. Microsoft TRELLIS.2 was used to generate 3D concept-model assets. NASA observational data, derived scientific layers, mission assumptions and generated concept assets are distinguished in our documentation. AI assistance is disclosed at repository level; scientific validation and remaining limitations are documented separately.

Use the same disclosure in the form's Use of SI/AI field, Project Details and the eventual demo. The repository's rule against AI commit co-author trailers does not remove these disclosure obligations.

## Watermarked visual gallery (15 November 2026)

Seven AI-assisted concept visuals are located in [assets/visuals/](assets/visuals/README.md). All seven exported raster images have visible creator/AI-generation watermarks. The hero illustration was created with ChatGPT image generation and assembled with scripted layout; the six explanatory diagrams were authored as vector graphics with ChatGPT (GPT-6) assistance. These visuals are **not** screenshots of the live site, NASA source observations, measured model results, or validation of EVA safety. Example values in the hero are illustrative.

These image credits are distinct from Codex/Claude Code development assistance and from TRELLIS.2 3D concept assets. None of the new gallery graphics claims TRELLIS.2 model rendering. If later visuals include such assets, the repository-required on-image label **AI-generated 3D assets using Microsoft TRELLIS.2** must be added.

For files, watermarks, sources and reuse constraints, see [visual attribution](assets/visuals/AI_ATTRIBUTION_AND_USAGE.md) and [visual manifest](assets/visuals/visual_manifest.json). No demo/walkthrough video has been added.
