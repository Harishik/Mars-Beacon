// Plan cards, mission timeline and plan charts. All read the shared mission state.
import { useMemo } from "react";
import { useStore } from "../store/store";
import type { Plan } from "../engine/planner";
import { activePlanOf, MARS_HOUR_S } from "../engine/useMission";
import { directIrradiance, tauAtElevation } from "../engine/environment";
import { formatLmst, sunMars24 } from "../engine/sun";
import { Tag } from "./Tag";

const PLAN_LABEL: Record<Plan["id"], { name: string; hint: string }> = {
  maxScience: { name: "Max science", hint: "Most stops the margins allow" },
  maxMargin: { name: "Max margin", hint: "Safest plan with science" },
  balanced: { name: "Balanced", hint: "Science weighed against margin" },
};
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

export function PlanCards() {
  const plans = useStore((s) => s.plans);
  const active = useStore((s) => s.activePlan);
  const busy = useStore((s) => s.planBusy);
  const targets = useStore((s) => s.bundle?.manifest.targets ?? []);
  const set = useStore((s) => s.set);
  const name = (id: string) => targets.find((t) => t.id === id)?.name ?? id;
  if (!plans.length) return <p className="select-hint">{busy ? "Planning routes on the terrain" : "No plan keeps both crew inside the envelope. Reduce load, add EVA time or park the rover."}</p>;
  return (
    <div className="plan-cards" role="radiogroup" aria-label="EVA plan options">
      {(["balanced", "maxScience", "maxMargin"] as const).map((id, k, all) => {
        const p = plans.find((x) => x.id === id);
        if (!p) return null;
        const same = all.slice(0, k).map((o) => plans.find((x) => x.id === o)).find((q) => q && q.order.join() === p.order.join());
        if (same) return <p key={id} className="pc-same">{PLAN_LABEL[id].name}: same route as {PLAN_LABEL[same.id].name}.</p>;
        return (
          <button key={id} role="radio" aria-checked={active === id} className={`plan-card ${active === id ? "on" : ""}`}
            onClick={() => set({ activePlan: id, playheadS: 0, playing: false })}>
            <span className="pc-head"><b>{PLAN_LABEL[id].name}</b><span>{PLAN_LABEL[id].hint}</span></span>
            <span className="pc-route">{p.order.map((o, i) => <span key={o}><i>{i + 1}</i>{name(o)}</span>)}</span>
            <span className="pc-stats">
              <span><small>Science</small>{p.science.toFixed(2)}</span>
              <span><small>Min margin</small>{Math.round(p.minMargin * 100)}%</span>
              <span><small>Duration</small>{hm(p.totalS)}</span>
              <span><small>Distance</small>{(p.distM / 1000).toFixed(2)} km</span>
              <span><small>O₂ EV1 / EV2</small>{Math.round(p.o2UsedG[0])} / {Math.round(p.o2UsedG[1])} g</span>
            </span>
          </button>
        );
      })}
      <p className="fine-note">Every plan is checked at each stop: after sampling, both suits must still reach the airlock with reserve. Science weights: ridge 0.35, hollow 0.35, drill site 0.2 <Tag t="ASSUMPTION" /></p>
    </div>
  );
}

