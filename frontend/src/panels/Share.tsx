// Save the mission to the team backend (PostgreSQL) and get a link that reopens it anywhere.
import { useState } from "react";
import { useStore } from "../store/store";
import { missionRecord, saveMission, shareUrl, useBackend, API_LABEL } from "../data/api";
import { activePlanOf } from "../engine/useMission";
import { routeGeoJSON, waypoints, waypointsCSV, download, WAYPOINT_SPACING_M } from "../engine/exportRoute";

const PLAN_LABEL = { balanced: "balanced", maxScience: "max-science", maxMargin: "max-margin" } as const;

/** Download the active plan as GeoJSON and as a CSV of waypoints about every 10 m. */
export function ExportRoute() {
  const ok = useStore((s) => !!s.bundle && s.plans.length > 0);
  const run = (fmt: "geojson" | "csv") => {
    const s = useStore.getState();
    const plan = activePlanOf(s);
    if (!s.bundle || !plan) return;
    const base = `mars-beacon_${s.bundle.manifest.siteId}_${PLAN_LABEL[plan.id]}`;
    if (fmt === "geojson") download(`${base}.geojson`, JSON.stringify(routeGeoJSON(s.bundle, plan, PLAN_LABEL[plan.id]), null, 1), "application/geo+json");
    else download(`${base}_waypoints.csv`, waypointsCSV(waypoints(s.bundle, plan)), "text/csv");
  };
  return (
    <div className="share export">
      <button className="btn btn-quiet" disabled={!ok} onClick={() => run("geojson")} title="Route line and stops, Mars 2000 sphere, east longitude">Route GeoJSON</button>
      <button className="btn btn-quiet" disabled={!ok} onClick={() => run("csv")} title={`Waypoints about every ${WAYPOINT_SPACING_M} m with elevation, slope, oxygen and walk-home need`}>Waypoints CSV</button>
    </div>
  );
}

export function ShareButton({ kind }: { kind: "plan" | "debrief" }) {
  const [st, setSt] = useState<{ busy?: boolean; url?: string; err?: string }>({});
  const be = useBackend();
  const save = async () => {
    const s = useStore.getState();
    const rec = missionRecord(s, kind);
    if (!rec) return;
    setSt({ busy: true });
    try {
      const id = await saveMission(rec);
      const url = shareUrl(id, rec.siteId);
      try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked: the link is shown */ }
      setSt({ url });
    } catch (e) { setSt({ err: (e as Error).message }); }
  };
  const offline = be && !be.ok;
  return (
    <div className="share">
      <button className="btn btn-quiet" onClick={save} disabled={st.busy} title="Store this mission in the team database and copy a link that reopens it">
        {st.busy ? "Saving…" : kind === "debrief" ? "Save debrief" : "Save and share"}
      </button>
      {st.url && <a className="share-link" href={st.url}>Saved. Link copied: {st.url.replace(/^https?:\/\//, "").slice(0, 46)}…</a>}
      {st.err && <span className="share-err">Not saved: {st.err}</span>}
      {offline && !st.err && !st.url && <span className="share-err">Database not answering yet; saving will retry when you press it</span>}
    </div>
  );
}

/** Shown while a shared mission link loads, or if it fails. */
export function SharedBanner() {
  const s = useStore((x) => x.sharedStatus);
  if (!s) return null;
  return <div className={`shared-banner ${s.error ? "err" : ""}`} role="status">{s.text}{s.error ? "" : ""}<button onClick={() => useStore.getState().set({ sharedStatus: null })} aria-label="Dismiss">×</button></div>;
}

export function BackendStatus() {
  const be = useBackend();
  return (
    <div className="pending-row">
      <span className="layer-name">Mission database {!be ? "(checking)" : be.ok ? "connected" : "offline"}</span>
      <span className="layer-source">
        {!be ? API_LABEL : be.ok ? `${be.health.db === "postgresql" ? "PostgreSQL" : be.health.db}${be.health.postgis ? " + PostGIS" : ""}, API ${be.health.version}. Stores saved missions and debriefs behind share links.` : `${be.error}. Planning still runs in the browser; saving is off.`}
      </span>
    </div>
  );
}
