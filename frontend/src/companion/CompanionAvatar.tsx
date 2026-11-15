// Pluggable avatar (§5.2): maps the guide's semantic expressions onto the selected rover artwork (Design 2 body,
// Design 3 face). Drawn square with object-fit: contain so the corrected proportions never stretch. Static by
// default; one short motion per event, none with reduced motion. Only the idle pose loads up front.
import type { CompanionExpression } from "./types";

export type Pose = "idle" | "wave" | "think" | "point_left" | "point_right" | "alert" | "celebrate" | "sleep";
const BASE = `${(import.meta.env.BASE_URL as string) || "./"}companion/`;

export function poseFor(expression: CompanionExpression, pointing: "left" | "right" | null): Pose {
  switch (expression) {
    case "attention": return "wave";
    case "explaining": return pointing === "left" ? "point_left" : pointing === "right" ? "point_right" : "idle";
    case "success": return "celebrate";
    case "warning": return "alert";
    case "error": return "think"; // the art's "confused" aliases thinking
    case "closed": case "idle": return "idle";
  }
}

export function CompanionAvatar({ expression, pointing = null, size }: { expression: CompanionExpression; pointing?: "left" | "right" | null; size: number }) {
  const pose = poseFor(expression, pointing);
  return <img key={pose} className={`ga-img ga-${pose}`} src={`${BASE}${pose}.webp`} alt="" width={size} height={size} draggable={false} />;
}

/** Warm the other poses once the visitor opens the guide (not at page load). */
let warmed = false;
export function warmPoses() {
  if (warmed) return; warmed = true;
  for (const p of ["wave", "think", "point_left", "point_right", "alert", "celebrate"]) { const im = new Image(); im.src = `${BASE}${p}.webp`; }
}
