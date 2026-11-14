// The EVA workflow of the V6 plan: Explore, Plan, Rehearse, Execute, Debrief.
// One mission state underneath; each step shows what that job needs.
import { useMemo } from "react";
import { useStore, type Phase } from "../store/store";
import { activePlanOf } from "../engine/useMission";
import { sunMars24, formatLmst } from "../engine/sun";
import { directIrradiance, tauAtElevation, evaDoseMsv, RAD_GY_PER_DAY, RAD_QUALITY } from "../engine/environment";
import { overlayValues, currentThermalTable } from "../engine/overlays";
import { flatCurve, STEPS_PER_SOL } from "../engine/thermal";
import { Tag } from "./Tag";
import { RoverViews } from "./RoverViews";
import type { Plan } from "../engine/planner";

export const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: "explore", label: "Explore", hint: "Read the site: terrain, temperature, sunlight, boulders, science value" },
  { id: "plan", label: "Plan", hint: "Choose stops and loads; compare plans by science and margin" },
  { id: "rehearse", label: "Rehearse", hint: "Play the EVA in simulated time on all displays at once" },
  { id: "execute", label: "Execute", hint: "What the crew carries outside: field tablet and helmet display" },
  { id: "debrief", label: "Debrief", hint: "Compare the walk with the plan and print the cue card" },
];

export function PhaseBar() {
  const phase = useStore((s) => s.phase);
  const setPhase = useStore((s) => s.setPhase);
  return (
    <nav className="phasebar" aria-label="EVA workflow">
      {PHASES.map((p, i) => (
        <button key={p.id} aria-current={phase === p.id ? "step" : undefined} title={p.hint} onClick={() => setPhase(p.id)}>
          <i>{i + 1}</i><span>{p.label}</span>
        </button>
      ))}
    </nav>
  );
}

const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

const bearing = (dx: number, dy: number) => Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);

/** Site conditions now: what a crew reads before deciding where to go. */
export function ExploreBrief() {
  const s = useStore();
  const b = s.bundle;
  const o = b?.manifest.crs.origin;
  const sun = sunMars24(s.lsDeg, s.lmstHours, o?.lat ?? -4.8, o?.lon ?? 137.38);
  const tauSite = tauAtElevation(s.storm ? Math.max(s.tau, 3) : s.tau, -3.6);
  const irr = directIrradiance(s.lsDeg, sun.elevationDeg, tauSite);
  const temps = useMemo(() => {
    if (!b) return null;
    overlayValues("thermal", b, Math.round(s.lsDeg), tauSite, Math.round(s.lmstHours * 6) / 6);
    const t = currentThermalTable();
    if (!t) return null;
    const c = flatCurve(t);
    const k = Math.floor(((s.lmstHours / 24) * STEPS_PER_SOL) % STEPS_PER_SOL);
    let mn = Infinity, mx = -Infinity; for (const v of c) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    return { now: c[k] - 273.15, min: mn - 273.15, max: mx - 273.15 };
  }, [b, s.lsDeg, tauSite, s.lmstHours]);
  const layers = b?.manifest.layers ?? [];
  const kinds = [
    ["Optical", "HiRISE 25 cm orthophoto"], ["Topographic", "HiRISE 1 m DEM, 4 m slope with P90"],
    ["Rover", "Curiosity traverse and drill sites, Navcam stereo"], ["Geophysical", "Boulder cover, ridges and hollows"],
    ["Thermal", "Surface temperature model"], ["Atmospheric", "Dust optical depth, sunlight"], ["Radiation", "Curiosity RAD surface dose"],
  ];
  const doseRate = RAD_GY_PER_DAY * RAD_QUALITY * 1000 * (s.storm ? 10 : 1);
  return (
    <aside className="pane brief" aria-label="Site conditions">
      <header className="pane-head"><h2>Site conditions</h2><span className="status ready">{formatLmst(s.lmstHours)} LMST</span></header>
      <div className="brief-body">
        <p className="brief-lede">Gale crater, Mount Sharp boxwork. Curiosity drilled a ridge and the hollow beside it here in 2025 to 2026.</p>
        <dl className="brief-grid">
          <div><dt>Sun</dt><dd>{sun.elevationDeg.toFixed(0)}° up, {Math.round(sun.azimuthDeg)}° az</dd><Tag t="PREDICTED" /></div>
          <div><dt>Direct sunlight</dt><dd>{Math.round(irr)} W/m²</dd><Tag t="DERIVED" /></div>
          <div><dt>Dust optical depth</dt><dd>τ {tauSite.toFixed(2)}{s.storm ? " (storm)" : ""}</dd><Tag t={s.storm ? "SCENARIO" : "ASSUMPTION"} /></div>
          {temps && <div><dt>Ground temperature</dt><dd>{Math.round(temps.now)} °C now, {Math.round(temps.min)} to {Math.round(temps.max)} today</dd><Tag t="DERIVED" /></div>}
          <div><dt>Radiation</dt><dd>{doseRate.toFixed(2)} mSv/day{s.storm ? " (event)" : ""}</dd><Tag t={s.storm ? "SCENARIO" : "HISTORICAL"} /></div>
          <div><dt>Space weather</dt><dd>Feed not connected</dd></div>
        </dl>
        <h3 className="list-h">Data layered here</h3>
        <ul className="brief-kinds">
          {kinds.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}
        </ul>
        <p className="brief-note">{layers.length} source layers in the bundle, each with mission, instrument, product and date under Data layers.</p>
        <button className="btn btn-primary brief-next" onClick={() => s.setPhase("plan")}>Plan the EVA</button>
      </div>
    </aside>
  );
}

