"""Mars time and sun position from the NASA GISS Mars24 algorithm (Allison and McEwen 2000),
plus Earth-Mars light time from the JPL approximate Keplerian elements (Standish).
Pure functions, no dependencies, so the same numbers come out of the API and the browser engine."""
from __future__ import annotations

import math
from datetime import datetime, timezone

D2R = math.pi / 180.0
TT_MINUS_UTC_S = 69.184  # 37 leap seconds + 32.184 s (valid since 2017)

_PBS = [  # (A, tau, phi) perturbations by the other planets
    (0.0071, 2.2353, 49.409), (0.0057, 2.7543, 168.173), (0.0039, 1.1177, 191.837),
    (0.0037, 15.7866, 21.736), (0.0021, 2.1354, 15.704), (0.0020, 2.4694, 95.528), (0.0018, 32.8493, 49.095),
]


def _wrap(x: float, m: float) -> float:
    return x % m


def mars_time(utc: datetime, lat_deg: float, lon_east_deg: float) -> dict:
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    jd_ut = utc.timestamp() / 86400.0 + 2440587.5
    jd_tt = jd_ut + TT_MINUS_UTC_S / 86400.0
    dt = jd_tt - 2451545.0
    m = (19.3871 + 0.52402073 * dt) * D2R
    alpha_fms = 270.3871 + 0.524038496 * dt
    pbs = sum(a * math.cos((0.985626 * dt / tau + phi) * D2R) for a, tau, phi in _PBS)
    v_m = ((10.691 + 3.0e-7 * dt) * math.sin(m) + 0.623 * math.sin(2 * m) + 0.050 * math.sin(3 * m)
           + 0.005 * math.sin(4 * m) + 0.0005 * math.sin(5 * m) + pbs)
    ls = _wrap(alpha_fms + v_m, 360.0)
    lsr = ls * D2R
    eot = 2.861 * math.sin(2 * lsr) - 0.071 * math.sin(4 * lsr) + 0.002 * math.sin(6 * lsr) - v_m
    msd = (dt - 4.5) / 1.0274912517 + 44796.0 - 0.0009626
    mtc = _wrap(24.0 * msd, 24.0)
    lmst = _wrap(mtc + lon_east_deg / 15.0, 24.0)
    ltst = _wrap(lmst + eot / 15.0, 24.0)
    dec = math.asin(0.42565 * math.sin(lsr)) / D2R + 0.25 * math.sin(lsr)
    h = (ltst - 12.0) * 15.0 * D2R
    phi, d = lat_deg * D2R, dec * D2R
    elev = math.asin(math.sin(phi) * math.sin(d) + math.cos(phi) * math.cos(d) * math.cos(h)) / D2R
    az = _wrap(math.atan2(math.sin(h), math.cos(h) * math.sin(phi) - math.tan(d) * math.cos(phi)) / D2R + 180.0, 360.0)
    return {
        "msd": round(msd, 5), "mtc": _hms(mtc), "lmst": _hms(lmst), "ltst": _hms(ltst),
        "lmstHours": round(lmst, 4), "ltstHours": round(ltst, 4), "ls": round(ls, 3),
        "equationOfTimeDeg": round(eot, 3), "solarDeclinationDeg": round(dec, 3),
        "sunElevDeg": round(elev, 2), "sunAzDeg": round(az, 1),
    }


def _hms(h: float) -> str:
    s = int(round(h * 3600)) % 86400
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


# Earth-Mars light time (JPL approximate Keplerian elements, 1800 to 2050).
_EARTH = (1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
          0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)
_MARS = (1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
         0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)


def _helio(el: tuple, t: float) -> tuple[float, float, float]:
    a0, e0, i0, l0, w0, o0, da, de, di, dl, dw, do = el
    a, e = a0 + da * t, e0 + de * t
    inc, lon, w, node = (i0 + di * t) * D2R, l0 + dl * t, w0 + dw * t, (o0 + do * t) * D2R
    om = w * D2R - node
    mm = ((lon - w) % 360.0) * D2R
    ea = mm + e * math.sin(mm)
    for _ in range(8):
        ea -= (ea - e * math.sin(ea) - mm) / (1 - e * math.cos(ea))
    xp, yp = a * (math.cos(ea) - e), a * math.sqrt(1 - e * e) * math.sin(ea)
    co, so, cn, sn, ci, si = math.cos(om), math.sin(om), math.cos(node), math.sin(node), math.cos(inc), math.sin(inc)
    return ((co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
            (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
            so * si * xp + co * si * yp)


def light_time(utc: datetime) -> dict:
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    t = (utc.timestamp() / 86400.0 + 2440587.5 - 2451545.0) / 36525.0
    e, m = _helio(_EARTH, t), _helio(_MARS, t)
    d = math.dist(e, m)
    sep = abs(math.atan2(m[1], m[0]) - math.atan2(e[1], e[0])) / D2R
    sep = 360.0 - sep if sep > 180.0 else sep
    return {"distanceAU": round(d, 4), "oneWayS": round(d * 149597870.7 / 299792.458, 1), "earthMarsSeparationDeg": round(sep, 1)}
