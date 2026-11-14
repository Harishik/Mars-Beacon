import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../store/store";
import type { SiteBundle } from "../data/bundle";
import { declinationDeg } from "../engine/environment";
import { sunAt } from "../engine/sun";
import { beamTransmission, tauAtElevation } from "../engine/environment";

/** Vertical exaggeration. Set from the manifest (display.verticalExaggeration); 1.0 for real terrain. */
export let VERT_EXAG = 1.6;
export function setVertExag(v: number) { VERT_EXAG = v; }

/** Envelope draw-in progress (0..1). Kept outside the store so it does not re-render React. */
export const anim = { reveal: 0 };

const vert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vElev;
  varying float vSmooth;
  attribute float smoothElev;
  uniform float uZMin;
  uniform float uZMax;
  void main() {
    vUv = uv;
    vSmooth = smoothElev;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vElev = position.z;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vElev;
  varying float vSmooth;
  uniform sampler2D uMargin;   // 0..1, 0.5 = envelope boundary
  uniform sampler2D uSlope;    // degrees / 60
  uniform vec3 uSunDir;
  uniform float uSunElev;
  uniform float uSlopeLimit;
  uniform float uReveal;
  uniform float uTime;
  uniform float uExag;
  uniform float uZMin;
  uniform float uZMax;
  uniform float uShowEnvelope;
  uniform float uShowSlope;
  uniform float uShowContours;
  uniform float uShowGrid;
  uniform float uHasMargin;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uOrtho;    // HiRISE greyscale, observed
  uniform float uHasOrtho;
  uniform sampler2D uNormalMap; // 1 m DEM normals, tangent space x east, y north, z up
  uniform float uHasNormal;
  uniform sampler2D uHeight;   // scene-unit heights for cast shadows
  uniform float uHasHeight;
  uniform float uExtent;
  uniform float uShadows;
  uniform float uBeam;        // fraction of sunlight surviving the dust column
  uniform float uTau;

  vec3 marsRamp(float t) {
    vec3 a = vec3(0.13, 0.065, 0.04);
    vec3 b = vec3(0.33, 0.15, 0.08);
    vec3 c = vec3(0.52, 0.27, 0.14);
    vec3 d = vec3(0.68, 0.45, 0.28);
    if (t < 0.33) return mix(a, b, t / 0.33);
    if (t < 0.7) return mix(b, c, (t - 0.33) / 0.37);
    return mix(c, d, (t - 0.7) / 0.3);
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // HiRISE is greyscale. This grade maps its brightness onto Mars surface colours
  // (dark basaltic sand to bright dust). Visualisation, not measured colour.
  vec3 marsGrade(float g) {
    vec3 dark = vec3(0.075, 0.040, 0.024);
    vec3 mid = vec3(0.30, 0.15, 0.075);
    vec3 dust = vec3(0.62, 0.40, 0.24);
    return g < 0.5 ? mix(dark, mid, g * 2.0) : mix(mid, dust, (g - 0.5) * 2.0);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  // Cast shadow by marching toward the sun through the height field. Soft penumbra.
  float castShadow(vec3 p, vec3 L) {
    if (uHasHeight < 0.5 || uShadows < 0.5 || L.y <= 0.0) return L.y <= 0.0 ? 0.0 : 1.0;
    vec2 dir = normalize(L.xz);
    float tanEl = L.y / max(length(L.xz), 1e-4);
    float lit = 1.0;
    float t = 6.0;
    for (int i = 0; i < 48; i++) {
      vec2 q = p.xz + dir * t;
      vec2 uv = vec2(q.x / uExtent + 0.5, q.y / uExtent + 0.5);
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
      float hTerrain = texture2D(uHeight, uv).r;
      float hRay = p.y + t * tanEl;
      lit = min(lit, clamp(1.0 + (hRay - hTerrain) / (0.02 * t + 1.5), 0.0, 1.0));
      if (lit <= 0.0) break;
      t *= 1.11;
    }
    return lit;
  }

  void main() {
    vec3 n = normalize(vNormal);
    if (uHasNormal > 0.5) {
      vec3 tn = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
      vec3 wn = normalize(vec3(tn.x, tn.z, -tn.y));   // east, up, south
      n = normalize(mix(n, wn, 0.85));
    }
    float elev = vElev / uExag;
    float t = clamp((elev - uZMin) / max(1.0, uZMax - uZMin), 0.0, 1.0);
    float camDist = length(vWorld - cameraPosition);

    vec3 albedo;
    if (uHasOrtho > 0.5) {
      float g = texture2D(uOrtho, vUv).r;
      // HiRISE has the orbital sun baked in; soften its contrast so our own sun does the shading.
      g = clamp(0.5 + (g - 0.5) * 0.9, 0.0, 1.0);
      albedo = marsGrade(g);
    } else {
      albedo = marsGrade(0.42 + 0.08 * (vnoise(vWorld.xz / 400.0) - 0.5) + 0.1 * (t - 0.5));
    }
    // Close-range grain so the ground does not go soft when the camera is near (procedural, labelled).
    float near = 1.0 - smoothstep(30.0, 260.0, camDist);
    albedo *= 1.0 + near * (vnoise(vWorld.xz * 1.7) - 0.5) * 0.22 + near * (vnoise(vWorld.xz * 7.3) - 0.5) * 0.12;

    // Cavity term from the smoothed surface: hollows darker, crests a touch lighter.
    float cavity = clamp(1.0 + (elev - vSmooth) * 0.035, 0.72, 1.12);

    // Sun and dusty sky light (visual approximation of Mars illumination).
    vec3 L = normalize(uSunDir);
    float day = smoothstep(-4.0, 8.0, uSunElev);
    float sh = castShadow(vWorld, L);
    float lambert = max(dot(n, L), 0.0) * day * sh * uBeam;
    vec3 sunCol = mix(vec3(1.0, 0.66, 0.45), vec3(1.0, 0.9, 0.78), smoothstep(4.0, 30.0, uSunElev)) * 2.0;
    vec3 skyCol = mix(vec3(0.05, 0.08, 0.16), vec3(0.62, 0.42, 0.30), day);
    float hemi = 0.55 + 0.45 * n.y;
    // Light bounced off the red ground fills the shadows warm.
    vec3 bounce = vec3(0.35, 0.18, 0.09) * day * (0.5 - 0.5 * n.y);
    // Dust scatters the lost beam into a brighter, flatter sky.
    float skyBoost = 1.0 + 0.9 * (1.0 - uBeam) * day;
    vec3 col = albedo * cavity * (sunCol * lambert * 1.25 + skyCol * hemi * 0.36 * skyBoost + bounce * 0.4);

    // Contours every 10 m, index contour every 50 m.
    if (uShowContours > 0.5) {
      // Contours from a smoothed surface (generalised, as on printed maps).
      float ce = vSmooth;
      float f = ce / 10.0;
      float w = max(fwidth(f), 1e-4);
      float line = 1.0 - smoothstep(0.0, w * 1.2, abs(fract(f - 0.5) - 0.5));
      float f5 = ce / 50.0;
      float w5 = max(fwidth(f5), 1e-4);
      float line5 = 1.0 - smoothstep(0.0, w5 * 1.6, abs(fract(f5 - 0.5) - 0.5));
      float camD = length(vWorld - cameraPosition);
      float fine = 1.0 - smoothstep(600.0, 1800.0, camD);
      col = mix(col, vec3(0.98, 0.9, 0.8), line * 0.07 * fine + line5 * 0.16);
    }

    // 500 m grid.
    if (uShowGrid > 0.5) {
      vec2 g = vWorld.xz / 500.0;
      vec2 gw = max(fwidth(g), vec2(1e-4));
      vec2 gl = 1.0 - smoothstep(vec2(0.0), gw * 1.2, abs(fract(g - 0.5) - 0.5));
      col = mix(col, vec3(0.75, 0.85, 1.0), max(gl.x, gl.y) * 0.35);
    }

    float slope = texture2D(uSlope, vUv).r * 64.0;
    if (uShowSlope > 0.5) {
      float steep = smoothstep(uSlopeLimit * 0.5, uSlopeLimit, slope);
      col = mix(col, vec3(0.96, 0.78, 0.45), steep * 0.35);
      if (slope > uSlopeLimit) {
        float hatch = step(0.5, fract((vWorld.x + vWorld.z) / 6.0));
        col = mix(col, vec3(1.0, 0.45, 0.34), 0.55 + 0.25 * hatch);
      }
    }

    // Return Envelope: margin field from the worker. Boundary at 0.5.
    if (uShowEnvelope > 0.5 && uHasMargin > 0.5) {
      vec2 mt = texture2D(uMargin, vUv).rg;
      float m = mt.r * 2.0 - 1.0;                           // -1..1
      float nogo = smoothstep(0.35, 0.65, mt.g);           // steep ground: an obstacle, not 'outside'
      float threshold = 1.0 - uReveal;                      // grows outward on reveal
      float inside = step(threshold * 0.999, m) * step(0.0, m);
      // Derivative clamped: 8-bit plateaus give fwidth = 0, and smoothstep(0, 0, x) is undefined.
      float fw = clamp(fwidth(m), 0.0035, 0.04);
      float edge = 1.0 - smoothstep(fw * 0.6, fw * 2.0, abs(m - max(threshold, 0.0)));
      float glow = 1.0 - smoothstep(0.0, fw * 12.0, abs(m - max(threshold, 0.0)));
      vec3 home = vec3(0.56, 0.74, 0.94);
      // Inside: cool tint, slightly stronger near the boundary (less margin).
      float nearEdge = 1.0 - smoothstep(0.0, 0.35, m);
      edge *= 1.0 - nogo; glow *= 1.0 - nogo; inside *= 1.0 - nogo;
      col = mix(col, col * 0.92 + home * 0.10, inside * (0.35 + 0.4 * nearEdge));
      // Outside: dim and desaturate so the reachable ground reads first.
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      col = mix(col, vec3(lum) * 0.45, (1.0 - inside) * (1.0 - nogo) * 0.55 * uReveal);
      // No-go ground: fine diagonal hatch in hazard colour, always legible.
      float hatch = step(0.62, fract((vWorld.x - vWorld.z) / 5.0));
      col = mix(col, vec3(1.0, 0.45, 0.34), nogo * uShowSlope * (0.18 + 0.22 * hatch) * uReveal);
      // Boundary line with a slow pulse.
      float pulse = 0.85 + 0.15 * sin(uTime * 1.6);
      col += home * glow * 0.18 * step(-0.95, m);
      col = mix(col, vec3(0.82, 0.91, 1.0), edge * pulse * step(-0.95, m));
    }

    // Distance haze.
    // Aerial perspective: suspended dust scatters light into the line of sight.
    float fog = 1.0 - exp(-max(camDist - uFogNear * 0.15, 0.0) / uFogFar * (0.9 + 1.2 * uTau));
    col = mix(col, uFogColor, clamp(fog, 0.0, 0.85));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Display copy of the margin field. Small blocked cells (steep ridge flanks)
// take the best neighbouring value so they do not each get an outline; the
// slope layer shows them. The engine's own inside/outside result is unchanged.
function marginToTexture(margin: Float32Array, slope: Float32Array, limit: number, cols: number, rows: number, tex?: THREE.DataTexture) {
  const data = (tex?.image.data as Uint8Array | undefined) ?? new Uint8Array(cols * rows * 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    let m = margin[i];
    const nogo = slope[i] > limit;
    if (nogo) {
      let best = -1;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (slope[j] <= limit && margin[j] > best) best = margin[j];
      }
      m = best;
    }
    m = Math.max(-1, Math.min(1, m));
    data[2 * i] = Math.round((m * 0.5 + 0.5) * 255);
    data[2 * i + 1] = nogo ? 255 : 0;
  }
  if (tex) { tex.needsUpdate = true; return tex; }
  const t = new THREE.DataTexture(data, cols, rows, THREE.RGFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.unpackAlignment = 1; // rows are 750 bytes, not a multiple of 4
  t.flipY = false; t.needsUpdate = true;
  return t;
}

export function makeTerrainMaterial(slopeTex: THREE.Texture | null, zMin: number, zMax: number) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uMargin: { value: null },
      uSlope: { value: slopeTex },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uSunElev: { value: 40 },
      uSlopeLimit: { value: 20 },
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uExag: { value: VERT_EXAG },
      uZMin: { value: zMin },
      uZMax: { value: zMax },
      uShowEnvelope: { value: 1 },
      uShowSlope: { value: 0 },
      uShowContours: { value: 1 },
      uShowGrid: { value: 0 },
      uHasMargin: { value: 0 },
      uFogColor: { value: new THREE.Color("#c9a27c") },
      uFogNear: { value: 3500 },
      uFogFar: { value: 16000 },
      uOrtho: { value: null },
      uHasOrtho: { value: 0 },
      uNormalMap: { value: null },
      uHasNormal: { value: 0 },
      uHeight: { value: null },
      uHasHeight: { value: 0 },
      uExtent: { value: 3000 },
      uShadows: { value: 1 },
      uBeam: { value: 0.7 },
      uTau: { value: 0.6 },
    },
  });
}

