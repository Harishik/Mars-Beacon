// Live feeds, fetched in the browser with no backend:
//  - Curiosity REMS daily weather (NASA/JPL Mars weather feed, Centro de Astrobiologia instrument team).
//  - NASA DONKI space weather: solar flares, solar energetic particle (SEP) events and CMEs whose
//    WSA-ENLIL model run lists a Mars impact. Tried keyless at CCMC first, then api.nasa.gov with
//    VITE_NASA_API_KEY (or DEMO_KEY, which is rate limited), then a bundled snapshot.
// Every value carries its source, the time it was fetched and whether it is live or a snapshot.
import { useEffect, useState } from "react";
import { earthMarsSeparationDeg } from "./lighttime";
import { backendSpaceWeather, backendRems } from "../data/api";

export type FeedState = "live" | "snapshot" | "unavailable";

export interface RemsSol {
  sol: number; date: string; ls: number; minC: number | null; maxC: number | null; groundMinC: number | null; groundMaxC: number | null;
  pressurePa: number | null; opacity: string; uv: string; sunrise: string; sunset: string;
}
export interface RemsFeed { state: FeedState; fetchedAt: number; latest: RemsSol | null; recent: RemsSol[]; ageDays: number | null; source: string; note?: string }

export interface Flare { id: string; peak: string; cls: string; region?: number }
export interface Sep { id: string; time: string; instruments: string[] }
export interface MarsCme { id: string; start: string; arrival: string; speed?: number }
export interface DonkiFeed {
  state: FeedState; fetchedAt: number; source: string; windowDays: number; note?: string;
  flares: Flare[]; seps: Sep[]; marsCmes: MarsCme[]; separationDeg: number;
  level: "quiet" | "watch" | "alert"; summary: string;
}

const REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json";
const CCMC = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get";
const APOD = "https://api.nasa.gov/DONKI";
const WINDOW_DAYS = 7;
const REFRESH_MS = 15 * 60 * 1000;

const num = (s: unknown) => { const v = Number(s); return s === "--" || s === "" || s == null || !Number.isFinite(v) ? null : v; };

function parseRems(json: { soles?: Record<string, string>[] }): RemsSol[] {
  return (json.soles ?? []).map((r) => ({
    sol: Number(r.sol), date: r.terrestrial_date, ls: Number(r.ls),
    minC: num(r.min_temp), maxC: num(r.max_temp), groundMinC: num(r.min_gts_temp), groundMaxC: num(r.max_gts_temp),
    pressurePa: num(r.pressure), opacity: r.atmo_opacity, uv: r.local_uv_irradiance_index, sunrise: r.sunrise, sunset: r.sunset,
  })).filter((r) => Number.isFinite(r.sol)).sort((a, b) => b.sol - a.sol);
}

