"""Suited walking and consumables model (plan 21 section 4). Python twin of the TypeScript engine.
Parameter names follow contracts/mission_state.schema.ts (Assumptions).
"""
import math
from dataclasses import dataclass, field, asdict

G_MARS = 3.71


@dataclass
class Assumptions:
    v0: float = 0.7              # m/s flat planning pace (ASSUMPTION; Apollo ~1 m/s max nominal)
    slopeLimitDeg: float = 20.0  # ASSUMPTION; applied to the 4 m slope (see bundle README: 1 m max slope is DEM-noise dominated)
    mRestW: float = 100.0        # ASSUMPTION
    bodyMassKg: float = 80.0
    loadKg: float = 121.0        # constant suited mass used in NASA IST-1
    fMob: float = 1.0
    kG: float = 0.78             # gravity + suit factor, fitted to NASA/TM-2010-216138 Fig. 10 at 0.32 g (calibrate_kg.py)
    kGTag: str = "DERIVED"
    rer: float = 0.85
    reserveM: float = 0.25
    etaSubstrate: float = 1.2    # regolith default (bedrock 1.0, sand 1.5-2.0), ASSUMPTION relative values

    def to_dict(self): return asdict(self)


def speed(i, a: Assumptions):
    """Tobler-shaped hiking function normalised so flat ground (i = 0) walks at v0 * fMob; peak at i = -0.05. i = rise/run."""
    return a.v0 * a.fMob * math.exp(-3.5 * abs(i + 0.05)) / math.exp(-0.175)


def cost_of_walking(i):
    """Minetti et al. 2002 walking polynomial, J/(kg m), valid about -0.45 <= i <= 0.45 (Earth gravity)."""
    i = max(-0.45, min(0.45, i))
    return 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5


def metabolic_power(i, a: Assumptions, v=None):
    v = speed(i, a) if v is None else v
    return a.mRestW + a.kG * a.etaSubstrate * cost_of_walking(i) * (a.bodyMassKg + a.loadKg) * v


def o2_g_per_h(power_w):
    vo2_l_h = power_w * 3600 / 20100.0
    return vo2_l_h * 1.429


def co2_g_per_h(power_w, rer=0.85):
    return rer * power_w * 3600 / 20100.0 * 1.977


def edge(dxy, dz, a: Assumptions):
    """Time (s) and O2 (g) to traverse one edge with horizontal length dxy and rise dz."""
    i = dz / dxy
    ds = math.hypot(dxy, dz)
    v = speed(i, a)
    t = ds / v
    return t, o2_g_per_h(metabolic_power(i, a, v)) * t / 3600.0
