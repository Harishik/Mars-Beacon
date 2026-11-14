"""Return Envelope, Python twin (plan 21 section 5), single crew, habitat haven, time + O2 on one path.

Graph: 16-neighbour lattice (8 + knight moves) on the 4 m grid; an edge is blocked if either endpoint or, for
knight moves, either cell it crosses is blocked (slope_4m > slopeLimitDeg, rockBig, or nodata).
Costs are direction dependent (uphill and downhill differ).
  R(x): least-time path from x back to the haven (search on the reversed graph); O2 accumulated along that
        same tree path (tree T in the plan).
  C(x): least-time path haven -> x (outbound), O2 along it.
A cell is inside the static excursion envelope if, for each resource r in {time, O2}:
  C_r(x) + (1 + m) * R_r(x) <= Budget_r          (Spent at x = outbound cost; conservative: walk straight out)
Impact figure: compare with the plain 2 km walk-back circle around the haven.
"""
import math

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from walking import Assumptions, speed, metabolic_power, o2_g_per_h

OFFSETS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1),
           (-2, -1), (-2, 1), (2, -1), (2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2)]


def _crossed(dr, dc):
    """Cells a knight move passes through (both cells adjacent to the segment)."""
    if abs(dr) == 2:
        return [(int(math.copysign(1, dr)), 0), (int(math.copysign(1, dr)), dc)]
    if abs(dc) == 2:
        return [(0, int(math.copysign(1, dc))), (dr, int(math.copysign(1, dc)))]
    if dr and dc:
        return [(dr, 0), (0, dc)]  # diagonal: no corner cutting
    return []


def build_graph(z, cell, blocked, a: Assumptions):
    n_r, n_c = z.shape
    idx = np.arange(n_r * n_c).reshape(n_r, n_c)
    src, dst, tcost, ocost = [], [], [], []
    for dr, dc in OFFSETS:
        r0, r1 = max(0, -dr), n_r - max(0, dr)
        c0, c1 = max(0, -dc), n_c - max(0, dc)
        ok = ~blocked[r0:r1, c0:c1] & ~blocked[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
        for xr, xc in _crossed(dr, dc):
            ok &= ~blocked[r0 + xr:r1 + xr, c0 + xc:c1 + xc]
        dxy = cell * math.hypot(dr, dc)
        dz = (z[r0 + dr:r1 + dr, c0 + dc:c1 + dc] - z[r0:r1, c0:c1])[ok]
        i = dz / dxy
        v = a.v0 * a.fMob * np.exp(-3.5 * np.abs(i + 0.05)) / math.exp(-0.175)
        ds = np.hypot(dxy, dz)
        t = ds / v
        ic = np.clip(i, -0.45, 0.45)
        cw = 280.5 * ic ** 5 - 58.7 * ic ** 4 - 76.8 * ic ** 3 + 51.9 * ic ** 2 + 19.6 * ic + 2.5
        P = a.mRestW + a.kG * a.etaSubstrate * cw * (a.bodyMassKg + a.loadKg) * v
        o2 = P * 3600 / 20100.0 * 1.429 * t / 3600.0
        src.append(idx[r0:r1, c0:c1][ok]); dst.append(idx[r0 + dr:r1 + dr, c0 + dc:c1 + dc][ok])
        tcost.append(t); ocost.append(o2)
    src, dst = np.concatenate(src), np.concatenate(dst)
    T = csr_matrix((np.concatenate(tcost), (src, dst)), shape=(n_r * n_c,) * 2)
    O = csr_matrix((np.concatenate(ocost), (src, dst)), shape=(n_r * n_c,) * 2)
    return T, O


def tree_costs(T, O, source, reverse):
    """Least-time tree from (reverse=False) or to (reverse=True) the source; O2 accumulated along the same tree."""
    M = T.T.tocsr() if reverse else T
    dist, pred = dijkstra(M, directed=True, indices=source, return_predecessors=True)
    order = np.argsort(dist)
    order = order[np.isfinite(dist[order])]
    o2 = np.full(dist.shape, np.inf); o2[source] = 0.0
    Oc = O.tocoo()
    N = dist.shape[0]
    keys = Oc.row.astype(np.int64) * N + Oc.col
    srt = np.argsort(keys); keys, vals = keys[srt], Oc.data[srt]
    vs = order[1:]; ps = pred[vs]
    # travel direction: outbound p->v ; return v->p (edge in the original graph)
    q = (vs.astype(np.int64) * N + ps) if reverse else (ps.astype(np.int64) * N + vs)
    w = vals[np.searchsorted(keys, q)]
    o2_list = o2.tolist(); w_list = w.tolist(); ps_l = ps.tolist()
    for k, v in enumerate(vs.tolist()):
        o2_list[v] = o2_list[ps_l[k]] + w_list[k]
    return dist, np.array(o2_list)


def envelope(z, cell, blocked, haven_rc, a: Assumptions, budget_time_s, budget_o2_g):
    T, O = build_graph(z, cell, blocked, a)
    n_r, n_c = z.shape
    s = haven_rc[0] * n_c + haven_rc[1]
    Rt, Ro = tree_costs(T, O, s, reverse=True)
    Ct, Co = tree_costs(T, O, s, reverse=False)
    m = a.reserveM
    inside = (Ct + (1 + m) * Rt <= budget_time_s) & (Co + (1 + m) * Ro <= budget_o2_g)
    return {"inside": inside.reshape(n_r, n_c), "timeToHaven": Rt.reshape(n_r, n_c), "o2ToHaven": Ro.reshape(n_r, n_c),
            "timeOut": Ct.reshape(n_r, n_c), "o2Out": Co.reshape(n_r, n_c)}
