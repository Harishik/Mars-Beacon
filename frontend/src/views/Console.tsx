import { useEffect, useRef } from "react";
import { useStore } from "../store/store";
import { useWalkKeys } from "../engine/useMission";
import { Scene } from "../render/Scene";
import { LayerDrawer } from "../panels/LayerDrawer";
import { CrewPanel } from "../panels/CrewPanel";
import { InstrumentStrip, LinkedFrames, ViewSwitch } from "../panels/Chrome";
import { MissionTimeline, PlanCharts } from "../panels/Plan";
import { Wordmark } from "./Wordmark";
import { Ledger } from "../panels/Ledger";
import { MapLayers } from "../panels/MapLayers";
import { Visor } from "../panels/Visor";
import { RoverCockpit } from "../panels/RoverCockpit";
import { FieldTablet } from "../panels/FieldTablet";
import { MissionControl } from "../panels/MissionControl";
import { PhaseBar, ExploreBrief, DebriefPanel, CueCard, ExecuteNext } from "../panels/Phases";
import { VERT_EXAG } from "../render/Terrain";
import { SharedBanner } from "../panels/Share";
import { SpaceAlertBar } from "../panels/SpaceAlert";

export function Console() {
  const bundle = useStore((s) => s.bundle);
  const view = useStore((s) => s.view);
  const phase = useStore((s) => s.phase);
  const focusView = useStore((s) => s.focusView);
  const eyeLevel = view === "eva" || view === "hud";
  // F toggles the focus view: panels slide away, the 3D site gets the screen. The timeline stays.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) useStore.getState().set({ focusView: !useStore.getState().focusView });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useWalkKeys(eyeLevel);
  // Eye-level views run at true pace by default (time-lapse made the crew sprint); the map keeps its time-lapse.
  const mapSpeed = useRef<number | null>(null);
  useEffect(() => {
    const s = useStore.getState();
    if (eyeLevel || view === "rover") {
      if (s.speed >= 60) { mapSpeed.current = s.speed; s.set({ speed: 1 }); }
    } else if (mapSpeed.current !== null) { s.set({ speed: mapSpeed.current }); mapSpeed.current = null; }
  }, [eyeLevel, view]);
  if (!bundle) return null;
  const synthetic = bundle.manifest.synthetic;

  return (
    <div className={`console view-${view} phase-${phase} ${focusView ? "focus-view" : ""}`}>
      <Scene bundle={bundle} mode={view} />
      <SharedBanner />
      <SpaceAlertBar />
      <header className="topbar">
        <a href="#/" className="brand" aria-label="Mars BEACON home"><Wordmark /></a>
        {synthetic && <span className="badge-warn" title={bundle.manifest.notice}>Placeholder terrain</span>}
        <PhaseBar />
        <button data-guide-anchor="equations" className="btn btn-quiet ledger-btn" onClick={() => useStore.getState().set({ ledger: true })}>Equations</button>
        <button data-guide-anchor="focus-view" className={`btn btn-quiet focus-btn ${focusView ? "on" : ""}`} aria-pressed={focusView} onClick={() => useStore.getState().set({ focusView: !focusView })}>
          {focusView ? "Show panels" : "Focus view"} <kbd>F</kbd>
        </button>
        <ViewSwitch />
      </header>
      {view !== "hud" && view !== "eva" && <InstrumentStrip />}
      {view === "console" && (phase === "explore" || phase === "plan") && <MapLayers />}
      {view !== "hud" && view !== "rover" && view !== "tablet" && view !== "eva" && view !== "control" && <LayerDrawer />}
      {view === "tablet" && <FieldTablet />}
      {view === "console" && phase === "explore" && <ExploreBrief />}
      {view === "console" && phase !== "explore" && <CrewPanel />}
      {view === "linked" && <LinkedFrames />}
      {view === "hud" && <Visor />}
      {view === "control" && <MissionControl />}
      {view === "eva" && <Visor thirdPerson />}
      {view === "rover" && <RoverCockpit />}
      {eyeLevel && (
        <p className="walk-hint" aria-label="Walking controls">
          <span><kbd>W</kbd> walk</span><span><kbd>S</kbd> back</span><span><kbd>Shift</kbd> faster</span>
          {view === "eva" && <span>Drag to look around</span>}
        </p>
      )}
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
