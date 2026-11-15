import { useClimatologyDust } from "../engine/atmosphere";
import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import { loadSite, siteFromUrl } from "../data/bundle";
import { shareIdFromUrl, loadMission, applyMission } from "../data/api";
import { useEngine } from "../engine/useEngine";
import { useMission } from "../engine/useMission";
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
  useMission();
  useClimatologyDust();

  useEffect(() => {
    loadSite(siteFromUrl()).then(async (b) => {
      const st = useStore.getState();
      st.setBundle(b);
      // A share link (#/app?plan=ID) reopens a mission saved in the team database.
      const id = shareIdFromUrl();
      if (!id) return;
      st.set({ sharedStatus: { text: "Opening the shared mission…" } });
      try {
        const rec = await loadMission(id);
        if (rec.siteId !== b.manifest.siteId) throw new Error(`it was saved for ${rec.siteId}; open it with ?site=${rec.siteId}`);
        st.set(applyMission(useStore.getState().bundle ?? b, rec));
        const when = rec.createdAt ? new Date(rec.createdAt).toUTCString().slice(5, 22) + " UTC" : "";
        const stale = rec.siteHash !== b.manifest.siteHash ? " The site data has changed since it was saved, so routes are recomputed on the current data." : "";
        st.set({ sharedStatus: { text: `Shared ${rec.kind} "${rec.planName}" loaded${when ? `, saved ${when}` : ""}.${stale}` } });
      } catch (e) {
        st.set({ sharedStatus: { text: `Could not open the shared mission: ${(e as Error).message}`, error: true } });
      }
    }).catch((e: Error) => useStore.getState().setError(e.message));
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
    return <div className="loading" role="status"><span className="loading-ring" aria-hidden />Loading site terrain</div>;
  }
  return route === "app" ? <Console /> : <Landing />;
}
