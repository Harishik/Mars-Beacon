// Where the crew is drawn, kept clear of the habitat. The planner's route starts on the habitat's own grid cell,
// so a literal drawing put both astronauts inside the modules or the solar array. This keeps the figures (and
// the cameras that follow them) outside the habitat model's footprint, solar array included, plus a margin.
// Drawing only: the engine, readings and routes still use the true crew position.
import { liveCrewPose } from "../engine/useMission";

/** Habitat model footprint in its own frame (metres), with its site position and heading. Set when it loads. */
export const habitatFootprint: { x: number; y: number; heading: number; minX: number; maxX: number; minZ: number; maxZ: number } | { x: null } = { x: null };
export function setHabitatFootprint(f: { x: number; y: number; heading: number; minX: number; maxX: number; minZ: number; maxZ: number }) {
  Object.assign(habitatFootprint, f);
}

const MARGIN = 3; // metres: covers the pair's 1.5 m side offset and a step of clearance

/** Push a site-frame point out of the habitat footprint to its nearest clear edge (continuous, so walking out is smooth). */
export function clearOfHabitat(px: number, py: number): [number, number] {
  const f = habitatFootprint;
  if (f.x === null) return [px, py];
  const h = f.heading, c = Math.cos(h), s = Math.sin(h);
  // Site to scene-relative (x east, z south), then into the model's frame (inverse of the Y rotation by heading).
  const sx = px - f.x, sz = -(py - f.y);
  let lx = sx * c - sz * s, lz = sx * s + sz * c;
  const x0 = f.minX - MARGIN, x1 = f.maxX + MARGIN, z0 = f.minZ - MARGIN, z1 = f.maxZ + MARGIN;
  if (lx <= x0 || lx >= x1 || lz <= z0 || lz >= z1) return [px, py];
  const d = [lx - x0, x1 - lx, lz - z0, z1 - lz];
  const k = d.indexOf(Math.min(...d));
  if (k === 0) lx = x0; else if (k === 1) lx = x1; else if (k === 2) lz = z0; else lz = z1;
  const ox = lx * c + lz * s, oz = -lx * s + lz * c;
  return [f.x + ox, f.y - oz];
}

/** The crew pose for drawing and for the cameras that follow the crew. */
export function visualCrewPose(): { x: number; y: number; heading: number } | null {
  const p = liveCrewPose();
  if (!p) return null;
  const [x, y] = clearOfHabitat(p.x, p.y);
  return { x, y, heading: p.heading };
}