/** Per-frame sun, haze and layer uniforms. `site` = false for the surrounding ground (no data overlays). */
export function useTerrainUniforms(material: THREE.ShaderMaterial, lat: number, site: boolean) {
  material.uniforms.uExag.value = VERT_EXAG;
  useFrame((state, dt) => {
    const s = useStore.getState();
    const u = material.uniforms;
    const sun = sunAt(s.lmstHours, lat, declinationDeg(s.lsDeg));
    u.uSunDir.value.set(...sun.dir);
    u.uSunElev.value = sun.elevationDeg;
    const tau = tauAtElevation(s.storm ? Math.max(s.tau, 3) : s.tau, -3.6);
    u.uTau.value = tau;
    u.uBeam.value = Math.max(beamTransmission(sun.elevationDeg, tau), 0.0);
    u.uSlopeLimit.value = s.slopeLimitDeg;
    u.uTime.value = state.clock.elapsedTime;
    u.uShowEnvelope.value = site && s.layers.envelope ? 1 : 0;
    u.uShowSlope.value = site && s.layers.slope ? 1 : 0;
    u.uShowContours.value = site && s.layers.contours ? 1 : 0;
    u.uShowGrid.value = site && s.layers.grid ? 1 : 0;
    if (site) {
      // Envelope draws in once after the first result, then follows edits instantly.
      if (u.uHasMargin.value > 0.5 && anim.reveal < 1) anim.reveal = Math.min(1, anim.reveal + dt / 2.4);
      u.uReveal.value = 1 - Math.pow(1 - anim.reveal, 3);
    }
    const day = Math.max(0, Math.min(1, (sun.elevationDeg + 4) / 14));
    (u.uFogColor.value as THREE.Color).setRGB(0.06 + 0.62 * day, 0.09 + 0.40 * day, 0.18 + 0.20 * day);
  });
}

