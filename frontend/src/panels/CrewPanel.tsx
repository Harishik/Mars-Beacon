import { useStore } from "../store/store";
import { Reading, Tag } from "./Tag";
import { evaDoseMsv } from "../engine/environment";
import { consumablesLeft } from "../engine/physiology";

const fmtMin = (s: number) => `${Math.max(0, Math.round(s / 60))}`;

export function CrewPanel() {
  const crew = useStore((s) => s.crew);
  const setCrew = useStore((s) => s.setCrew);
  const tBudget = useStore((s) => s.timeBudgetS);
  const tSpent = useStore((s) => s.timeSpentS);
  const reserve = useStore((s) => s.reserveM);
  const roverActive = useStore((s) => s.roverActive);
  const env = useStore((s) => s.envelope);
  const cell = useStore((s) => s.bundle?.manifest.grid.liveM ?? 4);
  const set = useStore((s) => s.set);

  const storm = useStore((s) => s.storm);
  const areaKm2 = (env.insideCells * cell * cell) / 1e6;
  const dose = evaDoseMsv(tSpent, storm ? 10 : 1);
  const noReturn = env.margin && env.insideCells === 0;

  return (
    <aside className="pane crew" aria-label="Crew and resources" data-guide="crew-panel">
      <header className="pane-head">
        <h2>Crew and margins</h2>
        <span className={`status ${env.computing ? "busy" : "ready"}`}>{env.computing ? "Recomputing" : "Certified"}</span>
      </header>

      <div className="envelope-summary">
        {noReturn ? (
          <p className="no-return">No verified return path from the crew's position. Reduce load, restore pace or bring the rover closer.</p>
        ) : (
          <>
            <div>
              <Reading label="Reachable and returnable" value={areaKm2.toFixed(2)} unit="km²" tag="DERIVED" />
              {env.insideP90 && <span className="p90-note" title="Same certification on the 90th percentile slope from 16 DEM realisations. The striped amber band is the difference.">{((env.p90Cells * cell * cell) / 1e6).toFixed(2)} km² on P90 slopes</span>}
            </div>
            <Reading label="EVA time left" value={fmtMin(tBudget - tSpent)} unit="min" tag="SCENARIO" />
            <Reading label="Dose this EVA" value={dose.toFixed(2)} unit="mSv" tag={storm ? "SCENARIO" : "HISTORICAL"} />
          </>
        )}
      </div>

      {crew.map((c, i) => {
        const left = c.o2BudgetG - c.o2SpentG;
        const more = consumablesLeft(c, tSpent);
        const pct = Math.max(0, Math.min(100, (left / c.o2BudgetG) * 100));
        return (
          <section key={c.label} className={`crew-card crew-${i === 0 ? "a" : "b"}`}>
            <div className="crew-head">
              <span className="crew-name"><span className="crew-dot" aria-hidden />{c.label}</span>
              <span className="crew-o2"><b>{Math.round(left)}</b> g O₂ left <Tag t="SCENARIO" /></span>
            </div>
            <div className="meter" role="meter" aria-label={`${c.label} oxygen remaining`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="crew-more">
              <span><b>{(more.waterLeftG / 1000).toFixed(2)}</b> kg cooling water <Tag t="SCENARIO" /></span>
              <span><b>{Math.round(more.batteryLeftWh)}</b> Wh battery <Tag t="SCENARIO" /></span>
            </div>
            <div className="seg" role="group" aria-label={`${c.label} suit load`}>
              {[104, 186].map((kg) => (
                <button key={kg} aria-pressed={c.loadKg === kg} onClick={() => setCrew(i as 0 | 1, { loadKg: kg })}>
                  {kg === 104 ? "Suit 104 kg" : "Suit + tools 186 kg"}
                </button>
              ))}
            </div>
            <label className="slider">
              <span>Pace <b>{Math.round(c.fMob * 100)}%</b></span>
              <input type="range" min={0.3} max={1} step={0.05} value={c.fMob}
                onChange={(e) => setCrew(i as 0 | 1, { fMob: Number(e.target.value) })} />
            </label>
            <label className="slider">
              <span>O₂ used <b>{c.o2SpentG} g</b></span>
              <input type="range" min={0} max={c.o2BudgetG} step={10} value={c.o2SpentG}
                onChange={(e) => setCrew(i as 0 | 1, { o2SpentG: Number(e.target.value) })} />
            </label>
          </section>
        );
      })}

      <section className="haven-row">
        <button className="haven-toggle" role="switch" aria-checked={roverActive} onClick={() => set({ roverActive: !roverActive })}>
          <span className="switch" aria-hidden />
          <span>
            <span className="layer-name">Rover R1 (Variant A, pressurized concept) as a haven</span>
            <span className="layer-source">{roverActive ? "Counted: a return may end at R1. Radiation shielding not quantified" : "Not counted"}</span>
          </span>
        </button>
        <label className="slider">
          <span>EVA time used <b>{fmtMin(tSpent)} of {fmtMin(tBudget)} min</b></span>
          <input type="range" min={0} max={tBudget} step={60} value={tSpent} onChange={(e) => set({ timeSpentS: Number(e.target.value) })} />
        </label>
      </section>

      <footer className="pane-foot">
        Pair walks at the slower member's pace. Inside means time and both suits' oxygen fit with {Math.round(reserve * 100)}% reserve along one path.
        {env.ms > 0 && <> Engine {Math.round(env.ms)} ms.</>}
      </footer>
    </aside>
  );
}
