import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { Scene } from "../render/Scene";
import { story } from "../render/StoryCamera";
import { anim } from "../render/Terrain";
import { CREW } from "../render/Crew";
import { reportAt } from "../engine/query";
import { activePlanOf } from "../engine/useMission";
import { mars24 } from "../engine/mars24";
import { formatLmst } from "../engine/sun";
import { useLiveWeather } from "../engine/liveWeather";
import { Wordmark } from "./Wordmark";


const LINEAGE = [
  ["Apollo lunar traverse maps", "Planned stops on photo maps, with a walk-back limit on how far the crew could go from the lunar module.", "We replace the fixed distance limit with a boundary computed from terrain, suits, pace and consumables."],
  ["NASA Worldview (Earth)", "A time slider and a layer drawer over daily satellite imagery, with shareable views.", "Our layer drawer and time bar follow the same pattern."],
  ["JPL Mars Trek", "Global and regional Mars layers in the browser.", "We use Trek's MOLA, CTX and Viking services for the setting, then go to the few square kilometres of one Marswalk."],
  ["JPL Experience Curiosity", "Rover-eye views of real Mars terrain in the browser.", "Our eye-level views follow the same idea: real terrain in natural colour, with planning overlays kept off the ground."],
  ["Artemis surface planning", "Walk-back distance limits and paired crew operations for the lunar south pole.", "Two-person crew rules and a moving rover haven are built into the engine."],
];

const BRIEF = [
  ["Map, tool or interface a Mars astronaut could use", "Habitat console, mission control, field tablet, helmet visor and rover cockpit from one mission state"],
  ["Start from science goals and a location", "Ridge against hollow in the Mount Sharp boxwork, where Curiosity worked in 2025 and 2026"],
  ["Details of routes and destinations", "Every stop shows whether it is reachable now, the route home, the time to turn back and its hazards; routes export as GeoJSON and 10 m waypoint tables"],
  ["Updates on current conditions", "Live Curiosity REMS weather and NASA DONKI space weather, the Mars sun by local solar time, seasonal dust"],
  ["At least three kinds of data", "Topographic, optical, rover imagery, atmospheric, radiation and space weather"],
  ["Astronaut safety, radiation, space weather", "The Return Envelope, a go/no-go safety board, RAD dose against the career limit, a shelter alert on every display when DONKI or the scenario raises a solar event, radio line of sight to the habitat"],
  ["Suits and equipment affect mobility", "Suit load and pace change speed, oxygen use and the envelope live"],
  ["Avoid large rock formations", "Steep ground is no-go; detected boulders are shown in 3D and flagged on the route ahead"],
  ["Rovers or paired astronauts", "Park the rover to add a second haven; the pair walks at the slower member's pace"],
  ["Other sites", "The same pipeline runs on Jezero crater (Perseverance stops) from a site picker"],
];

const DATA = [
  ["Topographic", "MRO HiRISE 1 m elevation model (USGS); MGS MOLA for the 160 km setting"],
  ["Optical", "MRO HiRISE 25 cm orthophoto at full resolution when zoomed in; MRO CTX; Viking orbital colour (via JPL Mars Trek)"],
  ["Rover imagery", "Curiosity Navcam frames; AI4Mars expert labels to train the terrain classifier"],
  ["Machine learning", "Terrain classes on rover images (mIoU 0.81 on held-out frames); boulders from HiRISE shadows"],
  ["Atmospheric", "Curiosity 880 nm dust climatology, REMS pressure, live REMS daily weather"],
  ["Radiation", "Curiosity RAD surface dose, NASA-STD-3001 career limit"],
  ["Space weather", "NASA DONKI flares, SEP events and CMEs modelled to reach Mars, live"],
];

const CHAPTERS = ["Gale crater", "The ridge", "The crew", "The way home", "Pick a point", "Walk the plan"];
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

/** Gale crater's local mean solar time now (Mars24), ticking once a second, plus the latest Curiosity REMS sol. */
function LiveSite() {
  const lon = useStore((s) => s.bundle?.manifest.crs.origin.lon ?? 137.38);
  const lat = useStore((s) => s.bundle?.manifest.crs.origin.lat ?? -4.8);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const m = mars24(now, lon, lat);
  const rems = useLiveWeather().rems?.latest;
  return (
    <dl className="live-site" aria-label="Gale crater now">
      <div><dt>Local time at the site</dt><dd className="num">{formatLmst(m.LMST_h)}</dd></div>
      <div><dt>Mars date</dt><dd className="num">Ls {Math.round(m.Ls)}°</dd></div>
      {rems && <div><dt>Curiosity, sol {rems.sol}</dt><dd className="num">{rems.minC} to {rems.maxC} °C</dd></div>}
    </dl>
  );
}

