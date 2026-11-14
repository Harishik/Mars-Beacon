import { useStore } from "../store/store";
import { Scene } from "../render/Scene";
import { LayerDrawer } from "../panels/LayerDrawer";
import { CrewPanel } from "../panels/CrewPanel";
import { HudOverlay, InstrumentStrip, LinkedFrames, ViewSwitch } from "../panels/Chrome";
import { MissionTimeline, PlanCharts } from "../panels/Plan";
import { Wordmark } from "./Wordmark";
import { Ledger } from "../panels/Ledger";
import { MapLayers } from "../panels/MapLayers";
import { PhaseBar, ExploreBrief, DebriefPanel, CueCard, ExecuteNext } from "../panels/Phases";
import { VERT_EXAG } from "../render/Terrain";

export function Console() {
  const bundle = useStore((s) => s.bundle);
  const view = useStore((s) => s.view);
  const phase = useStore((s) => s.phase);
  if (!bundle) return null;
  const synthetic = bundle.manifest.synthetic;

  return (
    <div className={`console view-${view} phase-${phase}`}>
      <Scene bundle={bundle} mode={view} />
      <header className="topbar">
        <a href="#/" className="brand" aria-label="Mars BEACON home"><Wordmark /></a>
        {synthetic && <span className="badge-warn" title={bundle.manifest.notice}>Placeholder terrain</span>}
        <PhaseBar />
        <button className="btn btn-quiet ledger-btn" onClick={() => useStore.getState().set({ ledger: true })}>Equations</button>
        <ViewSwitch />
      </header>
      {view !== "hud" && <InstrumentStrip />}
      {(view === "console" || view === "tablet") && (phase === "explore" || phase === "plan") && <MapLayers />}
      {view !== "hud" && <LayerDrawer />}
      {view === "console" && phase === "explore" && <ExploreBrief />}
      {(view === "console" || view === "tablet") && phase !== "explore" && <CrewPanel />}
      {view === "linked" && <LinkedFrames />}
      {view === "hud" && <HudOverlay />}
      <MissionTimeline />
      {view === "console" && (phase === "plan" || phase === "rehearse") && <PlanCharts />}
      {view === "console" && phase === "debrief" && <DebriefPanel />}
      <CueCard />
      {view === "tablet" && phase === "execute" && <ExecuteNext />}
      <Ledger />
      {false && (
        <div className="legend" aria-hidden>
          <span><i className="lg-home" /> Edge of safe return</span>
          <span><i className="lg-dim" /> Outside: no certified way home</span>
          <span className="lg-note">{VERT_EXAG === 1 ? "True vertical scale" : `Vertical scale ${VERT_EXAG}x`}</span>
        </div>
      )}
    </div>
  );
}