async function getJson(url: string, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 429 ? " rate limited" : ""}`);
    if (!/json/i.test(r.headers.get("content-type") ?? "")) throw new Error("not JSON");
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function fetchRems(): Promise<RemsFeed> {
  const now = Date.now();
  const build = (json: { soles?: Record<string, string>[] }, state: FeedState, source: string, note?: string): RemsFeed => {
    const recent = parseRems(json);
    const latest = recent[0] ?? null;
    const ageDays = latest ? (now - Date.parse(latest.date + "T12:00:00Z")) / 86400000 : null;
    return { state, fetchedAt: now, latest, recent: recent.slice(0, 14), ageDays, source, note };
  };
  try {
    // Team backend first: one cached fetch for every visitor.
    const r = await backendRems();
    if (r) {
      const recent = r.soles.map((x) => x as unknown as RemsSol).sort((a, b) => b.sol - a.sol);
      const latest = recent[0];
      return { state: r.badge === "LIVE" ? "live" : "snapshot", fetchedAt: r.fetchedAt ? Date.parse(r.fetchedAt) : now, latest, recent,
        ageDays: (now - Date.parse(latest.date + "T12:00:00Z")) / 86400000, source: `NASA/JPL Mars weather feed via the team backend${r.badge === "STALE" ? " (last good copy)" : ""}` };
    }
  } catch { /* fall through to the direct feed */ }
  try {
    return build(await getJson(REMS_URL), "live", "NASA/JPL Mars weather feed (Curiosity REMS)");
  } catch (e) {
    try {
      return build(await getJson("/live/msl_weather.json"), "snapshot", "Bundled snapshot of the REMS feed", `live fetch failed: ${(e as Error).message}`);
    } catch {
      return { state: "unavailable", fetchedAt: now, latest: null, recent: [], ageDays: null, source: "none", note: "REMS feed unreachable" };
    }
  }
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

interface RawFlare { flrID: string; peakTime: string; classType: string; activeRegionNum?: number }
interface RawSep { sepID: string; eventTime: string; instruments?: { displayName: string }[] }
interface RawCme { activityID: string; startTime: string; cmeAnalyses?: { speed?: number; isMostAccurate?: boolean; enlilList?: { impactList?: { location: string; arrivalTime: string }[] }[] }[] }

export function summarise(flares: Flare[], seps: Sep[], marsCmes: MarsCme[], separationDeg: number, nowMs: number) {
  const h = (iso: string) => (nowMs - Date.parse(iso)) / 3600000;
  const sepRecent = seps.filter((s) => h(s.time) < 72);
  const cmeSoon = marsCmes.filter((c) => { const dt = (Date.parse(c.arrival) - nowMs) / 3600000; return dt > -24 && dt < 96; });
  const xFlare = flares.filter((f) => f.cls.startsWith("X") && h(f.peak) < 48);
  const facing = separationDeg < 60;
  let level: DonkiFeed["level"] = "quiet";
  const parts: string[] = [];
  if (cmeSoon.length) { level = "alert"; parts.push(`CME modelled to reach Mars ${cmeSoon.map((c) => c.arrival.slice(5, 16).replace("T", " ")).join(", ")} UTC`); }
  if (sepRecent.length) { if (facing) level = "alert"; else if (level === "quiet") level = "watch"; parts.push(`${sepRecent.length} SEP event${sepRecent.length > 1 ? "s" : ""} in 72 h near Earth`); }
  if (xFlare.length) { if (level === "quiet") level = "watch"; parts.push(`X-class flare ${xFlare[0].cls}`); }
  if (!parts.length) parts.push(`no SEP, Mars-bound CME or X flare in ${WINDOW_DAYS} days`);
  return { level, summary: parts.join("; ") };
}

function buildDonki(fl: RawFlare[], sp: RawSep[], cm: RawCme[], state: FeedState, source: string, now: number, note?: string): DonkiFeed {
  const flares = (fl ?? []).map((f) => ({ id: f.flrID, peak: f.peakTime, cls: f.classType ?? "?", region: f.activeRegionNum })).sort((a, b) => b.peak.localeCompare(a.peak));
  const seps = (sp ?? []).map((s) => ({ id: s.sepID, time: s.eventTime, instruments: (s.instruments ?? []).map((i) => i.displayName) })).sort((a, b) => b.time.localeCompare(a.time));
  const marsCmes: MarsCme[] = [];
  for (const c of cm ?? []) {
    const an = c.cmeAnalyses?.find((a) => a.isMostAccurate) ?? c.cmeAnalyses?.[0];
    for (const run of an?.enlilList ?? []) for (const imp of run.impactList ?? []) {
      if (/mars/i.test(imp.location) && !marsCmes.some((m) => m.id === c.activityID)) marsCmes.push({ id: c.activityID, start: c.startTime, arrival: imp.arrivalTime, speed: an?.speed });
    }
  }
  const sep = earthMarsSeparationDeg(now);
  return { state, fetchedAt: now, source, windowDays: WINDOW_DAYS, note, flares, seps, marsCmes, separationDeg: sep, ...summarise(flares, seps, marsCmes, sep, now) };
}

export async function fetchDonki(): Promise<DonkiFeed> {
  const now = Date.now();
  const d0 = day(now - WINDOW_DAYS * 86400000), d1 = day(now);
  const q = `startDate=${d0}&endDate=${d1}`;
  const key = (import.meta.env.VITE_NASA_API_KEY as string | undefined) || "DEMO_KEY";
  const errs: string[] = [];
  type Raw = [RawFlare[], RawSep[], RawCme[]];
  const sources: [string, () => Promise<Raw | null>][] = [
    // Team backend: fetches DONKI on the server once per 15 min for everyone (no browser rate limit, no key in the page).
    ["NASA DONKI via the team backend", async () => {
      const r = await Promise.all((["FLR", "SEP", "CME"] as const).map((k) => backendSpaceWeather(k, d0, d1)));
      return r.every(Boolean) ? (r.map((x) => x!.events) as Raw) : null;
    }],
    ["NASA CCMC DONKI", async () => (await Promise.all(["FLR", "SEP", "CME"].map((t) => getJson(`${CCMC}/${t}?${q}`)))) as Raw],
    [`api.nasa.gov DONKI${key === "DEMO_KEY" ? " (demo key)" : ""}`, async () => (await Promise.all(["FLR", "SEP", "CME"].map((t) => getJson(`${APOD}/${t}?${q}&api_key=${key}`)))) as Raw],
  ];
  for (const [name, get] of sources) {
    try {
      const r = await get();
      if (r) return buildDonki(r[0], r[1], r[2], "live", name, now);
      errs.push(`${name}: seed data only`);
    } catch (e) { errs.push(`${name}: ${(e as Error).message}`); }
  }
  try {
    const snap = await getJson("/live/donki_snapshot.json");
    return buildDonki(snap.FLR, snap.SEP, snap.CME, "snapshot", `Bundled DONKI snapshot (${snap.snapshotUtc?.slice(0, 10) ?? "undated"})`, Date.parse(snap.snapshotUtc ?? new Date(now).toISOString()), errs.join("; "));
  } catch {
    const sep = earthMarsSeparationDeg(now);
    return { state: "unavailable", fetchedAt: now, source: "none", windowDays: WINDOW_DAYS, note: errs.join("; "), flares: [], seps: [], marsCmes: [], separationDeg: sep, level: "quiet", summary: "space weather feed unreachable" };
  }
}

// Shared cache: one fetch for every panel, refreshed every 15 minutes.
interface Live { rems: RemsFeed | null; donki: DonkiFeed | null }
let cache: Live = { rems: null, donki: null };
const subs = new Set<(l: Live) => void>();
let started = false;

async function refresh() {
  const [rems, donki] = await Promise.all([fetchRems(), fetchDonki()]);
  cache = { rems, donki };
  subs.forEach((f) => f(cache));
}

export function useLiveWeather(): Live {
  const [v, setV] = useState(cache);
  useEffect(() => {
    subs.add(setV);
    if (!started) { started = true; refresh(); setInterval(refresh, REFRESH_MS); }
    else setV(cache);
    return () => { subs.delete(setV); };
  }, []);
  return v;
}

export const feedTag = (s: FeedState | undefined) => (s === "live" ? "LIVE" : s === "snapshot" ? "SNAPSHOT" : "N/A");
export const ageText = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
