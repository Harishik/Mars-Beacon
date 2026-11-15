// Space weather alert on every display. Raised by a live NASA DONKI alert (a CME modelled to reach Mars,
// or a solar particle event while Mars faces Earth's side of the Sun) or by the storm scenario. It tells
// the crew what to do and how long the walk to shelter is, from the same Return Envelope as everything else.
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/store";
import { useLiveWeather } from "../engine/liveWeather";
import { reportAt } from "../engine/query";

export const SPE_LEAD_MIN = 30; // warning lead before particle flux peaks (assumption, ledger)

export function useSpaceAlert() {
  const { donki } = useLiveWeather();
  const storm = useStore((s) => s.storm);
  const shelter = useStore(useShallow((s) => {
    if (!s.bundle || !s.crewPos) return null;
    const r = reportAt(s.bundle, s, s.crewPos.x, s.crewPos.y);
    return r ? { reachable: r.reachable, min: r.walkHomeS / 60, rover: s.roverActive } : null;
  }));
  const live = donki?.level === "alert" && donki.state !== "unavailable";
  if (!storm && !live) return null;
  return {
    source: storm ? ("SCENARIO" as const) : ("DONKI" as const),
    reason: storm ? "Solar particle event scenario" : donki!.summary,
    shelterMin: shelter?.reachable ? shelter.min : null,
    inTime: !!shelter?.reachable && shelter.min <= SPE_LEAD_MIN,
    haven: shelter?.rover ? "habitat or R1" : "habitat",
  };
}

export function SpaceAlertBar() {
  const a = useSpaceAlert();
  const [ack, setAck] = useState<string | null>(null);
  const key = a ? `${a.source}|${a.reason}` : null;
  useEffect(() => { if (!key) setAck(null); }, [key]);
  if (!a) return null;
  const collapsed = ack === key;
  return (
    <div className={`space-alert ${collapsed ? "collapsed" : ""} ${a.inTime ? "" : "late"}`} role="alert" aria-live="assertive">
      <b>{collapsed ? "SPE" : "SOLAR PARTICLE EVENT"}</b>
      {!collapsed && (
        <span>
          {a.shelterMin === null
            ? "No certified walk to shelter from here. Call the rover and shelter in place behind terrain."
            : `Take shelter: ${a.haven}, ${Math.round(a.shelterMin)} min walk${a.inTime ? `, inside the ${SPE_LEAD_MIN} min warning lead` : `, longer than the ${SPE_LEAD_MIN} min warning lead`}.`}
          <em>{a.source === "SCENARIO" ? "SCENARIO" : `LIVE NASA DONKI: ${a.reason}`}</em>
        </span>
      )}
      <button onClick={() => setAck(collapsed ? null : key)} aria-label={collapsed ? "Show alert" : "Acknowledge alert"}>{collapsed ? "show" : "ACK"}</button>
    </div>
  );
}
