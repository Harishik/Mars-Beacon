"""Mars BEACON backend (owner: Naomi).

Run:    uvicorn main:app --host 0.0.0.0 --port 8000
Config (environment variables only, no secrets in the repo):
  DATABASE_URL     postgresql+psycopg2://user:pass@host/db   (default: local SQLite file)
  FIXTURE_MODE     1 = never call external services, serve seeded data (for Harry to develop against)
  BUNDLE_BASE_URL  CDN/bucket root that holds the site bundles
  ALLOWED_ORIGINS  comma-separated app + landing page origins (default "*" for dev only; CORS_ORIGINS also works)
  DONKI_BASE_URLS  comma-separated, tried in order (see DEFAULT_DONKI)
  NASA_API_KEY     only used for the api.nasa.gov DONKI pattern
  RAW_IMAGES_FEED  mars.nasa.gov raw-image JSON feed (VERIFY at build time)
Design rule: the front end works from the static bundle; every response here says if it is live or cached.
"""
import json
import math
import os
import secrets
import hashlib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
                        create_engine, select, text)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

VERSION = "0.2.0"
HERE = Path(__file__).parent
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{HERE / 'beacon.db'}")
for _prefix in ("postgres://", "postgresql://"):  # providers hand out the short forms; name the driver we install (psycopg2)
    if DATABASE_URL.startswith(_prefix):
        DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len(_prefix):]
FIXTURE_MODE = os.getenv("FIXTURE_MODE", "0") == "1"
BUNDLE_BASE_URL = os.getenv("BUNDLE_BASE_URL", "").rstrip("/")
NASA_API_KEY = os.getenv("NASA_API_KEY", "DEMO_KEY")
# DONKI moved to ccmc.gsfc.nasa.gov on 30 Sep 2026. DONKI-API/get/<type> is the confirmed endpoint (returns a JSON array); the older patterns stay as fallbacks.
DEFAULT_DONKI = "https://ccmc.gsfc.nasa.gov/DONKI-API/get,https://ccmc.gsfc.nasa.gov/DONKI/WS/get,https://api.nasa.gov/DONKI"
DONKI_BASE_URLS = [u.strip().rstrip("/") for u in os.getenv("DONKI_BASE_URLS", DEFAULT_DONKI).split(",") if u.strip()]
RAW_IMAGES_FEED = os.getenv("RAW_IMAGES_FEED", "https://mars.nasa.gov/rss/api/")
EXTERNAL_TIMEOUT = 3.0  # seconds, per contract
EXTERNAL_RETRIES = 1
IMAGE_TTL = timedelta(hours=6)
KM_PER_DEG_MARS = 2 * math.pi * 3396.19 / 360  # ~59.27 km

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- models (portable: plain columns, no PostGIS needed)
class Base(DeclarativeBase):
    pass


class Site(Base):
    __tablename__ = "site"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(String, default="Mars")
    bbox: Mapped[Any] = mapped_column(JSON)  # [lonW, latS, lonE, latN], east-positive -180..180
    crs: Mapped[str] = mapped_column(String, default="TBD by pipeline (local metre grid)")
    manifest_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    site_hash: Mapped[str] = mapped_column(String)
    placeholder: Mapped[bool] = mapped_column(Boolean, default=True)  # True until real coordinates are set
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Dataset(Base):
    __tablename__ = "dataset"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    mission: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    instrument: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    product_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resolution_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    acquired: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    licence: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    credit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tag: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # OBSERVED | DERIVED | HISTORICAL | PREDICTED | SCENARIO | ASSUMPTION
    kind: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meta: Mapped[Any] = mapped_column(JSON, default=dict)  # the full registry row


