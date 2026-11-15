// Regional context: NASA's own 3D model of Gale crater (NASA 3D Resources, "3D Printing/Gale Crater"),
// converted to GLB with its documented 3x vertical exaggeration removed. Display only: the model is in
// normalized coordinates with no geographic registration, so it never feeds slope, routes or the envelope,
// and the 3 km site is described in words rather than marked at a guessed position.
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Bounds } from "@react-three/drei";

const URL = "./regional/gale-overview.glb";

function Model() {
  const { scene } = useGLTF(URL);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b98a64", roughness: 0.95, metalness: 0 }), []);
  useEffect(() => {
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat; });
    return () => mat.dispose();
  }, [scene, mat]);
  return <primitive object={scene} />;
}

export default function RegionalContext() {
  return (
    <Canvas className="regional-canvas" dpr={[1, 1.5]} camera={{ fov: 35, position: [0, 3.2, 9] }} gl={{ antialias: true }}>
      <color attach="background" args={["#0d1626"]} />
      <hemisphereLight args={["#f2d2b0", "#2a1a12", 0.9]} />
      <directionalLight position={[6, 8, 3]} intensity={2.2} color="#ffe2c4" />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={0.8}><Model /></Bounds>
      </Suspense>
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} enablePan={false} maxPolarAngle={1.35} />
    </Canvas>
  );
}
