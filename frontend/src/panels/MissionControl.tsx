// Mission control dashboard: the flight-control view of the same mission state. Go/no-go for the EVA,
// both crew members, the safety board (radiation, climate, terrain, assets), communication delay to
// Earth and an event log. Every value is tagged; nothing here is suit telemetry.
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { activePlanOf, MARS_HOUR_S } from "../engine/useMission";
import { sunMars24, formatLmst } from "../engine/sun";
import { directIrradiance, evaDoseMsv, tauAtElevation, RAD_GY_PER_DAY, RAD_QUALITY } from "../engine/environment";
import { earthMarsLightTime } from "../engine/lighttime";
import { reportAt } from "../engine/query";
import { useLiveWeather, ageText } from "../engine/liveWeather";
import { radioCoverage, routeRadio } from "../engine/radio";
import { useAtmosphere, seasonalTau, pressureAt } from "../engine/atmosphere";
import { useVisor } from "../engine/useVisor";
import { temperatureAt } from "../engine/overlays";
import { toCell } from "../data/bundle";
import { Tag } from "./Tag";
import type { Tag as TagT } from "../data/bundle";
import { consumablesLeft } from "../engine/physiology";

/** NASA-STD-3001 Vol. 1 Rev. B (2022): career effective dose limit 600 mSv for all astronauts. */
const CAREER_LIMIT_MSV = 600;
/** Solar particle event warning lead time we plan to (ASSUMPTION; forecast lead times vary). */
import { SPE_LEAD_MIN } from "./SpaceAlert";
/** Habitat array for the power estimate (ASSUMPTION): 20 m2 at 25 % efficiency. */
const ARRAY_M2 = 20, ARRAY_EFF = 0.25;
/** Dust optical depth above which we hold EVAs (ASSUMPTION, about a regional storm). */
const TAU_HOLD = 2;

const fmtT = (s: number) => `${Math.floor(Math.max(0, s) / 3600)}:${String(Math.floor((Math.max(0, s) % 3600) / 60)).padStart(2, "0")}`;
const fmtD = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

type Status = "go" | "watch" | "nogo";
interface Check { label: string; status: Status; value: string; why: string; tag: TagT }

