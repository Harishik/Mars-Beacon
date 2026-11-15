import { useStore, type LayerId } from "../store/store";
import type { ManifestLayer, Tag as TagT } from "../data/bundle";
import { Tag } from "./Tag";
import { MissionPanel } from "./MissionPanel";

interface Row { id: LayerId; name: string; source: string; tag: TagT; manifestId?: string }
interface Group { kind: string; rows: Row[] }

const GROUPS: Group[] = [
  { kind: "Topographic", rows: [
    { id: "terrain", name: "3D terrain", source: "MRO HiRISE, USGS merged DEM", tag: "OBSERVED", manifestId: "dem" },
    { id: "contours", name: "Contours, 10 m", source: "Derived from the DEM", tag: "DERIVED" },
    { id: "slope", name: "Slope and no-go ground", source: "Horn 3x3 on the DEM", tag: "DERIVED", manifestId: "slope" },
    { id: "boulders", name: "Boulders in 3D", source: "Detected positions and sizes, M2 on HiRISE shadows", tag: "DERIVED" },
  ] },
  { kind: "Operations", rows: [
    { id: "envelope", name: "Return Envelope", source: "Mars BEACON engine, paired crew", tag: "DERIVED", manifestId: "envelope" },
    { id: "havens", name: "Habitat and rover", source: "Mission plan", tag: "SCENARIO" },
    { id: "grid", name: "500 m grid", source: "Site frame", tag: "DERIVED" },
  ] },
  { kind: "Science and rover context", rows: [
    { id: "targets", name: "ROVER workspaces", source: "Rover positions by sol (PDS PLACES and NASA waypoints)", tag: "HISTORICAL" },
    { id: "traverse", name: "ROVER traverse", source: "Rover localizations, NASA waypoints", tag: "HISTORICAL", manifestId: "traverse" },
  ] },
];

/** Validation of the pipeline outputs (pipeline/VALIDATION.md, Sahaj). Every figure is reproducible from a script. */
const VALIDATION: { name: string; result: string; detail: string; tag: TagT }[] = [
  { name: "2 km walk-back rule vs Return Envelope", result: "71% of the circle is not returnable", detail: "73% with P90 slopes. Budgets calibrated so flat ground gives the full circle; the difference is terrain alone. Curiosity's traverse lies inside the envelope.", tag: "DERIVED" },
  { name: "Slope no-go, 4 m grid", result: "1.5% of Curiosity's route above 20°", detail: "The 1 m slope flags 21.6% of ground the rover actually drove (DEM noise), so it is a cost term only. 16 DEM realisations give the P90 band.", tag: "DERIVED" },
  { name: "M1 terrain classes, rover images", result: "mIoU 0.806, pixel accuracy 98.0%", detail: "AI4Mars, 322 expert-labelled test images never used in training. Soil 0.97, bedrock 0.95, sand 0.95. Big rock IoU 0.35 (about 35% precision, 97% recall): a soft cost, never a hard block.", tag: "DERIVED" },
  { name: "M2 boulders, HiRISE shadows", result: "Precision not yet measured", detail: "42,685 rocks of 0.75 m or more. Big rocks add only 0.1% of the map as no-go; the rest is already too steep. Jezero rocks are unreliable (ripples).", tag: "ASSUMPTION" },
  { name: "M3 ridges and hollows", result: "Hollow site found; ridge site +0.4 m", detail: "The 1 m DEM does not resolve single 5 m ridges seen in the 25 cm orthophoto, so the layer captures larger structure only.", tag: "DERIVED" },
  { name: "Suit walking cost, k_g", result: "0.78, fit error 1.1%", detail: "Fitted to NASA/TM-2010-216138 Fig. 10 (suited, 0.32 g, the level closest to Mars).", tag: "DERIVED" },
];

const PENDING = [
  { kind: "Spectral", name: "CRISM hydrated minerals", who: "Sahaj, bundle" },
  { kind: "Thermal", name: "THEMIS thermal inertia", who: "Sahaj, bundle" },
  { kind: "Geophysical", name: "USGS geologic units", who: "Sahaj, bundle" },
  { kind: "Radiation", name: "RAD dose, DONKI events", who: "Naomi, API" },
  { kind: "Atmospheric", name: "REMS season band", who: "Naomi, API" },
];

