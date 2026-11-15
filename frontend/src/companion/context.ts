// Read-only snapshot of the mission state for the guide (§5.4). Read at display time; never sent anywhere.
import { useStore } from "../store/store";
import type { GuideContext } from "./types";

export function readContext(): GuideContext {
  const s = useStore.getState();
  return {
    route: window.location.hash.startsWith("#/app") ? "app" : "landing",
    phase: s.phase,
    view: s.view,
    siteLoaded: !!s.bundle,
    siteLabel: s.bundle?.manifest.site?.name ?? s.bundle?.manifest.name,
    quality: s.quality,
    panel: s.panel,
    plansReady: !s.planBusy && s.plans.length > 0,
    planning: s.planBusy,
    feasiblePlanCount: s.plans.length,
    envelopeReady: !!s.envelope.margin,
    p90Ready: !!s.envelope.insideP90,
    playing: s.playing,
    reservePct: Math.round(s.reserveM * 100),
    slopeLimitDeg: s.slopeLimitDeg,
    loadError: s.loadError ?? undefined,
  };
}