/** Chapter 4: the answer for the point the visitor clicked, from the same engine the app uses. */
function PointReadout() {
  const r = useStore(useShallow((s) => {
    if (!s.bundle || !s.selected || s.selected.label === "Crew position") return null;
    const q = reportAt(s.bundle, s, s.selected.x, s.selected.y);
    return q ? { walk: q.walkHomeS, dist: q.distanceM, o2: q.o2HomeG[0], stay: q.stayMin, limit: q.limitedBy, ok: q.reachable && q.inside && q.stayMin >= 0, reachable: q.reachable, haven: q.haven } : null;
  }));
  if (!r) return <p className="readout-empty">Click anywhere on the ground</p>;
  if (!r.reachable) return <div className="readout out"><b>No way home in time</b><span>Too steep or too far for the suits' budget. Try closer to the habitat.</span></div>;
  return (
    <div className={`readout ${r.ok ? "ok" : "tight"}`} aria-live="polite">
      <b>{r.ok ? "Safe to go" : "Outside the envelope"}</b>
      <dl>
        <div><dt>Walk back to the {r.haven.toLowerCase()}</dt><dd className="num">{Math.round(r.walk / 60)} min, {(r.dist / 1000).toFixed(2)} km</dd></div>
        <div><dt>EV1 oxygen for the walk</dt><dd className="num">{Math.round(r.o2)} g</dd></div>
        <div><dt>Time to work there</dt><dd className="num">{r.stay > 0 ? `${Math.floor(r.stay)} min` : "none"}</dd></div>
        <div><dt>Limited by</dt><dd>{r.limit}</dd></div>
      </dl>
    </div>
  );
}

/** Chapter 5: the walk as the visitor scrolls. */
function WalkReadout() {
  const w = useStore(useShallow((s) => {
    const plan = activePlanOf(s);
    if (!plan || !s.bundle) return null;
    const next = plan.events.find((e) => e.kind === "arrive" && e.t > s.playheadS);
    const name = next ? s.bundle.manifest.targets.find((t) => t.id === next.stop)?.name ?? "" : "Habitat airlock";
    return { t: s.playheadS, total: plan.totalS, o2a: s.crew[0].o2BudgetG - s.crew[0].o2SpentG, o2b: s.crew[1].o2BudgetG - s.crew[1].o2SpentG, next: name.split(",")[0] };
  }));
  if (!w) return null;
  return (
    <dl className="walk-readout">
      <div><dt>Since leaving the airlock</dt><dd className="num">{hm(w.t)} <small>of {hm(w.total)}</small></dd></div>
      <div><dt>Oxygen left</dt><dd className="num"><i style={{ background: CREW[0].color }} />{(w.o2a / 1000).toFixed(2)} kg <i style={{ background: CREW[1].color }} />{(w.o2b / 1000).toFixed(2)} kg</dd></div>
      <div><dt>Heading for</dt><dd>{w.next}</dd></div>
    </dl>
  );
}

