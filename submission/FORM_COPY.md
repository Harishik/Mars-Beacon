# Submission form copy

Prepared from the deployed app and repository on 15 November 2026. Review outstanding items in [CHECKLIST.md](CHECKLIST.md) before submitting. This file does not submit the project or attest to the form checkboxes.

## High-Level Summary

Mars BEACON is a browser-based planning and rehearsal tool for a two-person Marswalk. Built for the Interplanetary Survival Guide: Martian Map challenge, it combines NASA and USGS terrain, rover imagery, environmental records and space-weather context around Mount Sharp's boxwork in Gale crater. Its Return Envelope estimates where both astronauts can return to an active haven within modelled time, oxygen, cooling-water and battery budgets. Users compare science stops and route options, change suit loads or pace, and rehearse the mission across habitat, control, tablet, visor and rover displays. A second site at Jezero demonstrates pipeline reuse. Source provenance, scenario assumptions and validation limits are documented. Mars BEACON is a research prototype for explaining planning trade-offs, not an operational safety system or NASA-endorsed product.

## Project Demo

Pending by request. No video or demo link has been supplied. The separate official demo must be one public video of at most 30 seconds, or a deck of at most seven slides including the title. A longer walkthrough does not replace it.

## Final Project

https://mars-beacon.pages.dev/

Source repository: https://github.com/Harishik/Mars-Beacon  
Direct mission map: https://mars-beacon.pages.dev/#/app

## Project Details

Use [docs/PROJECT_DETAILS.md](../docs/PROJECT_DETAILS.md) as the full narrative, adapting to the actual form. It covers problem, users, science objective, design choices, tools, evidence, limitations, AI use and next steps.

## Use of SI / AI

We used Anthropic Claude Code and OpenAI Codex as AI coding assistants during development. Codex also assisted documentation and submission-text drafting, and repository records document Codex-assisted training/reconstruction work. Microsoft TRELLIS.2 was used to generate 3D concept-model assets. NASA observational data, derived scientific layers, mission assumptions and generated concept assets are distinguished in our documentation. AI assistance is disclosed at repository level; scientific validation and remaining limitations are documented separately.

Full disclosure: https://github.com/Harishik/Mars-Beacon/blob/main/AI_USAGE.md

## Space Agency Data

We use USGS/NASA MRO HiRISE Gale elevation and orthophoto mosaics to build a 3 × 3 km local site with a 4 m planning grid. Terrain processing supplies slope, roughness and horizon context for the Return Envelope. Curiosity localized waypoints, Navcam imagery and PDS XYZ products provide historical traverse context and rover detail. AI4Mars supports rover-image terrain classification. REMS and dust-opacity records provide environmental context; Curiosity RAD supplies a historical radiation reference; Mars24 supplies time/sun calculations; DONKI supplies event/model context when available. MOLA, CTX and Viking layers provide regional context, and Mars 2020 TRN products support a Jezero demonstration. These inputs shaped the selected site, ridge/hollow science scenario, map layers and the model's explicit limitations.

Before submission, identify which resource above is listed in the selected challenge's Resources and add its direct link. Eligibility matching was not independently completed because that page was inaccessible during this review.

Source details: https://github.com/Harishik/Mars-Beacon/blob/main/docs/DATA_SOURCES.md

## References / NASA Data / Space Agency Partner and Other Data

Populate every corresponding field shown in the actual form using [REFERENCES.md](../REFERENCES.md), [DATA_SOURCES.md](../docs/DATA_SOURCES.md), [asset credits](../assets/ASSET_CREDITS.csv), and [dependency inventory](../docs/DEPENDENCIES.csv). Include the direct source, terms/licence and use, rather than only a generic link to this repository. Complete the explicitly listed attribution gaps first.

## Images and videos

Project Details uploads: JPG, PNG or GIF, at most 10 MB each. Host documents/videos externally. Add visible AI labels directly to images showing generated content and throughout corresponding video segments; the README declaration alone is insufficient. Demo and walkthrough folders remain empty apart from `.gitkeep` placeholders.
