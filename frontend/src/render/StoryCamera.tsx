// Landing page camera: scroll position drives a flight through six keyframes over the real site, and the
// camera glides toward them with critical damping, so a fast scroll never jumps and a stop settles softly.
// The pointer adds a small parallax in the early chapters; the walk chapter follows the crew.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { SiteBundle } from "../data/bundle";
import { toScene } from "./Assets";
import { visualCrewPose } from "./habitatFootprint";

/** Scroll progress in chapters (0 = hero, 5 = walk), written by the landing page. */
export const story = { p: 0, pointerX: 0, pointerY: 0 };

const smooth = (t: number) => t * t * (3 - 2 * t);

export function StoryCamera({ bundle }: { bundle: SiteBundle }) {
  const { camera } = useThree();
  const m = bundle.manifest;
  const keys = useMemo(() => {
    const hab = m.havens.find((h) => h.type === "habitat")!;
    const goal = m.targets.find((t) => t.type === "ridge") ?? m.targets[0];
    const habP = toScene(bundle, hab.x, hab.y);
    const goalP = toScene(bundle, goal.x, goal.y);
    const pts = [hab, ...m.targets];
    const fx = pts.reduce((a, p) => a + p.x, 0) / pts.length, fy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const span = Math.max(300, ...pts.map((p) => Math.hypot(p.x - fx, p.y - fy)));
    const focus = toScene(bundle, fx, fy);
    const E = m.grid.extentM;
    // Where the crew waits by the airlock (same spot the scene puts them before egress).
    const dx = goal.x - hab.x, dy = goal.y - hab.y, d = Math.hypot(dx, dy) || 1;
    const crew = toScene(bundle, hab.x + (dx / d) * 58, hab.y + (dy / d) * 58, 1.2);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    return [
      { pos: habP.clone().add(V(-900, 520, 1250)), at: habP.clone().add(V(350, -40, -250)) },        // hero: the crater wall
      { pos: goalP.clone().add(V(-300, 190, 260)), at: goalP.clone() },                               // the ridge
      { pos: crew.clone().add(V(-7.5, 2.6, 9.5)), at: crew.clone() },                                 // the crew at the airlock
      { pos: V(-E * 0.12, focus.y + E * 0.95, E * 0.62), at: V(0, focus.y, -E * 0.04) },              // the whole envelope from above
      { pos: focus.clone().add(V(-span * 0.7, span * 1.45, span * 1.35)), at: focus.clone() },        // pick a point
      { pos: crew.clone().add(V(-16, 10, 18)), at: crew.clone() },                                    // walk (replaced by follow)
    ];
  }, [bundle, m]);

  // Layer 1: selection markers; layer 2: EV1's suit (hidden only from EV1's own visor camera).
  useEffect(() => { camera.layers.enable(1); camera.layers.enable(2); }, [camera]);
  const cur = useRef({ pos: keys[0].pos.clone(), at: keys[0].at.clone(), init: false });
  const want = useMemo(() => ({ pos: new THREE.Vector3(), at: new THREE.Vector3() }), []);

  useFrame((state, dt) => {
    const p = Math.max(0, Math.min(keys.length - 1, story.p));
    const i = Math.min(keys.length - 2, Math.floor(p)), f = smooth(p - i);
    // Keyframes that depend on where the crew actually is: meeting them (2) and walking with them (5).
    const pose = visualCrewPose();
    const live = (k: number) => {
      const key = keys[k];
      if (!pose || (k !== 2 && k !== 5)) return key;
      const h = (pose.heading * Math.PI) / 180, dx = Math.sin(h), dy = Math.cos(h);
      if (k === 2) {
        // In front of the pair and a little to the side, so you see both visors with the habitat behind them.
        const at = toScene(bundle, pose.x, pose.y, 1.1);
        const pos = toScene(bundle, pose.x + dx * 5 - dy * 8.5, pose.y + dy * 5 + dx * 8.5, 0);
        pos.y = Math.max(pos.y, at.y) + 1.6;
        return { pos, at };
      }
      // Walking: behind and above, looking where they walk.
      const at = toScene(bundle, pose.x + dx * 6, pose.y + dy * 6, 1.2);
      const pos = toScene(bundle, pose.x - dx * 22, pose.y - dy * 22, 0);
      pos.y = Math.max(pos.y, at.y) + 12;
      return { pos, at };
    };
    const a = live(i), b = live(i + 1);
    want.pos.copy(a.pos).lerp(b.pos, f);
    want.at.copy(a.at).lerp(b.at, f);
    // Hero: a slow drift around the site; early chapters: pointer parallax scaled to the viewing distance.
    const t = state.clock.elapsedTime;
    const dist = want.pos.distanceTo(want.at);
    const early = Math.max(0, 1 - p / 3);
    const drift = Math.max(0, 1 - p) * 0.06;
    const ang = Math.sin(t * 0.05) * drift;
    const rel = want.pos.clone().sub(want.at);
    rel.applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
    want.pos.copy(want.at).add(rel);
    const right = new THREE.Vector3().crossVectors(rel, THREE.Object3D.DEFAULT_UP).normalize();
    want.pos.addScaledVector(right, story.pointerX * dist * 0.035 * early);
    want.pos.y += story.pointerY * dist * 0.02 * early;

    const c = cur.current;
    if (!c.init) { c.pos.copy(want.pos); c.at.copy(want.at); c.init = true; }
    const k = 1 - Math.exp(-dt * 3.2);   // critically damped glide, about a third of a second to settle
    c.pos.lerp(want.pos, k);
    c.at.lerp(want.at, k);
    camera.position.copy(c.pos);
    camera.lookAt(c.at);
    const cam = camera as THREE.PerspectiveCamera;
    const near = dist < 60 ? 0.1 : 1;
    if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
  });
  return null;
}
