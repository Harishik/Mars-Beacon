import { create } from "zustand";
import type { SiteBundle } from "../data/bundle";

export type View = "console" | "tablet" | "hud";
export type LayerId = "terrain" | "contours" | "slope" | "envelope" | "grid" | "targets" | "havens";

export interface Crew { label: string; loadKg: number; fMob: number; o2BudgetG: number; o2SpentG: number }

export interface EnvelopeState {
  margin: Float32Array | null;
  timeToHaven: Float32Array | null;
  ms: number;
  insideCells: number;
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
  // Assumptions and scenario values (shown in the app with their tags)
  v0: number; slopeLimitDeg: number; reserveM: number; kG: number; mRestW: number; bodyMassKg: number;
  timeBudgetS: number; timeSpentS: number;
  crew: [Crew, Crew];
  roverActive: boolean;
  envelope: EnvelopeState;
  cursor: { x: number; y: number } | null; // site-frame metres under the pointer
  tour: boolean;
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
  layers: { terrain: true, contours: true, slope: false, envelope: true, grid: false, targets: true, havens: true },
  provenance: null,
  lmstHours: 15.6,
  v0: 0.7, slopeLimitDeg: 20, reserveM: 0.25, kG: 0.76, mRestW: 100, bodyMassKg: 80,
  timeBudgetS: 4 * 3600, timeSpentS: 3 * 3600 + 28 * 60,
  crew: [
    { label: "EV1", loadKg: 104, fMob: 1, o2BudgetG: 1000, o2SpentG: 760 },
    { label: "EV2", loadKg: 104, fMob: 1, o2BudgetG: 1000, o2SpentG: 790 },
  ],
  roverActive: false,
  envelope: { margin: null, timeToHaven: null, ms: 0, insideCells: 0, computing: false, version: 0 },
  cursor: null,
  tour: false,
  setBundle: (b) => set({ bundle: b, loadError: null }),
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
