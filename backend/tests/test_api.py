"""Backend tests (CI runs pytest). Shapes follow contracts/api_contract.yaml.
"""
import os
import tempfile
from datetime import datetime, timezone

os.environ["FIXTURE_MODE"] = "1"
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

SITE = "gale-boxwork"


def client():
    return TestClient(main.app)


def test_health_and_sites():
    with client() as c:
        h = c.get("/health").json()
        assert h["status"] == "ok" and "version" in h
        sites = c.get("/sites").json()
        assert {s["siteId"] for s in sites} == {SITE, "jezero"}
        assert all({"siteId", "name", "manifestUrl"} <= set(s) for s in sites)


def test_manifest_matches_example_shape():
    with client() as c:
        m = c.get(f"/sites/{SITE}/manifest").json()
        for key in ("siteId", "name", "body", "version", "siteHash", "crs", "grid", "elevation", "files", "layers",
                    "patches", "splats", "havens", "targets", "povImages", "route"):
            assert key in m, key
        assert len(m["layers"]) == 7 and m["layers"][0]["id"] == "dem"
        assert c.get("/sites/nope/manifest").status_code == 404


def test_targets_and_datasets():
    with client() as c:
        fc = c.get(f"/sites/{SITE}/targets").json()
        assert fc["type"] == "FeatureCollection" and fc["features"]
        ds = c.get("/datasets").json()
        assert len(ds) >= 20
        need = {"id", "name", "mission", "instrument", "productId", "resolutionM", "acquired", "licence", "credit", "url", "tag"}
        assert need <= set(ds[0])
        assert all(d["kind"] == "radiation" for d in c.get("/datasets?kind=radiation").json())
        assert {d["id"] for d in c.get(f"/datasets?site={SITE}").json()} >= {"usgs_gale_dem_1m", "msl_rems"}


def test_conditions_keys():
    with client() as c:
        r = c.get(f"/conditions?site={SITE}&utc=2026-11-15T00:00:00Z").json()
        for key in ("lmst", "ltst", "ls", "sunElevDeg", "sunAzDeg", "lightTimeS", "remsBand", "tags"):
            assert key in r, key
        assert 0 <= r["ls"] < 360


def test_spaceweather_fixture_is_cached_and_offline():
    with client() as c:
        r = c.get("/spaceweather?kind=SEP").json()
        assert r["cached"] is True and r["events"] == [] and "fetchedAt" in r
        assert r["scenario"]["rad_dose_microgray"] == 8100


def test_rover_images_is_a_list_with_status_header():
    with client() as c:
        r = c.get(f"/rover-images?site={SITE}&near=0,0&radius=50")
        assert r.json() == [] and r.headers["x-data-status"] == "CACHED"


def test_plans_roundtrip_keeps_everything_sent():
    with client() as c:
        body = {"siteHash": "abc", "seed": 7, "utcStart": "2026-11-15T00:00:00Z", "assumptions": {"reserveM": 0.25},
                "crew": [{"id": "A"}, {"id": "B"}], "plans": [{"id": "p1"}], "activePlanId": "p1"}
        r = c.post("/plans", json=body)
        assert r.status_code == 201
        sid = r.json()["shareId"]
        got = c.get(f"/plans/{sid}").json()
        assert got["assumptions"]["reserveM"] == 0.25 and got["plans"][0]["id"] == "p1" and got["shareId"] == sid
        assert c.get("/plans/missing").status_code == 404


def test_jobs():
    with client() as c:
        ok = dict(name="t", bbox=[77.5, 18.4, 77.52, 18.42], dem_url="https://x/y.tif")
        r = c.post("/jobs/generate-site", json=ok)
        assert r.status_code == 202
        jid = r.json()["jobId"]
        assert c.get(f"/jobs/{jid}").json()["status"] == "queued"
        assert c.post("/jobs/generate-site", json=dict(ok, bbox=[77.0, 18.0, 78.0, 19.0])).status_code == 422
        assert c.post("/jobs/generate-site", json=dict(ok, levels=["L1"])).status_code == 422
        assert c.get("/jobs/999").status_code == 404


def test_trek_layers_is_a_list():
    with client() as c:
        r = c.get(f"/trek/layers?site={SITE}").json()
        assert isinstance(r, list) and {"name", "wmtsUrl", "attribution"} <= set(r[0])


def test_mars24_loose_check():
    # Perseverance landed 2021-02-18 ~20:55 UTC at Jezero; mission quotes Ls ~5. Loose check only: verify against the Mars24 tool.
    r = main.mars24(datetime(2021, 2, 18, 20, 55, tzinfo=timezone.utc), 18.44, 77.45)
    assert abs(r["ls_deg"] - 5.2) < 1.0


def test_health_reports_database():
    with client() as c:
        h = c.get("/health").json()
        assert h["db"] in ("sqlite", "postgresql") and "postgis" in h


def test_postgres_url_is_normalised():
    assert main.DATABASE_URL.startswith(("sqlite", "postgresql+psycopg2://"))


def test_donki_primary_is_the_new_endpoint():
    assert main.DONKI_BASE_URLS[0] == "https://ccmc.gsfc.nasa.gov/DONKI-API/get"
