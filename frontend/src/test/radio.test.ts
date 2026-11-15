import { describe, it, expect } from "vitest";
import { viewshed, routeRadio } from "../engine/radio";

const N = 101, CELL = 4;
const flat = () => new Float32Array(N * N);

describe("radio line of sight", () => {
  it("sees all of flat ground", () => {
    const v = viewshed(flat(), N, N, CELL, [50, 50], 3);
    expect(v.reduce((a, b) => a + b, 0)).toBe(N * N);
  });
  it("a 20 m ridge puts the ground right behind it in shadow, but not the ground in front", () => {
    const h = flat();
    for (let r = 0; r < N; r++) h[r * N + 60] = 20; // north-south wall 40 m east of the antenna
    const v = viewshed(h, N, N, CELL, [50, 50], 3);
    expect(v[50 * N + 55]).toBe(1); // in front of the wall
    expect(v[50 * N + 62]).toBe(0); // just behind it
    expect(v[50 * N + 40]).toBe(1); // the other way
  });
  it("route share and longest gap", () => {
    const cov = new Uint8Array([1, 0, 0, 1, 1]);
    const r = routeRadio(cov, [0, 1, 2, 3, 4].map((c, i) => ({ cell: c, t: i * 60 })));
    expect(r.share).toBeCloseTo(0.6);
    expect(r.longestGapS).toBe(120);
  });
});
