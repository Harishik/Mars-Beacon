# Mars BEACON: Design System and References

Owner: Harishik (visual approval). Applies to `frontend/`. Tokens live in `frontend/src/styles/tokens.css`.

## 1. What we are designing

- **Subject:** a mission-planning instrument for a two-person Mars EVA crew at one science site (Gale crater boxwork).
- **Audience:** crew in the habitat, crew outside (tablet, helmet), mission planners; and the Space Apps judges who see it through a browser.
- **Primary job:** answer "can the crew still walk home from here?" at a glance, on real terrain, with every number's source visible.

## 2. References studied (Saturday 14 Nov, captured with headless Chromium)

| Source | What we borrow | What we avoid |
|---|---|---|
| NASA Eyes on the Solar System | Full-bleed 3D, left column of story cards, bottom time control with a LIVE pill, right vertical tool rail | Tracked-out all-caps labels everywhere |
| NASA Worldview | Layer drawer grouped by kind with source line under each layer; bottom timeline; shareable state | Dense grey chrome, modal on open |
| Felt (map platform) | A thin instrument strip with live coordinates, bearing, zoom, CRS and scale bar | Cream background |
| shadcn/ui, Origin UI | Calm neutral panels, one radius scale, muted secondary text, clear focus rings, honest form controls | Card grids for everything |
| Oxide Computer | Status badges on hardware panels ("Initialized"), hairline connectors, mission-grade restraint | Monospace for all labels |
| Longitude, SpaceX Starship | Cinematic full-bleed hero where the subject itself is the image; large confident headline over terrain | Marketing hype, tiny unreadable nav |
| mesh3d.gallery, Dark Mode Design, save.design, bencho.dev, designeer.xyz | Gallery-level polish bar for Three.js sites; generous space; one orchestrated motion moment | Neon accent on black (lime, acid green) |
| Igloo Inc, Unseen Studio (via mesh3d) | 3D as the hero, scroll-led reveal | Scroll-jacking that hides the tool |

## 3. Tokens

### Colour: meaning first

| Token | Hex | Meaning |
|---|---|---|
| `--night` | `#0a1322` | Ground. The blue hour after a Martian sunset (Mars sunsets are blue: dust scatters blue light forward around the sun) |
| `--dusk` / `--dusk-2` | `#101d33` / `#172843` | Raised surfaces |
| `--home` | `#8fbcf0` | The way home: Return Envelope, havens, primary actions. Taken from the blue halo around the sun at Martian sunset |
| `--sun` | `#e2ad6e` | Sun and time: time slider, illumination, solar readouts. Martian daytime butterscotch sky |
| `--flare` | `#ff7357` | Hazard only: no-go slope, storm, "no verified return path". Never decorative |
| `--crew-a` / `--crew-b` | `#6fd6e6` / `#f4c552` | EV1 and EV2, everywhere they appear |
| `--dust` | `#ece5d8` | Primary text (regolith dust white) |

Provenance tags each have a fixed colour (`--tag-*`) so OBSERVED, DERIVED, HISTORICAL, PREDICTED, SCENARIO and ASSUMPTION read the same in every panel.

### Type

One family, **Archivo** (variable, width 62 to 125). Hierarchy comes from the width axis, not from mixing fonts:

- Display: Archivo at width 112 to 125, weight 600, tight leading. Wide lettering echoes NASA's 1970s graphics standards without copying any NASA mark.
- UI and body: Archivo width 100, weight 400 to 500, sentence case, tabular figures for every number.
- Readings: value large, unit small and lighter (as in Eyes telemetry).

No all-caps labels, no monospace labels, no single-word colour accents in headlines.

### Layout

- **Console:** the map is full-bleed. Chrome floats over it as glass panes: layers on the left, crew and resources on the right, time along the bottom, instrument strip on top. Everything left-aligned.
- **Landing:** hero is the live terrain with the envelope drawing outward from the habitat. Text sits bottom-left. Sections below are prose and lists, not card grids.

```
+---------------------------------------------------------------+
| instrument strip: x, y, elevation, slope, time home at cursor |
+---------+-------------------------------------+---------------+
| Layers  |                                     | Crew EV1 EV2  |
| grouped |        3D terrain + envelope        | O2, time,     |
| by kind |                                     | load, pace    |
| source  |                                     | Havens        |
| card    |                                     | Engine stats  |
+---------+-------------------------------------+---------------+
| LMST time scrubber with sun readout  |  Console  Tablet  Helmet |
+---------------------------------------------------------------+
```

### Motion

One orchestrated moment: the Return Envelope draws outward from the havens when the map first loads. Everything else moves only in answer to the user (panel open, value change). `prefers-reduced-motion` turns the draw-in off.

## 4. Rules

- Every number carries a provenance tag.
- While the bundle is the synthetic fixture, a visible banner says so. No placeholder is ever labelled OBSERVED.
- No NASA logos, flags or mission patches in our branding or models.
- No game language. No em-dashes in UI copy.
- Keyboard focus visible on every control; text contrast at least 4.5:1 on panels.
