// Soft contact shadow under an object resting on the terrain (the custom terrain shader does not receive
// three.js shadow maps). A blurred dark ellipse, nudged away from the sun, grounds rovers, the habitat and crew.
import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../store/store";
import { sunMars24 } from "../engine/sun";

let tex: THREE.Texture | null = null;
function shadowTexture() {
  if (tex) return tex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!; const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, "rgba(0,0,0,0.75)"); r.addColorStop(0.55, "rgba(0,0,0,0.45)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  tex = new THREE.CanvasTexture(c);
  return tex;
}

export function ContactShadow({ position, width, length, heading = 0 }: { position: THREE.Vector3; width: number; length: number; heading?: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  const ref = useMemo(() => ({ mesh: null as THREE.Mesh | null }), []);
  useFrame(() => {
    const s = useStore.getState();
    const sun = sunMars24(s.lsDeg, s.lmstHours, s.bundle?.manifest.crs.origin.lat ?? -4.8, s.bundle?.manifest.crs.origin.lon ?? 137.38);
    const m = ref.mesh; if (!m) return;
    const day = Math.max(0, Math.min(1, sun.elevationDeg / 15));
    // Low sun stretches and pushes the shadow away from the sun.
    const k = Math.min(1.2, 1 / Math.tan(Math.max(10, sun.elevationDeg) * Math.PI / 180) * 0.25);
    m.position.set(position.x - sun.dir[0] * length * k, position.y + 0.04, position.z - sun.dir[2] * length * k);
    mat.opacity = 0.35 + 0.45 * day;
  });
  return (
    <mesh ref={(m) => { ref.mesh = m; }} material={mat} rotation={[-Math.PI / 2, 0, heading]} renderOrder={2}>
      <planeGeometry args={[width, length]} />
    </mesh>
  );
}
