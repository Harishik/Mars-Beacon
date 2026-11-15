// Guide action dispatcher (BEACON_Guide.md §4, §5.5). The guide changes the app only through these reviewed,
// idempotent functions. None of them touch crew loads, budgets, time limits, slope limit, rover haven, weather
// scenario, mission time, science stops or saved missions. Playback starts only from start_rehearsal, which the
// UI calls from an explicit button press, never from a tour step or a typed question.
import { useStore } from "../store/store";
import { ANCHORS } from "./anchors";
import type { ActionResult, GuideActionId } from "./types";

export const ACTION_IDS: readonly GuideActionId[] = [
  "open_explore", "open_plan", "open_layers", "open_mission", "show_envelope", "show_slope", "show_thermal",
  "open_equations", "set_low_quality", "focus_plan_cards", "offer_rehearsal", "start_rehearsal", "open_app",
];

export function isGuideActionId(v: unknown): v is GuideActionId {
  return typeof v === "string" && (ACTION_IDS as readonly string[]).includes(v);
}

/** Actions that need the site data loaded (disabled clearly when it is missing, §9). */
const NEEDS_SITE: ReadonlySet<GuideActionId> = new Set(["show_envelope", "show_slope", "show_thermal", "focus_plan_cards", "start_rehearsal", "open_plan", "open_explore"]);

const inApp = () => window.location.hash.startsWith("#/app");

export function runGuideAction(id: unknown): ActionResult {
  if (!isGuideActionId(id)) return { ok: false, reason: "That action is not available to the guide.", manual: "Use the controls on the map." };
  const s = useStore.getState();
  if (NEEDS_SITE.has(id) && !s.bundle) return { ok: false, reason: "The site data has not loaded, so this needs the map first.", manual: s.loadError ? "Reload the page; if it persists the site files are missing." : "Wait for the terrain to finish loading." };
  if (id !== "open_app" && !inApp()) window.location.hash = "#/app"; // every action lives on the map page

  switch (id) {
    case "open_app":
      if (!inApp()) window.location.hash = "#/app";
      return { ok: true };
    case "open_explore":
      if (s.phase !== "explore") s.setPhase("explore"); // also opens the Data layers tab and pauses playback
      return { ok: true };
    case "open_plan":
      if (s.phase !== "plan") { s.setPhase("plan"); return { ok: true, note: "Opening Plan returns the timeline to egress and clears the terrain colouring." }; }
      return { ok: true };
    case "open_layers":
      s.set({ view: "console", panel: "layers" }); // presentation only
      return { ok: true };
    case "open_mission":
      s.set({ view: "console", panel: "mission" });
      return { ok: true };
    case "show_envelope":
      if (!s.layers.envelope) s.set({ layers: { ...s.layers, envelope: true } }); // ensure on, never toggle off
      return { ok: true };
    case "show_slope":
      if (!s.layers.slope) s.set({ layers: { ...s.layers, slope: true } }); // the slope limit is not changed
      return { ok: true };
    case "show_thermal":
      if (s.phase !== "explore" && s.phase !== "plan") s.setPhase("explore"); // the colouring control lives in Explore and Plan
      useStore.getState().set({ view: "console", overlay: "thermal" });
      return { ok: true };
    case "open_equations":
      s.set({ ledger: true });
      return { ok: true };
    case "set_low_quality":
      s.set({ quality: "low" }); // rendering only: grid, routes and values are unchanged
      return { ok: true };
    case "focus_plan_cards":
      s.set({ view: "console", panel: "mission" });
      return { ok: true };
    case "offer_rehearsal":
      return { ok: true }; // the panel shows a separate "Start rehearsal" button; nothing changes here
    case "start_rehearsal":
      if (!s.plans.length) return { ok: false, reason: "There is no plan to rehearse yet.", manual: ANCHORS["plan-cards"].manual };
      s.setPhase("rehearse"); // starts playback: only ever called from an explicit button press
      return { ok: true };
  }
}
