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
    return () => useStore.getState().set({ lmstHours: 15.6 });
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
