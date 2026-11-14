import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { reportAt, type PointReport } from "../engine/query";
import { Tag } from "./Tag";

const TYPE_LABEL = { ridge: "Ridge", hollow: "Hollow", drill: "Drill site" } as const;
const WHY = {
  ridge: "Resistant rib. Sample the cement that may have filled old fractures.",
  hollow: "Softer rock between ridges. Sample to compare with the ridge.",
  drill: "Where Curiosity drilled. Ground truth for the comparison.",
} as const;

function useReport(x: number, y: number) {
  const s = useStore(useShallow((st) => ({
    bundle: st.bundle, envelope: st.envelope, timeSpentS: st.timeSpentS, timeBudgetS: st.timeBudgetS, reserveM: st.reserveM, crew: st.crew,
  })));
  return useMemo(() => (s.bundle ? reportAt(s.bundle, s, x, y) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.bundle, s.envelope.version, s.timeSpentS, s.timeBudgetS, s.reserveM, s.crew, x, y]);
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
  return (
    <li>
      <button className={`stop ${active ? "active" : ""}`} onClick={() => set({ selected: { x: t.x, y: t.y, label: t.name } })} aria-pressed={active}>
        <span className={`stop-type type-${t.type}`}>{TYPE_LABEL[t.type]}</span>
        <span className="stop-main">
          <span className="stop-name">{t.name}</span>
          <span className="stop-why">{WHY[t.type]}</span>
          <Status r={r} />
        </span>
        <span className="stop-time">{r && r.reachable ? <><b>{Math.round(r.walkHomeS / 60)}</b> min<br />home</> : "n/a"}</span>
      </button>
    </li>
  );
}

export function SelectedCard() {
  const sel = useStore((s) => s.selected);
  const set = useStore((s) => s.set);
  const r = useReport(sel?.x ?? 0, sel?.y ?? 0);
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
          <dl className="facts">
            <div><dt>Walk home</dt><dd>{Math.round(r.walkHomeS / 60)} min to {r.haven}</dd></div>
            <div><dt>Route length</dt><dd>{(r.distanceM / 1000).toFixed(2)} km</dd></div>
            <div><dt>O₂ to get home</dt><dd><span className="ca">EV1 {Math.round(r.o2HomeG[0])} g</span> <span className="cb">EV2 {Math.round(r.o2HomeG[1])} g</span></dd></div>
          </dl>
          <p className="fine-note">Route shown on the map is the certified path: time and both suits' oxygen fit on this same path with reserve.</p>
        </>
      )}
    </section>
  );
}

export function MissionPanel() {
  const targets = useStore((s) => s.bundle?.manifest.targets ?? []);
  const sel = useStore((s) => s.selected);
  return (
    <div className="mission">
      <section className="objective">
        <h3>Science objective</h3>
        <p>Sample one boxwork ridge and the hollow beside it, to test whether mineral-rich groundwater cemented the ridges.</p>
        <span className="obj-src">Follows Curiosity's 2025 to 2026 boxwork campaign <Tag t="HISTORICAL" /></span>
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
