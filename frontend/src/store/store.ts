import type { OverlayId } from "../engine/overlays";
import { create } from "zustand";
import type { SiteBundle } from "../data/bundle";
import type { Plan } from "../engine/planner";
import { setVertExag } from "../render/Terrain";

export type View = "console" | "tablet" | "eva" | "hud" | "rover" | "linked";
export type Phase = "explore" | "plan" | "rehearse" | "execute" | "debrief";
export type LayerId = "terrain" | "contours" | "slope" | "envelope" | "grid" | "targets" | "havens" | "traverse" | "patches" | "boulders";

export interface Crew { label: string; loadKg: number; fMob: number; o2BudgetG: number; o2SpentG: number }

export interface EnvelopeState {
  margin: Float32Array | null;
  timeToHaven: Float32Array | null;
  parent: Int32Array | null;
  o2A: Float32Array | null;
  o2B: Float32Array | null;
  ms: number;
  insideCells: number;
  insideP90: Uint8Array | null; // certified on the P90 slope too (null: not computed, e.g. while playing)
  p90Cells: number;
  computing: boolean;
  version: number;
}

interface State {
  bundle: SiteBundle | null;
  loadError: string | null;
  view: View;
  phase: Phase;                     // EVA workflow step
  layers: Record<LayerId, boolean>;
  provenance: string | null;        // layer id whose card is open
  lmstHours: number;                // local mean solar time, hours
  lsDeg: number;                    // solar longitude (season)
  tau: number;                      // column dust optical depth at the datum
  tauManual: boolean;
  quality: "high" | "low";          // rendering tier only; never changes the grid, routes or envelope               // true once the crew sets dust by hand; otherwise the measured climatology drives it
  overlay: OverlayId;               // data field coloured onto the terrain
  storm: boolean;                   // solar particle event / dust storm scenario
  // Assumptions and scenario values (shown in the app with their tags)
  v0: number; slopeLimitDeg: number; reserveM: number; kG: number; mRestW: number; bodyMassKg: number;
  timeBudgetS: number; timeSpentS: number;
  crew: [Crew, Crew];
  roverActive: boolean;
  envelope: EnvelopeState;
  cursor: { x: number; y: number } | null; // site-frame metres under the pointer
  selected: { x: number; y: number; label?: string } | null; // point the crew is asking about
  panel: "mission" | "layers";
  ledger: boolean;                  // equations and assumptions sheet open
  tour: boolean;
  sceneReady: boolean;
  // Shared EVA plan and timeline: every display reads the same moment of the EVA.
  plans: Plan[];
  activePlan: Plan["id"];
  planMs: number;
  planBusy: boolean;
  playheadS: number;                // seconds since egress on the active plan
  playing: boolean;
  speed: number;                    // simulated seconds per real second
  evaStartLmst: number;             // local solar time at egress
  dwellMin: number;                 // minutes at each stop
  crewPos: { x: number; y: number; heading: number } | null;
  setBundle: (b: SiteBundle) => void;
  setError: (e: string) => void;
  set: (p: Partial<State>) => void;
  setPhase: (p: Phase) => void;
  excludedStops: string[];          // stops the planner leaves out
  addStop: (x: number, y: number, name: string) => void;
  removeStop: (id: string) => void;
  toggleStop: (id: string) => void;
  toggleLayer: (id: LayerId) => void;
  setCrew: (i: 0 | 1, p: Partial<Crew>) => void;
  setEnvelope: (p: Partial<EnvelopeState>) => void;
}

