"""Oracle tests for the Python twin (plan 21 section 13). Run: python -m pytest pipeline/sim -q"""
import math, os, sys
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from mars24 import mars_time
from walking import Assumptions, speed, o2_g_per_h, cost_of_walking
from envelope import envelope


def close(a, b, tol):
    assert abs(a - b) <= tol, f"{a} vs {b} (tol {tol})"


def test_mars24_example1():
    m = mars_time(datetime(2000, 1, 6, tzinfo=timezone.utc), lon_east_deg=0.0, lat_deg=0.0, tt_utc=64.184)
    close(m["dtJ2000"], 4.50074, 1e-5); close(m["M"], 21.74558, 1e-4); close(m["alphaFMS"], 272.74566, 1e-4)
    close(m["PBS"], 0.00142, 1e-5); close(m["nuMinusM"], 4.44193, 1e-4); close(m["Ls"], 277.18758, 1e-4)
    close(m["EOT_deg"], -5.18774, 1e-4); close(m["MST_h"], 23.99425, 1e-4); close(m["LTST_h"], 23.64840, 1e-4)
    close(m["subsolarLonW"], 174.72600, 1e-3); close(m["declination"], -25.22825, 1e-4); close(m["R_au"], 1.39358, 1e-5)
    close(m["zenith"], 154.26182, 1e-3); close(m["azimuth"], 191.03905, 1e-3)


def test_mars24_example2_spirit():
    dt = datetime.fromtimestamp(1073137591000 / 1000, tz=timezone.utc)
    m = mars_time(dt, lon_east_deg=-184.702, lat_deg=-14.640, tt_utc=64.184)  # Gusev, 14.64 S
    close(m["Ls"], 327.32416, 1e-4); close(m["EOT_deg"], -12.77553, 1e-4); close(m["MST_h"], 13.16537, 1e-4)
    close(m["LMST_h"], 0.85190, 1e-4); close(m["LTST_h"] if m["LTST_h"] < 12 else m["LTST_h"] - 24, 0.00025, 1e-4)
    close(m["declination"], -13.42065, 5e-4); close(m["zenith"], 151.93895, 1e-3); close(m["azimuth"], 179.99383, 1e-3)


def test_watts_to_o2():
    close(o2_g_per_h(696.0), 178.1, 0.1)  # conversion check only, labelled as such in the plan


def test_speed_peak_and_asymmetry():
    a = Assumptions()
    close(speed(0.0, a), a.v0, 1e-12)                       # flat ground walks at the planning pace v0
    close(speed(-0.05, a), a.v0 / math.exp(-0.175), 1e-12)  # peak on a gentle 5 percent downhill
    assert speed(0.15, a) < speed(-0.15, a)
    assert cost_of_walking(0.2) > cost_of_walking(-0.2) > 0  # uphill costs more energy per metre


def test_flat_grid_exact():
    a = Assumptions()
    z = np.zeros((5, 5)); blocked = np.zeros((5, 5), bool)
    r = envelope(z, 4.0, blocked, (2, 2), a, 1e9, 1e9)
    # flat: v = v0 exactly (i = 0 gives exp(-0.175)/exp(-0.175)); corner by two diagonal steps
    close(r["timeToHaven"][0, 0], 2 * 4 * math.sqrt(2) / a.v0, 1e-6)
    # knight cell (0,1): one knight move of length 4*sqrt(5)
    close(r["timeToHaven"][0, 1], 4 * math.sqrt(5) / a.v0, 1e-6)
    close(r["timeToHaven"][2, 4], 8 / a.v0, 1e-6)


def test_knight_corner_blocked():
    a = Assumptions()
    z = np.zeros((5, 5)); blocked = np.zeros((5, 5), bool)
    blocked[1, 2] = True; blocked[1, 1] = True  # cells crossed by the knight move (2,2)->(0,1)
    r = envelope(z, 4.0, blocked, (2, 2), a, 1e9, 1e9)
    assert r["timeToHaven"][0, 1] > 4 * math.sqrt(5) / a.v0 + 1e-6


def test_blocked_and_unreachable():
    a = Assumptions()
    z = np.zeros((5, 5)); blocked = np.zeros((5, 5), bool); blocked[:, 3] = True
    r = envelope(z, 4.0, blocked, (2, 1), a, 1e9, 1e9)
    assert np.isinf(r["timeToHaven"][2, 4]) and not r["inside"][2, 4]


def test_uphill_downhill_direction():
    a = Assumptions()
    z = np.tile(np.arange(9, dtype=float) * 0.4, (3, 1))  # 10 percent grade rising east
    blocked = np.zeros(z.shape, bool)
    r = envelope(z, 4.0, blocked, (1, 0), a, 1e9, 1e9)
    # going out (east) is uphill, coming back is downhill: return is faster than outbound
    assert r["timeToHaven"][1, 8] < r["timeOut"][1, 8]
    assert r["o2ToHaven"][1, 8] < r["o2Out"][1, 8]


def test_load_monotonicity():
    rng = np.random.default_rng(0)
    z = np.cumsum(rng.normal(0, 0.3, (40, 40)), 0); blocked = np.zeros(z.shape, bool)
    light, heavy = Assumptions(loadKg=100), Assumptions(loadKg=160)
    e1 = envelope(z, 4.0, blocked, (20, 20), light, 1e9, 400)
    e2 = envelope(z, 4.0, blocked, (20, 20), heavy, 1e9, 400)
    assert e2["inside"].sum() <= e1["inside"].sum()
    assert np.all(e2["o2ToHaven"][np.isfinite(e2["o2ToHaven"])] >= e1["o2ToHaven"][np.isfinite(e1["o2ToHaven"])] - 1e-9)
