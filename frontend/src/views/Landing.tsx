import { useEffect } from "react";
import { useStore } from "../store/store";
import { Scene } from "../render/Scene";
import { Wordmark } from "./Wordmark";

const STEPS = [
  { title: "Explore the site", body: "HiRISE terrain and imagery with Viking colour, the regional MOLA and CTX setting, Curiosity's traverse and Navcam frames, and live Mars weather and space weather, on one 3 km site at Mount Sharp." },
  { title: "Plan the walk", body: "Pick science stops or add your own. The planner tries every order and ranks routes by science against the margin both astronauts keep on oxygen, time and reserve." },
  { title: "Rehearse it", body: "Play the EVA hour by hour with the real Mars sun, ground temperature and dust. For every 4 m of ground the engine checks that the pair can still walk back to the habitat or the rover." },
  { title: "Carry it outside", body: "The same mission state drives the habitat console, mission control, a field tablet, a helmet visor and the rover cockpit, then a debrief compares plan with what happened." },
];

const LINEAGE = [
  ["Apollo lunar traverse maps", "Planned stops on photo maps, with a walk-back limit on how far the crew could go from the lunar module.", "We replace the fixed distance limit with a boundary computed from terrain, suits, pace and consumables."],
  ["NASA Worldview (Earth)", "A time slider and a layer drawer over daily satellite imagery, with shareable views.", "Our layer drawer and time bar follow the same pattern."],
  ["JPL Mars Trek", "Global and regional Mars layers in the browser.", "We use Trek's MOLA, CTX and Viking services for the setting, then go to the few square kilometres of one Marswalk."],
  ["JPL Experience Curiosity", "Rover-eye views of real Mars terrain in the browser.", "Our eye-level views use the same idea: real terrain, natural colour, no game paint on the ground."],
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

export function Landing() {
  const bundle = useStore((s) => s.bundle);
  // Low morning sun for the hero: raking light across the ridges and the
  // blue glow Mars shows around a low sun.
  useEffect(() => {
    useStore.getState().set({ lmstHours: 7.5 });
    return () => useStore.getState().set({ lmstHours: useStore.getState().evaStartLmst });
  }, []);
  return (
    <div className="landing">
      <section className="hero" aria-label="Introduction">
        {bundle && <Scene bundle={bundle} mode="hero" />}
        <div className="hero-shade" aria-hidden />
        <nav className="landing-nav" aria-label="Main">
          <Wordmark />
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#data">NASA data</a>
            <a href="#team">Team</a>
            <a className="btn btn-quiet" href="#/app">Open the map</a>
          </div>
        </nav>
        <div className="hero-copy">
          <p className="hero-kicker">Interplanetary Survival Guide: Martian Map</p>
          <h1>Every step on Mars needs a way home.</h1>
          <p className="hero-lede">
            Mars BEACON layers NASA orbital and rover data over one science site in Gale crater and shows a two-person
            EVA crew how far they can walk and still get back, with live Mars weather and space weather.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#/app">Open the mission map</a>
            <a className="btn btn-ghost" href="#how">See how it works</a>
          </div>
        </div>
        <div className="hero-caption" aria-hidden>
          <span className="lg-home-line" /> The blue line is the Return Envelope: the edge of ground the crew can still walk home from.
          {bundle?.manifest.synthetic && <em> Terrain shown is a placeholder until the HiRISE bundle is processed.</em>}
        </div>
      </section>

      <section className="band problem">
        <div className="wrap two">
          <h2>Mars maps are built for planets. A Marswalk happens in a few square kilometres.</h2>
          <div className="prose">
            <p>
              NASA has decades of Mars data from many missions, but it is not yet layered together in the combinations needed
              to plan one human excursion. Mars Trek and the USGS geologic maps work at regional and global scale.
            </p>
            <p>
              We picked the site NASA named in the challenge: the boxwork ridges and hollows on Mount Sharp, where Curiosity
              drilled both a ridge and a hollow in 2025 and 2026. The EVA goal is to sample one of each and compare them.
            </p>
          </div>
        </div>
      </section>

      <section className="band" id="how">
        <div className="wrap">
          <h2 className="section-title">How it works</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-n">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

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
  );
}
