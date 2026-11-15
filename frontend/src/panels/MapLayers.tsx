// On-map control for the data field coloured onto the terrain, with its legend and the value under the pointer.
import { useMemo } from "react";
import { useStore } from "../store/store";
import { OVERLAYS, overlayValues, currentThermalTable, type OverlayId } from "../engine/overlays";
import { toCell } from "../data/bundle";
import { tauAtElevation } from "../engine/environment";
import { flatCurve } from "../engine/thermal";
import { Tag } from "./Tag";

const RAMPS = [
  "linear-gradient(90deg, #1a2973 0%, #73389e 40%, #ed6b33 75%, #ffeb9e 100%)",
  "linear-gradient(90deg, #1a1f38 0%, #ffcc59 100%)",
  "linear-gradient(90deg, #14242e 0%, #59f2c7 100%)",
  "linear-gradient(90deg, #331f29 0%, #ff528c 60%, #ff528c 100%)",
];

const SHORT: Record<OverlayId, string> = { none: "Terrain", thermal: "Temperature", solar: "Solar energy", science: "Science value", rocks: "Boulders", radio: "Radio" };

export function MapLayers() {
  const overlay = useStore((s) => s.overlay);
  const set = useStore((s) => s.set);
  const bundle = useStore((s) => s.bundle);
  const cursor = useStore((s) => s.cursor);
  const ls = useStore((s) => Math.round(s.lsDeg));
  const tau = useStore((s) => (s.storm ? Math.max(s.tau, 3) : s.tau));
  const lmstStep = useStore((s) => Math.round(s.lmstHours * 6) / 6);
  const info = OVERLAYS.find((o) => o.id === overlay);
  const available = OVERLAYS.filter((o) => !bundle || (o.id === "science" ? !!bundle.science : o.id === "rocks" ? !!bundle.rocks : true));

  const here = useMemo(() => {
    if (!info || !bundle || !cursor) return null;
    const vals = overlayValues(overlay, bundle, ls, tauAtElevation(tau, -3.6), lmstStep, useStore.getState().roverActive);
    if (!vals) return null;
    const [c, r] = toCell(bundle.manifest, cursor.x, cursor.y);
    const v = vals[r * bundle.manifest.grid.cols + c];
    return Number.isFinite(v) ? v : null;
  }, [info, bundle, cursor, overlay, ls, tau, lmstStep]);

  // Flat-ground daily range for the thermal legend (what a crew member standing on level ground sees).
  const range = useMemo(() => {
    if (overlay !== "thermal" || !bundle) return null;
    overlayValues("thermal", bundle, ls, tauAtElevation(tau, -3.6), lmstStep);
    const t = currentThermalTable();
    if (!t) return null;
    const c = flatCurve(t);
    let mn = Infinity, mx = -Infinity; for (const v of c) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    return { min: mn - 273.15, max: mx - 273.15 };
  }, [overlay, bundle, ls, tau, lmstStep]);

  return (
    <div className="maplayers">
      <div className="seg" role="radiogroup" aria-label="Colour the terrain by">
        {(["none", ...available.map((o) => o.id)] as OverlayId[]).map((id) => (
          <button key={id} role="radio" aria-checked={overlay === id} onClick={() => set({ overlay: id })}>{SHORT[id]}</button>
        ))}
        <TopViewToggle />
      </div>
      {info && (
        <div className="ml-legend">
          <div className="ml-head"><b>{info.name}</b><Tag t={info.tag} /></div>
          <div className="ml-ramp" style={{ background: RAMPS[info.ramp] }} />
          <div className="ml-scale"><span>{info.fmt(info.min)}</span><span>{info.unit}</span><span>{info.fmt(info.max)}</span></div>
          {here !== null && <div className="ml-here">Under the pointer: <b>{info.fmt(here)} {info.unit}</b></div>}
          {range && <div className="ml-here">Level ground today: {Math.round(range.min)} to {Math.round(range.max)} °C</div>}
          <p className="ml-src">{info.source}</p>
          {overlay === "rocks" && bundle?.manifest.rocksReliable === false && <p className="ml-warn">Display only at this site: sand-ripple crests are detected as rocks, so boulders do not block routes here.</p>}
        </div>
      )}
    </div>
  );
}

function TopViewToggle() {
  const top = useStore((s) => s.topView);
  return (
    <button className="seg-2d" aria-pressed={top} onClick={() => useStore.getState().set({ topView: !top })} title="Straight-down map view; zoom in for full-resolution 25 cm HiRISE">
      {top ? "3D" : "2D map"}
    </button>
  );
}
