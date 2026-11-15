import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
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
import { TargetPins, toScene } from "./Assets";
import { CrewPair } from "./Crew";
import { StoryCamera } from "./StoryCamera";
import { isLive } from "../engine/useMission";
import { visualCrewPose } from "./habitatFootprint";
import { meshHeightAt, VERT_EXAG as EXAG } from "./Terrain";

type Mode = "hero" | "story" | View;

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
  // Checks the store rather than a one-shot flag: a remount (or React's development double mount) clears
  // sceneReady after the first frame, which left the loading veil over the view, costing paint on every frame.
  useFrame(() => {
    if (useStore.getState().sceneReady) return;
    requestAnimationFrame(() => useStore.getState().set({ sceneReady: true }));
  });
  return null;
}

function CameraRig({ mode, bundle }: { mode: Mode; bundle: SiteBundle }) {
  const { camera, gl } = useThree();
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

  // Eye-level cameras that follow the crew: EV1's visor, third person behind EV1, and the support rover cab.
  const placeFollow = (pose: { x: number; y: number; heading: number } | null) => {
    const c = controls.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "hud") {
      // EV1's eye, 1.7 m above the ground, looking along the walking direction.
      const h = pose ? (pose.heading * Math.PI) / 180 : Math.atan2(goalP.x - habP.x, -(goalP.z - habP.z));
      const dx = Math.sin(h), dy = Math.cos(h);
      const bx = pose ? pose.x + Math.cos(h) * 1.5 : hab.x + dx * 30, by = pose ? pose.y - Math.sin(h) * 1.5 : hab.y + dy * 30;
      const eye = toScene(bundle, bx, by, 1.7);
      const ahead = toScene(bundle, bx + dx * 40, by + dy * 40, 1.7);
      cam.position.copy(eye);
      c?.target.copy(eye.clone().add(ahead.sub(eye).normalize().multiplyScalar(0.5)));
    } else if (mode === "eva") {
      // Third person: start 7 m behind and 3 m above the pair, looking at their chests. Drag to orbit, scroll to
      // zoom; the camera then keeps that offset while it follows them (see the frame loop below).
      const h = pose ? (pose.heading * Math.PI) / 180 : Math.atan2(goalP.x - habP.x, -(goalP.z - habP.z));
      const dx = Math.sin(h), dy = Math.cos(h);
      const px = pose?.x ?? hab.x + dx * 20, py = pose?.y ?? hab.y + dy * 20;
      const look = toScene(bundle, px, py, 1.25);
      const eye = toScene(bundle, px - dx * 7, py - dy * 7, 0);
      eye.y = Math.max(eye.y, look.y) + 3;
      cam.position.copy(eye);
      c?.target.copy(look);
    } else if (mode === "rover") {
      // Support rover cab, 3 m up, looking at the crew (or the first stop before egress).
      const rv = m.havens.find((h) => h.type === "rover");
      const rx = rv?.x ?? hab.x + 60, ry = rv?.y ?? hab.y;
      const tx = pose?.x ?? goal.x, ty = pose?.y ?? goal.y;
      const eye = toScene(bundle, rx, ry, 3.2);
      cam.position.copy(eye);
      const look = toScene(bundle, tx, ty, 1.5);
      c?.target.copy(eye.clone().add(look.sub(eye).normalize().multiplyScalar(0.5)));
    }
  };
  // Third person: carry the camera with the crew every frame, keeping the orbit the user dragged to, and keep it
  // above the ground. Visor and rover cab: re-aim every frame while the crew is moving.
  // Third person: shift the picture down a little so the crew sit in the clear middle, above the visor's cards.
  const size = useThree((s) => s.size);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "eva") cam.setViewOffset(size.width, size.height, 0, Math.round(size.height * 0.14), size.width, size.height);
    else if (cam.view) cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [mode, camera, size.width, size.height]);
  useFrame(() => {
    const c = controls.current;
    if (mode === "eva" && c) {
      const pose = visualCrewPose();
      const fallbackH = Math.atan2(goalP.x - habP.x, -(goalP.z - habP.z));
      const px = pose?.x ?? hab.x + Math.sin(fallbackH) * 20, py = pose?.y ?? hab.y + Math.cos(fallbackH) * 20;
      const want = toScene(bundle, px, py, 1.25);
      const delta = want.sub(c.target);
      c.target.add(delta); camera.position.add(delta);
      const zMid = (bundle.manifest.elevation.min + bundle.manifest.elevation.max) / 2;
      const E = bundle.manifest.grid.extentM / 2;
      const cx = camera.position.x, cy = -camera.position.z;
      if (Math.abs(cx) < E && Math.abs(cy) < E) {
        const ground = (meshHeightAt(bundle, cx, cy) - zMid) * EXAG + 0.6;
        if (camera.position.y < ground) camera.position.y = ground;
      }
      c.update();
      return;
    }
    if (!(mode === "hud" || mode === "rover") || !isLive()) return;
    placeFollow(visualCrewPose());
    c?.update();
  });

  // Third person: R or a double-click puts the camera back behind the crew after orbiting away.
  useEffect(() => {
    if (mode !== "eva") return;
    const reset = () => { placeFollow(visualCrewPose()); controls.current?.update(); };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) reset();
    };
    window.addEventListener("keydown", key);
    gl.domElement.addEventListener("dblclick", reset);
    return () => { window.removeEventListener("keydown", key); gl.domElement.removeEventListener("dblclick", reset); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, gl, bundle]);

  // Fly to what the user picks (a stop, a point on the ground) in the map views: the focus glides there with a
  // critically damped approach, keeping the current angle and zoom. Grabbing the map cancels it mid-flight.
  const fly = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    if (!(mode === "console" || mode === "linked" || mode === "tablet")) return;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.selected === prev.selected || !s.selected || s.selected.label === "Crew position" || s.playing) return;
      fly.current = toScene(bundle, s.selected.x, s.selected.y);
    });
    const c = controls.current;
    const cancel = () => { fly.current = null; };
    c?.addEventListener("start", cancel);
    return () => { unsub(); c?.removeEventListener("start", cancel); };
  }, [mode, bundle]);
  useFrame((_, dt) => {
    const c = controls.current, goal = fly.current;
    if (!c || !goal) return;
    const d = goal.clone().sub(c.target);
    if (d.length() < 0.5) { fly.current = null; return; }
    d.multiplyScalar(1 - Math.exp(-dt * 4.5));
    c.target.add(d); camera.position.add(d);
    c.update();
  });

  useEffect(() => {
    const c = controls.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "tablet") {
      cam.position.set(0, 4300, 0.01);
      c?.target.set(0, 0, 0);
      cam.fov = 40;
    } else if (mode === "hud" || mode === "eva" || mode === "rover") {
      placeFollow(livePos);
      cam.fov = mode === "hud" ? 70 : mode === "eva" ? 55 : 58;
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
  }, [mode, camera, habP, goalP, focus, bundle, hab.x, hab.y, mode === "hud" ? livePos : null, mode === "rover" ? (livePos ? Math.round(livePos.x / 10) * 1000 + Math.round(livePos.y / 10) : 0) : 0]);

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
      maxPolarAngle={mode === "hud" || mode === "rover" ? Math.PI * 0.62 : mode === "eva" ? Math.PI * 0.53 : Math.PI * 0.47}
      minDistance={mode === "hud" || mode === "rover" ? 0.1 : mode === "eva" ? 2.5 : topView ? 25 : 60}
      maxDistance={mode === "eva" ? 80 : 7000}
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

  const storyChapter = useStore((s) => s.storyChapter);
  const onClick = (e: { point: THREE.Vector3; delta: number }) => {
    if (mode === "hero" || mode === "hud" || mode === "rover" || mode === "eva" || e.delta > 6) return; // ignore drags
    if (mode === "story" && storyChapter !== 4) return; // on the landing page only the "pick a point" chapter
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
      <CrewPair bundle={bundle} standby={crewPos} showEv1={mode !== "hud"} />
      {mode !== "hud" && mode !== "hero" && <TargetPins bundle={bundle} />}
      {mode !== "hero" && <RouteHome bundle={bundle} marker={mode !== "hud" && mode !== "story"} />}
      {(mode === "hud" || mode === "eva") && <VisorPath bundle={bundle} />}
      {(mode === "hud" || mode === "eva") && <VisorAnchors />}
      {mode !== "hero" && mode !== "hud" && mode !== "eva" && (mode !== "story" || storyChapter >= 5) && <PlanRoute bundle={bundle} />}
      {mode !== "hero" && <CuriosityTraverse bundle={bundle} />}
      {mode === "story" ? <StoryCamera bundle={bundle} /> : <CameraRig mode={mode} bundle={bundle} />}
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
  // Adaptive resolution: start at 1.5x on high-density screens (full 2x costs about a quarter of the frame rate
  // for little visible gain on terrain), then step down to 1x or back up to the screen's density as the measured
  // frame rate allows. Never changes the data, only how many pixels are drawn.
  const maxDpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(() => Math.min(maxDpr, 1.5));
  // Development only: lets automated checks pin the resolution for repeatable measurements.
  if (import.meta.env.DEV) (window as unknown as { __setDpr?: unknown }).__setDpr = setDpr;
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
      dpr={low ? 1 : dpr}
      gl={{ antialias: !low, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, powerPreference: low ? "default" : "high-performance" }}
      camera={{ fov: 45, near: 1, far: 170000, position: [0, 1500, 2500] }}
      onCreated={({ gl }) => gl.setClearColor("#0a1322")}
    >
      {!low && (
        <PerformanceMonitor
          bounds={() => [45, 58]}
          flipflops={4}
          onDecline={() => setDpr((d) => Math.max(1, Math.round((d - 0.25) * 4) / 4))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, Math.round((d + 0.25) * 4) / 4))}
          onFallback={() => setDpr(1)}
        />
      )}
      <Suspense fallback={null}>
        <World bundle={bundle} mode={mode} />
      </Suspense>
    </Canvas>
    </>
  );
}
