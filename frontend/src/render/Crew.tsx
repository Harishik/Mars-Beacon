// The two-person EVA crew as the team's astronaut models: EV1 Elena Ruiz and EV2 Tomas Okafor.
// The models are static meshes (no skeleton), so the walk is procedural: a step bob, a forward lean and a
// small side sway, scaled by how fast the figure actually moves on screen. Compressed with meshopt and WebP
// (about 250 KB each, from 11 MB). A model that fails to load falls back to the simple suit shape.
import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { SiteBundle } from "../data/bundle";
import { liveCrewPose } from "../engine/useMission";
import { Astronaut, toScene } from "./Assets";

export const CREW = [
  { id: "ev1", name: "Elena Ruiz", role: "EV1", url: "./models/astronaut_elena.glb", color: "#6fd6e6" },
  { id: "ev2", name: "Tomas Okafor", role: "EV2", url: "./models/astronaut_tomas.glb", color: "#f4c552" },
] as const;

const HEIGHT_M = 1.85;          // suited astronaut, boots to helmet top
const MODEL_YAW = 0;            // the meshes already face +z, the walking direction below

function AstronautGLB({ url, layer }: { url: string; layer?: number }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The source meshes carry no normals; compute smooth ones so the Mars sun shades the suit.
      if (!mesh.geometry.attributes.normal) { mesh.geometry = mesh.geometry.clone(); mesh.geometry.computeVertexNormals(); }
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = new THREE.MeshStandardMaterial({ map: src.map ?? null, roughness: 0.78, metalness: 0.05, flatShading: false });
    });
    const box = new THREE.Box3().setFromObject(o);
    const s = HEIGHT_M / Math.max(1e-3, box.max.y - box.min.y);
    o.scale.setScalar(s);
    o.position.y = -box.min.y * s;
    o.rotation.y = MODEL_YAW;
    if (layer) o.traverse((m) => m.layers.set(layer)); // EV1's suit is hidden from EV1's own visor camera
    return o;
  }, [scene, layer]);
  return <primitive object={obj} />;
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const ORIGIN = new THREE.Vector3();

/** One crew member with a ground ring in their colour (the colour every panel uses for them). */
function Member({ url, color, layer }: { url: string; color: string; layer?: number }) {
  const fb = <Astronaut position={ORIGIN} color={color} layer={layer} />;
  return (
    <group ref={(g) => { if (layer) g?.traverse((o) => o.layers.set(layer)); }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={2}>
        <ringGeometry args={[0.42, 0.52, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.12, 0.03, 0.1]} renderOrder={1}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <Fallback fallback={fb}><Suspense fallback={fb}><AstronautGLB url={url} layer={layer} /></Suspense></Fallback>
    </group>
  );
}

/**
 * EV1 and EV2, side by side 3 m apart across the walking direction, facing where they walk. Placed every frame
 * from the live mission clock, so they glide during a rehearsal instead of stepping at the 20 Hz rate of the
 * shared state. `standby` is where they wait by the airlock before there is a crew position.
 */
export function CrewPair({ bundle, standby, showEv1 }: { bundle: SiteBundle; standby: THREE.Vector3[]; showEv1: boolean }) {
  const outer = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const body = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const gait = useRef({ phase: 0, amp: 0, yaw: 0, last: new THREE.Vector3(), init: false });
  useFrame((state, dt) => {
    const pose = liveCrewPose();
    const g = gait.current;
    let pa: THREE.Vector3, pb: THREE.Vector3, yaw = g.yaw;
    if (!pose) { pa = standby[0]; pb = standby[1]; }
    else {
      const h = (pose.heading * Math.PI) / 180, px = Math.cos(h) * 1.5, py = -Math.sin(h) * 1.5;
      pa = toScene(bundle, pose.x + px, pose.y + py);
      pb = toScene(bundle, pose.x - px, pose.y - py);
      // Scene: x east, z south. Facing the walking direction (sin h, -cos h) from the model's +z.
      yaw = Math.atan2(Math.sin(h), -Math.cos(h));
    }
    // Ground speed actually shown (m/s on screen), from the midpoint of the pair.
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const speed = g.init && dt > 0 ? mid.distanceTo(g.last) / dt : 0;
    g.last.copy(mid); g.init = true;
    const moving = Math.min(1, speed / 0.6);
    g.amp += (moving - g.amp) * Math.min(1, dt * 6);
    // Step cadence follows speed up to a brisk 2.2 steps per second; time-lapse glides instead of flailing.
    g.phase += dt * Math.PI * 2 * Math.min(2.2, 0.9 + speed * 0.9) * (g.amp > 0.02 ? 1 : 0);
    let dy = yaw - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.yaw += dy * Math.min(1, dt * 8);
    const t = state.clock.elapsedTime;
    [pa, pb].forEach((p, i) => {
      const o = outer[i].current, b = body[i].current;
      if (!o || !b) return;
      o.position.copy(p);
      o.rotation.y = g.yaw;
      const ph = g.phase + i * 1.9;
      b.position.y = Math.abs(Math.sin(ph)) * 0.05 * g.amp + Math.sin(t * 1.6 + i) * 0.006 * (1 - g.amp);
      b.rotation.x = 0.08 * g.amp;                 // lean into the walk
      b.rotation.z = Math.sin(ph) * 0.035 * g.amp;  // weight shifting foot to foot
    });
  });
  return (
    <>
      {showEv1 && <group ref={outer[0]} position={standby[0]}><group ref={body[0]}><Member url={CREW[0].url} color={CREW[0].color} layer={2} /></group></group>}
      <group ref={outer[1]} position={standby[1]}><group ref={body[1]}><Member url={CREW[1].url} color={CREW[1].color} /></group></group>
    </>
  );
}

useGLTF.preload(CREW[0].url);
useGLTF.preload(CREW[1].url);
