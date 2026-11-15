"""Live upstream feeds fetched on the server, cached in the database.

DONKI (NASA CCMC space weather): tried keyless at CCMC, then api.nasa.gov with NASA_API_KEY. The server
fetches once per cache window for every visitor, so browsers never hit the api.nasa.gov rate limit and the
key never reaches the page. REMS (Curiosity daily weather) comes from the NASA/JPL Mars weather feed.
If an upstream fails, the last good copy is served with badge STALE and its age."""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

import httpx

from .db import Database

CCMC = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get"
APINASA = "https://api.nasa.gov/DONKI"
REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
DONKI_TTL = timedelta(minutes=int(os.environ.get("DONKI_TTL_MIN", "15")))
REMS_TTL = timedelta(hours=1)
UA = {"User-Agent": "MarsBEACON/1.0 (NASA Space Apps 2026 mission planner)"}

Fetch = Callable[[str], Any]


def http_get_json(url: str, headers: dict | None = None) -> Any:
    with httpx.Client(timeout=20.0, headers={**UA, **(headers or {})}, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.json()


def _age_s(at: datetime) -> int:
    return int((datetime.now(timezone.utc) - at).total_seconds())


def donki(db: Database, kind: str, start: date, end: date, fetch: Fetch = http_get_json) -> dict:
    key = f"donki:{kind}:{start.isoformat()}:{end.isoformat()}"
    cached = db.cache_get(key)
    base = {"kind": kind, "start": start.isoformat(), "end": end.isoformat(), "credit": "NASA CCMC DONKI"}
    if cached and datetime.now(timezone.utc) - cached[2] < DONKI_TTL:
        return {**base, "events": cached[0], "cached": True, "badge": "LIVE", "fetchedAt": cached[2].isoformat(),
                "ageS": _age_s(cached[2]), "sourceUrl": cached[1]}
    q = f"startDate={start.isoformat()}&endDate={end.isoformat()}"
    api_key = os.environ.get("NASA_API_KEY", "").strip()
    # The key goes in the X-Api-Key header (api.data.gov accepts it), never in a URL that could be logged.
    sources: list[tuple[str, dict | None]] = [(f"{CCMC}/{kind}?{q}", None)]
    if api_key:
        sources.append((f"{APINASA}/{kind}?{q}", {"X-Api-Key": api_key}))
    errors: list[str] = []
    for url, hdrs in sources:
        try:
            events = fetch(url, hdrs) if hdrs else fetch(url)
            if events in ("", None):
                events = []
            if not isinstance(events, list):
                raise ValueError("unexpected DONKI payload")
            public = url
            at = db.cache_put(key, events, public)
            return {**base, "events": events, "cached": False, "badge": "LIVE", "fetchedAt": at.isoformat(), "ageS": 0, "sourceUrl": public}
        except Exception as e:  # noqa: BLE001 - every upstream failure falls through to the next source
            errors.append(f"{url.split('?')[0]}: {type(e).__name__}")
    if cached:
        return {**base, "events": cached[0], "cached": True, "badge": "STALE", "fetchedAt": cached[2].isoformat(),
                "ageS": _age_s(cached[2]), "sourceUrl": cached[1], "errors": errors}
    return {**base, "events": [], "cached": False, "badge": "UNAVAILABLE", "fetchedAt": None, "sourceUrl": None, "errors": errors,
            "hint": None if api_key else "Set NASA_API_KEY (free at api.nasa.gov) for a second DONKI source."}


def _num(v: Any) -> float | None:
    try:
        return None if v in ("--", "", None) else float(v)
    except (TypeError, ValueError):
        return None


def parse_rems(feed: dict, n: int = 14) -> list[dict]:
    rows = []
    for r in feed.get("soles", []):
        try:
            sol = int(r["sol"])
        except (KeyError, ValueError, TypeError):
            continue
        rows.append({"sol": sol, "date": r.get("terrestrial_date"), "ls": _num(r.get("ls")),
                     "minC": _num(r.get("min_temp")), "maxC": _num(r.get("max_temp")),
                     "groundMinC": _num(r.get("min_gts_temp")), "groundMaxC": _num(r.get("max_gts_temp")),
                     "pressurePa": _num(r.get("pressure")), "opacity": r.get("atmo_opacity"), "uv": r.get("local_uv_irradiance_index"),
                     "sunrise": r.get("sunrise"), "sunset": r.get("sunset")})
    rows.sort(key=lambda x: -x["sol"])
    return rows[:n]


def rems(db: Database, fetch: Fetch = http_get_json) -> dict:
    key = "rems:msl"
    cached = db.cache_get(key)
    base = {"site": "gale", "instrument": "Curiosity REMS", "credit": "NASA/JPL-Caltech, Centro de Astrobiologia (CSIC-INTA)"}
    if cached and datetime.now(timezone.utc) - cached[2] < REMS_TTL:
        return {**base, "soles": cached[0], "badge": "LIVE", "fetchedAt": cached[2].isoformat(), "ageS": _age_s(cached[2]), "sourceUrl": REMS_URL}
    try:
        soles = parse_rems(fetch(REMS_URL))
        if not soles:
            raise ValueError("empty REMS feed")
        at = db.cache_put(key, soles, REMS_URL)
        return {**base, "soles": soles, "badge": "LIVE", "fetchedAt": at.isoformat(), "ageS": 0, "sourceUrl": REMS_URL}
    except Exception as e:  # noqa: BLE001
        if cached:
            return {**base, "soles": cached[0], "badge": "STALE", "fetchedAt": cached[2].isoformat(), "ageS": _age_s(cached[2]),
                    "sourceUrl": REMS_URL, "errors": [type(e).__name__]}
        return {**base, "soles": [], "badge": "UNAVAILABLE", "fetchedAt": None, "sourceUrl": REMS_URL, "errors": [type(e).__name__]}