class Layer(Base):
    __tablename__ = "layer"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("site.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String)  # short layer id used by the front end: dem, ortho, ...
    dataset_id: Mapped[str] = mapped_column(ForeignKey("dataset.id"))
    kind: Mapped[str] = mapped_column(String)
    file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # relative to the bundle folder
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Target(Base):
    __tablename__ = "target"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("site.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # ridge | hollow | drill | waypoint
    lon: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    sol: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_dataset_id: Mapped[Optional[str]] = mapped_column(ForeignKey("dataset.id"), nullable=True)


class PovImage(Base):
    __tablename__ = "pov_image"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("site.id", ondelete="CASCADE"))
    mission: Mapped[str] = mapped_column(String)
    instrument: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sol: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    x_m: Mapped[float] = mapped_column(Float)  # local metre grid of the site
    y_m: Mapped[float] = mapped_column(Float)
    z_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pitch_deg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    url: Mapped[str] = mapped_column(String)
    credit: Mapped[str] = mapped_column(String, default="NASA/JPL-Caltech")


class Plan(Base):
    __tablename__ = "plan"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    share_id: Mapped[str] = mapped_column(String, unique=True)
    site_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    site_hash: Mapped[str] = mapped_column(String)
    assumptions: Mapped[Any] = mapped_column(JSON, nullable=True)
    seed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    events: Mapped[Any] = mapped_column(JSON, nullable=True)
    plan: Mapped[Any] = mapped_column(JSON)  # the full MissionState subset exactly as the front end sent it
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SpaceweatherCache(Base):
    __tablename__ = "spaceweather_cache"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String)  # FLR | CME | SEP | notifications | seed
    start_date: Mapped[str] = mapped_column(String)
    end_date: Mapped[str] = mapped_column(String)
    payload: Mapped[Any] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    source_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class ImageCache(Base):
    __tablename__ = "image_cache"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cache_key: Mapped[str] = mapped_column(String, unique=True)
    payload: Mapped[Any] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Job(Base):
    __tablename__ = "job"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String)
    params: Mapped[Any] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, default="queued")  # queued | running | done | failed
    log: Mapped[str] = mapped_column(Text, default="")
    result_site_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------- seed
# PLACEHOLDER centres. Replace with the real coordinates from the Curiosity localized waypoints (PLACES):
# the box sits between the Altadena and Nevado Sajama drill sites. Then set placeholder=False.
# Gale origin = Sahaj's draft manifest (contracts/site_manifest.example.json), still "TBD (PLACES)".
SEED_SITES = {
    "gale-boxwork": ("Gale crater, Mount Sharp boxwork unit", -4.86, 137.32),
    "jezero": ("Jezero crater (Site Generator proof)", 18.4, 77.5),
}
# Which registry dataset feeds which layer at each site: (layer key, dataset_id, kind, file_path in bundle)
SEED_LAYERS = {
    "gale-boxwork": [
        ("dem", "usgs_gale_dem_1m", "topographic", "height_4m.f32"),
        ("ortho", "gale_ortho_25cm", "optical", "normal_2048.webp"),
        ("crism", "crism_summary", "spectral", None),
        ("themis", "themis_thermal", "thermal", None),
        ("rad", "msl_rad_dose", "radiation", None),
        ("rems", "msl_rems", "atmospheric", None),
        ("geology", "usgs_geologic_map", "geologic", None),
    ],
    "jezero": [("dem", "jezero_hirise_dtm", "topographic", "height_4m.f32")],
}
SEED_STORM = {  # 20 May 2024 event at Gale (VERIFIED in the data-source list)
    "event": "2024-05-20 solar storm at Mars, measured by Curiosity RAD",
    "rad_dose_microgray": 8100,
    "shelter_budget_min": 50,
    "note": "Scenario fixture. DONKI feeds are mostly Earth-centred; check Mars arrival fields before relying on them.",
}


def bbox_from_center(lat: float, lon: float, size_m: int = 3000) -> list[float]:
    half_km = size_m / 2000
    dlat = half_km / KM_PER_DEG_MARS
    dlon = dlat / max(math.cos(math.radians(lat)), 0.05)
    return [round(lon - dlon, 6), round(lat - dlat, 6), round(lon + dlon, 6), round(lat + dlat, 6)]


def site_hash(site_id: str, bbox: list[float]) -> str:
    return hashlib.sha1(f"{site_id}{bbox}".encode()).hexdigest()[:12]


def load_registry() -> list[dict]:
    return json.loads((HERE / "sources_registry.json").read_text())["sources"]


POSTGIS_VERSION: Optional[str] = None


