// Helmet visor overlay (Artemis-style EVA HUD, after the patterns in NASA's SUITS design challenge):
// heading tape, next waypoint, hazard alerts, suit work and consumables on the left, the return
// countdown on the right, and a heading-up radar of the path and hazards. Every number comes from
// the shared mission state; values the simulation does not model say so.
import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { useVisor, type VisorData } from "../engine/useVisor";
import { reportAt } from "../engine/query";
import { evaDoseMsv, tauAtElevation } from "../engine/environment";
import { temperatureAt } from "../engine/overlays";
import { toCell } from "../data/bundle";

const fmtD = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Visor() {
  const v = useVisor();
  const crew = useStore((s) => s.crew);
  const t = useStore(useShallow((s) => ({ left: s.timeBudgetS - s.timeSpentS, budget: s.timeBudgetS, spent: s.timeSpentS, storm: s.storm })));
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
  const dose = evaDoseMsv(t.spent, t.storm ? 10 : 1);
  const alerts = useMemo(() => buildAlerts(v, ret?.stay ?? null, ground), [v, ret?.stay, ground]);

  return (
    <div className="visor" aria-label="Helmet visor display">
      <div className="visor-glass" aria-hidden />
      <svg className="visor-frame" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden>
        <path d="M40 120 V60 H120 M880 60 H960 V120 M40 480 V540 H120 M880 540 H960 V480" />
      </svg>
      <div className="visor-reticle" aria-hidden><i /><i /><i /><i /></div>
      <HeadingTape />
      {v?.next && (
        <div className="vz-next">
          <span className="vz-arrow" style={{ transform: `rotate(${v.next.rel}deg)` }} aria-hidden>▲</span>
          <span className="vz-next-name">{v.next.isHome ? "Habitat airlock" : v.next.name.split(",")[0]}</span>
          <b>{fmtD(v.next.dist)}</b>
          {v.next.etaS !== null && <span>ETA {mmss(Math.max(0, v.next.etaS))}</span>}
        </div>
      )}
      <ul className="vz-alerts" aria-live="polite">
        {alerts.map((a) => <li key={a.text} className={`vz-${a.level}`}>{a.text}</li>)}
      </ul>

      <section className="vz-panel vz-left" aria-label="Suit">
        <header>SUIT · EV1<span>simulated from the walking model</span></header>
        <Gauge label="O₂" value={(crew[0].o2BudgetG - crew[0].o2SpentG) / crew[0].o2BudgetG} text={`${Math.round(crew[0].o2BudgetG - crew[0].o2SpentG)} g`} />
        <dl>
          <div><dt>O₂ use</dt><dd>{v?.suit ? `${Math.round(v.suit.o2gph)} g/h` : "–"}</dd></div>
          <div><dt>Work rate</dt><dd>{v?.suit ? `${Math.round(v.suit.watts)} W` : "–"}</dd></div>
          <div><dt>Heart rate, est.</dt><dd>{v?.suit ? `${v.suit.hr} bpm` : "–"}</dd></div>
          <div><dt>Pace</dt><dd>{v?.suit ? `${v.suit.speed.toFixed(2)} m/s` : "–"}</dd></div>
          <div><dt>Grade ahead</dt><dd>{v?.suit ? `${v.suit.gradePct > 0 ? "+" : ""}${v.suit.gradePct.toFixed(0)}%` : "–"}</dd></div>
          <div className="vz-na"><dt>CO₂, suit pressure</dt><dd>not modelled</dd></div>
        </dl>
        <div className="vz-buddy">EV2 O₂ <b>{Math.round(crew[1].o2BudgetG - crew[1].o2SpentG)} g</b></div>
      </section>

      <section className="vz-panel vz-right" aria-label="Return">
        <header>RETURN<span>Return Envelope</span></header>
        <div className={`vz-turn ${ret && ret.stay < 10 ? "tight" : ""} ${ret && ret.stay < 0 ? "bad" : ""}`}>
          <span>{ret && ret.stay < 0 ? "TURN BACK NOW" : "Turn back in"}</span>
          <b>{ret && ret.reachable ? Math.max(0, Math.floor(ret.stay)) : "–"}<small>min</small></b>
          <em>limited by {ret?.limit ?? "–"}</em>
        </div>
        <dl>
          <div><dt>Walk home</dt><dd>{ret?.reachable ? `${Math.round(ret.walk / 60)} min` : "no path"}</dd></div>
          <div><dt>Home</dt><dd>{v ? `${Math.round(v.home.bearing)}°, ${fmtD(v.home.dist)}` : "–"}</dd></div>
          <div><dt>EVA time left</dt><dd>{Math.round(t.left / 60)} min</dd></div>
          <div><dt>Dose</dt><dd>{dose.toFixed(2)} mSv</dd></div>
          <div><dt>Ground</dt><dd>{ground !== null ? `${ground} °C` : "–"}</dd></div>
        </dl>
      </section>

      <Radar v={v} />
    </div>
  );
}

