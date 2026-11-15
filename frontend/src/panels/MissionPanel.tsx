import { ShareButton } from "./Share";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { reportAt, type PointReport } from "../engine/query";
import { Tag } from "./Tag";
import { siteText } from "../data/bundle";
import { PlanCards } from "./Plan";
import { RoverViews } from "./RoverViews";
import { stopHazards, type Hazard } from "../engine/hazards";
import { tauAtElevation } from "../engine/environment";
import { MARS_HOUR_S } from "../engine/useMission";

const TYPE_LABEL = { ridge: "Ridge", hollow: "Hollow", drill: "Drill site", custom: "Planner stop" } as const;
const WHY = {
  ridge: "Where Curiosity worked on a local high. Sample the resistant rock to compare with a hollow.",
  hollow: "Where Curiosity worked in a local low. Sample to compare with a ridge.",
  drill: "Where Curiosity stopped to work on flat ground. Context sample for the comparison.",
  custom: "Added by the mission planner on the map.",
} as const;

function useReport(x: number, y: number) {
  const s = useStore(useShallow((st) => ({
    bundle: st.bundle, envelope: st.envelope, timeSpentS: st.timeSpentS, timeBudgetS: st.timeBudgetS, reserveM: st.reserveM, crew: st.crew,
  })));
  return useMemo(() => (s.bundle ? reportAt(s.bundle, s, x, y) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.bundle, s.envelope.version, s.timeSpentS, s.timeBudgetS, s.reserveM, s.crew, x, y]);
}

function useHazards(x: number, y: number, stopId: string | undefined, stayMin: number | null) {
  const s = useStore(useShallow((st) => ({
    bundle: st.bundle, lsDeg: Math.round(st.lsDeg), tau: st.storm ? Math.max(st.tau, 3) : st.tau, storm: st.storm,
    evaStartLmst: st.evaStartLmst, playheadS: st.playheadS, plans: st.plans, activePlan: st.activePlan,
  })));
  return useMemo(() => {
    if (!s.bundle) return [];
    const plan = s.plans.find((p) => p.id === s.activePlan);
    const arrive = plan?.events.find((e) => e.kind === "arrive" && e.stop === stopId)?.t ?? s.playheadS;
    return stopHazards(s.bundle, x, y, {
      lsDeg: s.lsDeg, tau: tauAtElevation(s.tau, -3.6), storm: s.storm, stayMin,
      arriveLmstH: (s.evaStartLmst + arrive / MARS_HOUR_S) % 24, elapsedS: arrive,
    });
  }, [s, x, y, stopId, stayMin]);
}

function HazardChips({ hz, compact = false }: { hz: Hazard[]; compact?: boolean }) {
  if (!hz.length) return null;
  return (
    <ul className={`hz ${compact ? "compact" : ""}`} aria-label="Risks at this stop">
      {hz.map((h) => (
        <li key={h.id} className={`hz-${h.level}`} title={h.why}>
          <i aria-hidden />{compact ? h.label : <><span>{h.label}</span><b>{h.value}</b></>}
        </li>
      ))}
    </ul>
  );
}

function Status({ r }: { r: PointReport | null }) {
  if (!r) return <span className="st st-wait">Computing</span>;
  if (!r.reachable) return <span className="st st-out">No path home in budget</span>;
  if (!r.inside || r.stayMin < 0) return <span className="st st-out">Outside the envelope</span>;
  if (r.stayMin < 10) return <span className="st st-tight">Reachable, {Math.floor(r.stayMin)} min on site</span>;
  return <span className="st st-ok">Reachable, {Math.floor(r.stayMin)} min on site</span>;
}

function StopRow({ t, active }: { t: { id: string; name: string; type: keyof typeof TYPE_LABEL; x: number; y: number }; active: boolean }) {
  const r = useReport(t.x, t.y);
  const set = useStore((s) => s.set);
  const hz = useHazards(t.x, t.y, t.id, r && r.reachable ? r.stayMin : null);
  const excluded = useStore((s) => s.excludedStops.includes(t.id));
  const toggle = useStore((s) => s.toggleStop);
  return (
    <li className={excluded ? "excluded" : ""}>
      <label className="stop-include" title="Include this stop when planning">
        <input type="checkbox" checked={!excluded} onChange={() => toggle(t.id)} /> {excluded ? "Left out of the plan" : "In the plan"}
      </label>
      <button className={`stop ${active ? "active" : ""}`} onClick={() => set({ selected: { x: t.x, y: t.y, label: t.name } })} aria-pressed={active}>
        <span className={`stop-type type-${t.type}`}>{TYPE_LABEL[t.type]}</span>
        <span className="stop-main">
          <span className="stop-name">{t.name}</span>
          <span className="stop-why">{WHY[t.type]}</span>
          <Status r={r} />
          <HazardChips hz={hz} compact />
        </span>
        <span className="stop-time">{r && r.reachable ? <><b>{Math.round(r.walkHomeS / 60)}</b> min<br />home</> : "n/a"}</span>
      </button>
    </li>
  );
}

