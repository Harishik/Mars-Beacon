// Save the mission to the team backend (PostgreSQL) and get a link that reopens it anywhere.
import { useState } from "react";
import { useStore } from "../store/store";
import { missionRecord, saveMission, shareUrl, useBackend, API_BASE } from "../data/api";

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
        {!be ? API_BASE.replace(/^https?:\/\//, "") : be.ok ? `${be.health.db === "postgresql" ? "PostgreSQL" : be.health.db}${be.health.postgis ? " + PostGIS" : ""}, API ${be.health.version}. Stores saved missions and debriefs behind share links.` : `${be.error}. Planning still runs in the browser; saving is off.`}
      </span>
    </div>
  );
}
