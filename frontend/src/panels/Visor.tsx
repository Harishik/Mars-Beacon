// Helmet visor (after NASA SUITS patterns and the team's reference designs 01 to 03).
// Default: an open walking sightline with a heading tape, home cue, the next stop and nearby hazards
// labelled where they are, a heading-up local map and one compact status card. The suit detail panel opens
// on request (S). At the turn-back point a single RETURN NOW state takes over.
// Timing semantics are kept separate: turn back in, return ETA, resource-limited time left.
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { useVisor, type VisorData } from "../engine/useVisor";
import { reportAt } from "../engine/query";
import { evaDoseMsv, tauAtElevation } from "../engine/environment";
import { temperatureAt } from "../engine/overlays";
import { toCell } from "../data/bundle";
import { anchorTargets } from "../render/VisorAnchors";
import { toScene } from "../render/Assets";

const fmtD = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
/** mm:ss under an hour, otherwise h:mm with the unit shown. */
const fmtT = (s: number) => {
  const t = Math.max(0, s);
  return t < 3600 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : `${Math.floor(t / 3600)} h ${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};

export function Visor({ thirdPerson = false }: { thirdPerson?: boolean }) {
  const v = useVisor();
  const bundle = useStore((s) => s.bundle);
  const crew = useStore((s) => s.crew);
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "s" || e.key === "S") setDetail((d) => !d); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const t = useStore(useShallow((s) => ({ left: s.timeBudgetS - s.timeSpentS, spent: s.timeSpentS, storm: s.storm })));
  const ret = useStore(useShallow((s) => {
    if (!s.bundle || !s.crewPos) return null;
    const r = reportAt(s.bundle, s, s.crewPos.x, s.crewPos.y);
    return r ? { stay: r.stayMin, walk: r.walkHomeS, limit: r.limitedBy, reachable: r.reachable } : null;
  }));
  const ground = useStore((s) => {
    if (!s.bundle || !s.crewPos) return null;
    const [c, r] = toCell(s.bundle.manifest, s.crewPos.x, s.crewPos.y);
    return Math.round(temperatureAt(s.bundle, Math.round(s.lsDeg), tauAtElevation(s.storm ? Math.max(s.tau, 3) : s.tau, -3.6), Math.round(s.lmstHours * 6) / 6, r * s.bundle.manifest.grid.cols + c));
  });
  const o2Left = crew[0].o2BudgetG - crew[0].o2SpentG;
  // Resource-limited time left: the tighter of EVA time and O2 at the current use rate.
  const o2EnduranceS = v?.suit && v.suit.o2gph > 0 ? (o2Left / v.suit.o2gph) * 3600 : Infinity;
  const timeLeftS = Math.min(t.left, o2EnduranceS);
  const limitedBy = o2EnduranceS < t.left ? "O₂ at current work rate" : "EVA time";
  // Past the turn-back point, or outside the Return Envelope altogether (no certified path in the budget).
  const outside = !!ret && !ret.reachable;
  const returnNow = !!ret && (outside || ret.stay <= 0);
  const turnS = ret && ret.reachable ? ret.stay * 60 : null;
  const tone = returnNow ? "crit" : turnS === null ? "" : turnS < 15 * 60 ? "caution" : "nominal";

  // World anchors: the next stop and up to two hazards within 80 m on the path.
  const hz = useMemo(() => (v?.hazards ?? []).filter((h) => h.along < 80).slice(0, 2), [v]);
  useEffect(() => {
    anchorTargets.clear();
    if (!bundle || !v) return;
    if (v.next) anchorTargets.set("vz-anchor-next", toScene(bundle, v.next.x, v.next.y, 3));
    hz.forEach((h, i) => anchorTargets.set(`vz-anchor-hz-${i}`, toScene(bundle, h.x, h.y, 1.2)));
    return () => anchorTargets.clear();
  }, [bundle, v, hz]);

  return (
    <div className={`visor ${returnNow ? "returning" : ""} ${thirdPerson ? "third" : ""}`} aria-label={thirdPerson ? "EVA third-person view" : "Helmet visor display"}>
      {thirdPerson ? null : <HelmetRim />}
      <header className="vz-top">
        <span className="vz-id">BEACON / EVA-01 · {thirdPerson ? "THIRD PERSON, FOLLOWING E1 AND E2" : "E1 VISOR"}</span>
        <HeadingTape />
        {v && <span className="vz-home"><HomeIcon /> HOME {Math.round(v.home.bearing)}° · {fmtD(v.home.dist)}</span>}
      </header>

      {v?.next && (
        <div id="vz-anchor-next" className="vz-anchor vz-anchor-next" style={{ opacity: 0 }}>
          <span className="vz-diamond" aria-hidden />
          <b>{v.next.isHome ? "HABITAT" : v.next.name.split(",")[0].replace(" (approx.)", "").toUpperCase()}</b> / {fmtD(v.next.dist)}
        </div>
      )}
      {hz.map((h, i) => (
        <div key={i} id={`vz-anchor-hz-${i}`} className={`vz-anchor vz-anchor-hz ${h.kind}`} style={{ opacity: 0, marginTop: -38 - i * 34 }}>
          <WarnIcon /> {h.kind === "boulder" ? `BOULDER ${h.size.toFixed(1)} m · ADVISORY` : `STEEP ${Math.round(h.size)}° · AVOID`}
          <small>{Math.round(h.along)} m ahead</small>
        </div>
      ))}

      {returnNow && (
        <div className="vz-return" role="alert">
          <WarnIcon big />
          <div><b>RETURN NOW</b><span>{outside ? "Outside the Return Envelope: no certified path home within the remaining budget" : `Resource margin reached (${ret?.limit})`}</span></div>
          <div className="vz-return-t"><small>{outside ? "HOME" : "TURN-BACK WINDOW"}</small><b>{outside && v ? fmtD(v.home.dist) : "0:00"}</b></div>
        </div>
      )}

      <LocalMap v={v} />

      <section className={`vz-card ${tone}`} aria-label="Return status">
        {returnNow ? (
          <div className="vz-row big"><span>RETURN ETA</span><b>{ret && ret.reachable ? fmtT(ret.walk) : "over budget"}</b><em>EST</em></div>
        ) : (
          <div className="vz-row big"><span><TurnIcon /> TURN BACK IN</span><b>{turnS !== null ? fmtT(turnS) : "no path"}</b></div>
        )}
        <div className="vz-row"><span>O₂ E1</span><b>{(o2Left / 1000).toFixed(2)} kg</b><em>MODEL</em></div>
        <div className="vz-row"><span>TIME LEFT</span><b>{fmtT(timeLeftS)}</b><em>EST</em></div>
        <div className="vz-sub">limited by {limitedBy}</div>
        <button className="vz-suit-btn" onClick={() => setDetail((d) => !d)} aria-pressed={detail}>SUIT {detail ? "▾" : "▸"} <kbd>S</kbd></button>
      </section>

      {detail && (
        <section className="vz-detail" aria-label="Suit detail">
          <header>SUIT DETAIL · E1 <span>walking model, not suit telemetry</span></header>
          <dl>
            <Row k="O₂ remaining" val={`${(o2Left / 1000).toFixed(2)} kg`} tag="MODEL" />
            <Row k="O₂ E2" val={`${((crew[1].o2BudgetG - crew[1].o2SpentG) / 1000).toFixed(2)} kg`} tag="MODEL" />
            <Row k="O₂ use" val={v?.suit ? `${Math.round(v.suit.o2gph)} g/h` : "–"} tag="MODEL" />
            <Row k="Metabolic rate" val={v?.suit ? `${Math.round(v.suit.watts)} W` : "–"} tag="EST" />
            <Row k="Heart rate" val={v?.suit ? `${v.suit.hr} bpm` : "–"} tag="EST" note="linear in work rate, assumption" />
            <Row k="Pace, grade" val={v?.suit ? `${v.suit.speed.toFixed(2)} m/s, ${v.suit.gradePct > 0 ? "+" : ""}${v.suit.gradePct.toFixed(0)}%` : "–"} tag="MODEL" />
            <Row k="Dose this EVA" val={`${evaDoseMsv(t.spent, t.storm ? 10 : 1).toFixed(2)} mSv`} tag={t.storm ? "SCENARIO" : "RAD AVG"} />
            <Row k="Ground temperature" val={ground !== null ? `${ground} °C` : "–"} tag="MODEL" />
            <Row k="CO₂ scrubbing" val="not modelled" tag="" />
            <Row k="Suit pressure" val="not modelled" tag="" />
          </dl>
        </section>
      )}
    </div>
  );
}

function Row({ k, val, tag, note }: { k: string; val: string; tag: string; note?: string }) {
  return <div className={tag ? "" : "na"}><dt>{k}{note && <small>{note}</small>}</dt><dd>{val}</dd><em>{tag}</em></div>;
}

const HomeIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden><path d="M2 8l6-5 6 5M4 7v6h8V7" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
const TurnIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden><path d="M12 13V7a4 4 0 0 0-8 0v1M2 6l2 2 2-2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
function WarnIcon({ big = false }: { big?: boolean }) {
  const s = big ? 34 : 13;
  return <svg viewBox="0 0 16 16" width={s} height={s} aria-hidden><path d="M8 1.5l7 13H1z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 6v4M8 12v.5" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function HeadingTape() {
  const heading = useStore((s) => s.crewPos?.heading ?? 0);
  const h = (heading + 360) % 360;
  const names: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
  const marks: { deg: number; label: string }[] = [];
  for (let d = Math.floor((h - 60) / 15) * 15; d <= h + 60; d += 15) {
    const n = ((d % 360) + 360) % 360;
    marks.push({ deg: d, label: names[n] ?? String(n).padStart(3, "0") });
  }
  return (
    <div className="vz-tape" aria-label={`Heading ${Math.round(h)} degrees true, site frame`}>
      {marks.map((m) => <span key={m.deg} style={{ left: `${50 + ((m.deg - h) / 120) * 100}%` }} className={m.label.length <= 2 ? "card" : ""}>{m.label}</span>)}
      <b>{String(Math.round(h)).padStart(3, "0")}°</b>
    </div>
  );
}

/** Heading-up local map, 100 m radius, with scale and legend: path, boulders, steep cells, next stop, habitat. */
function LocalMap({ v }: { v: VisorData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pos = useStore((s) => s.crewPos);
  const RANGE = 100;
  useEffect(() => {
    const cv = ref.current; if (!cv || !v || !pos) return;
    const ctx = cv.getContext("2d")!; const W = cv.width, Hh = cv.height, cx = W / 2, cy = Hh * 0.62, scale = (Hh * 0.55) / RANGE;
    ctx.clearRect(0, 0, W, Hh);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((-pos.heading * Math.PI) / 180);
    const P = (x: number, y: number) => [(x - pos.x) * scale, -(y - pos.y) * scale] as const;
    if (v.rocks) {
      ctx.fillStyle = "rgba(243,181,64,0.75)";
      for (let k = 0; k < v.rocks.length; k += 3) {
        const dx = v.rocks[k] - pos.x, dy = v.rocks[k + 1] - pos.y;
        if (Math.abs(dx) > RANGE * 1.4 || Math.abs(dy) > RANGE * 1.4 || v.rocks[k + 2] < 1) continue;
        const [x, y] = P(v.rocks[k], v.rocks[k + 1]); ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, (v.rocks[k + 2] / 2) * scale), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const h of v.hazards) if (h.kind === "steep") { const [x, y] = P(h.x, h.y); ctx.strokeStyle = "rgba(243,181,64,0.9)"; ctx.strokeRect(x - 2.5, y - 2.5, 5, 5); }
    ctx.strokeStyle = "#60D7E5"; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.beginPath();
    v.path.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    const mark = (x: number, y: number, home: boolean) => {
      let [px, py] = P(x, y); const d = Math.hypot(px, py), lim = Hh * 0.55; if (d > lim) { px *= lim / d; py *= lim / d; }
      ctx.save(); ctx.translate(px, py); ctx.rotate((pos.heading * Math.PI) / 180);
      ctx.strokeStyle = home ? "#F1F3EF" : "#60D7E5"; ctx.lineWidth = 2;
      if (home) { ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(0, -4); ctx.lineTo(5, 1); ctx.moveTo(-3.5, 0); ctx.lineTo(-3.5, 5); ctx.lineTo(3.5, 5); ctx.lineTo(3.5, 0); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.stroke(); }
      ctx.restore();
    };
    if (v.next && !v.next.isHome) mark(v.next.x, v.next.y, false);
    mark(v.home.x, v.home.y, true);
    ctx.restore();
    ctx.fillStyle = "#F1F3EF"; ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx + 6, cy + 6); ctx.closePath(); ctx.fill();
  }, [v, pos]);
  const barPx = (50 / RANGE) * (150 * 0.55);
  return (
    <section className="vz-map" aria-label="Local map, heading up, 100 metre range">
      <header>LOCAL MAP · HEADING-UP</header>
      <canvas ref={ref} width={220} height={150} />
      <footer>
        <span className="vz-scale"><i style={{ width: barPx }} />50 m</span>
        <span className="vz-legend"><i className="lg-route" />route <i className="lg-rock" />boulder ≥1 m</span>
      </footer>
    </section>
  );
}

/** Helmet rim and visor glass: dark curved bezel, faint glass sheen, so the view reads as inside a helmet. */
function HelmetRim() {
  return (
    <svg className="helmet-rim" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden>
      <defs>
        <radialGradient id="rimShade" cx="50%" cy="46%" r="62%">
          <stop offset="78%" stopColor="#000" stopOpacity="0" />
          <stop offset="93%" stopColor="#0b0f12" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#05070a" stopOpacity="0.96" />
        </radialGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="35%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#rimShade)" />
      <path d="M0 900 L0 760 Q260 700 520 742 Q800 790 1080 742 Q1340 700 1600 760 L1600 900 Z" fill="#0d1216" opacity="0.92" />
      <path d="M0 760 Q260 700 520 742 Q800 790 1080 742 Q1340 700 1600 760" fill="none" stroke="#3a454d" strokeWidth="3" />
      <path d="M0 0 L0 90 Q400 40 800 46 Q1200 40 1600 90 L1600 0 Z" fill="#0d1216" opacity="0.85" />
      <path d="M0 90 Q400 40 800 46 Q1200 40 1600 90" fill="none" stroke="#3a454d" strokeWidth="2" />
      <ellipse cx="420" cy="230" rx="520" ry="260" fill="url(#sheen)" />
    </svg>
  );
}
