import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../store/store";
import { sunAt } from "../engine/sun";

// Mars sky, visual approximation: butterscotch by day, a blue glow around the
// sun near sunrise and sunset (dust forward scattering), deep blue-black at night.
const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const frag = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSun;
  uniform float uElev;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    float day = smoothstep(-6.0, 10.0, uElev);
    vec3 zenithDay = vec3(0.55, 0.40, 0.29);
    vec3 horizonDay = vec3(0.85, 0.66, 0.46);
    vec3 zenithNight = vec3(0.02, 0.04, 0.09);
    vec3 horizonNight = vec3(0.07, 0.11, 0.2);
    vec3 zen = mix(zenithNight, zenithDay, day);
    vec3 hor = mix(horizonNight, horizonDay, day);
    vec3 col = mix(hor, zen, pow(max(h, 0.0), 0.55));
    float cosA = max(dot(d, normalize(uSun)), 0.0);
    float low = 1.0 - smoothstep(2.0, 25.0, uElev);
    // Blue halo near the sun, strongest when the sun is low.
    col += vec3(0.25, 0.45, 0.85) * pow(cosA, 18.0) * (0.35 + 0.9 * low) * smoothstep(-8.0, 0.0, uElev);
    col += vec3(1.0, 0.95, 0.88) * pow(cosA, 900.0) * 2.0 * step(-1.0, uElev);
    // Below the horizon: ground haze colour.
    col = mix(col, hor * 0.7, smoothstep(0.0, -0.15, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uElev: { value: 40 } },
  }), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const s = useStore.getState();
    const sun = sunAt(s.lmstHours, s.bundle?.manifest.crs.origin.lat ?? -4.86);
    mat.uniforms.uSun.value.set(...sun.dir);
    mat.uniforms.uElev.value = sun.elevationDeg;
    // Keep the dome centred on the camera.
    ref.current?.position.copy(camera.position);
  });
  return <mesh ref={ref} material={mat} frustumCulled={false} renderOrder={-1}><sphereGeometry args={[20000, 48, 24]} /></mesh>;
}
