"""Mars24 sun and time (Allison 1997; Allison and McEwen 2000; NASA GISS Mars24 algorithm page).
Python twin of the frontend implementation; tested against the two GISS worked examples (tests/test_sim.py).
Longitudes: inputs here are EAST-positive degrees (site frame convention); converted to west internally.
"""
import math
from datetime import datetime, timezone

TT_MINUS_UTC_S = 69.184  # 37 leap seconds + 32.184 s; valid from 2017-01-01 (no leap second added since)
PERTURBERS = [(0.0071, 2.2353, 49.409), (0.0057, 2.7543, 168.173), (0.0039, 1.1177, 191.837),
              (0.0037, 15.7866, 21.736), (0.0021, 2.1354, 15.704), (0.0020, 2.4694, 95.528),
              (0.0018, 32.8493, 49.095)]


def _sin(d): return math.sin(math.radians(d))
def _cos(d): return math.cos(math.radians(d))


def jd_ut(dt: datetime) -> float:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return 2440587.5 + dt.timestamp() / 86400.0


def tt_minus_utc(jd: float) -> float:
    if jd >= 2457754.5:  # 2017-01-01
        return TT_MINUS_UTC_S
    if jd < 2441317.5:   # before 1972
        T = (jd - 2451545.0) / 36525
        return 64.184 + 59 * T - 51.2 * T ** 2 - 67.1 * T ** 3 - 16.4 * T ** 4
    raise ValueError("leap-second table for 1972-2016 not included; pass tt_utc explicitly")


def mars_time(dt: datetime, lon_east_deg: float = 0.0, lat_deg: float = 0.0, tt_utc: float = None) -> dict:
    """All Mars24 quantities for a UTC datetime and site. lat is planetographic (difference from planetocentric
    is < 0.1 deg at low latitude)."""
    JD_UT = jd_ut(dt)
    dTT = tt_minus_utc(JD_UT) if tt_utc is None else tt_utc
    JD_TT = JD_UT + dTT / 86400.0
    d = JD_TT - 2451545.0
    M = (19.3871 + 0.52402073 * d) % 360
    a_fms = (270.3871 + 0.524038496 * d) % 360
    PBS = sum(A * _cos(0.985626 * d / tau + phi) for A, tau, phi in PERTURBERS)
    nu_M = (10.691 + 3.0e-7 * d) * _sin(M) + 0.623 * _sin(2 * M) + 0.050 * _sin(3 * M) + 0.005 * _sin(4 * M) + 0.0005 * _sin(5 * M) + PBS
    Ls = (a_fms + nu_M) % 360
    EOT = 2.861 * _sin(2 * Ls) - 0.071 * _sin(4 * Ls) + 0.002 * _sin(6 * Ls) - nu_M
    MST = (24 * ((JD_TT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626)) % 24
    lon_w = (-lon_east_deg) % 360
    LMST = (MST - lon_w / 15.0) % 24
    LTST = (LMST + EOT / 15.0) % 24
    sub_lon_w = (MST * 15 + EOT + 180) % 360
    dec = math.degrees(math.asin(0.42565 * _sin(Ls))) + 0.25 * _sin(Ls)
    R_au = 1.52367934 * (1.00436 - 0.09309 * _cos(M) - 0.004336 * _cos(2 * M) - 0.00031 * _cos(3 * M) - 0.00003 * _cos(4 * M))
    H = lon_w - sub_lon_w
    cosZ = _sin(dec) * _sin(lat_deg) + _cos(dec) * _cos(lat_deg) * _cos(H)
    Z = math.degrees(math.acos(max(-1.0, min(1.0, cosZ))))
    az = math.degrees(math.atan2(_sin(H), _cos(lat_deg) * math.tan(math.radians(dec)) - _sin(lat_deg) * _cos(H))) % 360
    msd = (JD_TT - 2405522.0028779) / 1.0274912517
    return {"JD_UT": JD_UT, "JD_TT": JD_TT, "dtJ2000": d, "M": M, "alphaFMS": a_fms, "PBS": PBS, "nuMinusM": nu_M,
            "Ls": Ls, "EOT_deg": EOT, "MST_h": MST, "LMST_h": LMST, "LTST_h": LTST, "subsolarLonW": sub_lon_w,
            "declination": dec, "R_au": R_au, "zenith": Z, "elevation": 90 - Z, "azimuth": az, "MSD": msd}


def sun_vector_site(dt, lon_east, lat):
    """Unit sun vector in the site frame (x east, y north, z up) and elevation/azimuth in degrees."""
    m = mars_time(dt, lon_east, lat)
    e, a = math.radians(m["elevation"]), math.radians(m["azimuth"])
    return (math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e)), m
