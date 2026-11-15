// Team 3D models (Harishik's concept designs): the two-module field habitat and Rover Variant A, a pressurized
// exploration rover. Compressed with meshopt (decoder bundled with three, no network). Placed at true scale.
import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { SiteBundle } from "../data/bundle";
import { toScene, Habitat as HabitatBlock, Rover as RoverBlock } from "./Assets";
import { useStore } from "../store/store";

const HAB_URL = "./models/habitat.glb";
const ROVER_URL = "./models/rover.glb";

function HabitatGLB({ position, heading }: { position: THREE.Vector3; heading: number }) {
  const { scene } = useGLTF(HAB_URL);
  const obj = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={obj} position={position} rotation={[0, heading, 0]} />;
}

function RoverGLB({ bundle, x, y, heading }: { bundle: SiteBundle; x: number; y: number; heading: number }) {
  const { scene } = useGLTF(ROVER_URL);
  const obj = useMemo(() => scene.clone(true), [scene]);
  const base = toScene(bundle, x, y);
  // Pitch from the terrain under the front and rear axles (3 m apart along the heading).
  const f = toScene(bundle, x + Math.sin(heading) * 3, y + Math.cos(heading) * 3), r = toScene(bundle, x - Math.sin(heading) * 3, y - Math.cos(heading) * 3);
  const pitch = Math.atan2(f.y - r.y, 6);
  return (
    <group position={base} rotation={[0, Math.PI - heading, 0]}>
      <primitive object={obj} rotation={[-pitch, 0, 0]} />
    </group>
  );
}

/** A model that fails to load falls back to the simple shape instead of breaking the scene. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function HabitatModel({ position }: { position: THREE.Vector3 }) {
  const low = useStore((s) => s.quality === "low");
  if (low) return <HabitatBlock position={position} />;
  const fb = <HabitatBlock position={position} />;
  return <Fallback fallback={fb}><Suspense fallback={fb}><HabitatGLB position={position} heading={0.6} /></Suspense></Fallback>;
}

export function RoverModel({ bundle, x, y, active }: { bundle: SiteBundle; x: number; y: number; active: boolean }) {
  const low = useStore((s) => s.quality === "low");
  if (low) return <RoverBlock bundle={bundle} x={x} y={y} active={active} />;
  const fb = <RoverBlock bundle={bundle} x={x} y={y} active={active} />;
  return <Fallback fallback={fb}><Suspense fallback={fb}><RoverGLB bundle={bundle} x={x} y={y} heading={1.1} /></Suspense></Fallback>;
}
