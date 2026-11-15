// Helmet visor world layer: the planned path projected on the ground ahead (animated chevrons, coloured by slope),
// rings around boulders near the path, amber marks on steep cells, and light beams over the next stop and home.
import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SiteBundle } from "../data/bundle";
import { useStore } from "../store/store";
import { toScene } from "./Assets";
import { useVisor } from "../engine/useVisor";

const ribbonVert = /* glsl */ `
  attribute float along; attribute float side; attribute float slope;
  varying float vAlong; varying float vSide; varying float vSlope;
  void main() { vAlong = along; vSide = side; vSlope = slope; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const ribbonFrag = /* glsl */ `
  uniform float uTime; varying float vAlong; varying float vSide; varying float vSlope;
  void main() {
    vec3 safe = vec3(0.35, 0.95, 1.0), warn = vec3(1.0, 0.72, 0.25), bad = vec3(1.0, 0.33, 0.25);
    vec3 col = vSlope < 12.0 ? safe : (vSlope < 18.0 ? warn : bad);
    float edge = smoothstep(0.82, 1.0, abs(vSide));
    float chev = fract((vAlong - abs(vSide) * 0.9) / 2.2 - uTime * 0.6);
    float c = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.32, 0.45, chev));
    float fade = 1.0 - smoothstep(120.0, 250.0, vAlong);
    float a = (0.22 + 0.5 * c + 0.65 * edge) * fade;
    gl_FragColor = vec4(mix(col * 0.75, vec3(1.0), 0.35 * c), a);
  }
`;

function Ribbon({ bundle, pts }: { bundle: SiteBundle; pts: { x: number; y: number; slope: number }[] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    // Drawn on top like an AR projection: the 4 m terrain mesh can sit above the sampled path height.
    vertexShader: ribbonVert, fragmentShader: ribbonFrag, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
  }), []);
  useFrame((st) => { material.uniforms.uTime.value = st.clock.elapsedTime; });
  const geometry = useMemo(() => {
    if (pts.length < 2) return null;
    // Densify to about 1.5 m so the ribbon hugs the terrain.
    const dense: typeof pts = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
      for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, slope: b.slope });
    }
    dense.push(pts[pts.length - 1]);
    const W = 0.7;
    const pos: number[] = [], along: number[] = [], side: number[] = [], slope: number[] = [], idx: number[] = [];
    let L = 0;
    dense.forEach((p, i) => {
      const q = dense[Math.min(dense.length - 1, i + 1)], o = dense[Math.max(0, i - 1)];
      let dx = q.x - o.x, dy = q.y - o.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      if (i > 0) L += Math.hypot(p.x - dense[i - 1].x, p.y - dense[i - 1].y);
      for (const s of [-1, 1]) {
        const x = p.x + -dy * W * s, y = p.y + dx * W * s;
        const v = toScene(bundle, x, y, 0.12);
        pos.push(v.x, v.y, v.z); along.push(L); side.push(s); slope.push(p.slope);
      }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute("slope", new THREE.Float32BufferAttribute(slope, 1));
    g.setIndex(idx);
    return g;
  }, [bundle, pts]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} renderOrder={5} />;
}

const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
const ringBoulder = new THREE.MeshBasicMaterial({ color: "#ff5a48", transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
const ringSteep = new THREE.MeshBasicMaterial({ color: "#ffb340", transparent: true, opacity: 0.45, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 80, 16, 1, true);

function Beam({ bundle, x, y, color, dist }: { bundle: SiteBundle; x: number; y: number; color: string; dist: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), [color]);
  if (dist < 30) return null; // standing at the target: the beam would fill the visor
  const p = toScene(bundle, x, y, 40);
  return <mesh geometry={beamGeo} material={mat} position={p} renderOrder={6} />;
}

export function VisorPath({ bundle }: { bundle: SiteBundle }) {
  const v = useVisor();
  const roverOn = useStore((s) => s.roverActive);
  if (!v) return null;
  return (
    <group>
      <Ribbon bundle={bundle} pts={v.path} />
      {v.hazards.filter((h) => h.along < 200).map((h, i) => {
        const p = toScene(bundle, h.x, h.y, 0.15);
        const r = h.kind === "boulder" ? h.size / 2 + 0.6 : 1.2;
        return <mesh key={i} geometry={ringGeo} material={h.kind === "boulder" ? ringBoulder : ringSteep} position={p} rotation={[-Math.PI / 2, 0, 0]} scale={[r, r, r]} renderOrder={6} />;
      })}
      {v.next && !v.next.isHome && <Beam bundle={bundle} x={v.next.x} y={v.next.y} color="#59e8ff" dist={v.next.dist} />}
      <Beam bundle={bundle} x={v.home.x} y={v.home.y} color="#8fbcf0" dist={v.home.dist} />
      {roverOn && null}
    </group>
  );
}
