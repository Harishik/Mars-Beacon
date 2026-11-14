"""Write oracle_test_cases.json: shared cases for Pytest (Python twin) and Vitest (TypeScript engine), plan 21 s13.
Tolerance for TS vs Python: 1e-5 relative; hand-worked small graphs exact to 1e-6.
Grids are row-major, north-up (row 0 = north), 4 m cells unless stated; haven given as [row, col].
"""
import json, math, os, sys
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from mars24 import mars_time
from walking import Assumptions, speed, cost_of_walking, metabolic_power, o2_g_per_h, edge
from envelope import envelope


def env_case(name, z, blocked, haven, a, bt, bo, note):
    r = envelope(np.array(z, float), 4.0, np.array(blocked, bool), haven, a, bt, bo)
    f = lambda m: [[None if not np.isfinite(v) else round(float(v), 9) for v in row] for row in m]
    return {"name": name, "note": note, "cellM": 4.0, "z": z, "blocked": blocked, "haven": list(haven),
            "assumptions": a.to_dict(), "budgetTimeS": bt, "budgetO2G": bo,
            "expect": {"timeToHaven": f(r["timeToHaven"]), "o2ToHaven": f(r["o2ToHaven"]),
                       "inside": r["inside"].astype(int).tolist()}}


def main():
    A = Assumptions()
    cases = {"version": 1, "generatedBy": "pipeline/sim/make_oracle_cases.py", "tolerance": {"relative": 1e-5, "handWorked": 1e-6},
             "assumptionsDefault": A.to_dict(), "mars24": [], "walking": [], "edges": [], "envelope": []}
    for label, dt, lon_e, lat, tt in [
        ("GISS worked example 1", datetime(2000, 1, 6, tzinfo=timezone.utc), 0.0, 0.0, 64.184),
        ("GISS worked example 2 (Spirit, Gusev)", datetime.fromtimestamp(1073137591, tz=timezone.utc), -184.702, -14.640, 64.184),
        ("Gale boxwork box centre, arbitrary check instant (local night)", datetime(2026, 11, 15, 3, 0, tzinfo=timezone.utc), 137.3840, -4.8031, None),
    ]:
        m = mars_time(dt, lon_e, lat, tt)
        cases["mars24"].append({"label": label, "utc": dt.isoformat(), "lonEastDeg": lon_e, "latDeg": lat, "ttMinusUtcS": tt if tt else 69.184,
                                "expect": {k: m[k] for k in ("Ls", "EOT_deg", "MST_h", "LMST_h", "LTST_h", "declination", "zenith", "azimuth", "MSD")}})
    for i in (-0.3, -0.1, -0.05, 0.0, 0.05, 0.1, 0.18, 0.3):
        v = speed(i, A); P = metabolic_power(i, A, v)
        cases["walking"].append({"grade": i, "speed": v, "costOfWalking": cost_of_walking(i), "metabolicW": P, "o2GPerH": o2_g_per_h(P)})
    cases["walking"].append({"check": "watts to O2", "metabolicW": 696.0, "o2GPerH": o2_g_per_h(696.0), "note": "conversion only"})
    for deg in (5, 10, 18):
        for sub, eta in (("regolith", 1.2), ("sand", 1.75)):
            a = Assumptions(etaSubstrate=eta)
            dz = 4.0 * math.tan(math.radians(deg))
            up, down = edge(4.0, dz, a), edge(4.0, -dz, a)
            cases["edges"].append({"slopeDeg": deg, "substrate": sub, "etaSubstrate": eta, "dxy": 4.0, "dz": dz,
                                   "uphill": {"timeS": up[0], "o2G": up[1]}, "downhill": {"timeS": down[0], "o2G": down[1]}})
    heavy = Assumptions(loadKg=160.0)
    cases["edges"].append({"slopeDeg": 0, "substrate": "regolith", "heavyLoadKg": 160.0, "dxy": 4.0, "dz": 0.0,
                           "nominal": dict(zip(("timeS", "o2G"), edge(4.0, 0.0, A))), "heavy": dict(zip(("timeS", "o2G"), edge(4.0, 0.0, heavy)))})
    flat = [[0.0] * 5 for _ in range(5)]; nob = [[False] * 5 for _ in range(5)]
    cases["envelope"].append(env_case("flat 5x5, haven centre", flat, nob, (2, 2), A, 1e9, 1e9, "corner = 2 diagonal steps; (0,1) = one knight move"))
    kb = [[False] * 5 for _ in range(5)]; kb[1][1] = kb[1][2] = True
    cases["envelope"].append(env_case("knight move across blocked corner is blocked", flat, kb, (2, 2), A, 1e9, 1e9, "(0,1) must not use the direct knight move"))
    wall = [[c == 3 for c in range(5)] for _ in range(5)]
    cases["envelope"].append(env_case("wall makes east side unreachable", flat, wall, (2, 1), A, 1e9, 1e9, "column 4 = null (unreachable), inside = 0"))
    ramp = [[c * 0.4 for c in range(9)] for _ in range(3)]
    cases["envelope"].append(env_case("10 percent ramp rising east, haven west", ramp, [[False] * 9 for _ in range(3)], (1, 0), A, 1e9, 1e9, "return downhill is cheaper than outbound"))
    cases["envelope"].append(env_case("time budget cuts the far cells", flat, nob, (2, 2), A, 2.25 * 8 / 0.7 + 1e-6, 1e9,
                                      "budget = straight 8 m out + 1.25 x back on flat; (2,4) is exactly inside, corners outside"))
    out = os.path.join(os.path.dirname(__file__), "oracle_test_cases.json")
    json.dump(cases, open(out, "w"), indent=1)
    print("wrote", out, {k: len(v) for k, v in cases.items() if isinstance(v, list)})


if __name__ == "__main__":
    main()
