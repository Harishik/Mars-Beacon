import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import { loadSite } from "../data/bundle";
import { useEngine } from "../engine/useEngine";
import { anim } from "../render/Terrain";
import { Landing } from "../views/Landing";
import { Console } from "../views/Console";

function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.startsWith("#/app") ? "app" : "landing";
}

export function App() {
  const route = useRoute();
  const bundle = useStore((s) => s.bundle);
  const error = useStore((s) => s.loadError);
  useEngine();

  useEffect(() => {
    loadSite().then((b) => useStore.getState().setBundle(b)).catch((e: Error) => useStore.getState().setError(e.message));
  }, []);

  useEffect(() => {
    // Replay the envelope draw-in when entering the map.
    anim.reveal = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0;
    if (route === "landing" && !window.location.hash.startsWith("#/")) {
      const id = window.location.hash.slice(1);
      if (id) document.getElementById(id)?.scrollIntoView();
    } else window.scrollTo(0, 0);
  }, [route]);

  if (error) {
    return (
      <main className="fatal">
        <h1>The site data did not load</h1>
        <p>{error}</p>
        <p>Run <code>npm run fixture</code> in <code>frontend/</code> to create the placeholder bundle, or set <code>VITE_BUNDLE_BASE_URL</code> to the bucket.</p>
      </main>
    );
  }
  if (!bundle) {
    return <div className="loading" role="status"><span className="loading-ring" aria-hidden />Loading Gale crater terrain</div>;
  }
  return route === "app" ? <Console /> : <Landing />;
}