export function LayerDrawer() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const provenance = useStore((s) => s.provenance);
  const set = useStore((s) => s.set);
  const manifest = useStore((s) => s.bundle?.manifest);
  const synthetic = !!manifest?.synthetic;
  const rover = manifest?.site?.rover ?? "Rover";
  const panel = useStore((s) => s.panel);

  return (
    <aside className="pane drawer" aria-label="Mission and layers">
      <header className="pane-head pane-tabs" role="tablist">
        <button role="tab" aria-selected={panel === "mission"} onClick={() => set({ panel: "mission" })}>Mission</button>
        <button role="tab" aria-selected={panel === "layers"} onClick={() => set({ panel: "layers" })}>Data layers <span className="count">{manifest?.layers.length ?? 0}</span></button>
      </header>
      {panel === "mission" ? <div className="drawer-scroll"><MissionPanel /></div> : (
      <div className="drawer-scroll">
        {GROUPS.map((g) => (
          <section key={g.kind} className="layer-group">
            <h3>{g.kind}</h3>
            {g.rows.map((r) => {
              const ml = manifest?.layers.find((l) => l.id === r.manifestId);
              const tag: TagT = synthetic && (r.tag === "OBSERVED" || r.tag === "HISTORICAL") ? "SCENARIO" : (ml?.tag ?? r.tag);
              return (
                <div key={r.id} className={`layer-row ${layers[r.id] ? "on" : ""}`}>
                  <button className="layer-toggle" role="switch" aria-checked={layers[r.id]} onClick={() => toggle(r.id)}>
                    <span className="switch" aria-hidden />
                    <span className="layer-text">
                      <span className="layer-name">{r.name.replace("ROVER", rover)}</span>
                      <span className="layer-source">{r.source}</span>
                    </span>
                  </button>
                  <div className="layer-meta">
                    <Tag t={tag} />
                    {ml && (
                      <button className="icon-btn" aria-label={`Source details for ${r.name}`} aria-expanded={provenance === ml.id}
                        onClick={() => set({ provenance: provenance === ml.id ? null : ml.id })}>
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" /><path d="M8 7v4M8 5v.01" stroke="currentColor" strokeLinecap="round" /></svg>
                      </button>
                    )}
                  </div>
                  {ml && provenance === ml.id && <ProvenanceCard layer={ml} synthetic={synthetic} />}
                </div>
              );
            })}
          </section>
        ))}
        <ReconstructionGroup />
        {!synthetic && manifest?.siteId === "gale-boxwork" && (
          <section className="layer-group">
            <h3>Validation</h3>
            {VALIDATION.map((v) => (
              <div key={v.name} className="valid-row">
                <span className="valid-top"><span className="layer-name">{v.name}</span><Tag t={v.tag} /></span>
                <b className="valid-result">{v.result}</b>
                <span className="layer-source">{v.detail}</span>
              </div>
            ))}
          </section>
        )}
        <section className="layer-group pending">
          <h3>Not yet in the bundle</h3>
          {PENDING.map((p) => (
            <div key={p.name} className="pending-row">
              <span className="layer-name">{p.name}</span>
              <span className="layer-source">{p.kind}, from {p.who}</span>
            </div>
          ))}
        </section>
      </div>)}
    </aside>
  );
}

function ProvenanceCard({ layer, synthetic }: { layer: ManifestLayer; synthetic: boolean }) {
  return (
    <dl className="prov-card">
      <div><dt>Mission</dt><dd>{layer.mission}</dd></div>
      {layer.instrument && <div><dt>Instrument</dt><dd>{layer.instrument}</dd></div>}
      <div><dt>Product</dt><dd>{layer.productId}</dd></div>
      <div><dt>Resolution</dt><dd>{layer.resolutionM} m</dd></div>
      <div><dt>Acquired</dt><dd>{layer.acquired}</dd></div>
      <div><dt>Credit</dt><dd>{layer.attribution}</dd></div>
      {layer.url && <div><dt>Source</dt><dd><a href={layer.url} target="_blank" rel="noreferrer">Open product page</a></dd></div>}
      {synthetic && <p className="prov-note">This view uses the synthetic placeholder bundle. The product above is what the real bundle will contain.</p>}
    </dl>
  );
}

function ReconstructionGroup() {
  const patches = useStore((s) => ((s.bundle?.manifest as unknown as { patches?: { id: string; source: string; products?: { site: number }[]; validation: Record<string, number | number[]> }[] })?.patches) ?? []);
  const on = useStore((s) => s.layers.patches);
  const toggle = useStore((s) => s.toggleLayer);
  if (!patches.length) return null;
  return (
    <section className="layer-group">
      <h3>Reconstruction</h3>
      <div className={`layer-row ${on ? "on" : ""}`}>
        <button className="layer-toggle" role="switch" aria-checked={on} onClick={() => toggle("patches")}>
          <span className="switch" aria-hidden />
          <span className="layer-text">
            <span className="layer-name">Rover stereo ground patches</span>
            <span className="layer-source">Curiosity Navcam stereo fused onto HiRISE</span>
          </span>
        </button>
        <div className="layer-meta"><Tag t="DERIVED" /></div>
      </div>
      {patches.map((p) => {
        const v = p.validation as { points: number; rmseM: number; madM: number; coverage: number; horizontalShiftM?: number[]; rmse1mBeforeM?: number; rmse1mAfterM?: number };
        return (
          <dl key={p.id} className="prov-card">
            <div><dt>Where</dt><dd>Site {p.products?.[0]?.site ?? ""}, 64 m around the sol 4752 workspace, 25 cm grid</dd></div>
            <div><dt>Points</dt><dd>{(v.points / 1e6).toFixed(2)} million stereo points</dd></div>
            <div><dt>Fit to HiRISE</dt><dd>median difference {Math.round(v.madM * 100)} cm, RMSE {v.rmseM.toFixed(2)} m (4 m grid)</dd></div>
            {v.horizontalShiftM && <div><dt>Registration</dt><dd>shifted {v.horizontalShiftM[0]} m E, {v.horizontalShiftM[1]} m N; RMSE against the 1 m DEM {v.rmse1mBeforeM?.toFixed(2)} to {v.rmse1mAfterM?.toFixed(2)} m</dd></div>}
            <div><dt>Coverage</dt><dd>{Math.round(v.coverage * 100)}% of the patch; gaps use HiRISE</dd></div>
            <div><dt>Source</dt><dd>{p.source}</dd></div>
          </dl>
        );
      })}
    </section>
  );
}
