// Linked displays: the habitat console view fills the screen and the field tablet
// and helmet visor render into two insets from the SAME scene and the SAME mission
// state, so the envelope, route and crew position always agree across displays.
import { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../store/store";
import type { SiteBundle } from "../data/bundle";
import { toScene } from "./Assets";

/** Inset rectangles in CSS pixels, measured from the bottom-right of the canvas. */
export const INSETS = { w: 400, h: 225, right: 16, bottom: 120, gap: 12 };

export function LinkedViews({ bundle }: { bundle: SiteBundle }) {
  const { gl, scene, camera, size } = useThree();
  const tabletCam = useMemo(() => { const c = new THREE.PerspectiveCamera(40, INSETS.w / INSETS.h, 1, 40000); c.layers.enable(1); c.layers.enable(2); return c; }, []);
  const visorCam = useMemo(() => new THREE.PerspectiveCamera(70, INSETS.w / INSETS.h, 0.1, 40000), []);

  // Priority 1: this callback takes over rendering for the whole canvas.
  useFrame(() => {
    const s = useStore.getState();
    const pos = s.crewPos;
    const hab = bundle.manifest.havens.find((h) => h.type === "habitat")!;
    const px = pos?.x ?? hab.x, py = pos?.y ?? hab.y;
    const heading = ((pos?.heading ?? 0) * Math.PI) / 180;

    // Tablet: top-down, 900 m across, centred on the crew, north up.
    const c = toScene(bundle, px, py);
    tabletCam.position.set(c.x, c.y + 1050, c.z + 0.01);
    tabletCam.lookAt(c.x, c.y, c.z);
    // Visor: EV1's eye, 1.7 m up, looking along the walking direction.
    const ex = px + Math.cos(heading) * 1.5, ey = py - Math.sin(heading) * 1.5;
    const eye = toScene(bundle, ex, ey, 1.7);
    const ahead = toScene(bundle, ex + Math.sin(heading) * 40, ey + Math.cos(heading) * 40, 1.7);
    visorCam.position.copy(eye);
    visorCam.lookAt(ahead);

    const W = size.width, H = size.height;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, W, H);
    gl.render(scene, camera);
    if (W < 1100) return; // insets need room; small screens show the main view only
    gl.setScissorTest(true);
    const x = W - INSETS.right - INSETS.w;
    const rects: [THREE.PerspectiveCamera, number][] = [
      [visorCam, INSETS.bottom],
      [tabletCam, INSETS.bottom + INSETS.h + INSETS.gap],
    ];
    for (const [cam, y] of rects) {
      gl.setViewport(x, y, INSETS.w, INSETS.h);
      gl.setScissor(x, y, INSETS.w, INSETS.h);
      gl.clear();
      gl.render(scene, cam);
    }
    gl.setScissorTest(false);
    gl.setViewport(0, 0, W, H);
  }, 1);
  return null;
}
