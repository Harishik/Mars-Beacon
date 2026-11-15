// Equations and assumptions: every modelling choice visible, tagged and adjustable.
import { useEffect, useRef } from "react";
import { useStore } from "../store/store";
import { WORK_POWER_W } from "../engine/query";
import { Tag } from "./Tag";
import { HAZARD_LIMITS } from "../engine/hazards";
import type { Tag as TagT } from "../data/bundle";

interface Param { key: "v0" | "slopeLimitDeg" | "reserveM" | "kG" | "mRestW"; name: string; unit: string; min: number; max: number; step: number; tag: TagT; note: string; fmt?: (v: number) => string }

const PARAMS: Param[] = [
  { key: "v0", name: "Flat-ground pace, v0", unit: "m/s", min: 0.4, max: 1.0, step: 0.05, tag: "ASSUMPTION", note: "Apollo treated about 1 m/s as the maximum nominal walking speed" },
  { key: "slopeLimitDeg", name: "Slope limit", unit: "°", min: 10, max: 25, step: 1, tag: "ASSUMPTION", note: "Steeper cells are no-go" },
  { key: "reserveM", name: "Reserve margin, m", unit: "%", min: 0, max: 0.5, step: 0.05, tag: "ASSUMPTION", note: "Every return cost is multiplied by 1 + m", fmt: (v) => `${Math.round(v * 100)}` },
  { key: "kG", name: "Gravity and suit factor, k_g", unit: "", min: 0.4, max: 1.2, step: 0.02, tag: "DERIVED", note: "0.78 fitted by Sahaj to NASA/TM-2010-216138 Fig. 10 (suited walking at Mars gravity)" },
  { key: "mRestW", name: "Resting power, M_rest", unit: "W", min: 60, max: 160, step: 5, tag: "ASSUMPTION", note: "Suited crew member standing" },
];

const EQUATIONS: { name: string; eq: string; src: string; tag: TagT }[] = [
  { name: "Walking speed", eq: "v = v0 · f_mob · e^(-3.5 |i + 0.05|) / e^(-0.175)", src: "Tobler (1993) hiking function, normalised to v0", tag: "ASSUMPTION" },
  { name: "Cost of walking on a grade", eq: "C(i) = 280.5i⁵ - 58.7i⁴ - 76.8i³ + 51.9i² + 19.6i + 2.5  J/(kg·m)", src: "Minetti et al. (2002)", tag: "DERIVED" },
  { name: "Suited metabolic power", eq: "M = M_rest + k_g · η · C(i) · (W + L) · v", src: "η = terrain factor, W = body, L = suit and load", tag: "ASSUMPTION" },
  { name: "Oxygen use", eq: "O₂ (g/h) = M · 3.6 / 20.1 · 1.429", src: "20.1 kJ per litre O₂ at RER 0.85; 696 W gives 178 g/h (conversion check only)", tag: "DERIVED" },
  { name: "Pair pace", eq: "Δt_pair = max(Δt_EV1, Δt_EV2)", src: "The pair walks at the slower member's pace", tag: "ASSUMPTION" },
  { name: "Ground temperature", eq: "ρc ∂T/∂t = ∂/∂z(k ∂T/∂z);  k ∂T/∂z|₀ = (1 − A)·S_slope + ε·L_sky − εσT⁴", src: "1D conduction per slope and aspect class, run to a repeating sol. I = √(kρc) = 350, A = 0.22, ε = 0.98, ρc = 1.2 MJ/m³K, L_sky = 4% of noon sunlight. Flat ground at Gale, Ls 150: −87 to −8.5 °C, inside the REMS range", tag: "DERIVED" },
  { name: "Sunlight on a slope", eq: "S = I_dir·max(0, cos z cos γ + sin z sin γ cos(φ_sun − φ_slope)) + I_dif·(1 + cos γ)/2", src: "I_dir = S₀(Ls)·e^(−τ·m(z)); diffuse = 0.75 of the light removed from the beam (dust scatters forward)", tag: "DERIVED" },
  { name: "Inside the Return Envelope", eq: "Spent + (1 + m) · PathCost + Reserve ≤ Budget, for time and each suit's O₂, on one path", src: "Multi-haven reverse Dijkstra, 16-neighbour lattice", tag: "DERIVED" },
];

