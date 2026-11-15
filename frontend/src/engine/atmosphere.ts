// Measured atmosphere at Gale (training and atmosphere work, Codex pipeline):
//  - dust: seasonal climatology fitted to Curiosity column optical depth (880 nm), with an empirical band
//  - pressure: REMS half-hour bins at the rover during the boxwork campaign (observed, rover-local)
// Missing support stays missing: no value is invented outside the measured sols or times.
import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import { tauAtElevation } from "./environment";

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";

export interface OpacityClimatology { coefficients: number[]; band: number; testMAE: number; testCoverage?: number }
export interface Atmosphere {
  tau880?: OpacityClimatology;
  pressure?: Record<string, [number, number, number][]>; // sol -> [ltst, Pa, samples]
}

let cache: { site: string; data: Promise<Atmosphere> } | null = null;

export function loadAtmosphere(siteId: string): Promise<Atmosphere> {
  if (cache?.site === siteId) return cache.data;
  const base = `${BASE}/${siteId}/atmosphere`;
  const j = (p: string) => fetch(`${base}/${p}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const data = Promise.all([j("opacity_climatology.json"), j("rems_pressure.json")]).then(([o, p]) => ({
    tau880: o?.tau880 as OpacityClimatology | undefined,
    pressure: p?.sols as Atmosphere["pressure"] | undefined,
  }));
  cache = { site: siteId, data };
  return data;
}

/** Seasonal dust optical depth at the rover (880 nm): log tau = c0 + c1 sin Ls + c2 cos Ls. */
export function seasonalTau(m: OpacityClimatology, lsDeg: number) {
  const a = (lsDeg * Math.PI) / 180;
  const [c0, c1, c2] = m.coefficients;
  const tau = Math.exp(c0 + c1 * Math.sin(a) + c2 * Math.cos(a));
  return { tau, lo: Math.max(0, tau - m.band), hi: tau + m.band };
}

/** REMS pressure on a sol at a local true solar time, if measured within half an hour. */
export function pressureAt(a: Atmosphere, sol: number, ltstH: number): { pa: number; n: number; offsetH: number } | null {
  const bins = a.pressure?.[String(sol)];
  if (!bins?.length) return null;
  let best = bins[0];
  for (const b of bins) if (Math.abs(b[0] - ltstH) < Math.abs(best[0] - ltstH)) best = b;
  const off = Math.abs(best[0] - ltstH);
  return off <= 0.5 ? { pa: best[1], n: best[2], offsetH: off } : null;
}

export function useAtmosphere(): Atmosphere | null {
  const siteId = useStore((s) => s.bundle?.manifest.siteId);
  const [a, setA] = useState<Atmosphere | null>(null);
  useEffect(() => {
    let live = true;
    if (!siteId) return;
    loadAtmosphere(siteId).then((d) => { if (live) setA(d); });
    return () => { live = false; };
  }, [siteId]);
  return a;
}

/**
 * Keeps the dust optical depth on the measured seasonal climatology when the site has one
 * (and the crew has not set a value by hand). The store holds tau at the datum; the site
 * value is the climatology, so convert back through the scale height.
 */
export function useClimatologyDust() {
  const atm = useAtmosphere();
  const ls = useStore((s) => Math.round(s.lsDeg));
  const manual = useStore((s) => s.tauManual);
  useEffect(() => {
    if (!atm?.tau880 || manual) return;
    const site = seasonalTau(atm.tau880, ls).tau;
    const datum = site / tauAtElevation(1, -3.6);
    useStore.getState().set({ tau: datum });
  }, [atm, ls, manual]);
}
