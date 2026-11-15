// Local first-visit and tour state (§9). Namespaced, versioned, no identifiers or transcripts; in-memory when
// storage is blocked.
const KEY = "mars-beacon:guide:v1";
export interface GuidePrefs { v: 1; inviteDismissed: boolean; tourCompleted: boolean; lastTourStep: number | null; hidden: boolean }
const DEFAULTS: GuidePrefs = { v: 1, inviteDismissed: false, tourCompleted: false, lastTourStep: null, hidden: false };
let memory: GuidePrefs = { ...DEFAULTS };

export function loadPrefs(): GuidePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return memory;
    const p = JSON.parse(raw) as Partial<GuidePrefs>;
    if (p.v !== 1) return memory;
    memory = { ...DEFAULTS, inviteDismissed: !!p.inviteDismissed, tourCompleted: !!p.tourCompleted, lastTourStep: typeof p.lastTourStep === "number" ? p.lastTourStep : null, hidden: !!p.hidden };
  } catch { /* storage blocked: keep in-memory */ }
  return memory;
}

export function savePrefs(patch: Partial<Omit<GuidePrefs, "v">>) {
  memory = { ...memory, ...patch, v: 1 };
  try { window.localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* in-memory only */ }
}
