// Team backend (Naomi): FastAPI + PostgreSQL/PostGIS on Azure. Used for what a static site cannot do:
// saving missions and debriefs so they can be reopened and shared by link, and a server-side space
// weather cache. Site data, the engine and the plans themselves still run in the browser, so the
// app keeps working if the backend is down.
import { useEffect, useState } from "react";
import type { SiteBundle } from "./bundle";
import type { State } from "../store/store";

export const API_BASE = ((import.meta.env.VITE_BEACON_API as string | undefined) || "https://beacon-api-naomi42.azurewebsites.net").replace(/\/$/, "");

async function call<T>(path: string, init?: RequestInit, ms = 20000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API_BASE + path, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`backend HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    throw new Error((e as Error).name === "AbortError" ? "backend did not answer in time" : (e as Error).message);
  } finally { clearTimeout(t); }
}

export interface Health { status: string; version: string; db: string; postgis?: string; fixture_mode?: boolean }
export type BackendState = { ok: true; health: Health; checkedAt: number } | { ok: false; error: string; checkedAt: number };

let health: BackendState | null = null;
let pending: Promise<BackendState> | null = null;
export function checkBackend(): Promise<BackendState> {
  if (!pending) {
    pending = call<Health>("/health", undefined, 25000) // the Azure app can take a while to wake
      .then((h): BackendState => ({ ok: h.status === "ok", health: h, checkedAt: Date.now() } as BackendState))
      .catch((e): BackendState => ({ ok: false, error: (e as Error).message, checkedAt: Date.now() }));
    pending.then((h) => { health = h; setTimeout(() => { pending = null; }, h.ok ? 55000 : 5000); });
  }
  return pending;
}
/** Backend health, re-checked every minute (one failed check must not switch saving off for good). */
export function useBackend() {
  const [h, setH] = useState(health);
  useEffect(() => {
    let live = true;
    const run = () => checkBackend().then((x) => { if (live) setH(x); });
    run();
    const id = setInterval(run, 60000);
    return () => { live = false; clearInterval(id); };
  }, []);
  return h;
}

/** Everything needed to rebuild a mission on another machine. Results (envelope, plans) are recomputed, not stored. */
export interface MissionRecord {
  app: "mars-beacon"; schema: 1; kind: "plan" | "debrief";
  siteHash: string; siteId: string; seed: null; planName: string;
  assumptions: {
    v0: number; slopeLimitDeg: number; reserveM: number; kG: number; mRestW: number; bodyMassKg: number;
    timeBudgetS: number; dwellMin: number; evaStartLmst: number; lsDeg: number; tau: number; tauManual: boolean; storm: boolean;
    roverActive: boolean; crew: State["crew"]; excludedStops: string[]; activePlan: string;
    customStops: { id: string; name: string; x: number; y: number }[];
  };
  events: { t: number; kind: string; stop?: string }[];
  summary?: Record<string, number | string>;
}

export function missionRecord(s: State, kind: "plan" | "debrief"): MissionRecord | null {
  const b = s.bundle;
  if (!b) return null;
  const plan = s.plans.find((p) => p.id === s.activePlan);
  return {
    app: "mars-beacon", schema: 1, kind, siteHash: b.manifest.siteHash, siteId: b.manifest.siteId, seed: null,
    planName: `${b.manifest.name}: ${plan ? { balanced: "Balanced", maxScience: "Max science", maxMargin: "Max margin" }[plan.id] : "EVA"}`,
    assumptions: {
      v0: s.v0, slopeLimitDeg: s.slopeLimitDeg, reserveM: s.reserveM, kG: s.kG, mRestW: s.mRestW, bodyMassKg: s.bodyMassKg,
      timeBudgetS: s.timeBudgetS, dwellMin: s.dwellMin, evaStartLmst: s.evaStartLmst, lsDeg: s.lsDeg, tau: s.tau, tauManual: s.tauManual, storm: s.storm,
      roverActive: s.roverActive, crew: s.crew, excludedStops: s.excludedStops, activePlan: s.activePlan,
      customStops: b.manifest.targets.filter((t) => t.type === "custom").map((t) => ({ id: t.id, name: t.name, x: t.x, y: t.y })),
    },
    events: plan ? plan.events.map((e) => ({ t: Math.round(e.t), kind: e.kind, stop: e.stop })) : [],
    summary: plan ? {
      stops: plan.order.length, totalS: Math.round(plan.totalS), distanceM: Math.round(plan.distM), minMargin: Math.round(plan.minMargin * 100) / 100,
      ...(kind === "debrief" ? { walkedS: Math.round(Math.min(s.playheadS, plan.totalS)) } : {}),
    } : undefined,
  };
}

export async function saveMission(rec: MissionRecord): Promise<string> {
  const r = await call<{ shareId: string }>("/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
  if (!r.shareId) throw new Error("backend returned no share id");
  return r.shareId;
}

export async function loadMission(shareId: string): Promise<MissionRecord & { createdAt?: string }> {
  const r = await call<MissionRecord & { createdAt?: string }>(`/plans/${encodeURIComponent(shareId)}`);
  if (r.app !== "mars-beacon" || !r.assumptions) throw new Error("this link is not a Mars BEACON mission");
  return r;
}

/** Store patch that restores a saved mission onto the loaded site bundle. */
export function applyMission(b: SiteBundle, r: MissionRecord): Partial<State> {
  const a = r.assumptions;
  const known = new Set(b.manifest.targets.map((t) => t.id));
  const extra = (a.customStops ?? []).filter((c) => !known.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, type: "custom" as const, x: c.x, y: c.y, sol: null, source: "Added by the mission planner" }));
  const bundle = extra.length ? { ...b, manifest: { ...b.manifest, targets: [...b.manifest.targets, ...extra] } } : b;
  return {
    bundle,
    v0: a.v0, slopeLimitDeg: a.slopeLimitDeg, reserveM: a.reserveM, kG: a.kG, mRestW: a.mRestW, bodyMassKg: a.bodyMassKg,
    timeBudgetS: a.timeBudgetS, dwellMin: a.dwellMin, evaStartLmst: a.evaStartLmst, lmstHours: a.evaStartLmst, lsDeg: a.lsDeg,
    tau: a.tau, tauManual: a.tauManual, storm: a.storm, roverActive: a.roverActive, crew: a.crew,
    excludedStops: a.excludedStops ?? [], activePlan: a.activePlan as State["activePlan"], timeSpentS: 0, playheadS: 0,
  };
}

export function shareIdFromUrl(): string | null {
  const q = new URLSearchParams(window.location.search || window.location.hash.split("?")[1] || "");
  const id = q.get("plan");
  return id && /^[A-Za-z0-9_-]{4,40}$/.test(id) ? id : null;
}

export function shareUrl(id: string, siteId: string) {
  return `${window.location.origin}${window.location.pathname}#/app?site=${encodeURIComponent(siteId)}&plan=${encodeURIComponent(id)}`;
}

/** Server-side DONKI cache. Null when the server only holds seed data or has nothing (UNAVAILABLE). */
export async function backendSpaceWeather(kind: "FLR" | "SEP" | "CME", start: string, end: string) {
  const r = await call<{ events: unknown[]; sourceUrl?: string | null; badge?: string; fetchedAt?: string | null }>(`/spaceweather?kind=${kind}&start=${start}&end=${end}`);
  if (!r || r.sourceUrl === "seed" || r.badge === "UNAVAILABLE" || !Array.isArray(r.events)) return null;
  return r;
}

/** Server-side cache of the Curiosity REMS feed. */
export async function backendRems() {
  const r = await call<{ soles: Record<string, unknown>[]; badge: string; fetchedAt: string | null }>("/weather/rems");
  if (!r || r.badge === "UNAVAILABLE" || !r.soles?.length) return null;
  return r;
}