def ensure_postgis(db: Session) -> Optional[str]:
    """On Postgres, enable PostGIS if the server offers it and keep geometry columns in step with the plain
    lon/lat and bbox columns. Mars coordinates use SRID 0 (no Earth CRS). Returns the PostGIS version or None.
    Everything is optional: if PostGIS is unavailable the API runs unchanged on plain columns."""
    if engine.dialect.name != "postgresql":
        return None
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        db.commit()
    except Exception:
        db.rollback()
        return None
    try:
        for stmt in (
            "ALTER TABLE site ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 0)",
            "ALTER TABLE target ADD COLUMN IF NOT EXISTS geom geometry(Point, 0)",
            "CREATE INDEX IF NOT EXISTS site_geom_gix ON site USING GIST (geom)",
            "CREATE INDEX IF NOT EXISTS target_geom_gix ON target USING GIST (geom)",
            "UPDATE site SET geom = ST_MakeEnvelope((bbox->>0)::float8, (bbox->>1)::float8, (bbox->>2)::float8, (bbox->>3)::float8, 0)",
            "UPDATE target SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 0)",
        ):
            db.execute(text(stmt))
        db.commit()
        return db.execute(text("SELECT postgis_version()")).scalar()
    except Exception:
        db.rollback()
        return None


def init_db() -> None:
    global POSTGIS_VERSION
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for row in load_registry():  # upsert, so editing the JSON and restarting is enough
            d = db.get(Dataset, row["id"]) or Dataset(id=row["id"])
            d.name, d.mission, d.instrument = row["product"], row.get("mission"), row.get("instrument")
            d.product_id, d.resolution_m, d.acquired = row.get("product_id"), row.get("resolution_m"), row.get("acquired")
            d.licence, d.credit, d.url = row.get("licence"), row.get("credit"), row.get("link")
            d.tag, d.kind, d.meta = row.get("tag"), row.get("kind"), row
            db.add(d)
        db.flush()
        if not db.scalar(select(Site.id).limit(1)):
            for sid, (name, lat, lon) in SEED_SITES.items():
                bb = bbox_from_center(lat, lon)
                db.add(Site(id=sid, name=name, bbox=bb, site_hash=site_hash(sid, bb)))
            db.flush()
            for sid, rows in SEED_LAYERS.items():
                db.add_all(Layer(site_id=sid, key=key, dataset_id=ds, kind=k, file_path=fp) for key, ds, k, fp in rows)
        if not db.scalar(select(SpaceweatherCache.id).where(SpaceweatherCache.kind == "seed")):
            db.add(SpaceweatherCache(kind="seed", start_date="2024-05-20", end_date="2024-05-20",
                                     payload={"events": [], "scenario": SEED_STORM}, source_url="seed"))
        db.commit()
        POSTGIS_VERSION = ensure_postgis(db)


def get_db():
    with SessionLocal() as db:
        yield db


def site_or_404(db: Session, site_id: str) -> Site:
    s = db.get(Site, site_id)
    if not s:
        raise HTTPException(404, f"unknown site '{site_id}'")
    return s


# ---------------------------------------------------------------- Mars24 (Allison & McEwen 2000)
def mars24(utc: datetime, lat: float, lon_east: float) -> dict:
    """Mars24 algorithm (published formulas). Loose check only: Ls comes out about 5.6 deg on
    2021-02-18 (Perseverance landing, mission says Ls ~5). VERIFY against the official Mars24 web tool before relying on it."""
    rad, deg = math.radians, math.degrees
    jd_ut = aware(utc).timestamp() / 86400 + 2440587.5
    jd_tt = jd_ut + 69.184 / 86400  # TT-UT: 32.184 s + 37 s leap seconds (valid while no new leap second)
    dt = jd_tt - 2451545.0
    msd = (jd_tt - 2405522.0028779) / 1.0274912517
    mtc = (24 * msd) % 24
    lmst = (mtc - ((-lon_east) % 360) * 24 / 360) % 24
    m = (19.3871 + 0.52402073 * dt) % 360
    alpha_fms = 270.3871 + 0.524038496 * dt
    pbs = sum(a * math.cos(rad(0.985626 * dt / tau + ph)) for a, tau, ph in (
        (0.0071, 2.2353, 49.409), (0.0057, 2.7543, 168.173), (0.0039, 1.1177, 191.837), (0.0037, 15.7866, 21.736),
        (0.0021, 2.1354, 15.704), (0.0020, 2.4694, 95.528), (0.0018, 32.8493, 49.095)))
    nu_m = ((10.691 + 3.0e-7 * dt) * math.sin(rad(m)) + 0.623 * math.sin(rad(2 * m)) + 0.050 * math.sin(rad(3 * m))
            + 0.005 * math.sin(rad(4 * m)) + 0.0005 * math.sin(rad(5 * m)) + pbs)
    ls = (alpha_fms + nu_m) % 360
    eot_deg = 2.861 * math.sin(rad(2 * ls)) - 0.071 * math.sin(rad(4 * ls)) + 0.002 * math.sin(rad(6 * ls)) - nu_m
    ltst = (lmst + eot_deg * 24 / 360) % 24
    decl = deg(math.asin(0.42565 * math.sin(rad(ls)))) + 0.25 * math.sin(rad(ls))
    h = rad((ltst - 12) * 15)
    sin_el = math.sin(rad(decl)) * math.sin(rad(lat)) + math.cos(rad(decl)) * math.cos(rad(lat)) * math.cos(h)
    el = deg(math.asin(max(-1, min(1, sin_el))))
    az = (deg(math.atan2(math.sin(h), math.cos(h) * math.sin(rad(lat)) - math.tan(rad(decl)) * math.cos(rad(lat)))) + 180) % 360

    def hms(x: float) -> str:
        return f"{int(x):02d}:{int((x % 1) * 60):02d}:{int(((x * 60) % 1) * 60):02d}"

    return dict(msd=round(msd, 4), mtc=hms(mtc), lmst=hms(lmst), ltst=hms(ltst), lmst_h=round(lmst, 4), ltst_h=round(ltst, 4), ls_deg=round(ls, 3),
                solar_declination_deg=round(decl, 3), sun_elevation_deg=round(el, 2), sun_azimuth_deg=round(az, 2))