/** Mission design: turn the selected point into a science stop. */
function AddStop({ x, y }: { x: number; y: number }) {
  const add = useStore((s) => s.addStop);
  const count = useStore((s) => (s.bundle?.manifest.targets.length ?? 0) - s.excludedStops.length);
  const [name, setName] = useState("");
  return (
    <form className="add-stop" onSubmit={(e) => { e.preventDefault(); add(x, y, name.trim()); setName(""); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this stop (optional)" aria-label="Stop name" />
      <button className="btn btn-primary" type="submit" disabled={count >= 6}>Add as science stop</button>
      {count >= 6 && <small>Six stops is the planner limit; leave one out first.</small>}
    </form>
  );
}

export function SelectedCard() {
  const sel = useStore((s) => s.selected);
  const removeStop = useStore((s) => s.removeStop);
  const set = useStore((s) => s.set);
  const r = useReport(sel?.x ?? 0, sel?.y ?? 0);
  const stopId = useStore((s) => s.bundle?.manifest.targets.find((t) => sel && t.x === sel.x && t.y === sel.y)?.id);
  const hz = useHazards(sel?.x ?? 0, sel?.y ?? 0, stopId, r && r.reachable ? r.stayMin : null);
  if (!sel) return <p className="select-hint">Click anywhere on the terrain, or a stop below, to see the route home and how long the crew can stay there.</p>;
  return (
    <section className="selected" aria-live="polite">
      <header>
        <h3>{sel.label ?? `Point ${sel.x.toFixed(0)} E, ${sel.y.toFixed(0)} N`}</h3>
        <button className="icon-btn" aria-label="Clear selection" onClick={() => set({ selected: null })}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeLinecap="round" /></svg>
        </button>
      </header>
      {!r || !r.reachable ? (
        <p className="no-return">No certified way home from here within the remaining EVA time. Pick a closer point or park the rover nearer.</p>
      ) : (
        <>
          <div className={`turnback ${r.stayMin < 0 ? "bad" : r.stayMin < 10 ? "tight" : ""}`}>
            <span className="tb-label">{r.stayMin < 0 ? "Already past turn-back" : "Turn back within"}</span>
            <span className="tb-value">{r.stayMin < 0 ? `${Math.ceil(-r.stayMin)}` : Math.floor(r.stayMin)}<small>min</small></span>
            <span className="tb-why">limited by {r.limitedBy} <Tag t="DERIVED" /></span>
          </div>
          {!stopId && <AddStop x={sel.x} y={sel.y} />}
          {stopId?.startsWith("custom-") && <button className="btn btn-quiet stop-del" onClick={() => removeStop(stopId)}>Delete this planner stop</button>}
          <h4 className="hz-title">Risks here <Tag t="DERIVED" /></h4>
          <HazardChips hz={hz} />
          <dl className="facts">
            <div><dt>Walk home</dt><dd>{Math.round(r.walkHomeS / 60)} min to {r.haven}</dd></div>
            <div><dt>Route length</dt><dd>{(r.distanceM / 1000).toFixed(2)} km</dd></div>
            <div><dt>O₂ to get home</dt><dd><span className="ca">EV1 {Math.round(r.o2HomeG[0])} g</span> <span className="cb">EV2 {Math.round(r.o2HomeG[1])} g</span></dd></div>
          </dl>
          <p className="fine-note">Route shown on the map is the certified path: time and both suits' oxygen fit on this same path with reserve.</p>
        </>
      )}
      {stopId && <RoverViews stopId={stopId} />}
    </section>
  );
}

export function MissionPanel() {
  const m = useStore((s) => s.bundle?.manifest);
  const site = m ? siteText(m) : null;
  const targets = useStore((s) => s.bundle?.manifest.targets ?? []);
  const sel = useStore((s) => s.selected);
  return (
    <div className="mission">
      <section className="objective">
        <h3>Science objective</h3>
        <p>{site?.objective}</p>
        <span className="obj-src">{site?.objectiveSource} <Tag t="HISTORICAL" /></span>
      </section>
      <section>
        <h3 className="list-h">EVA plan</h3>
        <ShareButton kind="plan" />
        <PlanCards />
      </section>
      <SelectedCard />
      <section>
        <h3 className="list-h">Stops</h3>
        <ul className="stops">
          {targets.map((t) => <StopRow key={t.id} t={t} active={!!sel && sel.x === t.x && sel.y === t.y} />)}
        </ul>
      </section>
    </div>
  );
}
