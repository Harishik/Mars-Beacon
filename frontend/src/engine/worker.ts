/// <reference lib="webworker" />
// Engine worker: holds the terrain once, recomputes the envelope on request.
import { computeEnvelope, type EnvelopeParams } from "./envelope";
import { planEVA, type PlanInput } from "./planner";

let height: Float32Array | null = null;
let slope: Float32Array | null = null;
let slopeP90: Float32Array | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: "terrain"; height: Float32Array; slope: Float32Array; slopeP90?: Float32Array }
    | { type: "envelope"; id: number; params: EnvelopeParams }
    | { type: "plan"; id: number; input: PlanInput };
  if (msg.type === "terrain") {
    height = msg.height; slope = msg.slope; slopeP90 = msg.slopeP90 ?? null;
    return;
  }
  if (msg.type === "plan" && height && slope) {
    const t0 = performance.now();
    const plans = planEVA(height, slope, msg.input);
    (self as unknown as Worker).postMessage({ type: "plan", id: msg.id, plans, ms: performance.now() - t0 });
    return;
  }
  if (msg.type === "envelope" && height && slope) {
    const out = computeEnvelope(height, slope, msg.params);
    // Uncertainty band: the same certification on the 90th percentile slope (16 DEM realisations).
    // Cells inside the median envelope but not certified at P90 form the band.
    let insideP90: Uint8Array | null = null, p90Cells = 0;
    if (slopeP90 && msg.params.p90) {
      const p = computeEnvelope(height, slopeP90, msg.params);
      insideP90 = new Uint8Array(p.margin.length);
      for (let i = 0; i < p.margin.length; i++) if (p.margin[i] >= 0 && slopeP90[i] <= msg.params.slopeLimitDeg) { insideP90[i] = 1; p90Cells++; }
    }
    const bufs: Transferable[] = [out.margin.buffer, out.timeToHaven.buffer, out.parent.buffer, out.o2A.buffer, out.o2B.buffer];
    if (insideP90) bufs.push(insideP90.buffer);
    (self as unknown as Worker).postMessage(
      { type: "envelope", id: msg.id, margin: out.margin, timeToHaven: out.timeToHaven, parent: out.parent, o2A: out.o2A, o2B: out.o2B, ms: out.ms, insideCells: out.insideCells, insideP90, p90Cells },
      bufs,
    );
  }
};
