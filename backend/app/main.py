"""Mars BEACON API (contracts/api_contract.yaml).

The browser runs the terrain engine, the Return Envelope and the planner, so the app stays fast and keeps
working if this service is down. The server does what a static site cannot:
  - stores saved missions and debriefs in PostgreSQL behind short share links,
  - fetches NASA DONKI space weather and Curiosity REMS weather once per cache window for every visitor
    (no browser rate limits, no API key in the page), with STALE/UNAVAILABLE badges when an upstream fails,
  - serves the site catalogue, manifests, targets, provenance registry and rover images from the same
    bundles the frontend uses, and Mars24 conditions and Earth-Mars light time for any site and time.
"""
from __future__ import annotations

import json
import math
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import feeds
from .db import Database
from .mars24 import light_time, mars_time

VERSION = "1.0.0"
R_MARS = 3396190.0
BUNDLE_DIR = Path(os.environ.get("BUNDLE_DIR", Path(__file__).resolve().parents[2] / "fixtures" / "bundle"))
PUBLIC_SITES = [s.strip() for s in os.environ.get("SITES", "gale-boxwork,jezero").split(",") if s.strip()]
MAX_PLAN_BYTES = int(os.environ.get("MAX_PLAN_BYTES", str(64 * 1024)))
PLAN_RATE = int(os.environ.get("PLAN_RATE_PER_HOUR", "30"))
STARTED = time.time()

app = FastAPI(title="Mars BEACON API", version=VERSION, description=__doc__)
origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"], max_age=600)
app.add_middleware(GZipMiddleware, minimum_size=1024)

if BUNDLE_DIR.is_dir():  # rover frames and M1 overlays referenced by /rover-images
    app.mount("/bundle", StaticFiles(directory=BUNDLE_DIR), name="bundle")

_db: Database | None = None


def db() -> Database:
    global _db
    if _db is None:
        _db = Database()
    return _db


# Sites ----------------------------------------------------------------------------------------------

@lru_cache(maxsize=16)
def _manifest(site_id: str) -> dict:
    if site_id not in PUBLIC_SITES:
        raise HTTPException(404, f"unknown site '{site_id}'")
    p = BUNDLE_DIR / site_id / "manifest.json"
    if not p.is_file():
        raise HTTPException(404, f"no bundle for site '{site_id}'")
    return json.loads(p.read_text())


def _lonlat(m: dict, x: float, y: float) -> tuple[float, float]:
    o = m["crs"]["origin"]
    lat = o["lat"] + math.degrees(y / R_MARS)
    lon = o["lon"] + math.degrees(x / (R_MARS * math.cos(math.radians(o["lat"]))))
    return round(lon, 7), round(lat, 7)


def _bbox(m: dict) -> list[float]:
    h = m["grid"]["extentM"] / 2
    (w, s), (e, n) = _lonlat(m, -h, -h), _lonlat(m, h, h)
    return [w, s, e, n]


@app.get("/health")
def health() -> dict:
    d = db()
    ok = d.ping()
    return {"status": "ok" if ok else "degraded", "version": VERSION, "db": d.kind, "dbOk": ok,
            "sites": PUBLIC_SITES, "donkiKey": bool(os.environ.get("NASA_API_KEY")), "uptimeS": int(time.time() - STARTED)}


@app.get("/sites")
def sites() -> list[dict]:
    out = []
    for sid in PUBLIC_SITES:
        try:
            m = _manifest(sid)
        except HTTPException:
            continue
        out.append({"siteId": sid, "name": m["name"], "body": m.get("body", "Mars"), "manifestUrl": f"/sites/{sid}/manifest",
                    "bbox": _bbox(m), "siteHash": m.get("siteHash"), "origin": m["crs"]["origin"], "placeholderCoordinates": False})
    return out


@app.get("/sites/{site_id}/manifest")
def manifest(site_id: str) -> dict:
    return _manifest(site_id)


@app.get("/sites/{site_id}/targets")
def targets(site_id: str) -> dict:
    m = _manifest(site_id)
    feats = []
    for t in m.get("targets", []):
        lon, lat = _lonlat(m, t["x"], t["y"])
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {k: t.get(k) for k in ("id", "name", "type", "x", "y", "sol", "source")}})
    for h in m.get("havens", []):
        lon, lat = _lonlat(m, h["x"], h["y"])
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"id": h.get("id", h["type"]), "name": h.get("name", h["type"]), "type": h["type"], "x": h["x"], "y": h["y"], "haven": True}})
    return {"type": "FeatureCollection", "siteId": site_id, "siteHash": m.get("siteHash"), "features": feats}


@app.get("/datasets")
def datasets(site: str | None = None) -> list[dict]:
    seen: dict[str, dict] = {}
    for sid in ([site] if site else PUBLIC_SITES):
        try:
            m = _manifest(sid)
        except HTTPException:
            continue
        for layer in m.get("layers", []):
            d = seen.setdefault(layer.get("productId") or layer["id"], {
                "id": layer["id"], "name": layer.get("name") or layer.get("productId"), "kind": layer.get("kind"),
                "mission": layer.get("mission"), "instrument": layer.get("instrument"), "productId": layer.get("productId"),
                "resolutionM": layer.get("resolutionM"), "acquired": layer.get("acquired"), "licence": layer.get("licence"),
                "credit": layer.get("attribution"), "url": layer.get("url"), "tag": layer.get("tag"), "usedIn": []})
            d["usedIn"].append(sid)
    return list(seen.values())


