import { useEffect } from "react";
import { useStore } from "../store/store";
import { Scene } from "../render/Scene";
import { Wordmark } from "./Wordmark";

const STEPS = [
  { title: "Layer the data", body: "HiRISE elevation and imagery, CRISM minerals, THEMIS thermal inertia, USGS geology, Curiosity RAD and REMS, rover photos and DONKI space weather, aligned on one 3 km site." },
  { title: "Rebuild the ground", body: "The 1 m orbital terrain is fused with rover stereo at the waypoints, so the crew sees the ridges and hollows they will actually walk." },
  { title: "Draw the way home", body: "For every 4 m of ground the engine checks whether both astronauts can still walk back to the habitat or rover along one path, with oxygen, time and reserve to spare." },
  { title: "Carry it outside", body: "The same mission state drives the habitat console, a field tablet and a helmet display, and updates when pace, load, the rover or space weather change." },
];

const LINEAGE = [
  ["Apollo lunar traverse maps", "Planned stops on photo maps, with a walk-back limit on how far the crew could go from the lunar module.", "We replace the fixed distance limit with a boundary computed from terrain, suits, pace and consumables."],
  ["NASA Worldview (Earth)", "A time slider and a layer drawer over daily satellite imagery, with shareable views.", "Our layer drawer and time bar follow the same pattern."],
  ["JPL Mars Trek", "Global and regional Mars layers in the browser.", "Trek works at regional scale; we go to the few square kilometres of one Marswalk."],
  ["Artemis surface planning", "Walk-back distance limits and paired crew operations for the lunar south pole.", "Two-person crew rules and a moving rover haven are built into the engine."],
];

const BRIEF = [
  ["Map, tool or interface a Mars astronaut could use", "Habitat console, field tablet and helmet display from one mission state"],
  ["Start from science goals and a location", "Ridge against hollow in the Mount Sharp boxwork, where Curiosity worked in 2025"],
  ["Details of routes and destinations", "Every stop shows whether it is reachable now, the route home and the time to turn back"],
  ["Updates on current conditions", "Sun and shadows by local solar time, radiation dose, space weather feed"],
  ["At least three kinds of data", "Seven: topographic, optical, spectral, thermal, geophysical, atmospheric, radiation"],
  ["Astronaut safety, radiation, space weather", "The Return Envelope; storm shelter scenario; RAD and DONKI context"],
  ["Suits and equipment affect mobility", "Suit load and pace change speed, oxygen use and the envelope live"],
  ["Avoid large rock formations", "Steep ground and buttes are no-go; routes go around them"],
  ["Rovers or paired astronauts", "Park the rover to add a second haven; the pair walks at the slower member's pace"],
  ["Look at how other worlds were mapped", "Lineage from Apollo, Worldview, Mars Trek and Artemis planning"],
];

const DATA = [
  ["Topographic", "MRO HiRISE 1 m elevation model (USGS merged DEM)"],
  ["Optical", "MRO HiRISE 25 cm orthophoto"],
  ["Spectral", "MRO CRISM hydrated mineral and sulfate parameters"],
  ["Thermal", "Mars Odyssey THEMIS thermal inertia"],
  ["Geophysical", "USGS-NASA geologic units, rock density"],
  ["Atmospheric", "Curiosity REMS temperature and pressure by season"],
  ["Radiation", "Curiosity RAD surface dose, NASA DONKI event records"],
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
            EVA crew, live, how far they can walk and still get back.
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
            <h2 className="section-title">Seven kinds of NASA data, one site</h2>
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
          <h2 className="section-title">One mission state, three displays</h2>
          <div className="display-row">
            <figure><div className="display-shape console-shape" aria-hidden /><figcaption><b>Habitat console.</b> Plan the walk, compare routes, rehearse it hour by hour with the real sun.</figcaption></figure>
            <figure><div className="display-shape tablet-shape" aria-hidden /><figcaption><b>Field tablet.</b> Top-down map, next stop, and the margin each astronaut has left.</figcaption></figure>
            <figure><div className="display-shape hud-shape" aria-hidden /><figcaption><b>Helmet display.</b> The edge of safe return drawn on the ground ahead, oxygen and time at the edges of view.</figcaption></figure>
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
            Data: NASA, JPL, USGS, University of Arizona. NASA does not endorse this project. Scenario events in the app are
            labelled and invented to exercise the system. Code under Apache 2.0.
          </p>
        </div>
      </footer>
    </div>
  );
}
