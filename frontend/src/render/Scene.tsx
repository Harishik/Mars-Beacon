import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore, type View } from "../store/store";
import type { SiteBundle } from "../data/bundle";
import { sunMars24 } from "../engine/sun";
import { Terrain } from "./Terrain";
import { Sky } from "./Sky";
import { Surroundings } from "./Surroundings";
import { RouteHome } from "./RouteHome";
import { PlanRoute } from "./PlanRoute";
import { LinkedViews } from "./LinkedViews";
import { CuriosityTraverse } from "./Traverse";
import { Boulders } from "./Boulders";
import { Splats } from "./Splats";
import { VisorPath } from "./VisorPath";
import { HabitatModel, RoverModel } from "./Models";
import { VisorAnchors } from "./VisorAnchors";
import { Patches } from "./Patches";
import { Astronaut, TargetPins, toScene } from "./Assets";

type Mode = "hero" | View;

function Lights({ lat }: { lat: number }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    const s = sunMars24(useStore.getState().lsDeg, useStore.getState().lmstHours, lat, useStore.getState().bundle?.manifest.crs.origin.lon ?? 137.38);
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
  const livePos = useStore((s) => s.crewPos);
  const topView = useStore((s) => s.topView) && (mode === "console" || mode === "linked");
  // Toggle the 2D planning view: straight down over the current focus, keeping the zoom.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cam = camera as THREE.PerspectiveCamera;
    const d = Math.max(150, cam.position.distanceTo(c.target));
    if (topView) cam.position.set(c.target.x, c.target.y + d, c.target.z + 0.01);
    else cam.position.set(c.target.x - d * 0.3, c.target.y + d * 0.7, c.target.z + d * 0.65);
    c.update();
  }, [topView, camera]);
  const goal = m.targets.find((t) => t.type === "ridge") ?? m.targets[0];
  const goalP = useMemo(() => toScene(bundle, goal.x, goal.y), [bundle, goal.x, goal.y]);
  // Frame the working area: habitat and stops.
  const focus = useMemo(() => {
    const pts = [hab, ...m.targets];
    const fx = pts.reduce((a, p) => a + p.x, 0) / pts.length, fy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const span = Math.max(300, ...pts.map((p) => Math.hypot(p.x - fx, p.y - fy)));
    return { p: toScene(bundle, fx, fy), span };
  }, [bundle, hab, m.targets]);

  useEffect(() => {
    const c = controls.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "tablet") {
      cam.position.set(0, 4300, 0.01);
      c?.target.set(0, 0, 0);
      cam.fov = 40;
    } else if (mode === "hud") {
      // EV1's eye, 1.7 m above the ground, looking along the walking direction.
      const h = livePos ? (livePos.heading * Math.PI) / 180 : Math.atan2(goalP.x - habP.x, -(goalP.z - habP.z));
      const dx = Math.sin(h), dy = Math.cos(h);
      const bx = livePos ? livePos.x + Math.cos(h) * 1.5 : hab.x + dx * 30, by = livePos ? livePos.y - Math.sin(h) * 1.5 : hab.y + dy * 30;
      const eye = toScene(bundle, bx, by, 1.7);
      const ahead = toScene(bundle, bx + dx * 40, by + dy * 40, 1.7);
      cam.position.copy(eye);
      c?.target.copy(eye.clone().add(ahead.sub(eye).normalize().multiplyScalar(0.5)));
      cam.fov = 70;
    } else if (mode === "eva") {
      // Third person: 7 m behind and 3.2 m above EV1, looking at a point 12 m ahead of the pair.
      const h = livePos ? (livePos.heading * Math.PI) / 180 : Math.atan2(goalP.x - habP.x, -(goalP.z - habP.z));
      const dx = Math.sin(h), dy = Math.cos(h);
      const px = livePos?.x ?? hab.x + dx * 20, py = livePos?.y ?? hab.y + dy * 20;
      const eye = toScene(bundle, px - dx * 4.5, py - dy * 4.5, 2.4);
      const look = toScene(bundle, px + dx * 10, py + dy * 10, 0.9);
      cam.position.copy(eye);
      c?.target.copy(look);
      cam.fov = 55;
    } else if (mode === "rover") {
      // Support rover cab, 3 m up, looking at the crew (or the first stop before egress).
      const rv = m.havens.find((h) => h.type === "rover");
      const rx = rv?.x ?? hab.x + 60, ry = rv?.y ?? hab.y;
      const tx = livePos?.x ?? goal.x, ty = livePos?.y ?? goal.y;
      const eye = toScene(bundle, rx, ry, 3.2);
      cam.position.copy(eye);
      const look = toScene(bundle, tx, ty, 1.5);
      c?.target.copy(eye.clone().add(look.sub(eye).normalize().multiplyScalar(0.5)));
      cam.fov = 58;
    } else if (mode === "hero") {
      cam.position.set(habP.x - 900, habP.y + 520, habP.z + 1250);
      c?.target.set(habP.x + 350, habP.y - 40, habP.z - 250);
      cam.fov = 38;
    } else {
      const d = focus.span * 2.4;
      cam.position.set(focus.p.x - d * 0.35, focus.p.y + d * 0.75, focus.p.z + d * 0.9);
      c?.target.set(focus.p.x, focus.p.y, focus.p.z);
      cam.fov = 45;
    }
    if (mode === "eva") cam.layers.disable(1); else cam.layers.enable(1); // layer 1: selection markers
    cam.layers.enable(2); // layer 2: EV1's own suit, hidden from EV1's visor
    cam.near = mode === "hud" || mode === "rover" || mode === "eva" ? 0.1 : 1;
    cam.updateProjectionMatrix();
    c?.update();
    // Development only: lets automated checks frame the camera.
    if (import.meta.env.DEV) (window as unknown as { __cam?: unknown }).__cam = { cam, controls: c };
  }, [mode, camera, habP, goalP, focus, bundle, hab.x, hab.y, mode === "hud" || mode === "eva" ? livePos : null, mode === "rover" ? (livePos ? Math.round(livePos.x / 10) * 1000 + Math.round(livePos.y / 10) : 0) : 0]);

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
      enableRotate={mode !== "tablet" && !topView}
      enablePan={mode === "console" || mode === "tablet" || mode === "linked"}
      enableZoom={mode !== "hud" && mode !== "rover"}
      screenSpacePanning={mode === "tablet" || topView}
      maxPolarAngle={mode === "hud" || mode === "rover" ? Math.PI * 0.62 : Math.PI * 0.47}
      minDistance={mode === "hud" || mode === "rover" ? 0.1 : topView ? 25 : 60}
      maxDistance={7000}
      rotateSpeed={mode === "hud" || mode === "rover" ? -0.35 : 0.6}
    />
  );
}