export function MissionTimeline() {
  const s = useStore();
  const plan = activePlanOf(s);
  const targets = s.bundle?.manifest.targets ?? [];
  const lat = s.bundle?.manifest.crs.origin.lat ?? -4.86;
  const elevKm = s.bundle ? (s.bundle.manifest.elevation.min + s.bundle.manifest.elevation.max) / 2000 : -3.6;
  const sun = sunMars24(s.lsDeg, s.lmstHours, lat, s.bundle?.manifest.crs.origin.lon ?? 137.38);
  const tau = tauAtElevation(s.storm ? Math.max(s.tau, 3) : s.tau, elevKm);
  const irr = directIrradiance(s.lsDeg, sun.elevationDeg, tau);
  const total = plan?.totalS ?? s.timeBudgetS;
  const stopIdx = new Map((plan?.order ?? []).map((id, i) => [id, i + 1]));
  const name = (id: string) => targets.find((t) => t.id === id)?.name ?? id;
  const pct = (t: number) => `${(t / total) * 100}%`;

  return (
    <div className="pane timeline" aria-label="Mission timeline">
      <div className="tl-controls">
        <button className="play" aria-label={s.playing ? "Pause rehearsal" : "Play rehearsal"} onClick={() => {
          if (!plan) return;
          s.set({ playing: !s.playing, playheadS: s.playheadS >= plan.totalS ? 0 : s.playheadS });
        }}>
          {s.playing
            ? <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            : <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>}
        </button>
        <select aria-label="Rehearsal speed" value={s.speed} onChange={(e) => s.set({ speed: Number(e.target.value) })}>
          <option value={60}>1 min/s</option><option value={120}>2 min/s</option><option value={300}>5 min/s</option><option value={900}>15 min/s</option>
        </select>
        <div className="tl-clock">
          <span className="tl-met">{hm(s.playheadS)}<small>since egress</small></span>
          <span className="tl-lmst">{formatLmst(s.lmstHours)}<small>LMST</small> {formatLmst(sun.ltstH)}<small>LTST</small></span>
          <span className="tl-date" title="First date from 15 Nov 2026 at this season (Mars24)">{new Date(sun.utcMs).toISOString().slice(0, 10)} UTC</span>
        </div>
      </div>

      <div className="tl-track">
        <div className="tl-bar">
          {plan?.events.map((e, i) => {
            if (e.kind !== "arrive") return null;
            const leave = plan.events[i + 1];
            return <span key={i} className="tl-stay" style={{ left: pct(e.t), width: `calc(${pct(leave.t - e.t)})` }} title={`${name(e.stop)} sampling`} />;
          })}
          <span className="tl-done" style={{ width: pct(s.playheadS) }} />
        </div>
        {plan?.events.filter((e) => e.kind === "arrive").map((e, i, arr) => {
          const nextT = arr[i + 1]?.t ?? Infinity;
          const roomy = (nextT - e.t) / total > 0.16;
          return (
            <span key={e.stop} className="tl-marker" style={{ left: pct(e.t) }} title={name(e.stop)}>
              <i>{stopIdx.get(e.stop)}</i>{roomy && <span>{name(e.stop)}</span>}
            </span>
          );
        })}
        <input type="range" aria-label="Time since egress" min={0} max={total} step={10} value={Math.min(s.playheadS, total)}
          onChange={(e) => s.set({ playheadS: Number(e.target.value), playing: false })} />
        <div className="tl-ends"><span>Egress</span><span>Airlock {plan ? hm(plan.totalS) : ""}</span></div>
      </div>

      <div className="tl-env">
        <span><b>{sun.elevationDeg.toFixed(0)}°</b> sun</span>
        <span title="Direct sunlight on flat ground through the dust"><b>{Math.round(irr)}</b> W/m² direct</span>
        <label className="season" title="Solar longitude. Dust season peaks near 250.">
          <span>Season L<sub>s</sub> <b>{Math.round(s.lsDeg)}°</b></span>
          <input type="range" min={0} max={359} step={1} value={s.lsDeg} onChange={(e) => s.set({ lsDeg: Number(e.target.value) })} />
        </label>
        <label className="season" title="Local solar time at egress">
          <span>Egress <b>{formatLmst(s.evaStartLmst)}</b></span>
          <input type="range" min={6} max={14} step={0.25} value={s.evaStartLmst}
            onChange={(e) => s.set({ evaStartLmst: Number(e.target.value), lmstHours: Number(e.target.value) + s.playheadS / MARS_HOUR_S })} />
        </label>
        <button className={`chip ${s.storm ? "chip-on" : ""}`} aria-pressed={s.storm} onClick={() => s.set({ storm: !s.storm })}>Storm scenario</button>
      </div>
    </div>
  );
}

