import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore, type View } from "../store/store";
import type { SiteBundle } from "../data/bundle";
import { declinationDeg } from "../engine/environment";
import { sunAt } from "../engine/sun";
import { Terrain } from "./Terrain";
import { Sky } from "./Sky";
import { Surroundings } from "./Surroundings";
import { RouteHome } from "./RouteHome";
import { Astronaut, Habitat, Rover, TargetPins, toScene } from "./Assets";

type Mode = "hero" | View;

function Lights({ lat }: { lat: number }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    const s = sunAt(useStore.getState().lmstHours, lat, declinationDeg(useStore.getState().lsDeg));
    const day = Math.max(0, Math.min(1, (s.elevationDeg + 3) / 12));
    if (sun.current) {
      sun.current.position.set(s.dir[0] * 3000, s.dir[1] * 3000, s.dir[2] * 3000);
      sun.current.intensity = 2.6 * day;
    }
    if (hemi.current) hemi.current.intensity = 0.35 + 0.6 * day;
  });
  return (
    <>
      <directionalLight ref={sun} color="#ffe6cc" />
      <hemisphereLight ref={hemi} args={["#c9a27c", "#3a2418", 0.8]} />
    </>
  );
}

/** Flags the first rendered frame so the UI can lift its loading veil. */
function FirstFrame() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => useStore.getState().set({ sceneReady: true }));
  });
  return null;
}

function CameraRig({ mode, bundle }: { mode: Mode; bundle: SiteBundle }) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const m = bundle.manifest;
  const hab = m.havens.find((h) => h.type === "habitat")!;
  const habP = useMemo(() => toScene(bundle, hab.x, hab.y), [bundle, hab.x, hab.y]);
  const goal = m.targets.find((t) => t.type === "ridge") ?? m.targets[0];
  const goalP = useMemo(() => toScene(bundle, goal.x, goal.y), [bundle, goal.x, goal.y]);

  useEffect(() => {
    const c = controls.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "tablet") {
      cam.position.set(0, 4300, 0.01);
      c?.target.set(0, 0, 0);
      cam.fov = 40;
    } else if (mode === "hud") {
      const dir = goalP.clone().sub(habP).setY(0).normalize();
      const eye = toScene(bundle, hab.x + dir.x * 40, hab.y - dir.z * 40, 1.7);
      cam.position.copy(eye);
      c?.target.copy(eye.clone().add(dir.multiplyScalar(0.5)));
      cam.fov = 70;
    } else if (mode === "hero") {
      cam.position.set(habP.x - 900, habP.y + 520, habP.z + 1250);
      c?.target.set(habP.x + 350, habP.y - 40, habP.z - 250);
      cam.fov = 38;
    } else {
      cam.position.set(habP.x - 700, habP.y + 900, habP.z + 1300);
      c?.target.set(habP.x + 250, habP.y - 60, habP.z - 200);
      cam.fov = 45;
    }
    cam.near = mode === "hud" ? 0.1 : 1;
    cam.updateProjectionMatrix();
    c?.update();
  }, [mode, camera, habP, goalP, bundle, hab.x, hab.y]);

  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotate={mode === "hero" && !reduced}
      autoRotateSpeed={0.25}
      enabled={mode !== "hero"}
      enableRotate={mode !== "tablet"}
      enablePan={mode === "console" || mode === "tablet"}
      enableZoom={mode !== "hud"}
      screenSpacePanning={mode === "tablet"}
      maxPolarAngle={mode === "hud" ? Math.PI * 0.62 : Math.PI * 0.47}
      minDistance={mode === "hud" ? 0.1 : 60}
      maxDistance={7000}
      rotateSpeed={mode === "hud" ? -0.35 : 0.6}
    />
  );
}

function World({ bundle, mode }: { bundle: SiteBundle; mode: Mode }) {
  const m = bundle.manifest;
  const roverActive = useStore((s) => s.roverActive);
  const showHavens = useStore((s) => s.layers.havens);
  const hab = m.havens.find((h) => h.type === "habitat")!;
  const rover = m.havens.find((h) => h.type === "rover");
  const goal = m.targets.find((t) => t.type === "ridge") ?? m.targets[0];
  const crewPos = useMemo(() => {
    const dx = goal.x - hab.x, dy = goal.y - hab.y, d = Math.hypot(dx, dy);
    const ux = dx / d, uy = dy / d;
    return [toScene(bundle, hab.x + ux * 60 - uy * 2, hab.y + uy * 60 + ux * 2), toScene(bundle, hab.x + ux * 57 + uy * 2, hab.y + uy * 57 - ux * 2)];
  }, [bundle, goal.x, goal.y, hab.x, hab.y]);
  const habP = useMemo(() => toScene(bundle, hab.x, hab.y), [bundle, hab.x, hab.y]);

  const onClick = (e: { point: THREE.Vector3; delta: number }) => {
    if (mode === "hero" || mode === "hud" || e.delta > 6) return; // ignore drags
    useStore.getState().set({ selected: { x: e.point.x, y: -e.point.z } });
  };
  const onMove = (e: { point: THREE.Vector3 }) => {
    if (mode === "hero") return;
    useStore.getState().set({ cursor: { x: e.point.x, y: -e.point.z } });
  };

  return (
    <>
      <Sky />
      <Lights lat={m.crs.origin.lat} />
      <Surroundings bundle={bundle} />
      <group onClick={onClick} onPointerMove={onMove} onPointerOut={() => useStore.getState().set({ cursor: null })}>
        <Terrain bundle={bundle} segments={mode === "hero" ? 320 : 448} />
      </group>
      {showHavens && <Habitat position={habP} />}
      {showHavens && rover && <Rover bundle={bundle} x={rover.x} y={rover.y} active={roverActive} />}
      <Astronaut position={crewPos[0]} color="#6fd6e6" />
      <Astronaut position={crewPos[1]} color="#f4c552" phase={1.4} />
      {mode !== "hud" && mode !== "hero" && <TargetPins bundle={bundle} />}
      {mode !== "hero" && <RouteHome bundle={bundle} />}
      <CameraRig mode={mode} bundle={bundle} />
      <FirstFrame />
    </>
  );
}

export function Scene({ bundle, mode }: { bundle: SiteBundle; mode: Mode }) {
  const ready = useStore((s) => s.sceneReady);
  useEffect(() => () => useStore.getState().set({ sceneReady: false }), []);
  return (
    <>
    {!ready && <div className="scene-veil" role="status"><span className="loading-ring" aria-hidden />Preparing Gale terrain</div>}
    <Canvas
      className="scene"
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, powerPreference: "high-performance" }}
      camera={{ fov: 45, near: 1, far: 40000, position: [0, 1500, 2500] }}
      onCreated={({ gl }) => gl.setClearColor("#0a1322")}
    >
      <Suspense fallback={null}>
        <World bundle={bundle} mode={mode} />
      </Suspense>
    </Canvas>
    </>
  );
}