function World({ bundle, mode }: { bundle: SiteBundle; mode: Mode }) {
  const m = bundle.manifest;
  const roverActive = useStore((s) => s.roverActive);
  const quality = useStore((s) => s.quality);
  const showSplats = useStore((s) => s.layers.patches);
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
  const livePos = useStore((s) => s.crewPos);
  const crewAt = useMemo(() => {
    if (!livePos) return null;
    // Side by side, 3 m apart, across the walking direction.
    const h = (livePos.heading * Math.PI) / 180, px = Math.cos(h) * 1.5, py = -Math.sin(h) * 1.5;
    return [toScene(bundle, livePos.x + px, livePos.y + py), toScene(bundle, livePos.x - px, livePos.y - py)];
  }, [bundle, livePos]);

  const onClick = (e: { point: THREE.Vector3; delta: number }) => {
    if (mode === "hero" || mode === "hud" || mode === "rover" || mode === "eva" || e.delta > 6) return; // ignore drags
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
      {quality === "high" && <Patches bundle={bundle} />}
      {quality === "high" && showSplats && <Splats bundle={bundle} />}
      {quality === "high" && <Boulders bundle={bundle} />}
      <group onClick={onClick} onPointerMove={onMove} onPointerOut={() => useStore.getState().set({ cursor: null })}>
        <Terrain bundle={bundle} segments={quality === "low" ? 256 : mode === "hero" ? 320 : 448} />
      </group>
      {showHavens && <HabitatModel bundle={bundle} x={hab.x} y={hab.y} position={habP} />}
      {showHavens && rover && mode !== "rover" && <RoverModel bundle={bundle} x={rover.x} y={rover.y} active={roverActive} />}
      {mode !== "hud" && <Astronaut position={(crewAt ?? crewPos)[0]} color="#6fd6e6" layer={2} />}
      <Astronaut position={(crewAt ?? crewPos)[1]} color="#f4c552" phase={1.4} />
      {mode !== "hud" && mode !== "hero" && <TargetPins bundle={bundle} />}
      {mode !== "hero" && <RouteHome bundle={bundle} marker={mode !== "hud"} />}
      {(mode === "hud" || mode === "eva") && <VisorPath bundle={bundle} />}
      {(mode === "hud" || mode === "eva") && <VisorAnchors />}
      {mode !== "hero" && mode !== "hud" && mode !== "eva" && <PlanRoute bundle={bundle} />}
      {mode !== "hero" && <CuriosityTraverse bundle={bundle} />}
      <CameraRig mode={mode} bundle={bundle} />
      {mode === "linked" && quality === "high" && <LinkedViews bundle={bundle} />}
      <FirstFrame />
    </>
  );
}

/** WebGL available? Checked once; without it the panels still work over a flat map image. */
let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl === null) {
    try { const c = document.createElement("canvas"); webgl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { webgl = false; }
  }
  return webgl;
}

export function Scene({ bundle, mode }: { bundle: SiteBundle; mode: Mode }) {
  const ready = useStore((s) => s.sceneReady);
  const low = useStore((s) => s.quality === "low");
  useEffect(() => () => useStore.getState().set({ sceneReady: false }), []);
  if (!hasWebGL()) {
    return (
      <div className="scene scene-fallback" style={bundle.orthoUrl ? { backgroundImage: `url(${bundle.orthoUrl})` } : undefined}>
        <p role="status">This browser cannot draw the 3D terrain (WebGL is off or unsupported). The HiRISE map, plans, envelope numbers and every panel still work.</p>
      </div>
    );
  }
  return (
    <>
    {!ready && <div className="scene-veil" role="status"><span className="loading-ring" aria-hidden />Preparing {bundle.manifest.site?.name ?? bundle.manifest.name}</div>}
    <Canvas
      className="scene"
      dpr={low ? 1 : [1, 2]}
      gl={{ antialias: !low, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, powerPreference: low ? "default" : "high-performance" }}
      camera={{ fov: 45, near: 1, far: 170000, position: [0, 1500, 2500] }}
      onCreated={({ gl }) => gl.setClearColor("#0a1322")}
    >
      <Suspense fallback={null}>
        <World bundle={bundle} mode={mode} />
      </Suspense>
    </Canvas>
    </>
  );
}
