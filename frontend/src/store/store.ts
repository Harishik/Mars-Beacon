import type { OverlayId } from "../engine/overlays";
import { create } from "zustand";
import type { SiteBundle } from "../data/bundle";
import type { Plan } from "../engine/planner";
import { setVertExag } from "../render/Terrain";

export type View = "console" | "tablet" | "hud" | "linked";
export type LayerId = "terrain" | "contours" | "slope" | "envelope" | "grid" | "targets" | "havens" | "traverse" | "patches";

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
  layers: Record<LayerId, boolean>;
  provenance: string | null;        // layer id whose card is open
  lmstHours: number;                // local mean solar time, hours
  lsDeg: number;                    // solar longitude (season)
  tau: number;                      // column dust optical depth at the datum
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
  toggleLayer: (id: LayerId) => void;
  setCrew: (i: 0 | 1, p: Partial<Crew>) => void;
  setEnvelope: (p: Partial<EnvelopeState>) => void;
}

export const useStore = create<State>((set) => ({
  bundle: null,
  loadError: null,
  view: "console",
  layers: { terrain: true, contours: false, slope: false, envelope: true, grid: false, targets: true, havens: true, traverse: true, patches: true },
  provenance: null,
  lmstHours: 9.0,
  lsDeg: 150,
  tau: 0.6,
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
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setCrew: (i, p) => set((s) => {
    const crew = [...s.crew] as [Crew, Crew];
    crew[i] = { ...crew[i], ...p };
    return { crew };
  }),
  setEnvelope: (p) => set((s) => ({ envelope: { ...s.envelope, ...p } })),
}));
