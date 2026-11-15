// Guided tour (§3.3). Named anchors only. A step may open a safe informational panel; it never changes mission
// assumptions and never starts playback (Rehearse is offered as a separate button).
import type { GuideActionId, GuideAnchor } from "./types";

export interface TourStep {
  id: string;
  title: string;
  narration: string;
  enter?: GuideActionId;        // presentation-only action run when the step opens
  anchor?: GuideAnchor;
  offer?: { label: string; action: GuideActionId };  // only on an explicit press
}

export const TOUR: TourStep[] = [
  { id: "welcome", title: "Welcome", narration: "This is a Marswalk decision-support workspace built from NASA mission data." },
  { id: "explore", title: "Explore", narration: "Inspect real terrain and the layers behind each map. Each layer names its source and resolution.", enter: "open_explore", anchor: "data-layers" },
  { id: "science", title: "Science", narration: "Choose a scientific destination and include a stop in the plan. Selecting a stop shows its route home and hazards.", enter: "open_mission", anchor: "mission-stops" },
  { id: "plan", title: "Plan", narration: "Compare routes by science value and remaining safety margin. Opening Plan returns the timeline to egress.", enter: "open_plan", anchor: "plan-cards" },
  { id: "return", title: "Return", narration: "The boundary reflects modeled travel, oxygen and reserve constraints. The amber band is the P90 slope uncertainty when it is available.", enter: "show_envelope", anchor: "envelope-summary" },
  { id: "rehearse", title: "Rehearse", narration: "Inspect how the proposed EVA changes over mission time. Rehearse starts playback, so it waits for you.", anchor: "phase-rehearse", offer: { label: "Start rehearsal", action: "start_rehearsal" } },
  { id: "evidence", title: "Evidence", narration: "Open source cards and equations to check the assumptions.", anchor: "equations", offer: { label: "Open Equations", action: "open_equations" } },
  { id: "finish", title: "Finish", narration: "You're ready to explore. Open the guide any time." },
];
