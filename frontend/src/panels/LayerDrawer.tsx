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
  ] },
  { kind: "Operations", rows: [
    { id: "envelope", name: "Return Envelope", source: "Mars BEACON engine, paired crew", tag: "DERIVED", manifestId: "envelope" },
    { id: "havens", name: "Habitat and rover", source: "Mission plan", tag: "SCENARIO" },
    { id: "grid", name: "500 m grid", source: "Site frame", tag: "DERIVED" },
  ] },
  { kind: "Science and rover context", rows: [
    { id: "targets", name: "Curiosity workspaces", source: "PDS PLACES rover positions, by sol", tag: "HISTORICAL" },
    { id: "traverse", name: "Curiosity traverse", source: "MSL localizations, PDS Imaging Node", tag: "HISTORICAL", manifestId: "traverse" },
  ] },
];

const PENDING = [
  { kind: "Optical", name: "HiRISE 25 cm orthophoto", who: "Sahaj, bundle" },
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
                      <span className="layer-name">{r.name}</span>
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
        <section className="layer-group pending">
          <h3>Arriving with the real bundle</h3>
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