/** Compare the walked EVA (the rehearsal) with the plan, and the plan with Curiosity's own route. */
export function DebriefPanel() {
  const s = useStore();
  const plan = activePlanOf(s);
  const b = s.bundle;
  if (!plan || !b) return null;
  const walked = Math.min(s.playheadS, plan.totalS);
  const done = plan.events.filter((e) => e.kind === "leave" && e.t <= walked).length;
  const at = plan.samples.reduce((p, q) => (q.t <= walked ? q : p), plan.samples[0]);
  const minReturnSlack = plan.samples.filter((q) => q.t <= walked).reduce((m, q) => Math.min(m, q.timeLeft - q.returnNeedS), Infinity);
  const dose = evaDoseMsv(walked, s.storm ? 10 : 1);
  const name = (id: string) => b.manifest.targets.find((t) => t.id === id)?.name ?? id;
  return (
    <section className="pane debrief" aria-label="Debrief">
      <header className="db-head">
        <h2>Debrief</h2>
        <span>{walked >= plan.totalS ? "EVA complete" : `Rehearsal stopped at ${hm(walked)}`}</span>
        <button className="btn btn-quiet" onClick={() => window.print()}>Print EVA cue card</button>
      </header>
      <div className="db-grid">
        <table className="db-table">
          <thead><tr><th /><th>Planned</th><th>Walked</th></tr></thead>
          <tbody>
            <tr><th>Stops sampled</th><td>{plan.order.length}</td><td>{done}</td></tr>
            <tr><th>Duration</th><td>{hm(plan.totalS)}</td><td>{hm(walked)}</td></tr>
            <tr><th>Distance</th><td>{(plan.distM / 1000).toFixed(2)} km</td><td>{(at.distM / 1000).toFixed(2)} km</td></tr>
            <tr><th>O₂ used, EV1 / EV2</th><td>{Math.round(plan.o2UsedG[0])} / {Math.round(plan.o2UsedG[1])} g</td><td>{Math.round(s.crew[0].o2BudgetG - at.o2Left[0])} / {Math.round(s.crew[1].o2BudgetG - at.o2Left[1])} g</td></tr>
            <tr><th>Smallest margin (plan) / spare time (walk)</th><td>{Math.round(plan.minMargin * 100)}%</td><td>{Number.isFinite(minReturnSlack) ? `${Math.round(minReturnSlack / 60)} min spare` : ""}</td></tr>
            <tr><th>Dose</th><td>{evaDoseMsv(plan.totalS, s.storm ? 10 : 1).toFixed(2)} mSv</td><td>{dose.toFixed(2)} mSv</td></tr>
          </tbody>
        </table>
        <div className="db-notes">
          <h3>Against Curiosity's route</h3>
          <p>The plan visits {plan.order.map(name).join(", ")}: the same workspaces the rover team drove to on sols 4534 to 4844. Curiosity covered this ground in weeks of drives; the crew samples it in one {hm(plan.totalS)} EVA with {Math.round(plan.minMargin * 100)}% margin left at the tightest point.</p>
          <h3>For the next EVA</h3>
          <ul>
            {plan.minMargin < 0.3 && <li>Margin dropped below 30%: shorten dwell or carry less.</li>}
            {s.storm && <li>The event scenario raised dose tenfold; keep the shelter time inside the envelope.</li>}
            <li>Boulder layer precision is not yet measured; treat boulder cover as "possible rock" when choosing a sampling spot.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Printable EVA cue card: what the crew carries on the wrist. Hidden on screen. */
export function CueCard() {
  const s = useStore();
  const plan = activePlanOf(s);
  const b = s.bundle;
  if (!plan || !b) return null;
  const hab = b.manifest.havens.find((h) => h.type === "habitat")!;
  const rows = plan.events.filter((e) => e.kind === "arrive").map((e, i) => {
    const t = b.manifest.targets.find((x) => x.id === e.stop)!;
    const smp = plan.samples.reduce((p, q) => (Math.abs(q.t - e.t) < Math.abs(p.t - e.t) ? q : p), plan.samples[0]);
    const leave = plan.events.find((x) => x.kind === "leave" && x.stop === e.stop)!;
    const turnBack = smp.timeLeft - smp.returnNeedS;
    return { i: i + 1, name: t.name, arrive: e.t, leave: leave.t, o2: smp.o2Left, home: smp.returnNeedS, turnBack, brg: bearing(hab.x - t.x, hab.y - t.y), dist: Math.hypot(hab.x - t.x, hab.y - t.y) };
  });
  return (
    <div className="cuecard" aria-hidden>
      <h1>Mars BEACON EVA cue card</h1>
      <p>Gale crater, Mount Sharp boxwork. Egress {formatLmst(s.evaStartLmst)} LMST, Ls {Math.round(s.lsDeg)}°. Plan: {plan.id === "balanced" ? "balanced" : plan.id === "maxMargin" ? "maximum margin" : "maximum science"}. Habitat at E {Math.round(hab.x)} m, N {Math.round(hab.y)} m in the site frame.</p>
      <table>
        <thead><tr><th>#</th><th>Stop</th><th>Arrive</th><th>Leave by</th><th>O₂ left EV1/EV2</th><th>Walk home</th><th>Spare before turn-back</th><th>Home bearing</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.i}><td>{r.i}</td><td>{r.name}</td><td>{hm(r.arrive)}</td><td>{hm(r.leave)}</td><td>{Math.round(r.o2[0])} / {Math.round(r.o2[1])} g</td><td>{Math.round(r.home / 60)} min</td><td>{Math.round(r.turnBack / 60)} min</td><td>{r.brg}° , {Math.round(r.dist)} m</td></tr>
          ))}
        </tbody>
      </table>
      <p>Airlock by {hm(plan.totalS)} after egress. Reserve margin {Math.round(s.reserveM * 100)}% on every return. If the helmet display shows the turn-back countdown at zero, walk home on the marked route.</p>
      <p className="cc-src">Return times from the Mars BEACON engine (DERIVED). Terrain USGS HiRISE DEM; sun Mars24.</p>
    </div>
  );
}

