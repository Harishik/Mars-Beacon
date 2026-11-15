// BEACON, the on-screen guide: the team's rover character (Design 2 body, Design 3 face), ported from the
// v0.1 web companion. Poses are whole-image swaps with whole-body CSS motion (no limb animation); the artwork is
// always drawn square with object-fit: contain, so its proportions are never stretched.
// Other code drives it only through `guide` below; what it may do to the app goes through actions.ts.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { guideElement, runGuideAction, type GuideAction, type GuideTarget } from "./actions";

export const POSES = ["idle", "wave", "think", "point_left", "point_right", "alert", "celebrate", "sleep"] as const;
export type Pose = (typeof POSES)[number] | "confused";
const ASSET: Record<Pose, string> = {
  idle: "idle", wave: "wave", think: "think", point_left: "point_left", point_right: "point_right",
  alert: "alert", celebrate: "celebrate", sleep: "sleep", confused: "think", // confused aliases think (no distinct art yet)
};
const BASE = `${(import.meta.env.BASE_URL as string) || "./"}companion/`;

interface GuideButton { label: string; action?: GuideAction; onPress?: () => void }
interface GuideState { pose: Pose; text: string | null; buttons: GuideButton[]; target: GuideTarget | null; hidden: boolean }

let state: GuideState = { pose: "idle", text: null, buttons: [], target: null, hidden: false };
const subs = new Set<() => void>();
const emit = (p: Partial<GuideState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

/** Typed controller for the guide character. Text is rendered as text, never as HTML. */
export const guide = {
  say(text: string, pose: Pose = "idle", buttons: GuideButton[] = []) { emit({ text, pose, buttons, target: null, hidden: false }); },
  pose(pose: Pose) { emit({ pose }); },
  /** Point at an allowlisted part of the interface; returns false when it is not on screen. */
  pointTo(target: GuideTarget, text: string, buttons: GuideButton[] = []) {
    const el = guideElement(target);
    if (!el) return false;
    emit({ text, buttons, target, hidden: false, pose: "point_right" });
    return true;
  },
  quiet() { emit({ text: null, buttons: [], target: null }); },
  hide() { emit({ hidden: true, text: null, buttons: [], target: null }); },
  show() { emit({ hidden: false }); },
};

function useGuide() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
}

export function BeaconCompanion() {
  const g = useGuide();
  const self = useRef<HTMLDivElement>(null);

  // Pointing: face the target and outline it twice, softly. Recomputed when the target changes.
  useEffect(() => {
    if (!g.target) return;
    const el = guideElement(g.target);
    if (!el || !self.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    const r = el.getBoundingClientRect(), p = self.current.getBoundingClientRect();
    emit({ pose: r.left + r.width / 2 < p.left + p.width / 2 ? "point_left" : "point_right" });
    el.classList.add("guide-target");
    const anim = reduced ? null : el.animate(
      [{ outlineColor: "rgba(102, 224, 228, 0.95)", outlineOffset: "4px" }, { outlineColor: "rgba(102, 224, 228, 0)", outlineOffset: "10px" }],
      { duration: 1400, iterations: 2, easing: "ease-out" });
    return () => { anim?.cancel(); el.classList.remove("guide-target"); };
  }, [g.target]);

  if (g.hidden) return null;
  return (
    <div className="beacon-guide" ref={self}>
      {g.text && (
        <div className="bg-bubble" role="status" aria-live="polite">
          <p>{g.text}</p>
          <div className="bg-actions">
            {g.buttons.map((b) => (
              <button key={b.label} onClick={() => { if (b.action) runGuideAction(b.action); b.onPress?.(); }}>{b.label}</button>
            ))}
            <button className="bg-dismiss" onClick={() => guide.quiet()}>Hide</button>
          </div>
        </div>
      )}
      <button className="bg-pet" aria-label="BEACON guide" onClick={() => guide.say("Hi, I'm BEACON.", "wave")}>
        <img key={g.pose} className={`bg-pose bg-${g.pose}`} src={`${BASE}${ASSET[g.pose]}.webp`} alt="" width={256} height={256} draggable={false} />
      </button>
    </div>
  );
}

// Warm the image cache so the first pose change does not flash.
if (typeof window !== "undefined") for (const p of POSES) { const im = new Image(); im.src = `${BASE}${p}.webp`; }