export function MissionControl() {
  const s = useStore(useShallow((st) => ({
    bundle: st.bundle, crew: st.crew, lsDeg: st.lsDeg, lmst: st.lmstHours, tau: st.tau, storm: st.storm, playheadS: st.playheadS,
    spent: st.timeSpentS, budget: st.timeBudgetS, crewPos: st.crewPos, roverActive: st.roverActive, evaStart: st.evaStartLmst,
    plans: st.plans, activePlan: st.activePlan, reserveM: st.reserveM,
  })));
  const atm = useAtmosphere();
  const live = useLiveWeather();
  const dk = live.donki, rm = live.rems;
  const v = useVisor();
  const b = s.bundle;
  const plan = activePlanOf({ plans: s.plans, activePlan: s.activePlan });
  const o = b?.manifest.crs.origin;
  const sun = sunMars24(s.lsDeg, s.lmst, o?.lat ?? -4.8, o?.lon ?? 137.38);
  const lt = earthMarsLightTime(sun.utcMs);
  const tauSite = tauAtElevation(s.storm ? Math.max(s.tau, 3) : s.tau, -3.6);
  const dust = atm?.tau880 ? seasonalTau(atm.tau880, s.lsDeg) : null;
  const irr = directIrradiance(s.lsDeg, sun.elevationDeg, tauSite);
  const powerKw = (irr * ARRAY_M2 * ARRAY_EFF) / 1000;
  const refSol = b?.manifest.targets.find((t) => t.id === plan?.order[0])?.sol ?? null;
  const pres = atm && refSol ? pressureAt(atm, refSol, sun.ltstH) : null;
  const ret = b && s.crewPos ? reportAt(b, useStore.getState(), s.crewPos.x, s.crewPos.y) : null;
  const doseRate = RAD_GY_PER_DAY * RAD_QUALITY * 1000 * (s.storm ? 10 : 1);
  const doseNow = evaDoseMsv(s.spent, s.storm ? 10 : 1);
  const dosePlan = plan ? evaDoseMsv(plan.totalS, s.storm ? 10 : 1) : 0;
  const ground = b && s.crewPos ? (() => { const [c, r] = toCell(b.manifest, s.crewPos.x, s.crewPos.y); return Math.round(temperatureAt(b, Math.round(s.lsDeg), tauSite, Math.round(s.lmst * 6) / 6, r * b.manifest.grid.cols + c)); })() : null;
  const steepOnRoute = useMemo(() => {
    if (!b || !plan) return 0;
    let mx = 0; for (const leg of plan.legs) for (const c of leg.cells) mx = Math.max(mx, Math.min(60, b.slopeDeg[c]));
    return mx;
  }, [b, plan]);
  const shelterMin = ret?.reachable ? ret.walkHomeS / 60 : Infinity;
  const radio = useMemo(() => {
    if (!b || !plan) return null;
    const cov = radioCoverage(b, s.roverActive);
    return cov ? routeRadio(cov, plan.samples) : null;
  }, [b, plan, s.roverActive]);

  const checks: Check[] = [
    { label: "Every stop returnable with reserve", status: !plan ? "nogo" : plan.minMargin > 0.3 ? "go" : plan.minMargin > 0 ? "watch" : "nogo", value: plan ? `min margin ${Math.round(plan.minMargin * 100)}%` : "no plan", why: `Return Envelope with ${Math.round(s.reserveM * 100)}% reserve on time and both suits' O₂`, tag: "DERIVED" },
    { label: "Dust", status: tauSite >= TAU_HOLD ? "nogo" : tauSite >= 1.2 ? "watch" : "go", value: `τ ${tauSite.toFixed(2)}`, why: `Hold EVAs at τ ≥ ${TAU_HOLD} (assumption)`, tag: s.storm ? "SCENARIO" : dust ? "DERIVED" : "ASSUMPTION" },
    { label: "Radiation, solar particle event", status: s.storm || dk?.level === "alert" ? (shelterMin <= SPE_LEAD_MIN ? "watch" : "nogo") : dk?.level === "watch" ? "watch" : "go", value: s.storm || dk?.level === "alert" ? `shelter ${Number.isFinite(shelterMin) ? Math.round(shelterMin) + " min" : "out of reach"}` : dk && dk.state !== "unavailable" ? (dk.level === "watch" ? "DONKI watch" : "DONKI quiet") : "no live feed", why: `During an event the crew must reach the habitat${s.roverActive ? " or R1" : ""} within the ${SPE_LEAD_MIN} min warning lead (assumption). Live: ${dk?.summary ?? "fetching DONKI"}`, tag: s.storm ? "SCENARIO" : dk?.state === "live" ? "OBSERVED" : "HISTORICAL" },
    { label: "Daylight at egress and return", status: sun.elevationDeg > 10 ? "go" : sun.elevationDeg > 0 ? "watch" : "nogo", value: `sun ${sun.elevationDeg.toFixed(0)}°`, why: "Sun above 10° for footing and power", tag: "PREDICTED" },
    { label: "Steepest ground on the route", status: steepOnRoute > 20 ? "nogo" : steepOnRoute > 15 ? "watch" : "go", value: `${steepOnRoute.toFixed(0)}°`, why: "4 m slope on the planned path cells; no-go above the slope limit", tag: "DERIVED" },
    { label: "Radio line of sight on the route", status: !radio ? "watch" : radio.share >= 0.9 && radio.longestGapS <= 5 * 60 ? "go" : "watch", value: radio ? `${Math.round(radio.share * 100)}%, longest gap ${Math.round(radio.longestGapS / 60)} min` : "–", why: `Helmet to habitat antenna${s.roverActive ? " or the R1 relay" : ""} over the DEM (mast heights assumed). ${radio && radio.longestGapS > 15 * 60 ? (s.roverActive ? "Gaps over 15 min remain: move R1 to a ridge as a relay." : "Gaps over 15 min: count R1 as a relay or plan check-in calls before each gap.") : "Watch if any gap is over 5 min."}`, tag: "DERIVED" },
    { label: "Habitat power from the array", status: powerKw > 0.5 ? "go" : powerKw > 0.1 ? "watch" : "nogo", value: `${powerKw.toFixed(2)} kW now`, why: `${ARRAY_M2} m² at ${ARRAY_EFF * 100}% (assumption), direct sunlight through the dust`, tag: "DERIVED" },
  ];
  const overall: Status = checks.some((c) => c.status === "nogo") ? "nogo" : checks.some((c) => c.status === "watch") ? "watch" : "go";

  const events = useMemo(() => {
    if (!plan || !b) return [] as { t: number; text: string }[];
    const name = (id: string) => (id === "home" ? "habitat" : b.manifest.targets.find((t) => t.id === id)?.name.split(",")[0] ?? id);
    const ev = plan.events.map((e) => ({ t: e.t, text: e.kind === "depart" ? "Egress from the habitat airlock" : e.kind === "arrive" ? `Arrive ${name(e.stop)}, start sampling` : e.kind === "leave" ? `Leave ${name(e.stop)}` : "Return to the airlock" }));
    const turn = plan.samples.find((q) => q.timeLeft - q.returnNeedS < 15 * 60);
    if (turn) ev.push({ t: turn.t, text: "Turn-back window under 15 min (caution)" });
    return ev.sort((a, c) => a.t - c.t);
  }, [plan, b]);

  return (
    <div className="mc" aria-label="Mission control dashboard">
      <section className="mc-col">
        <div className={`mc-go mc-${overall}`}>
          <span>EVA-01 STATUS</span>
          <b>{overall === "go" ? "GO" : overall === "watch" ? "GO, WATCH ITEMS" : "NO-GO"}</b>
          <em>{formatLmst(s.lmst)} LMST · MET {fmtT(s.playheadS)} · Ls {Math.round(s.lsDeg)}°</em>
        </div>
        <ul className="mc-checks">
          {checks.map((c) => (
            <li key={c.label} className={`mc-s-${c.status}`} title={c.why}>
              <i aria-hidden /><span>{c.label}<small>{c.why}</small></span><b>{c.value}</b><Tag t={c.tag} />
            </li>
          ))}
        </ul>
        <div className="mc-box">
          <h3>Communication with Earth</h3>
          <div className="mc-big"><b>{(lt.oneWayS / 60).toFixed(1)} min</b><span>one way, {lt.distanceAU.toFixed(2)} AU <Tag t="DERIVED" /></span></div>
          <p>Round trip {(2 * lt.oneWayS / 60).toFixed(0)} min: Earth cannot help in real time, so go/no-go and turn-back decisions sit with the crew and the habitat.</p>
        </div>
      </section>

      <section className="mc-col">
        <h3 className="mc-h">Crew</h3>
        {s.crew.map((c, i) => (
          <div key={c.label} className="mc-crew">
            <header><b>E{i + 1}</b><span>{i === 0 ? "EV1" : "EV2"} · suit load {c.loadKg} kg · pace {Math.round(c.fMob * 100)}%</span></header>
            <dl>
              <div><dt>O₂ left</dt><dd>{((c.o2BudgetG - c.o2SpentG) / 1000).toFixed(2)} kg</dd><Tag t="DERIVED" /></div>
              <div><dt>Water, battery</dt><dd>{(() => { const m = consumablesLeft(c, s.spent); return `${(m.waterLeftG / 1000).toFixed(2)} kg, ${Math.round(m.batteryLeftWh)} Wh`; })()}</dd><Tag t="DERIVED" /></div>
              <div><dt>O₂ use now</dt><dd>{v?.suit ? `${Math.round(v.suit.o2gph)} g/h (pair pace)` : "–"}</dd><Tag t="DERIVED" /></div>
              <div><dt>Work rate, HR</dt><dd>{v?.suit ? `${Math.round(v.suit.watts)} W, ${v.suit.hr} bpm` : "–"}</dd><Tag t="ASSUMPTION" /></div>
              <div><dt>Dose this EVA</dt><dd>{doseNow.toFixed(2)} mSv</dd><Tag t={s.storm ? "SCENARIO" : "HISTORICAL"} /></div>
            </dl>
          </div>
        ))}
        <div className="mc-box">
          <h3>Return</h3>
          <dl className="mc-dl">
            <div><dt>Turn back in</dt><dd>{ret?.reachable ? `${Math.max(0, Math.floor(ret.stayMin))} min` : "outside envelope"}</dd></div>
            <div><dt>Walk home now</dt><dd>{ret?.reachable ? `${Math.round(ret.walkHomeS / 60)} min, ${fmtD(ret.distanceM)}` : "no certified path"}</dd></div>
            <div><dt>Limiting resource</dt><dd>{ret?.limitedBy ?? "–"}</dd></div>
            <div><dt>EVA time left</dt><dd>{Math.round((s.budget - s.spent) / 60)} min</dd></div>
            <div><dt>Rover R1</dt><dd>{s.roverActive ? "counted as a haven" : "not counted"}</dd></div>
          </dl>
        </div>
      </section>

      <section className="mc-col">
        <h3 className="mc-h">Safety board</h3>
        <div className="mc-box">
          <h3>Radiation</h3>
          <dl className="mc-dl">
            <div><dt>Surface dose rate</dt><dd>{doseRate.toFixed(2)} mSv/day {s.storm ? "(event ×10)" : ""}</dd></div>
            <div><dt>This EVA, planned</dt><dd>{dosePlan.toFixed(2)} mSv = {((dosePlan / CAREER_LIMIT_MSV) * 100).toFixed(3)}% of the 600 mSv career limit</dd></div>
            <div><dt>Shelter</dt><dd>habitat{s.roverActive ? " or R1 (shielding not quantified)" : ""}, {Number.isFinite(shelterMin) ? `${Math.round(shelterMin)} min walk` : "out of reach"}</dd></div>
          </dl>
          <p>Curiosity RAD surface average (Hassler et al. 2014), quality factor 3.05; limit from NASA-STD-3001.</p>
        </div>
        <div className={`mc-box mc-live sw-${dk?.level ?? "na"}`}>
          <h3>Space weather, NASA DONKI <span className="mc-feed">{dk ? `${dk.state === "live" ? "LIVE" : dk.state === "snapshot" ? "SNAPSHOT" : "OFFLINE"} · ${ageText(dk.fetchedAt)}` : "fetching"}</span></h3>
          <div className="mc-big"><b>{!dk ? "…" : dk.state === "unavailable" ? "No feed" : dk.level === "quiet" ? "Quiet" : dk.level === "watch" ? "Watch" : "Alert"}</b><span>{dk?.state === "unavailable" ? "Live fetch failed; the radiation check falls back to the RAD average and the storm scenario" : dk?.summary}</span></div>
          <dl className="mc-dl">
            <div><dt>Flares, last {dk?.windowDays ?? 7} days</dt><dd>{dk ? (dk.flares.length ? `${dk.flares.length}, largest ${[...dk.flares].sort((a, b) => b.cls.localeCompare(a.cls))[0].cls}` : "none") : "–"}</dd></div>
            <div><dt>SEP events</dt><dd>{dk ? (dk.seps.length ? dk.seps.slice(0, 2).map((e) => e.time.slice(5, 16).replace("T", " ")).join(", ") + " UTC" : "none") : "–"}</dd></div>
            <div><dt>CMEs modelled to reach Mars</dt><dd>{dk ? (dk.marsCmes.length ? dk.marsCmes.map((c) => `${c.arrival.slice(5, 16).replace("T", " ")} UTC`).join(", ") : "none") : "–"}</dd></div>
            <div><dt>Mars from Earth, around the Sun</dt><dd>{dk ? `${Math.round(dk.separationDeg)}°${dk.separationDeg > 60 ? ", Earth-side events are a weak guide" : ""}` : "–"}</dd></div>
          </dl>
          <p>{dk && dk.state !== "unavailable" ? `Source: ${dk.source}. ` : ""}{dk?.note ? `Fetch log: ${dk.note}. ` : ""}Flares and SEPs are observed from near Earth; Mars-bound CMEs come from the WSA-ENLIL model runs in DONKI.</p>
        </div>
        <div className="mc-box">
          <h3>Atmosphere and climate</h3>
          <dl className="mc-dl">
            <div><dt>Dust optical depth</dt><dd>τ {tauSite.toFixed(2)}{dust && !s.storm ? ` (range ${dust.lo.toFixed(2)} to ${dust.hi.toFixed(2)})` : s.storm ? " storm scenario" : ""}</dd></div>
            <div><dt>Air pressure</dt><dd>{pres ? `${Math.round(pres.pa)} Pa, REMS sol ${refSol}` : "no REMS reading at this time"}</dd></div>
            <div><dt>Ground at the crew</dt><dd>{ground !== null ? `${ground} °C (model)` : "–"}</dd></div>
            <div><dt>Sunlight</dt><dd>{Math.round(irr)} W/m² direct, sun {sun.elevationDeg.toFixed(0)}°</dd></div>
            <div><dt>Latest Curiosity sol (REMS)</dt><dd>{rm?.latest ? `sol ${rm.latest.sol}, ${rm.latest.date}: air ${rm.latest.minC} to ${rm.latest.maxC} °C, ground ${rm.latest.groundMinC} to ${rm.latest.groundMaxC} °C, ${rm.latest.pressurePa} Pa, UV ${rm.latest.uv.toLowerCase()}` : rm ? "feed unreachable" : "fetching"}</dd></div>
          </dl>
          {rm?.latest && <p>{rm.state === "live" ? "Live" : "Snapshot of the"} NASA/JPL Mars weather feed{rm.ageDays !== null ? `; the newest published sol is ${Math.round(rm.ageDays)} days old (the instrument team publishes with a lag)` : ""}. Measured at Gale by Curiosity.</p>}
        </div>
        <div className="mc-box">
          <h3>Event log</h3>
          <ol className="mc-log">
            {events.map((e, i) => (
              <li key={i} className={e.t <= s.playheadS ? "done" : ""}><time>{fmtT(e.t)}</time><span>{e.text}</span><em>{formatLmst((s.evaStart + e.t / MARS_HOUR_S) % 24)}</em></li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