/** Low tier for phones, few-core or low-memory devices, or when the user asks to save data (?quality=low|high overrides). */
function detectQuality(): "high" | "low" {
  if (typeof window === "undefined") return "high";
  const q = new URLSearchParams(window.location.search).get("quality");
  if (q === "low" || q === "high") return q;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
  if (mobile || (navigator.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || nav.connection?.saveData) return "low";
  return "high";
}

export const useStore = create<State>((set) => ({
  bundle: null,
  loadError: null,
  view: "console",
  phase: "plan",
  layers: { terrain: true, contours: false, slope: false, envelope: true, grid: false, targets: true, havens: true, traverse: true, patches: true, boulders: true },
  provenance: null,
  lmstHours: 9.0,
  lsDeg: 150,
  tau: 0.6,
  tauManual: false,
  quality: detectQuality(),
  overlay: "none",
  storm: false,
  v0: 0.7, slopeLimitDeg: 20, reserveM: 0.25, kG: 0.78, mRestW: 100, bodyMassKg: 80,
  timeBudgetS: 4 * 3600, timeSpentS: 0,
  crew: [
    { label: "EV1", loadKg: 104, fMob: 1, o2BudgetG: 1000, o2SpentG: 0 },
    { label: "EV2", loadKg: 104, fMob: 1, o2BudgetG: 1000, o2SpentG: 0 },
  ],
  roverActive: false,
  envelope: { margin: null, timeToHaven: null, parent: null, o2A: null, o2B: null, ms: 0, insideCells: 0, insideP90: null, p90Cells: 0, computing: false, version: 0 },
  cursor: null,
  selected: null,
  panel: "mission",
  ledger: false,
  tour: false,
  sceneReady: false,
  plans: [],
  activePlan: "balanced",
  planMs: 0,
  planBusy: false,
  playheadS: 0,
  playing: false,
  speed: 120,
  evaStartLmst: 9.0,
  dwellMin: 20,
  crewPos: null,
  setBundle: (b) => {
    setVertExag(b.manifest.display?.verticalExaggeration ?? 1.6);
    // Start with the first ridge selected so the turn-back card and route are visible at once.
    const t = b.manifest.targets.find((x) => x.type === "ridge") ?? b.manifest.targets[0];
    set({ bundle: b, loadError: null, selected: t ? { x: t.x, y: t.y, label: t.name } : null });
  },
  setError: (e) => set({ loadError: e }),
  set: (p) => set(p),
  excludedStops: [],
  // Mission design: planners add their own science stops on the map. The stop joins the site's target list
  // (so every display sees it) and the planner re-plans.
  addStop: (x, y, name) => set((s) => {
    if (!s.bundle) return {};
    const id = `custom-${Date.now().toString(36)}`;
    const t = { id, name: name || `Stop at E ${Math.round(x)}, N ${Math.round(y)}`, type: "custom" as const, x, y, sol: null, source: "Added by the mission planner" };
    const manifest = { ...s.bundle.manifest, targets: [...s.bundle.manifest.targets, t] };
    return { bundle: { ...s.bundle, manifest }, selected: { x, y, label: t.name } };
  }),
  removeStop: (id) => set((s) => {
    if (!s.bundle) return {};
    const manifest = { ...s.bundle.manifest, targets: s.bundle.manifest.targets.filter((t) => t.id !== id) };
    return { bundle: { ...s.bundle, manifest }, excludedStops: s.excludedStops.filter((e) => e !== id), selected: null };
  }),
  toggleStop: (id) => set((s) => ({ excludedStops: s.excludedStops.includes(id) ? s.excludedStops.filter((e) => e !== id) : [...s.excludedStops, id] })),
  setPhase: (phase) => set((s) => {
    const wide = (typeof window === "undefined" || window.innerWidth >= 1100) && s.quality === "high";
    const total = s.plans.find((p) => p.id === s.activePlan)?.totalS ?? 0;
    switch (phase) {
      case "explore": return { phase, view: "console", panel: "layers", playing: false };
      case "plan": return { phase, view: "console", panel: "mission", playing: false, playheadS: 0, overlay: "none" };
      case "rehearse": return { phase, view: wide ? "linked" : "console", panel: "mission", playing: true, overlay: "none", playheadS: s.playheadS >= total ? 0 : s.playheadS };
      case "execute": return { phase, view: "tablet", panel: "mission", overlay: "none" };
      case "debrief": return { phase, view: "console", panel: "mission", playing: false, overlay: "none" };
    }
  }),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setCrew: (i, p) => set((s) => {
    const crew = [...s.crew] as [Crew, Crew];
    crew[i] = { ...crew[i], ...p };
    return { crew };
  }),
  setEnvelope: (p) => set((s) => ({ envelope: { ...s.envelope, ...p } })),
}));

// Development only: lets automated checks drive the shared state (not present in production builds).
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __beacon?: typeof useStore }).__beacon = useStore;
