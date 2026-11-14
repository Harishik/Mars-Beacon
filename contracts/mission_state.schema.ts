// Mission state contract (draft). Owner: Harishik. Frozen after the 21:15 team meeting.

export type Tag = "OBSERVED" | "DERIVED" | "HISTORICAL" | "PREDICTED" | "SCENARIO" | "ASSUMPTION";
export type CrewId = "A" | "B";

export interface ResourceBudget {
  o2G: number;        // usable oxygen, grams
  energyWh: number;   // suit battery, watt-hours
  timeS: number;      // EVA time limit, seconds
  co2G: number;       // CO2 capacity, grams
}

export interface Assumptions {
  v0: number;                      // flat-ground planning pace, m/s
  slopeLimitDeg: number;
  mRestW: number;                  // resting metabolic power, W
  bodyMassKg: number;
  loadKg: Record<CrewId, number>;  // suit plus carried load
  fMob: Record<CrewId, number>;    // mobility factor, 1.0 nominal
  kG: number;                      // gravity and suit factor
  kGTag: Tag;
  rer: number;                     // respiratory exchange ratio
  reserveM: number;                // reserve margin fraction
  budgets: Record<CrewId, ResourceBudget>;
  warnTimeS: number;               // storm warning time (SCENARIO)
}

export interface CrewState {
  id: CrewId;
  x: number; y: number;            // site frame, metres (local ENU)
  o2SpentG: number;
  energySpentWh: number;
  timeS: number;
  loadKg: number;
  fMob: number;
}

export interface Haven {
  id: string;
  type: "habitat" | "rover" | "shelter";
  x: number; y: number;
  active: boolean;
}

export type EventType = "o2" | "load" | "pace" | "roverPark" | "roverOut" | "commLoss" | "spe" | "timeJump";

export interface MissionEvent {
  t: number;                       // seconds from egress
  type: EventType;
  payload: Record<string, unknown>;
  tag: Tag;                        // SCENARIO for invented events
}

export interface PlanMetrics {
  science: number;
  minMargin: number;               // fraction of budget left at the tightest point
  timeS: number;
  o2G: Record<CrewId, number>;
  commShadowS: number;
  doseUGy: number;
}

export interface Plan {
  id: string;
  label: "maxScience" | "maxMargin" | "balanced" | "custom";
  stops: string[];                 // target ids
  path: [number, number][];
  metrics: PlanMetrics;
}

export interface EnvelopeResult {
  gridM: number;                   // 4 live, 8 while dragging
  cols: number; rows: number;
  inside: Uint8Array;              // median terrain
  inside90: Uint8Array;            // P90 terrain
  timeToHaven: Float32Array;       // seconds
  tree: "T" | "O";
}

export interface MissionState {
  siteHash: string;
  seed: number;
  utcStart: string;                // ISO 8601
  t: number;
  assumptions: Assumptions;
  crew: [CrewState, CrewState];
  havens: Haven[];
  events: MissionEvent[];
  plans: Plan[];
  activePlanId: string | null;
  stale: boolean;
  view: "console" | "tablet" | "hud";
  layers: string[];                // active layer ids
}
