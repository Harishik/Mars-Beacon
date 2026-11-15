// Support rover cockpit display (NASA suggestion S6: rovers transporting crew and tools). The rover is a
// moving safe haven: the display shows where the walking pair is, how far and how long a drive it would be,
// their consumables, and whether the rover is counted as a haven in the Return Envelope.
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { activePlanOf } from "../engine/useMission";

/** Drive speed for the estimate: Apollo LRV averaged about 2.5 m/s on traverses; we use 2 m/s on a direct line (ASSUMPTION). */
const ROVER_SPEED_MS = 2.0;
const fmtD = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

export function RoverCockpit() {
  const s = useStore(useShallow((st) => ({
    bundle: st.bundle, crewPos: st.crewPos, crew: st.crew, roverActive: st.roverActive, set: st.set,
    insideCells: st.envelope.insideCells, computing: st.envelope.computing, left: st.timeBudgetS - st.timeSpentS, plans: st.plans, activePlan: st.activePlan, playheadS: st.playheadS,
  })));
  if (!s.bundle) return null;
  const m = s.bundle.manifest;
  const rv = m.havens.find((h) => h.type === "rover");
  const hab = m.havens.find((h) => h.type === "habitat")!;
  const crew = s.crewPos ?? { x: hab.x, y: hab.y, heading: 0 };
  const rx = rv?.x ?? hab.x, ry = rv?.y ?? hab.y;
  const dCrew = Math.hypot(crew.x - rx, crew.y - ry), dHab = Math.hypot(hab.x - rx, hab.y - ry);
  const brg = ((Math.atan2(crew.x - rx, crew.y - ry) * 180) / Math.PI + 360) % 360;
  const area = (s.insideCells * m.grid.liveM * m.grid.liveM) / 1e6;
  const plan = activePlanOf({ plans: s.plans, activePlan: s.activePlan });
  const nextEv = plan?.events.find((e) => e.kind === "arrive" && e.t > s.playheadS);
  const next = nextEv ? m.targets.find((t) => t.id === nextEv.stop) : null;
  return (
    <div className="cockpit" aria-label="Rover cockpit display">
      <div className="ck-glass" aria-hidden />
      <section className="ck-panel ck-left">
        <header>CREW TRACK</header>
        <div className="ck-big"><b>{fmtD(dCrew)}</b><span>to EV1 and EV2, bearing {Math.round(brg)}°</span></div>
        <dl>
          <div><dt>Drive to crew</dt><dd>{Math.ceil(dCrew / ROVER_SPEED_MS / 60)} min at 2 m/s, direct</dd></div>
          <div><dt>EV1 O₂</dt><dd>{Math.round(s.crew[0].o2BudgetG - s.crew[0].o2SpentG)} g</dd></div>
          <div><dt>EV2 O₂</dt><dd>{Math.round(s.crew[1].o2BudgetG - s.crew[1].o2SpentG)} g</dd></div>
          <div><dt>EVA time left</dt><dd>{Math.round(s.left / 60)} min</dd></div>
          <div><dt>Crew heading to</dt><dd>{next ? next.name.split(",")[0] : "Habitat airlock"}</dd></div>
        </dl>
        <p className="ck-note">Drive time is a straight-line estimate (ASSUMPTION); rover traverse planning is not modelled.</p>
      </section>
      <section className="ck-panel ck-right">
        <header>SAFE HAVEN</header>
        <button className={`ck-toggle ${s.roverActive ? "on" : ""}`} onClick={() => s.set({ roverActive: !s.roverActive })} style={{ pointerEvents: "auto" }}>
          {s.roverActive ? "Rover is a haven" : "Rover not counted as a haven"}
        </button>
        <dl>
          <div><dt>Returnable ground</dt><dd>{s.computing ? "recomputing" : `${area.toFixed(2)} km²`}</dd></div>
          <div><dt>Rover to habitat</dt><dd>{fmtD(dHab)}, {Math.ceil(dHab / ROVER_SPEED_MS / 60)} min</dd></div>
          <div><dt>Parked at</dt><dd>E {Math.round(rx)} m, N {Math.round(ry)} m</dd></div>
        </dl>
        <p className="ck-note">With the rover counted as a haven, the Return Envelope certifies walks home to either the habitat or the rover, and the area above grows.</p>
      </section>
    </div>
  );
}