# ---------------------------------------------------------------- app
app = FastAPI(title="Mars BEACON API", version=VERSION)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS") or "*").split(",")],
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/", include_in_schema=False)
def root():
    return {"name": "Mars BEACON API", "version": VERSION, "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "version": VERSION, "fixture_mode": FIXTURE_MODE, "db": engine.dialect.name, "postgis": POSTGIS_VERSION}




# ---------------------------------------------------------------- endpoints (response shapes follow contracts/api_contract.yaml)
def site_center(s: Site) -> tuple:
    w, so, e, n = s.bbox
    return (so + n) / 2, (w + e) / 2  # lat, lon


def local_to_lonlat(s: Site, x: float, y: float) -> tuple:
    lat0, lon0 = site_center(s)
    m_per_deg = KM_PER_DEG_MARS * 1000
    return lon0 + x / (m_per_deg * max(math.cos(math.radians(lat0)), 0.05)), lat0 + y / m_per_deg


def lonlat_to_local(s: Site, lon: float, lat: float) -> tuple:
    lat0, lon0 = site_center(s)
    m_per_deg = KM_PER_DEG_MARS * 1000
    return (lon - lon0) * m_per_deg * max(math.cos(math.radians(lat0)), 0.05), (lat - lat0) * m_per_deg


def site_json(s: Site) -> dict:
    return dict(siteId=s.id, name=s.name, manifestUrl=s.manifest_url or f"/sites/{s.id}/manifest",
                body=s.body, bbox=s.bbox, siteHash=s.site_hash, placeholderCoordinates=s.placeholder)


def target_list(db: Session, s: Site) -> list:
    out = []
    for t in db.scalars(select(Target).where(Target.site_id == s.id)):
        x, y = lonlat_to_local(s, t.lon, t.lat)
        out.append(dict(id=f"t{t.id}", name=t.name, type=t.type, x=round(x, 2), y=round(y, 2), sol=t.sol, source=t.source_dataset_id))
    if not out and FIXTURE_MODE:  # clearly labelled so the front end can develop before real targets exist
        out = [dict(id="ridge-fixture", name="Ridge top (fixture)", type="ridge", x=0.0, y=0.0, sol=None, source="fixture"),
               dict(id="hollow-fixture", name="Hollow (fixture)", type="hollow", x=2.0, y=0.0, sol=None, source="fixture")]
    return out


def pov_list(db: Session, site_id: str) -> list:
    return [dict(id=p.id, mission=p.mission, instrument=p.instrument, sol=p.sol, x=p.x_m, y=p.y_m, z=p.z_m,
                 headingDeg=p.heading_deg, pitchDeg=p.pitch_deg, url=p.url, credit=p.credit)
            for p in db.scalars(select(PovImage).where(PovImage.site_id == site_id))]


def dataset_json(d: Dataset) -> dict:
    m = d.meta or {}
    return dict(id=d.id, name=d.name, mission=d.mission, instrument=d.instrument, productId=d.product_id,
                resolutionM=d.resolution_m, acquired=d.acquired, licence=d.licence, credit=d.credit, url=d.url, tag=d.tag,
                kind=d.kind, type=m.get("type"), status=m.get("status"), usedIn=m.get("used_in"), resourceItem=m.get("resource_item"))


# -- sites, manifests, targets
@app.get("/sites")
def list_sites(db: Session = Depends(get_db)):
    return [site_json(s) for s in db.scalars(select(Site))]


@app.get("/sites/{siteId}/manifest")
def manifest(siteId: str, db: Session = Depends(get_db)):
    """Catalogue view in the shape of contracts/site_manifest.example.json. The pipeline's real bundle manifest
    (files, crs, grid, elevation) replaces the placeholder fields here once Sahaj's bundle exists."""
    s = site_or_404(db, siteId)
    lat0, lon0 = site_center(s)
    layers = []
    for l in db.scalars(select(Layer).where(Layer.site_id == siteId)):
        d = db.get(Dataset, l.dataset_id)
        layers.append(dict(id=l.key, kind=l.kind, mission=d.mission, instrument=d.instrument, productId=d.product_id,
                           resolutionM=d.resolution_m, acquired=d.acquired, tag=d.tag, attribution=d.credit, url=d.url,
                           file=l.file_path,
                           bundleUrl=f"{BUNDLE_BASE_URL}/sites/{s.site_hash}/{l.file_path}" if (BUNDLE_BASE_URL and l.file_path) else None))
    return dict(siteId=s.id, name=s.name, body=s.body, version="0.1.0", siteHash=s.site_hash,
                crs=dict(proj4="TBD (local equirectangular centred on the box)", origin=dict(lat=round(lat0, 5), lon=round(lon0, 5)),
                         datum="sphere R=3396190 m", lonDomain="-180..180"),
                grid=dict(liveM=4, cols=750, rows=750, extentM=3000), elevation=dict(min=0, max=0), files=[], layers=layers,
                patches=[], splats=[], havens=[dict(id="hab", type="habitat", x=0, y=0)], targets=target_list(db, s),
                povImages=pov_list(db, siteId), route=dict(source="PDS PLACES / Curiosity traverse", points=[]),
                fixture=FIXTURE_MODE, placeholderCoordinates=s.placeholder, bundleBaseUrl=BUNDLE_BASE_URL or None)


@app.get("/sites/{siteId}/targets")
def targets(siteId: str, db: Session = Depends(get_db)):
    s = site_or_404(db, siteId)
    feats = []
    for t in target_list(db, s):
        lon, lat = local_to_lonlat(s, t["x"], t["y"])
        feats.append(dict(type="Feature", geometry=dict(type="Point", coordinates=[round(lon, 7), round(lat, 7)]),
                          properties={**t, "fixture": t["source"] == "fixture"}))
    return dict(type="FeatureCollection", features=feats)


# -- provenance registry
@app.get("/datasets")
def datasets(site: Optional[str] = None, kind: Optional[str] = None, db: Session = Depends(get_db)):
    q = select(Dataset)
    if site:
        site_or_404(db, site)
        q = q.where(Dataset.id.in_([l.dataset_id for l in db.scalars(select(Layer).where(Layer.site_id == site))]))
    if kind:
        q = q.where(Dataset.kind == kind)
    return [dataset_json(d) for d in db.scalars(q)]


# -- live conditions
@app.get("/conditions")
def conditions(site: str, utc: Optional[datetime] = None, db: Session = Depends(get_db)):
    s = site_or_404(db, site)
    lat, lon = site_center(s)
    t = utc or now()
    m = mars24(t, lat, lon)
    return dict(siteId=site, utc=aware(t).isoformat(), lat=round(lat, 5), lonEast=round(lon, 5), msd=m["msd"], mtc=m["mtc"],
                lmst=m["lmst"], ltst=m["ltst"], lmstHours=m["lmst_h"], ltstHours=m["ltst_h"], ls=m["ls_deg"],
                solarDeclinationDeg=m["solar_declination_deg"], sunElevDeg=m["sun_elevation_deg"], sunAzDeg=m["sun_azimuth_deg"],
                lightTimeS=None,  # TODO: daily Earth-Mars table from JPL Horizons
                remsBand=None,    # TODO: REMS seasonal band from the PDS Atmospheres tables (VERIFY)
                tags=["DERIVED"], sources=["Mars24 (Allison & McEwen 2000)"], placeholderCoordinates=s.placeholder)


# -- space weather (DONKI), cached per day
async def fetch_donki(kind: str, start: str, end: str) -> tuple:
    last = None
    async with httpx.AsyncClient(timeout=EXTERNAL_TIMEOUT) as client:
        for base in DONKI_BASE_URLS:
            params: dict = {"startDate": start, "endDate": end}
            if kind == "notifications":
                params["type"] = "all"
            if "api.nasa.gov" in base:
                params["api_key"] = NASA_API_KEY
            for _ in range(EXTERNAL_RETRIES + 1):
                try:
                    r = await client.get(f"{base}/{kind}", params=params)
                    r.raise_for_status()
                    return r.json() or [], f"{base}/{kind}"
                except Exception as e:  # try the retry, then the next base URL
                    last = e
    raise RuntimeError(f"all DONKI endpoints failed: {last}")


@app.get("/spaceweather")
async def spaceweather(kind: str = Query("CME", pattern="^(FLR|CME|SEP|notifications)$"),
                       start: Optional[date] = None, end: Optional[date] = None, db: Session = Depends(get_db)):
    end_d = end or now().date()
    start_d = start or end_d - timedelta(days=30)
    s_str, e_str = start_d.isoformat(), end_d.isoformat()
    seed = db.scalars(select(SpaceweatherCache).where(SpaceweatherCache.kind == "seed")).first()

    def out(row: SpaceweatherCache, cached: bool):
        p = row.payload
        return dict(events=p if isinstance(p, list) else p.get("events", []), cached=cached, fetchedAt=row.fetched_at,
                    badge="CACHED" if cached else "LIVE", kind=kind, start=s_str, end=e_str, sourceUrl=row.source_url,
                    credit="NASA CCMC DONKI", scenario=p.get("scenario") if isinstance(p, dict) else None)

    if FIXTURE_MODE:
        return out(seed, True)
    rows = db.scalars(select(SpaceweatherCache).where(SpaceweatherCache.kind == kind, SpaceweatherCache.start_date == s_str,
                                                      SpaceweatherCache.end_date == e_str)
                      .order_by(SpaceweatherCache.fetched_at.desc())).all()
    if rows and aware(rows[0].fetched_at).date() == now().date():  # cache per day
        return out(rows[0], True)
    try:
        payload, url = await fetch_donki(kind, s_str, e_str)
        row = SpaceweatherCache(kind=kind, start_date=s_str, end_date=e_str, payload=payload, source_url=url)
        db.add(row)
        db.commit()
        return out(row, False)
    except Exception:
        return out(rows[0] if rows else seed, True)  # never break the panel


# -- rover images: a bare list, as in the contract. Live or cached status is in the X-Data-Status header.
SITE_ROVER = {"gale-boxwork": "msl", "jezero": "mars2020"}
ROVER_NAME = {"msl": "MSL", "mars2020": "Mars 2020"}


async def fetch_raw_images(rover: str, sol: Optional[int], limit: int) -> list:
    category = "mars2020" if rover == "mars2020" else "msl"
    params: dict = {"feed": "raw_images", "category": category, "feedtype": "json", "num": limit,
                    "page": 0, "order": "sol desc,date_taken desc"}
    if sol is not None:
        params["condition_2"] = f"{sol}:sol:in"
    last = None
    async with httpx.AsyncClient(timeout=EXTERNAL_TIMEOUT) as client:
        for _ in range(EXTERNAL_RETRIES + 1):
            try:
                r = await client.get(RAW_IMAGES_FEED, params=params)
                r.raise_for_status()
                items = []
                for i in r.json().get("images", []):
                    files = i.get("image_files") or {}
                    items.append(dict(id=i.get("imageid"), mission=ROVER_NAME[rover], instrument=(i.get("camera") or {}).get("instrument"),
                                      sol=i.get("sol"), x=None, y=None, z=None, headingDeg=None, pitchDeg=None,
                                      url=files.get("large") or files.get("full_res") or files.get("medium"), credit="NASA/JPL-Caltech"))
                return items
            except Exception as e:
                last = e
    raise RuntimeError(f"raw image feed failed: {last}")


@app.get("/rover-images")
async def rover_images(response: Response, site: str, near: Optional[str] = Query(None, description="x,y in site metres"),
                       radius: float = 200.0, sol: Optional[int] = None, limit: int = Query(12, ge=1, le=50),
                       db: Session = Depends(get_db)):
    site_or_404(db, site)
    pins = pov_list(db, site)
    if near:
        try:
            nx, ny = (float(v) for v in near.split(","))
        except ValueError:
            raise HTTPException(422, "near must be 'x,y' in metres")
        pins = [p for p in pins if math.hypot(p["x"] - nx, p["y"] - ny) <= radius]
    response.headers["X-Data-Status"] = "CACHED"
    if FIXTURE_MODE:
        return pins
    rover = SITE_ROVER.get(site, "msl")
    key = f"{rover}:{sol or 'latest'}:{limit}"
    cached = db.scalars(select(ImageCache).where(ImageCache.cache_key == key)).first()
    if cached and now() - aware(cached.fetched_at) < IMAGE_TTL:
        return pins + cached.payload
    try:
        items = await fetch_raw_images(rover, sol, limit)
        if cached:
            cached.payload, cached.fetched_at = items, now()
        else:
            db.add(ImageCache(cache_key=key, payload=items))
        db.commit()
        response.headers["X-Data-Status"] = "LIVE"
        return pins + items
    except Exception:
        return pins + (cached.payload if cached else [])


# -- plans (the front end sends a MissionState subset; it is stored exactly as sent)
class PlanIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    siteHash: str
    siteId: Optional[str] = None
    seed: Optional[int] = None
    assumptions: Optional[dict] = None
    events: Optional[list] = None


@app.post("/plans", status_code=201)
def save_plan(body: PlanIn, db: Session = Depends(get_db)):
    share_id = secrets.token_urlsafe(6)
    db.add(Plan(share_id=share_id, site_id=body.siteId, site_hash=body.siteHash, assumptions=body.assumptions,
                seed=body.seed, events=body.events, plan=body.model_dump()))
    db.commit()
    return {"shareId": share_id}


@app.get("/plans/{shareId}")
def get_plan(shareId: str, db: Session = Depends(get_db)):
    p = db.scalars(select(Plan).where(Plan.share_id == shareId)).first()
    if not p:
        raise HTTPException(404, "plan not found")
    return {**p.plan, "shareId": p.share_id, "createdAt": p.created_at}


# -- Site Generator jobs (API only: the worker that runs Sahaj's build_site.py is NOT wired yet)
class GenerateSiteIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    bbox: list = Field(min_length=4, max_length=4)  # [lonW, latS, lonE, latN]
    dem_url: str
    ortho_url: Optional[str] = None
    levels: list = ["L0"]


@app.post("/jobs/generate-site", status_code=202)
def generate_site(body: GenerateSiteIn, db: Session = Depends(get_db)):
    w, so, e, n = body.bbox
    if not (-180 <= w < e <= 180 and -90 <= so < n <= 90):
        raise HTTPException(422, "bbox must be [lonW, latS, lonE, latN] with W<E and S<N")
    width_km = (e - w) * math.cos(math.radians((so + n) / 2)) * KM_PER_DEG_MARS
    height_km = (n - so) * KM_PER_DEG_MARS
    if max(width_km, height_km) > 5:
        raise HTTPException(422, f"box too large ({max(width_km, height_km):.1f} km); limit is 5 km")
    if body.levels != ["L0"]:
        raise HTTPException(422, "user jobs are L0 only (L1 and L2 need GPU and curation)")
    # When wiring the worker: allowlist dem_url/ortho_url hosts (USGS, PDS) so users cannot make the worker fetch arbitrary URLs.
    job = Job(type="generate-site", params=body.model_dump(), log="queued; worker not connected yet")
    db.add(job)
    db.commit()
    return {"jobId": str(job.id)}


@app.get("/jobs/{jobId}")
def get_job(jobId: str, db: Session = Depends(get_db)):
    j = db.get(Job, int(jobId)) if jobId.isdigit() else None
    if not j:
        raise HTTPException(404, "job not found")
    return dict(status=j.status, log=j.log, resultSiteId=j.result_site_id, createdAt=j.created_at, finishedAt=j.finished_at)


# -- Mars Trek helper: bare list. URLs live in trek_layers.json so nothing is hard-coded in the front end.
@app.get("/trek/layers")
def trek_layers(site: str, db: Session = Depends(get_db)):
    site_or_404(db, site)
    return json.loads((HERE / "trek_layers.json").read_text())["layers"]