export function Landing() {
  const bundle = useStore((s) => s.bundle);
  const chapter = useStore((s) => s.storyChapter);
  const sol = (bundle?.manifest.route as { sols?: number[] } | undefined)?.sols?.[1];
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [fill, setFill] = useState(0);

  // Low morning sun: raking light across the ridges. Everything the story changes is put back on the way out.
  useEffect(() => {
    const st = useStore.getState();
    st.set({ lmstHours: 7.5, storyChapter: 0, selected: null, playheadS: 0, playing: false, layers: { ...st.layers, envelope: false } });
    return () => {
      const s = useStore.getState();
      s.set({ lmstHours: s.evaStartLmst, storyChapter: -1, selected: null, playheadS: 0, layers: { ...s.layers, envelope: true } });
    };
  }, []);

  // Scroll to story progress: the camera reaches chapter i when its section is centred in the viewport.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const vh = window.innerHeight, y = window.scrollY + vh / 2;
      const secs = refs.current.filter(Boolean) as HTMLElement[];
      let i = 0;
      while (i < secs.length - 1 && y >= secs[i + 1].offsetTop) i++;
      const sec = secs[i];
      const frac = Math.max(0, Math.min(1, (y - sec.offsetTop) / sec.offsetHeight));
      let p = i - 0.5 + frac;
      if (i === 5) {
        p = 5;
        // The walk: scrolling through the tall section scrubs the plan from egress to the airlock.
        const s = useStore.getState(), plan = activePlanOf(s);
        const k = Math.max(0, Math.min(1, (window.scrollY - sec.offsetTop) / Math.max(1, sec.offsetHeight - vh)));
        if (plan) { const t = Math.round(k * plan.totalS); if (t !== s.playheadS) s.set({ playheadS: t }); }
      }
      story.p = Math.max(0, Math.min(5, p));
      setFill(story.p / 5);
      const ch = Math.max(0, Math.min(5, Math.round(story.p)));
      const st = useStore.getState();
      if (ch !== st.storyChapter) {
        const patch: Parameters<typeof st.set>[0] = { storyChapter: ch };
        if ((ch >= 3) !== st.layers.envelope) patch.layers = { ...st.layers, envelope: ch >= 3 };
        if (ch === 3 && st.storyChapter < 3) anim.reveal = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0;
        if (ch < 5 && st.playheadS !== 0) patch.playheadS = 0;
        if (ch !== 4 && st.selected) patch.selected = null;
        st.set(patch);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const onPointer = (e: PointerEvent) => { story.pointerX = (e.clientX / window.innerWidth) * 2 - 1; story.pointerY = (e.clientY / window.innerHeight) * 2 - 1; };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); window.removeEventListener("pointermove", onPointer); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const go = (i: number) => refs.current[i]?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: i === 5 ? "start" : "center" });
  const sec = (i: number) => (el: HTMLElement | null) => { refs.current[i] = el; };

  return (
    <div className={`landing story-ch-${chapter}`}>
      <div className="story-stage" aria-hidden={chapter !== 4}>
        {bundle && <Scene bundle={bundle} mode="story" />}
        <div className="story-scrim" aria-hidden />
      </div>

      <nav className="landing-nav" aria-label="Main">
        <Wordmark />
        <div className="nav-links">
          <a href="#data">NASA data</a>
          <a href="#team">Team</a>
          <a className="btn btn-quiet" href="#/app">Open the map</a>
        </div>
      </nav>

      <nav className="story-rail" aria-label="Chapters">
        <span className="rail-line" aria-hidden><span style={{ transform: `scaleY(${fill})` }} /></span>
        {CHAPTERS.map((c, i) => (
          <button key={c} className={chapter === i ? "on" : ""} aria-current={chapter === i ? "step" : undefined} onClick={() => go(i)}>
            <span className="rail-tick" aria-hidden /><span className="rail-label">{c}</span>
          </button>
        ))}
      </nav>

      <main className="story">
        <section ref={sec(0)} className="chapter hero-ch" aria-label="Introduction">
          <div className="ch-copy">
            <h1>Every step on Mars needs a way home</h1>
            <p className="lede">Mars BEACON plans a two-person walk on real NASA terrain in Gale crater and checks, for every 4 m of ground, that both astronauts can still get back to the habitat.</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#/app">Open the mission map</a>
              <button className="btn btn-ghost" onClick={() => go(1)}>Fly to the site</button>
            </div>
          </div>
          <LiveSite />
        </section>

        <section ref={sec(1)} className="chapter">
          <div className="ch-copy">
            <h2>One ridge and one hollow on Mount Sharp</h2>
            <p>The boxwork ridges where Curiosity drilled in 2025 and 2026. The walk's science goal is to sample a resistant ridge and the hollow beside it, and compare them.</p>
            <ul className="facts">
              <li><b className="num">3 km</b> site, NASA HiRISE 1 m elevation</li>
              <li><b className="num">25 cm</b> orbital imagery where you zoom in</li>
              {sol && <li><b className="num">Sol {sol}</b> Curiosity's traverse, drawn where it drove</li>}
            </ul>
          </div>
        </section>

        <section ref={sec(2)} className="chapter">
          <div className="ch-copy">
            <h2>Two astronauts, one airlock</h2>
            <ul className="crew-list">
              {CREW.map((c) => (
                <li key={c.id}><i style={{ borderColor: c.color }} aria-hidden /><span><b>{c.name}</b> {c.role}</span></li>
              ))}
            </ul>
            <p>They walk together at the slower one's pace. Each suit carries its own oxygen, cooling water and battery, and the plan has to bring both of them home.</p>
          </div>
        </section>

        <section ref={sec(3)} className="chapter">
          <div className="ch-copy">
            <h2>The blue line is the way home</h2>
            <p>Inside it, both suits can walk back with a 25% reserve on time, oxygen, water and battery. Steep ground is cut out. It is recomputed from the terrain whenever the suits, the load or the clock change.</p>
          </div>
        </section>

        <section ref={sec(4)} className="chapter pick-ch">
          <div className="ch-copy">
            <h2>Pick a point, see the walk back</h2>
            <p>This is the live engine. Click the ground to ask what the crew asks outside: how do we get home from here, and how long can we stay.</p>
            <PointReadout />
          </div>
        </section>

        <section ref={sec(5)} className="chapter walk-ch">
          <div className="walk-sticky">
            <div className="ch-copy">
              <h2>Walk the plan</h2>
              <p>Keep scrolling. The crew walks the balanced plan stop by stop, and every number comes from the same mission state the habitat, the tablet and the helmet visor read.</p>
              <WalkReadout />
            </div>
          </div>
        </section>

        <section className="chapter end-ch">
          <div className="ch-copy">
            <h2>Plan your own walk</h2>
            <p>Change the suits, the load, the season or the start time and watch the way home move.</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#/app">Open the mission map</a>
            </div>
          </div>
        </section>
      </main>

      <div className="landing-more">
      <section className="band data" id="data">
        <div className="wrap two">
          <div>
            <h2 className="section-title">NASA data, one site</h2>
            <p className="prose">Every layer in the app names its mission, instrument, product, resolution, date and a provenance tag. Coarse layers stay at their true resolution.</p>
          </div>
          <dl className="data-list">
            {DATA.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      </section>

      <section className="band lineage">
        <div className="wrap">
          <h2 className="section-title">Built on how NASA mapped other worlds</h2>
          <div className="lineage-list">
            {LINEAGE.map(([name, what, ours]) => (
              <div key={name} className="lineage-row">
                <h3>{name}</h3>
                <p>{what}</p>
                <p className="ours">{ours}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band brief">
        <div className="wrap">
          <h2 className="section-title">What the challenge asks, and where it is in Mars BEACON</h2>
          <table className="brief-table">
            <thead><tr><th scope="col">From the challenge</th><th scope="col">In the app</th></tr></thead>
            <tbody>{BRIEF.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="band displays">
        <div className="wrap">
          <h2 className="section-title">One mission state, every display</h2>
          <div className="display-row">
            <figure><div className="display-shape console-shape" aria-hidden /><figcaption><b>Habitat console.</b> Plan the walk, compare routes, rehearse it hour by hour with the real sun.</figcaption></figure>
            <figure><div className="display-shape tablet-shape" aria-hidden /><figcaption><b>Field tablet.</b> Top-down map, next stop, and the margin each astronaut has left.</figcaption></figure>
            <figure><div className="display-shape hud-shape" aria-hidden /><figcaption><b>Helmet visor.</b> The safe path drawn on the ground ahead, hazards anchored in the world, oxygen and turn-back time at the edges of view.</figcaption></figure>
            <figure><div className="display-shape console-shape" aria-hidden /><figcaption><b>Mission control.</b> Go/no-go checks, both crew, radiation, climate, live space weather and the light-time delay to Earth.</figcaption></figure>
          </div>
          <a className="btn btn-primary" href="#/app">Open the mission map</a>
        </div>
      </section>

      <footer className="band foot" id="team">
        <div className="wrap two">
          <div>
            <Wordmark />
            <p className="prose">Team NASHA: Harishik, Sahaj and Naomi. NASA Space Apps Challenge 2026, Seoul.</p>
          </div>
          <p className="fine">
            Data: NASA, JPL, USGS, University of Arizona; REMS by Centro de Astrobiologia for NASA/JPL. NASA does not endorse this project. Scenario events in the app are
            labelled and invented to exercise the system. Code under Apache 2.0.
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
