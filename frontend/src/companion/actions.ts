// The only things the BEACON guide can make the app do. Guide content (scripts, tours, replies) is data: every
// action it asks for is checked here against a closed list before it touches the mission state, and anything
// else is refused. No action can change crew budgets, the envelope inputs, saved missions or the network.
import { useStore, type Phase, type View, type LayerId } from "../store/store";

const PHASES: readonly Phase[] = ["explore", "plan", "rehearse", "execute", "debrief"];
const VIEWS: readonly View[] = ["console", "control", "tablet", "eva", "hud", "rover", "linked"];

/** Interface elements the guide may point at. Each is a `data-guide="..."` attribute in the app. */
export const GUIDE_TARGETS = [
  "phase-bar", "view-switch", "equations", "focus-view",
  "map-layers", "mission-panel", "crew-panel", "timeline", "play", "speed",
] as const;
export type GuideTarget = (typeof GUIDE_TARGETS)[number];

export type GuideAction =
  | { type: "goPhase"; phase: Phase }
  | { type: "setView"; view: View }
  | { type: "showLayer"; layer: LayerId; on: boolean }
  | { type: "selectStop"; stopId: string }
  | { type: "play" }
  | { type: "pause" }
  | { type: "openEquations" }
  | { type: "focusView"; on: boolean }
  | { type: "highlight"; target: GuideTarget };

export type GuideActionResult = { ok: true } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Narrow untrusted input to a GuideAction, or say why not. */
export function parseGuideAction(raw: unknown): GuideAction | string {
  if (!isObj(raw) || typeof raw.type !== "string") return "not an action";
  const s = useStore.getState();
  switch (raw.type) {
    case "goPhase": return PHASES.includes(raw.phase as Phase) ? { type: "goPhase", phase: raw.phase as Phase } : "unknown phase";
    case "setView": return VIEWS.includes(raw.view as View) ? { type: "setView", view: raw.view as View } : "unknown view";
    case "showLayer":
      return typeof raw.layer === "string" && Object.prototype.hasOwnProperty.call(s.layers, raw.layer) && typeof raw.on === "boolean"
        ? { type: "showLayer", layer: raw.layer as LayerId, on: raw.on } : "unknown layer";
    case "selectStop":
      return typeof raw.stopId === "string" && !!s.bundle?.manifest.targets.some((t) => t.id === raw.stopId)
        ? { type: "selectStop", stopId: raw.stopId } : "unknown stop";
    case "play": case "pause": case "openEquations": return { type: raw.type };
    case "focusView": return typeof raw.on === "boolean" ? { type: "focusView", on: raw.on } : "focusView needs on";
    case "highlight": return GUIDE_TARGETS.includes(raw.target as GuideTarget) ? { type: "highlight", target: raw.target as GuideTarget } : "unknown target";
    default: return `action "${raw.type}" is not allowed`;
  }
}

/** The element for a guide target, or null when that part of the interface is not on screen. */
export function guideElement(target: GuideTarget): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
}

/** Run one action from guide content. Untrusted input is validated first; refusals never throw. */
export function runGuideAction(raw: unknown): GuideActionResult {
  const a = parseGuideAction(raw);
  if (typeof a === "string") return { ok: false, reason: a };
  const s = useStore.getState();
  switch (a.type) {
    case "goPhase": s.setPhase(a.phase); break;
    case "setView": s.set({ view: a.view }); break;
    case "showLayer": if (s.layers[a.layer] !== a.on) s.toggleLayer(a.layer); break;
    case "selectStop": {
      const t = s.bundle!.manifest.targets.find((x) => x.id === a.stopId)!;
      s.set({ selected: { x: t.x, y: t.y, label: t.name } });
      break;
    }
    case "play": if (s.plans.length) s.set({ playing: true }); else return { ok: false, reason: "no plan yet" }; break;
    case "pause": s.set({ playing: false }); break;
    case "openEquations": s.set({ ledger: true }); break;
    case "focusView": s.set({ focusView: a.on }); break;
    case "highlight": if (!guideElement(a.target)) return { ok: false, reason: "not on screen" }; break;
  }
  return { ok: true };
}
