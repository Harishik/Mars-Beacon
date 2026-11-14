/// <reference lib="webworker" />
// Engine worker: holds the terrain once, recomputes the envelope on request.
import { computeEnvelope, type EnvelopeParams } from "./envelope";

let height: Float32Array | null = null;
let slope: Float32Array | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: "terrain"; height: Float32Array; slope: Float32Array }
    | { type: "envelope"; id: number; params: EnvelopeParams };
  if (msg.type === "terrain") {
    height = msg.height; slope = msg.slope;
    return;
  }
  if (msg.type === "envelope" && height && slope) {
    const out = computeEnvelope(height, slope, msg.params);
    (self as unknown as Worker).postMessage(
      { type: "envelope", id: msg.id, margin: out.margin, timeToHaven: out.timeToHaven, ms: out.ms, insideCells: out.insideCells },
      [out.margin.buffer, out.timeToHaven.buffer],
    );
  }
};
