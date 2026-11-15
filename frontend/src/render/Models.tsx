// Team 3D models (Harishik's concept designs): the two-module field habitat and Rover Variant A, a pressurized
// exploration rover. Compressed with meshopt (decoder bundled with three, no network). Placed at true scale.
import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { SiteBundle } from "../data/bundle";
import { Habitat as HabitatBlock, Rover as RoverBlock } from "./Assets";
import { meshHeightAt, VERT_EXAG } from "./Terrain";
import { ContactShadow } from "./ContactShadow";
import { useStore } from "../store/store";

const HAB_URL = "./models/habitat.glb";
const ROVER_URL = "./models/rover.glb";

/** Site-frame point at local (lx right-left, lz forward) offsets from a centre, for a heading (rad from north). */
function offset(x: number, y: number, heading: number, lx: number, lz: number) {
  return [x + Math.sin(heading) * lz - Math.cos(heading) * lx, y + Math.cos(heading) * lz + Math.sin(heading) * lx] as const;
}

function HabitatGLB({ bundle, x, y, heading }: { bundle: SiteBundle; x: number; y: number; heading: number }) {
  const { scene } = useGLTF(HAB_URL);
  const obj = useMemo(() => scene.clone(true), [scene]);
  // Rest on the footpads: the model's base is at y = 0; sit on the highest of the four footprint corners
  // (the landing legs are height adjustable), so no part goes into the ground.
  const { min, max } = bundle.manifest.elevation, zMid = (min + max) / 2;
  const corners = [[-10, -2], [-10, 4], [5.5, -2], [5.5, 4], [-2, 1]].map(([lx, lz]) => { const [px, py] = offset(x, y, heading, -lx, lz); return meshHeightAt(bundle, px, py); });
  const base = (Math.max(...corners) - zMid) * VERT_EXAG;
  return <>
    <primitive object={obj} position={[x, base, -y]} rotation={[0, heading, 0]} />
    <ContactShadow position={new THREE.Vector3(x, base, -y)} width={19} length={9} heading={heading} />
  </>;
}

function RoverGLB({ bundle, x, y, heading }: { bundle: SiteBundle; x: number; y: number; heading: number }) {
  const { scene } = useGLTF(ROVER_URL);
  const obj = useMemo(() => scene.clone(true), [scene]);
  // Wheel contacts (model: wheels at about +-1.35 m across, axles at +-2.6 m along). Fit the body to the four
  // contact heights: centre height, pitch from front-rear, roll from left-right. Wheels stay on the surface.
  const { min, max } = bundle.manifest.elevation, zMid = (min + max) / 2;
  const W = 1.35, L = 2.6;
  const h = (lx: number, lz: number) => { const [px, py] = offset(x, y, heading, lx, lz); return meshHeightAt(bundle, px, py); };
  const fl = h(W, L), fr = h(-W, L), rl = h(W, -L), rr = h(-W, -L);
  const centre = ((fl + fr + rl + rr) / 4 - zMid) * VERT_EXAG;
  const pitch = Math.atan2(((fl + fr) - (rl + rr)) / 2 * VERT_EXAG, 2 * L);
  const roll = Math.atan2(((fl + rl) - (fr + rr)) / 2 * VERT_EXAG, 2 * W);
  const rot = useMemo(() => new THREE.Euler(-pitch, Math.PI - heading, roll, "YXZ"), [pitch, roll, heading]);
  return <>
    <primitive object={obj} position={[x, centre, -y]} rotation={rot} />
    <ContactShadow position={new THREE.Vector3(x, centre, -y)} width={3.8} length={8.2} heading={-heading} />
  </>;
}

/** A model that fails to load falls back to the simple shape instead of breaking the scene. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function HabitatModel({ bundle, x, y, position }: { bundle: SiteBundle; x: number; y: number; position: THREE.Vector3 }) {
  const low = useStore((s) => s.quality === "low");
  if (low) return <HabitatBlock position={position} />;
  const fb = <HabitatBlock position={position} />;
  return <Fallback fallback={fb}><Suspense fallback={fb}><HabitatGLB bundle={bundle} x={x} y={y} heading={0.6} /></Suspense></Fallback>;
}

export function RoverModel({ bundle, x, y, active }: { bundle: SiteBundle; x: number; y: number; active: boolean }) {
  const low = useStore((s) => s.quality === "low");
  if (low) return <RoverBlock bundle={bundle} x={x} y={y} active={active} />;
  const fb = <RoverBlock bundle={bundle} x={x} y={y} active={active} />;
  return <Fallback fallback={fb}><Suspense fallback={fb}><RoverGLB bundle={bundle} x={x} y={y} heading={1.1} /></Suspense></Fallback>;
}
