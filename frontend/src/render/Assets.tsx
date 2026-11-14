// Habitat, support rover, two astronauts and science target pins, built in
// code (no Blender). No NASA logos, flags or mission marks.
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { sampleHeight, type SiteBundle } from "../data/bundle";
import { VERT_EXAG } from "./Terrain";
import { useStore } from "../store/store";

/** Site-frame metres (x east, y north) to scene coordinates. */
export function toScene(b: SiteBundle, x: number, y: number, lift = 0): THREE.Vector3 {
  const { min, max } = b.manifest.elevation;
  const zMid = (min + max) / 2;
  return new THREE.Vector3(x, (sampleHeight(b, x, y) - zMid) * VERT_EXAG + lift, -y);
}

const suit = new THREE.MeshStandardMaterial({ color: "#e9e4da", roughness: 0.65 });
const visor = new THREE.MeshStandardMaterial({ color: "#2a3a55", roughness: 0.1, metalness: 0.8 });
const hull = new THREE.MeshStandardMaterial({ color: "#d9d4ca", roughness: 0.5, metalness: 0.15 });
const dark = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.8 });
const regolith = new THREE.MeshStandardMaterial({ color: "#8e5434", roughness: 1 });

function Beacon({ color, y }: { color: string; y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = 0.55 + 0.45 * Math.sin(clock.elapsedTime * 2.4) ** 2;
  });
  return (
    <mesh ref={ref} position={[0, y, 0]}>
      <sphereGeometry args={[0.5, 16, 12]} />
      <meshBasicMaterial color={color} transparent />
    </mesh>
  );
}

export function Habitat({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      {/* Regolith berm */}
      <mesh material={regolith} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[9, 12, 2.6, 40]} />
      </mesh>
      {/* Pressurised module */}
      <mesh material={hull} position={[0, 3.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[3.2, 9, 8, 24]} />
      </mesh>
      {/* Airlock */}
      <mesh material={hull} position={[0, 2.6, 4.6]}>
        <cylinderGeometry args={[1.6, 1.6, 3.2, 24]} />
      </mesh>
      <mesh material={dark} position={[0, 2.4, 6.25]}>
        <boxGeometry args={[1.4, 2.0, 0.1]} />
      </mesh>
      {/* Antenna mast */}
      <mesh material={dark} position={[4, 8, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 8, 8]} />
      </mesh>
      <group position={[4, 12, 0]}><Beacon color="#8fbcf0" y={0} /></group>
    </group>
  );
}

export function Rover({ bundle, x, y, active }: { bundle: SiteBundle; x: number; y: number; active: boolean }) {
  const wheels = useMemo(() => [-2.2, 0, 2.2].flatMap((wx) => [[wx, -1.7], [wx, 1.7]] as [number, number][]), []);
  const base = toScene(bundle, x, y);
  // Body tilt from terrain under the front and rear axles.
  const front = toScene(bundle, x + 2.2, y), rear = toScene(bundle, x - 2.2, y);
  const pitch = Math.atan2(front.y - rear.y, 4.4);
  return (
    <group position={base} rotation={[0, 0, pitch]}>
      <mesh material={hull} position={[0, 1.6, 0]}>
        <boxGeometry args={[5.6, 1.4, 3.0]} />
      </mesh>
      <mesh material={visor} position={[1.9, 2.5, 0]}>
        <boxGeometry args={[1.6, 0.9, 2.6]} />
      </mesh>
      <mesh material={dark} position={[-0.6, 2.42, 0]}>
        <boxGeometry args={[3.2, 0.08, 2.8]} />
      </mesh>
      {wheels.map(([wx, wz], i) => (
        <mesh key={i} material={dark} position={[wx, 0.6, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.45, 18]} />
        </mesh>
      ))}
      <group position={[-1.8, 3.4, 0]}><Beacon color={active ? "#8fbcf0" : "#7f8797"} y={0} /></group>
    </group>
  );
}

export function Astronaut({ position, color, phase = 0 }: { position: THREE.Vector3; color: string; phase?: number }) {
  const legL = useRef<THREE.Mesh>(null), legR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.2 + phase;
    if (legL.current) legL.current.rotation.x = Math.sin(t) * 0.35;
    if (legR.current) legR.current.rotation.x = -Math.sin(t) * 0.35;
  });
  return (
    <group position={position} scale={1}>
      <mesh ref={legL} material={suit} position={[-0.17, 0.45, 0]}><capsuleGeometry args={[0.13, 0.6, 4, 10]} /></mesh>
      <mesh ref={legR} material={suit} position={[0.17, 0.45, 0]}><capsuleGeometry args={[0.13, 0.6, 4, 10]} /></mesh>
      <mesh material={suit} position={[0, 1.2, 0]}><capsuleGeometry args={[0.3, 0.55, 4, 14]} /></mesh>
      <mesh material={suit} position={[0, 1.25, -0.32]}><boxGeometry args={[0.55, 0.7, 0.28]} /></mesh>
      <mesh material={suit} position={[0, 1.78, 0]}><sphereGeometry args={[0.24, 18, 14]} /></mesh>
      <mesh material={visor} position={[0, 1.79, 0.1]}><sphereGeometry args={[0.19, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2.2]} /></mesh>
      <mesh position={[0, 2.25, -0.3]}><sphereGeometry args={[0.09, 10, 8]} /><meshBasicMaterial color={color} /></mesh>
    </group>
  );
}

export function TargetPins({ bundle }: { bundle: SiteBundle }) {
  const show = useStore((s) => s.layers.targets);
  if (!show) return null;
  return (
    <>
      {bundle.manifest.targets.map((t) => {
        const p = toScene(bundle, t.x, t.y);
        const col = t.type === "ridge" ? "#e2ad6e" : t.type === "hollow" ? "#b5a6f2" : "#ece5d8";
        return (
          <group key={t.id} position={p}>
            <mesh position={[0, 14, 0]}>
              <cylinderGeometry args={[0.35, 0.35, 28, 6]} />
              <meshBasicMaterial color={col} transparent opacity={0.7} />
            </mesh>
            <mesh position={[0, 28, 0]}>
              <octahedronGeometry args={[2.6]} />
              <meshBasicMaterial color={col} />
            </mesh>
            <Html position={[0, 34, 0]} center distanceFactor={1600} zIndexRange={[10, 0]}>
              <div className="pin-label"><span className="pin-dot" style={{ background: col }} />{t.name}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