@app.get("/rover-images")
def rover_images(site: str, stop: str | None = None, sol: int | None = None) -> list[dict]:
    _manifest(site)
    p = BUNDLE_DIR / site / "rover" / "index.json"
    if not p.is_file():
        return []
    imgs = json.loads(p.read_text()).get("images", [])
    return [{**i, "image": f"/bundle/{site}/{i['image']}", "m1": f"/bundle/{site}/{i['m1']}" if i.get("m1") else None}
            for i in imgs if (stop is None or i.get("stop") == stop) and (sol is None or i.get("sol") == sol)]


# Conditions and feeds -------------------------------------------------------------------------------

@app.get("/conditions")
def conditions(site: str, utc: datetime | None = None) -> dict:
    m = _manifest(site)
    o = m["crs"]["origin"]
    t = utc or datetime.now(timezone.utc)
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    rems_band = None
    if site.startswith("gale"):
        r = feeds.rems(db())
        if r["soles"]:
            s = r["soles"][0]
            rems_band = {"sol": s["sol"], "date": s["date"], "airMinC": s["minC"], "airMaxC": s["maxC"], "pressurePa": s["pressurePa"],
                         "badge": r["badge"], "note": "Latest published Curiosity sol (the feed lags by weeks)"}
    return {"siteId": site, "utc": t.isoformat(), "lat": o["lat"], "lonEast": o["lon"], **mars_time(t, o["lat"], o["lon"]),
            "lightTime": light_time(t), "remsLatest": rems_band, "tags": ["DERIVED"],
            "sources": ["Mars24 (Allison and McEwen 2000)", "JPL approximate Keplerian elements (Standish)"], "placeholderCoordinates": False}


@app.get("/spaceweather")
def spaceweather(kind: Literal["FLR", "CME", "SEP", "GST", "notifications"] = "CME",
                 start: date | None = None, end: date | None = None) -> dict:
    end = end or datetime.now(timezone.utc).date()
    start = start or end - timedelta(days=30)
    if start > end or (end - start).days > 120:
        raise HTTPException(422, "date window must be 0 to 120 days")
    return feeds.donki(db(), kind, start, end)


@app.get("/weather/rems")
def weather_rems() -> dict:
    return feeds.rems(db())


@app.get("/trek/layers")
def trek_layers(site: str | None = None) -> list[dict]:
    base = "https://trek.nasa.gov/tiles/Mars/EQ"
    return [
        {"name": "MOLA colour shaded relief", "id": "Mars_MGS_MOLA_ClrShade_merge_global_463m",
         "wmtsUrl": f"{base}/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{{z}}/{{y}}/{{x}}.jpg", "attribution": "NASA/JPL-Caltech Mars Trek"},
        {"name": "CTX mosaic", "id": "CTX_beta01_uncorrected_00N090W",
         "wmtsUrl": f"{base}/CTX_beta01_uncorrected_00N090W/1.0.0/default/default028mm/{{z}}/{{y}}/{{x}}.png", "attribution": "NASA/JPL-Caltech/MSSS Mars Trek"},
        {"name": "THEMIS day IR", "id": "Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12",
         "wmtsUrl": f"{base}/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12/1.0.0/default/default028mm/{{z}}/{{y}}/{{x}}.png", "attribution": "NASA/JPL-Caltech/ASU Mars Trek"},
        {"name": "Viking colour mosaic", "id": "Mars_Viking_MDIM21_ClrMosaic_global_232m",
         "wmtsUrl": f"{base}/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{{z}}/{{y}}/{{x}}.jpg", "attribution": "NASA/JPL-Caltech/USGS Mars Trek"},
    ]


# Saved missions ------------------------------------------------------------------------------------

_hits: dict[str, deque] = defaultdict(deque)


def _rate_ok(ip: str) -> bool:
    q, now = _hits[ip], time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= PLAN_RATE:
        return False
    q.append(now)
    return True


@app.post("/plans", status_code=201)
async def save_plan(request: Request) -> dict:
    raw = await request.body()
    if len(raw) > MAX_PLAN_BYTES:
        raise HTTPException(413, f"plan larger than {MAX_PLAN_BYTES // 1024} KB")
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    if not _rate_ok(ip):
        raise HTTPException(429, "too many saves from this address; try again later")
    try:
        body: Any = json.loads(raw)
    except ValueError:
        raise HTTPException(422, "body must be JSON")
    if not isinstance(body, dict) or not isinstance(body.get("siteHash"), str) or not body["siteHash"]:
        raise HTTPException(422, "siteHash is required")
    if body.get("siteId") is not None and body["siteId"] not in PUBLIC_SITES:
        raise HTTPException(422, f"unknown siteId '{body['siteId']}'")
    if body.get("kind", "plan") not in ("plan", "debrief"):
        raise HTTPException(422, "kind must be plan or debrief")
    for _ in range(5):
        share_id = secrets.token_urlsafe(6)
        try:
            created = db().save_plan(share_id, body)
            return {"shareId": share_id, "createdAt": created.isoformat()}
        except Exception as e:  # unique-id collision: try another id
            if "unique" not in str(e).lower() and "duplicate" not in str(e).lower():
                raise HTTPException(503, "mission database unavailable") from e
    raise HTTPException(503, "could not allocate a share id")


@app.get("/plans/{share_id}")
def get_plan(share_id: str) -> dict:
    if not (4 <= len(share_id) <= 40) or not share_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(404, "plan not found")
    p = db().get_plan(share_id)
    if not p:
        raise HTTPException(404, "plan not found")
    return p


# Site Generator ------------------------------------------------------------------------------------

@app.post("/jobs/generate-site", status_code=501)
def generate_site() -> JSONResponse:
    return JSONResponse(status_code=501, content={
        "detail": "Site generation runs offline in pipeline/ (it needs the USGS DEM and HiRISE downloads, minutes of CPU). "
                  "Generated bundles are published as new sites; see pipeline/README."})


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    raise HTTPException(404, "no such job")
