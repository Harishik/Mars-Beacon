// Field tablet carried outside (reference design 04): the shared map underneath, a status column with the
// next stop, home, turn-back and oxygen, and three glove-sized actions. Same mission state as every display.
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { consumablesLeft } from "../engine/physiology";
import { useVisor } from "../engine/useVisor";
import { reportAt } from "../engine/query";
import { evaDoseMsv } from "../engine/environment";

const fmtD = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
const fmtT = (s: number) => {
  const t = Math.max(0, s);
  return t < 3600 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : `${Math.floor(t / 3600)} h ${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};

export function FieldTablet() {
  const v = useVisor();
  const [suit, setSuit] = useState(false);
  const s = useStore(useShallow((st) => ({ crew: st.crew, left: st.timeBudgetS - st.timeSpentS, spent: st.timeSpentS, storm: st.storm, crewPos: st.crewPos, set: st.set, bundle: st.bundle })));
  const ret = useStore(useShallow((st) => {
    if (!st.bundle || !st.crewPos) return null;
    const r = reportAt(st.bundle, st, st.crewPos.x, st.crewPos.y);
    return r ? { stay: r.stayMin, walk: r.walkHomeS, dist: r.distanceM, reachable: r.reachable, limit: r.limitedBy } : null;
  }));
  const o2 = s.crew[0].o2BudgetG - s.crew[0].o2SpentG;
  const more = consumablesLeft(s.crew[0], s.spent);
  const turnS = ret && ret.reachable ? ret.stay * 60 : null;
  const showRoute = () => { if (v?.next) s.set({ selected: { x: v.next.x, y: v.next.y, label: v.next.name } }); };
  const showReturn = () => { if (s.crewPos) s.set({ selected: { x: s.crewPos.x, y: s.crewPos.y, label: "Route home from here" } }); };
  return (
    <aside className="tablet" aria-label="Field tablet">
      <header className="tb-head"><b>BEACON / EVA-01</b><span>crew E1, E2 · rover R1</span></header>
      <div className="tb-cards">
        <div className="tb-card"><span className="tb-ic">◆</span><div><small>NEXT</small><b>{v?.next ? (v.next.isHome ? "Habitat" : v.next.name.split(",")[0].replace(" (approx.)", "")) : "–"}</b><em>{v?.next ? fmtD(v.next.dist) : ""}</em></div></div>
        <div className="tb-card"><span className="tb-ic">⌂</span><div><small>HOME, walking route</small><b>{ret?.reachable ? fmtD(ret.dist) : "no path"}</b><em>{v ? `${Math.round(v.home.bearing)}° true` : ""}</em></div></div>
        <div className={`tb-card ${turnS !== null && turnS < 900 ? "caution" : ""}`}><span className="tb-ic">↺</span><div><small>TURN BACK IN</small><b className="tb-big">{turnS !== null ? fmtT(turnS) : "–"}</b><em>limited by {ret?.limit ?? "–"}</em></div></div>
        <div className="tb-card"><span className="tb-ic">O₂</span><div><small>E1 · E2 remaining</small><b>{(o2 / 1000).toFixed(2)} kg</b><em>E2 {((s.crew[1].o2BudgetG - s.crew[1].o2SpentG) / 1000).toFixed(2)} kg · MODEL</em></div></div>
        <div className="tb-card"><span className="tb-ic">H₂O</span><div><small>Cooling water · battery, E1</small><b>{(more.waterLeftG / 1000).toFixed(2)} kg</b><em>{Math.round(more.batteryLeftWh)} Wh battery · MODEL</em></div></div>
      </div>
      {suit && (
        <dl className="tb-suit">
          <div><dt>EVA time left</dt><dd>{fmtT(s.left)}</dd></div>
          <div><dt>Walk home</dt><dd>{ret?.reachable ? fmtT(ret.walk) : "–"}</dd></div>
          <div><dt>Metabolic rate, est.</dt><dd>{v?.suit ? `${Math.round(v.suit.watts)} W` : "–"}</dd></div>
          <div><dt>Heart rate, est.</dt><dd>{v?.suit ? `${v.suit.hr} bpm` : "–"}</dd></div>
          <div><dt>Dose this EVA</dt><dd>{evaDoseMsv(s.spent, s.storm ? 10 : 1).toFixed(2)} mSv</dd></div>
          <div className="na"><dt>CO₂, suit pressure</dt><dd>not modelled</dd></div>
        </dl>
      )}
      <nav className="tb-actions">
        <button onClick={showRoute}><span>⌖</span>ROUTE</button>
        <button onClick={() => setSuit((x) => !x)} aria-pressed={suit}><span>◎</span>SUIT</button>
        <button className="tb-return" onClick={showReturn}><span>↶</span>RETURN</button>
      </nav>
    </aside>
  );
}