/** Oxygen and time remaining against what is needed to get home, plus the route profile. */
export function PlanCharts() {
  const plans = useStore((s) => s.plans);
  const activeId = useStore((s) => s.activePlan);
  const playhead = useStore((s) => s.playheadS);
  const budgetT = useStore((s) => s.timeBudgetS);
  const o2Budget = useStore((s) => s.crew[0].o2BudgetG);
  const reserve = useStore((s) => s.reserveM);
  const targets = useStore((s) => s.bundle?.manifest.targets ?? []);
  const plan = plans.find((p) => p.id === activeId) ?? plans[0];

  const W = 360, H = 120, P = 26;
  const charts = useMemo(() => {
    if (!plan || plan.samples.length < 2) return null;
    const S = plan.samples, T = plan.totalS;
    const x = (t: number) => P + (t / T) * (W - P - 6);
    const y = (f: number) => 8 + (1 - Math.max(0, Math.min(1, f))) * (H - 22);
    const line = (fn: (s: (typeof S)[number]) => number) => S.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(fn(s)).toFixed(1)}`).join(" ");
    const elev = S.map((s) => s.elev), zMin = Math.min(...elev), zMax = Math.max(...elev);
    const D = S[S.length - 1].distM || 1;
    const px = (d: number) => P + (d / D) * (W - P - 6);
    const pz = (z: number) => 8 + (1 - (z - zMin) / Math.max(1, zMax - zMin)) * (H - 22);
    const prof = S.map((s, i) => `${i ? "L" : "M"}${px(s.distM).toFixed(1)},${pz(s.elev).toFixed(1)}`).join(" ");
    const stops = plan.events.filter((e) => e.kind === "arrive").map((e, i) => {
      const smp = S.find((s) => s.t >= e.t) ?? S[S.length - 1];
      return { i: i + 1, t: e.t, d: smp.distM, z: smp.elev };
    });
    return {
      x, px, pz, T, zMin, zMax, D, prof, stops,
      a: line((s) => s.o2Left[0] / o2Budget),
      b: line((s) => s.o2Left[1] / o2Budget),
      time: line((s) => s.timeLeft / budgetT),
      need: line((s) => s.returnNeedS / budgetT),
      sampleAt: (t: number) => S.find((s) => s.t >= t) ?? S[S.length - 1],
    };
  }, [plan, o2Budget, budgetT]);

  if (!plan || !charts) return null;
  const ph = Math.min(playhead, charts.T);
  const cur = charts.sampleAt(ph);
  return (
    <div className="pane plan-charts" aria-label="Plan analytics">
      <figure>
        <figcaption>Resources left <span className="lg"><i className="la" />EV1 O₂ <i className="lb" />EV2 O₂ <i className="lt" />EVA time <i className="ln" />Time needed to get home (with {Math.round(reserve * 100)}% reserve)</span></figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Oxygen and time remaining over the EVA">
          {[0, 0.5, 1].map((f) => <g key={f}><line x1={P} x2={W - 6} y1={8 + (1 - f) * (H - 22)} y2={8 + (1 - f) * (H - 22)} className="grid" /><text x={P - 4} y={12 + (1 - f) * (H - 22)} className="ax" textAnchor="end">{f * 100}%</text></g>)}
          <path d={charts.need} className="c-need" />
          <path d={charts.time} className="c-time" />
          <path d={charts.a} className="c-a" />
          <path d={charts.b} className="c-b" />
          {charts.stops.map((st) => <g key={st.i}><line x1={charts.x(st.t)} x2={charts.x(st.t)} y1={8} y2={H - 14} className="stopline" /><text x={charts.x(st.t)} y={H - 3} className="ax" textAnchor="middle">{st.i}</text></g>)}
          <line x1={charts.x(ph)} x2={charts.x(ph)} y1={4} y2={H - 14} className="ph" />
        </svg>
      </figure>
      <figure>
        <figcaption>Route profile <span className="lg">{(charts.D / 1000).toFixed(2)} km, {Math.round(charts.zMax - charts.zMin)} m relief, now {Math.round(cur.elev - charts.zMin)} m above the low point</span></figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elevation along the planned route">
          <path d={`${charts.prof} L${W - 6},${H - 14} L${P},${H - 14} Z`} className="c-fill" />
          <path d={charts.prof} className="c-prof" />
          <text x={P - 4} y={12} className="ax" textAnchor="end">{Math.round(charts.zMax - charts.zMin)}</text>
          <text x={P - 4} y={H - 14} className="ax" textAnchor="end">0 m</text>
          {charts.stops.map((st) => <g key={st.i}><circle cx={charts.px(st.d)} cy={charts.pz(st.z)} r={6} className="stopdot" /><text x={charts.px(st.d)} y={charts.pz(st.z) + 3.5} className="stopnum" textAnchor="middle">{st.i}</text></g>)}
          <circle cx={charts.px(cur.distM)} cy={charts.pz(cur.elev)} r={4} className="phdot" />
        </svg>
      </figure>
      <p className="fine-note">Stops: {plan.order.map((o, i) => `${i + 1} ${targets.find((t) => t.id === o)?.name ?? o}`).join(", ")}. Dwell {useStore.getState().dwellMin} min per stop <Tag t="ASSUMPTION" /></p>
    </div>
  );
}