function Gauge({ label, value, text }: { label: string; value: number; text: string }) {
  const f = Math.max(0, Math.min(1, value));
  return (
    <div className={`vz-gauge ${f < 0.25 ? "low" : ""}`}>
      <span>{label}</span>
      <div className="vz-bar"><i style={{ width: `${f * 100}%` }} /></div>
      <b>{Math.round(f * 100)}%</b><small>{text}</small>
    </div>
  );
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
    <div className="vz-tape" aria-label={`Heading ${Math.round(h)} degrees`}>
      {marks.map((m) => <span key={m.deg} style={{ left: `${50 + ((m.deg - h) / 120) * 100}%` }} className={m.label.length <= 2 ? "card" : ""}>{m.label}</span>)}
      <b>{String(Math.round(h)).padStart(3, "0")}°</b>
    </div>
  );
}

interface Alert { level: "info" | "caution" | "warn"; text: string }
function buildAlerts(v: VisorData | null, stay: number | null, ground: number | null): Alert[] {
  const out: Alert[] = [];
  if (stay !== null && stay < 0) out.push({ level: "warn", text: "Past turn-back: walk home on the marked route" });
  else if (stay !== null && stay < 15) out.push({ level: "caution", text: `Turn back in ${Math.floor(stay)} min` });
  const b = v?.hazards.find((h) => h.kind === "boulder");
  if (b) out.push({ level: b.along < 25 ? "caution" : "info", text: `Boulder ${b.size.toFixed(1)} m, ${Math.round(b.along)} m ahead (advisory)` });
  const st = v?.hazards.find((h) => h.kind === "steep");
  if (st) out.push({ level: st.size > 18 ? "warn" : "caution", text: `Steep ${Math.round(st.size)}°, ${Math.round(st.along)} m ahead` });
  if (ground !== null && ground < -80) out.push({ level: "caution", text: `Ground ${ground} °C: limit glove contact` });
  return out.slice(0, 3);
}

/** Heading-up radar, 120 m radius: path ahead, boulders, steep ground, next stop and home. */
function Radar({ v }: { v: VisorData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pos = useStore((s) => s.crewPos);
  useEffect(() => {
    const cv = ref.current; if (!cv || !v || !pos) return;
    const ctx = cv.getContext("2d")!; const S = cv.width, R = S / 2, scale = R / 120;
    ctx.clearRect(0, 0, S, S);
    ctx.save(); ctx.translate(R, R);
    ctx.strokeStyle = "rgba(120,230,255,0.25)"; ctx.lineWidth = 1;
    for (const r of [40, 80, 120]) { ctx.beginPath(); ctx.arc(0, 0, r * scale, 0, Math.PI * 2); ctx.stroke(); }
    ctx.rotate((-pos.heading * Math.PI) / 180);
    const P = (x: number, y: number) => [(x - pos.x) * scale, -(y - pos.y) * scale] as const;
    if (v.rocks) {
      ctx.fillStyle = "rgba(255,120,100,0.55)";
      for (let k = 0; k < v.rocks.length; k += 3) {
        const dx = v.rocks[k] - pos.x, dy = v.rocks[k + 1] - pos.y;
        if (Math.abs(dx) > 120 || Math.abs(dy) > 120) continue;
        const [x, y] = P(v.rocks[k], v.rocks[k + 1]); ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, v.rocks[k + 2] * scale), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(90,235,255,0.95)"; ctx.lineWidth = 2.5; ctx.beginPath();
    v.path.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    for (const h of v.hazards) if (h.kind === "steep") { const [x, y] = P(h.x, h.y); ctx.fillStyle = "#ffb340"; ctx.fillRect(x - 2, y - 2, 4, 4); }
    const mark = (x: number, y: number, col: string, label: string) => {
      let [px, py] = P(x, y); const d = Math.hypot(px, py); if (d > R - 10) { px *= (R - 10) / d; py *= (R - 10) / d; }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(px, py); ctx.rotate((pos.heading * Math.PI) / 180); ctx.font = "10px Archivo, sans-serif"; ctx.fillText(label, 7, 3); ctx.restore();
    };
    if (v.next && !v.next.isHome) mark(v.next.x, v.next.y, "#59e8ff", "NEXT");
    mark(v.home.x, v.home.y, "#8fbcf0", "HAB");
    ctx.restore();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(R, R - 7); ctx.lineTo(R - 5, R + 5); ctx.lineTo(R + 5, R + 5); ctx.closePath(); ctx.fill();
  }, [v, pos]);
  return (
    <div className="vz-radar" aria-label="Radar, 120 metres, heading up">
      <canvas ref={ref} width={200} height={200} />
      <span>120 m</span>
    </div>
  );
}
