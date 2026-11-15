// Named interface anchors (§3.3, Stage C): stable data attributes, never CSS classes or coordinates.
import type { GuideAnchor } from "./types";

export const ANCHORS: Record<GuideAnchor, { label: string; manual: string }> = {
  "phase-bar": { label: "workflow steps", manual: "The five numbered steps are at the top of the map: Explore, Plan, Rehearse, Execute, Debrief." },
  "phase-rehearse": { label: "Rehearse step", manual: "Rehearse is step 3 in the bar at the top of the map." },
  "data-layers": { label: "Data layers", manual: "Open the map, then the Data layers tab in the left panel." },
  "mission-stops": { label: "science stops", manual: "Open the map, then the Mission tab in the left panel; stops are listed there." },
  "plan-cards": { label: "plan options", manual: "In the Plan step, the plan options are in the Mission tab of the left panel." },
  "envelope-summary": { label: "Return Envelope readout", manual: "In Plan, Rehearse or Debrief, the right panel opens with the reachable area and the P90 note." },
  "crew-panel": { label: "crew panel", manual: "In Plan, Rehearse or Debrief, each suit's oxygen, water and battery are in the right panel." },
  "map-layers": { label: "terrain colouring", manual: "In Explore or Plan, the terrain colouring buttons sit at the top of the map." },
  "timeline": { label: "mission timeline", manual: "The timeline runs along the bottom of the map." },
  "equations": { label: "Equations", manual: "The Equations button is in the top bar of the map." },
  "focus-view": { label: "Focus view", manual: "Focus view is in the top bar of the map, or press F." },
  "view-switch": { label: "display switch", manual: "The displays (Habitat, Control, Tablet, EVA, Visor, Rover, Linked) are at the top right of the map." },
};

export function anchorElement(a: GuideAnchor): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-guide-anchor="${a}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null; // hidden by a breakpoint or display mode counts as absent
}

/** Wait for an anchor after a panel mounts (§5.5: timeout and fallback). */
export function waitForAnchor(a: GuideAnchor, timeoutMs = 1200): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const el = anchorElement(a);
      if (el || performance.now() - t0 > timeoutMs) resolve(el);
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

/** Bring an anchor into view and outline it briefly. No pointer trap: the control stays usable. */
export function spotlight(el: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  el.classList.add("guide-spot");
  window.setTimeout(() => el.classList.remove("guide-spot"), 2600);
}
