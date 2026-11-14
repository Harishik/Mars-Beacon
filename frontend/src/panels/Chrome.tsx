// Instrument strip, time bar, view switch, HUD overlay and tablet cards.
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { reportAt } from "../engine/query";
import { useStore, type View } from "../store/store";
import { sampleHeight, toCell } from "../data/bundle";
import { formatLmst, sunAt } from "../engine/sun";
import { declinationDeg, directIrradiance, tauAtElevation } from "../engine/environment";
import { Tag } from "./Tag";

export function InstrumentStrip() {
  const cursor = useStore((s) => s.cursor);
  const bundle = useStore((s) => s.bundle);
  const envVersion = useStore((s) => s.envelope.version);
  const info = useMemo(() => {
    if (!cursor || !bundle) return null;
    const m = bundle.manifest;
    const [c, r] = toCell(m, cursor.x, cursor.y);
    const i = r * m.grid.cols + c;
    const t = useStore.getState().envelope.timeToHaven?.[i];
    const mg = useStore.getState().envelope.margin?.[i];
    return {
      e: sampleHeight(bundle, cursor.x, cursor.y), slope: bundle.slopeDeg[i],
      t: t !== undefined && Number.isFinite(t) ? t : null, margin: mg ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, bundle, envVersion]);
  const lim = useStore((s) => s.slopeLimitDeg);
  const o = bundle?.manifest.crs.origin;

  return (
    <div className="strip" aria-live="off">
      <span><i>Site</i> {bundle?.manifest.siteId ?? "loading"}</span>
      <span><i>Origin</i> {o ? `${Math.abs(o.lat).toFixed(2)}° S, ${o.lon.toFixed(2)}° E` : ""}</span>
      {info && cursor ? (
        <>
          <span><i>E</i> {cursor.x.toFixed(0)} m</span>
          <span><i>N</i> {cursor.y.toFixed(0)} m</span>
          <span><i>Elev</i> {info.e.toFixed(1)} m</span>
          <span className={info.slope > lim ? "warn" : ""}><i>Slope</i> {info.slope.toFixed(1)}°</span>
          <span className={info.margin !== null && info.margin < 0 ? "warn" : "home"}>
            <i>Walk home</i> {info.t !== null ? `${Math.round(info.t / 60)} min` : "no path in budget"}
          </span>
        </>
      ) : (
        <span className="hint">Point at the terrain to read elevation, slope and walk-home time</span>
      )}
      <span className="strip-right" title="Curiosity RAD surface average, Hassler et al., Science 2014"><i>Radiation</i> 0.21 mGy/day <Tag t="HISTORICAL" /></span>
      <span title="Live DONKI space weather arrives with the backend"><i>Space weather</i> feed not connected</span>
    </div>
  );
}

export function TimeBar() {
  const lmst = useStore((s) => s.lmstHours);
  const set = useStore((s) => s.set);
  const lat = useStore((s) => s.bundle?.manifest.crs.origin.lat ?? -4.86);
  const ls = useStore((s) => s.lsDeg);
  const tauRef = useStore((s) => s.tau);
  const storm = useStore((s) => s.storm);
  const elevKm = useStore((s) => s.bundle ? (s.bundle.manifest.elevation.min + s.bundle.manifest.elevation.max) / 2000 : -3.6);
  const sun = sunAt(lmst, lat, declinationDeg(ls));
  const tau = tauAtElevation(storm ? Math.max(tauRef, 3) : tauRef, elevKm);
  const irr = directIrradiance(ls, sun.elevationDeg, tau);
  const pct = ((lmst - 5) / 14) * 100;
  return (
    <div className="pane timebar">
      <div className="time-readout">
        <span className="time-big">{formatLmst(lmst)}</span>
        <span className="time-unit">LMST</span>
        <Tag t="PREDICTED" />
      </div>
      <div className="time-track">
        <input aria-label="Local mean solar time" type="range" min={5} max={19} step={1 / 12} value={lmst}
          onChange={(e) => set({ lmstHours: Number(e.target.value) })} style={{ ["--p" as string]: `${pct}%` }} />
        <div className="time-ticks" aria-hidden>
          {[6, 8, 10, 12, 14, 16, 18].map((h) => <span key={h} style={{ left: `${((h - 5) / 14) * 100}%` }}>{String(h).padStart(2, "0")}</span>)}
        </div>
      </div>
      <div className="sun-readout">
        <span><b>{sun.elevationDeg.toFixed(0)}°</b> sun</span>
        <span title="Direct sunlight reaching flat ground through the dust"><b>{Math.round(irr)}</b> W/m² direct</span>
        <label className="season" title="Solar longitude: 0 spring equinox (north), 90 summer, 180 autumn, 270 winter. Dust season peaks near 250.">
          <span>Season L<sub>s</sub> <b>{Math.round(ls)}°</b></span>
          <input type="range" min={0} max={359} step={1} value={ls} onChange={(e) => set({ lsDeg: Number(e.target.value) })} />
        </label>
        <button className={`chip ${storm ? "chip-on" : ""}`} aria-pressed={storm} onClick={() => set({ storm: !storm })} title="Scenario: regional dust storm and solar particle event">
          Storm scenario
        </button>
        <Tag t={storm ? "SCENARIO" : "PREDICTED"} />
      </div>
    </div>
  );
}

const VIEWS: { id: View; label: string; short: string; hint: string }[] = [
  { id: "console", label: "Habitat console", short: "Console", hint: "Full 3D map and analysis" },
  { id: "tablet", label: "Field tablet", short: "Tablet", hint: "Top-down map for walking crew" },
  { id: "hud", label: "Helmet display", short: "Helmet", hint: "First-person view at eye height" },
];

export function ViewSwitch() {
  const view = useStore((s) => s.view);
  const set = useStore((s) => s.set);
  return (
    <div className="viewswitch" role="tablist" aria-label="Display">
      {VIEWS.map((v) => (
        <button key={v.id} role="tab" aria-selected={view === v.id} title={v.hint} onClick={() => set({ view: v.id })}><span className="vs-long">{v.label}</span><span className="vs-short">{v.short}</span></button>
      ))}
    </div>
  );
}

export function HudOverlay() {
  const crew = useStore((s) => s.crew);
  const nav = useStore(useShallow((s) => {
    const plan = s.plans.find((p) => p.id === s.activePlan) ?? s.plans[0];
    const pos = s.crewPos;
    if (!plan || !pos || !s.bundle) return null;
    const next = plan.events.find((e) => e.kind === "arrive" && e.t > s.playheadS);
    const tgt = next ? s.bundle.manifest.targets.find((t) => t.id === next.stop) : null;
    const hab = s.bundle.manifest.havens.find((h) => h.type === "habitat")!;
    const goal = tgt ?? { name: "Habitat airlock", x: hab.x, y: hab.y };
    const dx = goal.x - pos.x, dy = goal.y - pos.y;
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    const rel = ((bearing - pos.heading + 540) % 360) - 180;
    const r = reportAt(s.bundle, s, pos.x, pos.y);
    return { name: goal.name, dist: Math.hypot(dx, dy), rel, stay: r?.stayMin ?? null, limit: r?.limitedBy ?? "" };
  }));
  const tLeft = useStore((s) => s.timeBudgetS - s.timeSpentS);
  const tBudget = useStore((s) => s.timeBudgetS);
  const arc = (frac: number, r: number) => {
    const a = Math.max(0, Math.min(1, frac)) * Math.PI * 0.9;
    const x = 100 - r * Math.cos(a + Math.PI * 0.05), y = 100 - r * Math.sin(a + Math.PI * 0.05);
    return `M ${100 - r * Math.cos(Math.PI * 0.05)} ${100 - r * Math.sin(Math.PI * 0.05)} A ${r} ${r} 0 0 1 ${x} ${y}`;
  };
  const o2 = (crew[0].o2BudgetG - crew[0].o2SpentG) / crew[0].o2BudgetG;
  return (
    <div className="hud" aria-label="Helmet display overlay">
      <div className="hud-horizon" />
      <Compass />
      <svg className="hud-arcs hud-left" viewBox="0 0 200 110" aria-hidden>
        <path d={arc(1, 80)} className="track" /><path d={arc(o2, 80)} className="o2" />
      </svg>
      <svg className="hud-arcs hud-right" viewBox="0 0 200 110" aria-hidden>
        <path d={arc(1, 80)} className="track" /><path d={arc(tLeft / tBudget, 80)} className="time" />
      </svg>
      <div className="hud-read hud-read-left"><b>{Math.round(crew[0].o2BudgetG - crew[0].o2SpentG)}</b> g O₂</div>
      <div className="hud-read hud-read-right"><b>{Math.round(tLeft / 60)}</b> min left</div>
      {nav ? (
        <>
          <div className="hud-next">
            <span className="hud-chev" style={{ transform: `rotate(${nav.rel}deg)` }} aria-hidden>▲</span>
            Next: <b>{nav.name}</b>, {nav.dist < 1000 ? `${Math.round(nav.dist)} m` : `${(nav.dist / 1000).toFixed(2)} km`}
          </div>
          {nav.stay !== null && (
            <div className={`hud-turn ${nav.stay < 10 ? "tight" : ""} ${nav.stay < 0 ? "bad" : ""}`}>
              {nav.stay < 0 ? "Turn back now" : <>Turn back within <b>{Math.floor(nav.stay)}</b> min</>}
              <small>limited by {nav.limit}</small>
            </div>
          )}
        </>
      ) : <div className="hud-next">Choose a plan to see the next waypoint.</div>}
    </div>
  );
}

/** Heading tape for the helmet display, centred on the crew's walking direction. */
function Compass() {
  const heading = useStore((s) => s.crewPos?.heading ?? 0);
  const h = (heading + 360) % 360;
  const marks = [] as { deg: number; label: string }[];
  const names: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
  for (let d = Math.floor((h - 60) / 15) * 15; d <= h + 60; d += 15) {
    const n = ((d % 360) + 360) % 360;
    marks.push({ deg: d, label: names[n] ?? String(n).padStart(3, "0") });
  }
  return (
    <div className="hud-compass" aria-label={`Heading ${Math.round(h)} degrees`}>
      {marks.map((m) => (
        <span key={m.deg} style={{ left: `${50 + ((m.deg - h) / 120) * 100}%` }} className={m.label.length <= 2 ? "card" : ""}>{m.label}</span>
      ))}
      <b>{String(Math.round(h)).padStart(3, "0")}°</b>
    </div>
  );
}
