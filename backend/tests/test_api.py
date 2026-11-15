"""API tests. Run against SQLite by default, or a real Postgres with TEST_DATABASE_URL=postgresql://..."""
import os
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import feeds, main
from app.db import Database
from app.mars24 import light_time, mars_time


@pytest.fixture()
def client(tmp_path, monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 't.db'}"
    d = Database(url)
    if d.kind == "postgresql":
        with d._cur() as cur:
            cur.execute("TRUNCATE plans, feed_cache")
    main._db = d
    main._hits.clear()
    yield TestClient(main.app)
    main._db = None


def test_mars24_matches_giss_worked_example():
    # NASA GISS Mars24 example: 2000-01-06 00:00 UTC, MSD 44795.9998, Ls 277.187.
    t = mars_time(datetime(2000, 1, 6, tzinfo=timezone.utc), 0.0, 0.0)
    assert abs(t["msd"] - 44795.9998) < 0.0005
    assert abs(t["ls"] - 277.187) < 0.01


def test_light_time_range():
    lt = light_time(datetime(2026, 11, 15, tzinfo=timezone.utc))
    assert 3 * 60 < lt["oneWayS"] < 23 * 60


def test_health_and_sites(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["dbOk"]
    sites = client.get("/sites").json()
    ids = {s["siteId"] for s in sites}
    assert {"gale-boxwork", "jezero"} <= ids
    gale = next(s for s in sites if s["siteId"] == "gale-boxwork")
    w, s_, e, n = gale["bbox"]
    assert w < 137.384 < e and s_ < -4.8031 < n  # bbox around the site origin
    assert gale["siteHash"]


def test_manifest_targets_match_bundle(client):
    m = client.get("/sites/gale-boxwork/manifest").json()
    t = client.get("/sites/gale-boxwork/targets").json()
    assert t["siteHash"] == m["siteHash"]
    ids = {f["properties"]["id"] for f in t["features"]}
    assert {x["id"] for x in m["targets"]} <= ids
    assert client.get("/sites/nowhere/manifest").status_code == 404


def test_conditions(client, monkeypatch):
    monkeypatch.setattr(feeds, "http_get_json", lambda url: {"soles": [{"sol": "4995", "terrestrial_date": "2026-08-25", "min_temp": "-71", "max_temp": "-5", "pressure": "777"}]})
    c = client.get("/conditions", params={"site": "gale-boxwork", "utc": "2026-11-15T07:44:42Z"}).json()
    assert c["lmst"] == "05:20:23" or abs(c["lmstHours"] - 5.34) < 0.05
    assert -90 <= c["sunElevDeg"] <= 90 and c["lightTime"]["oneWayS"] > 0


def test_plan_roundtrip_and_validation(client):
    body = {"app": "mars-beacon", "schema": 1, "kind": "plan", "siteHash": "fbb0", "siteId": "gale-boxwork", "seed": None,
            "planName": "test", "assumptions": {"v0": 0.7, "customStops": [{"id": "custom-a", "name": "A", "x": 1, "y": 2}]}, "events": []}
    r = client.post("/plans", json=body)
    assert r.status_code == 201
    sid = r.json()["shareId"]
    got = client.get(f"/plans/{sid}").json()
    assert got["assumptions"]["customStops"][0]["name"] == "A" and got["createdAt"]
    assert client.get("/plans/doesnotexist").status_code == 404
    assert client.post("/plans", json={"siteId": "gale-boxwork"}).status_code == 422
    assert client.post("/plans", json={**body, "siteId": "elsewhere"}).status_code == 422
    assert client.post("/plans", content=b"x" * (main.MAX_PLAN_BYTES + 1), headers={"Content-Type": "application/json"}).status_code == 413


def test_plan_rate_limit(client, monkeypatch):
    monkeypatch.setattr(main, "PLAN_RATE", 3)
    body = {"siteHash": "h", "siteId": "gale-boxwork"}
    codes = [client.post("/plans", json=body).status_code for _ in range(4)]
    assert codes == [201, 201, 201, 429]


def test_donki_live_then_cached_then_stale(client, monkeypatch):
    calls = []
    def ok(url):
        calls.append(url)
        return [{"flrID": "2026-11-14T10:00:00-FLR-001", "classType": "M2.1", "peakTime": "2026-11-14T10:05Z"}]
    d = main.db()
    r1 = feeds.donki(d, "FLR", date(2026, 11, 8), date(2026, 11, 15), fetch=ok)
    assert r1["badge"] == "LIVE" and not r1["cached"] and len(r1["events"]) == 1
    r2 = feeds.donki(d, "FLR", date(2026, 11, 8), date(2026, 11, 15), fetch=ok)
    assert r2["cached"] and len(calls) == 1  # served from the cache, no second upstream call
    monkeypatch.setattr(feeds, "DONKI_TTL", feeds.timedelta(seconds=0))
    def down(url):
        raise TimeoutError("upstream down")
    r3 = feeds.donki(d, "FLR", date(2026, 11, 8), date(2026, 11, 15), fetch=down)
    assert r3["badge"] == "STALE" and len(r3["events"]) == 1 and r3["errors"]


def test_donki_unavailable_without_cache(client):
    def down(url):
        raise ConnectionError("no route")
    r = feeds.donki(main.db(), "SEP", date(2026, 1, 1), date(2026, 1, 7), fetch=down)
    assert r["badge"] == "UNAVAILABLE" and r["events"] == []


def test_api_key_never_leaks(client, monkeypatch):
    monkeypatch.setenv("NASA_API_KEY", "SECRETKEY123")
    seen = {}
    def fetch(url, headers=None):
        if "kauai" in url:
            raise ConnectionError("ccmc down")
        seen["headers"] = headers
        assert "SECRETKEY123" not in url
        return []
    r = feeds.donki(main.db(), "CME", date(2026, 2, 1), date(2026, 2, 7), fetch=fetch)
    assert r["badge"] == "LIVE" and "SECRETKEY123" not in str(r)
    assert seen["headers"] == {"X-Api-Key": "SECRETKEY123"}


def test_spaceweather_endpoint_window(client):
    assert client.get("/spaceweather", params={"kind": "FLR", "start": "2026-01-01", "end": "2026-12-31"}).status_code == 422
    assert client.get("/spaceweather", params={"kind": "XYZ"}).status_code == 422


def test_rover_images(client):
    imgs = client.get("/rover-images", params={"site": "gale-boxwork"}).json()
    assert imgs and imgs[0]["image"].startswith("/bundle/gale-boxwork/")
    assert client.get(imgs[0]["image"]).status_code == 200