export function Ledger() {
  const open = useStore((s) => s.ledger);
  const set = useStore((s) => s.set);
  const st = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") set({ ledger: false }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, set]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={() => set({ ledger: false })}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Equations and assumptions" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>Equations and assumptions</h2>
          <button className="btn btn-quiet" onClick={() => set({ ledger: false })}>Close</button>
        </header>
        <div className="sheet-body">
          <section>
            <h3>Model inputs</h3>
            <p className="sheet-note">Change any value and the Return Envelope recomputes. Values tagged Assumption are our modelling choices, not measurements.</p>
            <div className="params">
              {PARAMS.map((p) => {
                const v = st[p.key];
                return (
                  <label key={p.key} className="param">
                    <span className="param-top"><span>{p.name}<Tag t={p.tag} /></span><b>{p.fmt ? p.fmt(v) : v}{p.unit && ` ${p.unit}`}</b></span>
                    <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => set({ [p.key]: Number(e.target.value) })} />
                    <span className="param-note">{p.note}</span>
                  </label>
                );
              })}
              <div className="param static">
                <span className="param-top"><span>Work power at a stop<Tag t="ASSUMPTION" /></span><b>{WORK_POWER_W} W</b></span>
                <span className="param-note">Used for the turn-back time while sampling</span>
              </div>
              <div className="param static">
                <span className="param-top"><span>Suit O₂ budget and EVA time<Tag t="SCENARIO" /></span><b>{st.crew[0].o2BudgetG} g, {Math.round(st.timeBudgetS / 60)} min</b></span>
                <span className="param-note">Placeholders until cited suit figures are found</span>
              </div>
            </div>
          </section>
          <section>
            <h3>Equations</h3>
            <ul className="eqs">
              {EQUATIONS.map((e) => (
                <li key={e.name}>
                  <span className="eq-name">{e.name}<Tag t={e.tag} /></span>
                  <code className="eq">{e.eq}</code>
                  <span className="eq-src">{e.src}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Risk thresholds at a stop</h3>
            <ul className="limits">
              <li>Slope: caution above {HAZARD_LIMITS.slopeCaution}° (P90 within 12 m), high above 20° <Tag t="ASSUMPTION" /></li>
              <li>Boulders: caution above {HAZARD_LIMITS.rocksCaution}% cover, high above {HAZARD_LIMITS.rocksHigh}% <Tag t="ASSUMPTION" /></li>
              <li>Ground temperature at arrival: caution below {HAZARD_LIMITS.coldCaution} °C, high below {HAZARD_LIMITS.coldHigh} °C <Tag t="ASSUMPTION" /></li>
              <li>Dose so far: caution above {HAZARD_LIMITS.doseCaution} mSv, high above {HAZARD_LIMITS.doseHigh} mSv <Tag t="ASSUMPTION" /></li>
              <li>Time on site before turn-back: caution under {HAZARD_LIMITS.marginCaution} min, high under {HAZARD_LIMITS.marginHigh} min <Tag t="ASSUMPTION" /></li>
            </ul>
            <h3>Limits of this build</h3>
            <ul className="limits">
              <li>Certification uses one search tree (least pair time). A second tree minimising oxygen will be added; until then a feasible cell can be missed, never an infeasible one certified.</li>
              <li>Sun from the Mars24 algorithm (Allison and McEwen 2000), checked against the NASA GISS worked examples. The season slider picks the first date from 15 Nov 2026 at that solar longitude.</li>
              <li>The thermal model uses one thermal inertia for the whole site and ignores cast shadows; rock and sand differ. A THEMIS inertia map would set it per pixel.</li>
              <li>No radiation shelter layer yet: shelter needs overhang or habitat geometry, not available for this site.</li>
              <li>Terrain is the USGS HiRISE 1 m DEM and 25 cm orthophoto (Sahaj's L0 bundle). No-go uses the 4 m slope; the P90 band uses 16 DEM realisations.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
