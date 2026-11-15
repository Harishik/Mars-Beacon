// Keeps world-anchored visor labels (next stop, hazards) attached to their places on Mars: projects each
// anchor every frame and moves its HTML element. Off-screen targets slide to the view edge with an arrow.
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/** id -> scene-space point. Written by the visor overlay, read here every frame. */
export const anchorTargets = new Map<string, THREE.Vector3>();

const v = new THREE.Vector3();

export function VisorAnchors() {
  const { camera, size } = useThree();
  useFrame(() => {
    for (const [id, p] of anchorTargets) {
      const el = document.getElementById(id);
      if (!el) continue;
      v.copy(p).project(camera);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
      const pad = 70;
      const off = behind || x < pad || x > size.width - pad || y < pad || y > size.height - 140;
      if (behind) { x = size.width - x; y = size.height - y; }
      if (off) {
        x = Math.min(size.width - pad, Math.max(pad, x));
        y = Math.min(size.height - 160, Math.max(pad + 40, y));
      }
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.dataset.off = off ? "1" : "0";
      el.style.opacity = "1";
    }
  });
  return null;
}