export function planSummary(plan: Plan | undefined) { return plan ? `${plan.order.length} stops, ${hm(plan.totalS)}` : ""; }

/** Execute: the next stop, when the crew gets there, and what it will look like. */
export function ExecuteNext() {
  const s = useStore();
  const plan = activePlanOf(s);
  const b = s.bundle;
  if (!plan || !b) return null;
  const next = plan.events.find((e) => e.kind === "arrive" && e.t > s.playheadS);
  const tgt = next ? b.manifest.targets.find((t) => t.id === next.stop) : null;
  const idx = next ? plan.order.indexOf(next.stop) + 1 : 0;
  return (
    <section className="pane exec-next" aria-label="Next stop">
      <header className="db-head">
        <h2>{tgt ? `Next: stop ${idx}` : "Walk home"}</h2>
        <span>{tgt ? `${tgt.name}, in ${Math.max(0, Math.round((next!.t - s.playheadS) / 60))} min` : `Airlock in ${Math.max(0, Math.round((plan.totalS - s.playheadS) / 60))} min`}</span>
        <button className="btn btn-quiet" onClick={() => s.set({ playing: !s.playing })}>{s.playing ? "Pause" : "Resume"}</button>
      </header>
      {tgt && <RoverViews stopId={tgt.id} compact />}
    </section>
  );
}
