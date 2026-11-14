import { useStore } from "../store/store";
import { Scene } from "../render/Scene";
import { LayerDrawer } from "../panels/LayerDrawer";
import { CrewPanel } from "../panels/CrewPanel";
import { HudOverlay, InstrumentStrip, TimeBar, ViewSwitch } from "../panels/Chrome";
import { Wordmark } from "./Wordmark";

export function Console() {
  const bundle = useStore((s) => s.bundle);
  const view = useStore((s) => s.view);
  if (!bundle) return null;
  const synthetic = bundle.manifest.synthetic;

  return (
    <div className={`console view-${view}`}>
      <Scene bundle={bundle} mode={view} />
      <header className="topbar">
        <a href="#/" className="brand" aria-label="Mars BEACON home"><Wordmark /></a>
        <div className="site-name">
          <span>Gale crater, Mount Sharp boxwork</span>
          {synthetic && <span className="badge-warn" title={bundle.manifest.notice}>Placeholder terrain</span>}
        </div>
        <ViewSwitch />
      </header>
      {view !== "hud" && <InstrumentStrip />}
      {view === "console" && <LayerDrawer />}
      {view !== "hud" && <CrewPanel />}
      {view === "hud" && <HudOverlay />}
      <TimeBar />
      {view === "console" && (
        <div className="legend" aria-hidden>
          <span><i className="lg-home" /> Edge of safe return</span>
          <span><i className="lg-dim" /> Outside: no certified way home</span>
          <span className="lg-note">Vertical scale 1.6x</span>
        </div>
      )}
    </div>
  );
}
