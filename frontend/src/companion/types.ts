// Mars BEACON guide: shared types (spec BEACON_Guide.md §5.3, §5.4, §7).

export type GuideIntent =
  | "getting_started" | "plan_eva" | "return_envelope" | "science_stops" | "source_provenance"
  | "slope_layer" | "thermal_layer" | "oxygen_margin" | "p90_uncertainty" | "mission_timeline"
  | "equations" | "performance" | "no_route" | "site_selection" | "share_brief"
  | "safety" | "displays" | "walk_controls" | "rover_haven" | "space_weather" | "mobile" | "focus_view";

/** Every app change the guide can make. Each maps to one reviewed function in actions.ts. */
export type GuideActionId =
  | "open_explore" | "open_plan" | "open_layers" | "open_mission"
  | "show_envelope" | "show_slope" | "show_thermal"
  | "open_equations" | "set_low_quality" | "focus_plan_cards" | "offer_rehearsal" | "start_rehearsal"
  | "open_app";

/** Interface elements the guide may point at: `data-guide-anchor="..."` in the app. */
export type GuideAnchor =
  | "phase-bar" | "phase-rehearse" | "data-layers" | "mission-stops" | "plan-cards"
  | "envelope-summary" | "crew-panel" | "map-layers" | "timeline" | "equations" | "focus-view" | "view-switch";

/** Semantic companion states (§7); the avatar decides how each looks. */
export type CompanionExpression = "idle" | "attention" | "explaining" | "success" | "warning" | "error" | "closed";

export interface GuideContext {
  route: "landing" | "app";
  phase: "explore" | "plan" | "rehearse" | "execute" | "debrief";
  view: string;
  siteLoaded: boolean;
  siteLabel?: string;
  quality: "low" | "high";
  panel: "mission" | "layers";
  plansReady: boolean;
  planning: boolean;
  feasiblePlanCount: number;
  envelopeReady: boolean;
  p90Ready: boolean;
  playing: boolean;
  reservePct: number;
  slopeLimitDeg: number;
  loadError?: string;
}

export interface GuideTopic {
  id: GuideIntent;
  title: string;
  aliases: string[];          // whole phrases people type
  keywords: string[];         // weighted tokens (weight 1, or "word:2")
  summary: string;            // authored, independent of runtime state
  steps?: string[];           // 1 to 3 short steps
  details?: string[];         // "More detail", source-reviewed
  /** One live line from the read-only context, only from values that exist (no invented numbers). */
  live?: (ctx: GuideContext) => string | null;
  action?: GuideActionId;
  actionLabel?: string;
  anchor?: GuideAnchor;
  availableWhen?: "always" | "site-loaded" | "plan-ready";
  related?: GuideIntent[];
  reviewDate: string;
  source: string;             // where the statement comes from in the app or docs
}

export type ActionResult =
  | { ok: true; note?: string }
  | { ok: false; reason: string; manual: string };