export function Terrain({ bundle, segments = 384 }: { bundle: SiteBundle; segments?: number }) {
  const { manifest, height, slopeDeg } = bundle;
  const { cols, rows, extentM } = manifest.grid;
  const zMin = manifest.elevation.min, zMax = manifest.elevation.max;
  const zMid = (zMin + zMax) / 2;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(extentM, extentM, segments, segments);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      // Plane local: x east, y north. Sample the raster (row 0 = north).
      const fc = Math.min(cols - 1.001, Math.max(0, (x + extentM / 2) / extentM * cols - 0.5));
      const fr = Math.min(rows - 1.001, Math.max(0, (extentM / 2 - y) / extentM * rows - 0.5));
      const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, ty = fr - r;
      const a = height[r * cols + c], b = height[r * cols + c + 1], cc = height[(r + 1) * cols + c], d = height[(r + 1) * cols + c + 1];
      const z = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty;
      pos.setZ(i, (z - zMid) * VERT_EXAG);
    }
    g.computeVertexNormals();
    // Smoothed elevation for contour lines: separable box blur over the vertex grid.
    const n1 = segments + 1;
    const raw = new Float32Array(n1 * n1);
    for (let i = 0; i < raw.length; i++) raw[i] = pos.getZ(i) / VERT_EXAG + zMid;
    const tmp = new Float32Array(raw.length), sm = new Float32Array(raw.length);
    const R = 4;
    for (let r = 0; r < n1; r++) for (let c = 0; c < n1; c++) {
      let acc = 0, k = 0;
      for (let d = -R; d <= R; d++) { const cc = c + d; if (cc >= 0 && cc < n1) { acc += raw[r * n1 + cc]; k++; } }
      tmp[r * n1 + c] = acc / k;
    }
    for (let r = 0; r < n1; r++) for (let c = 0; c < n1; c++) {
      let acc = 0, k = 0;
      for (let d = -R; d <= R; d++) { const rr = r + d; if (rr >= 0 && rr < n1) { acc += tmp[rr * n1 + c]; k++; } }
      sm[r * n1 + c] = acc / k;
    }
    g.setAttribute("smoothElev", new THREE.BufferAttribute(sm, 1));
    // UVs: v = 0 at the north edge so texture rows match raster rows.
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    return g;
  }, [cols, rows, extentM, height, segments, zMid]);

  const slopeTex = useMemo(() => {
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.round((slopeDeg[i] / 64) * 255));
    const t = new THREE.DataTexture(data, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true;
    return t;
  }, [cols, rows, slopeDeg]);

  const marginTex = useRef<THREE.DataTexture | null>(null);

  // Height field for cast shadows, in scene units (metres above the site mid elevation, exaggerated).
  const heightTex = useMemo(() => {
    const data = new Float32Array(cols * rows);
    for (let i = 0; i < data.length; i++) data[i] = (height[i] - zMid) * VERT_EXAG;
    const t = new THREE.DataTexture(data, cols, rows, THREE.RedFormat, THREE.FloatType);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  }, [cols, rows, height, zMid]);

  const material = useMemo(() => makeTerrainMaterial(slopeTex, zMin - zMid, zMax - zMid), [slopeTex, zMin, zMax, zMid]);
  useTerrainUniforms(material, manifest.crs.origin.lat, true);

  useEffect(() => () => { material.dispose(); geometry.dispose(); slopeTex.dispose(); heightTex.dispose(); }, [material, geometry, slopeTex, heightTex]);

  useEffect(() => {
    const u = material.uniforms;
    u.uHeight.value = heightTex; u.uHasHeight.value = 1; u.uExtent.value = extentM;
    const loader = new THREE.TextureLoader();
    const disposers: THREE.Texture[] = [];
    if (bundle.orthoUrl) loader.load(bundle.orthoUrl, (t) => {
      t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      u.uOrtho.value = t; u.uHasOrtho.value = 1; disposers.push(t);
    });
    if (bundle.normalUrl) loader.load(bundle.normalUrl, (t) => {
      t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
      u.uNormalMap.value = t; u.uHasNormal.value = 1; disposers.push(t);
    });
    return () => disposers.forEach((t) => t.dispose());
  }, [material, heightTex, extentM, bundle.orthoUrl, bundle.normalUrl]);

  // Push the newest margin field into the texture (no geometry rebuild).
  const envelopeVersion = useStore((s) => s.envelope.version);
  useEffect(() => {
    const m = useStore.getState().envelope.margin;
    if (!m) return;
    marginTex.current = marginToTexture(m, slopeDeg, useStore.getState().slopeLimitDeg, cols, rows, marginTex.current ?? undefined);
    material.uniforms.uMargin.value = marginTex.current;
    material.uniforms.uHasMargin.value = 1;
  }, [envelopeVersion, cols, rows, material, slopeDeg]);

  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} />;
}
