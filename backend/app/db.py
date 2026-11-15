"""Storage: PostgreSQL in production (DATABASE_URL=postgresql://...), SQLite for local runs and tests.
Two tables: saved missions (plans) and a cache for upstream feeds (DONKI, REMS)."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

SCHEMA_PG = """
CREATE TABLE IF NOT EXISTS plans (
  share_id   TEXT PRIMARY KEY,
  site_id    TEXT,
  site_hash  TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'plan',
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plans_site_idx ON plans (site_id, created_at DESC);
CREATE TABLE IF NOT EXISTS feed_cache (
  key        TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  source     TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
"""

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS plans (
  share_id TEXT PRIMARY KEY, site_id TEXT, site_hash TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'plan',
  payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feed_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL);
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Database:
    def __init__(self, url: str | None = None):
        self.url = url or os.environ.get("DATABASE_URL") or "sqlite:///beacon.db"
        self.kind = "postgresql" if self.url.startswith(("postgres://", "postgresql://")) else "sqlite"
        self._lock = threading.Lock()
        self._pool = None
        if self.kind == "postgresql":
            from psycopg_pool import ConnectionPool  # type: ignore

            url = self.url.replace("postgres://", "postgresql://", 1)
            self._pool = ConnectionPool(url, min_size=1, max_size=int(os.environ.get("DB_POOL_MAX", "5")), open=True,
                                        kwargs={"autocommit": True})
        else:
            path = self.url.removeprefix("sqlite:///") or ":memory:"
            self._sqlite = sqlite3.connect(path, check_same_thread=False)
        self._init()

    @contextmanager
    def _cur(self) -> Iterator[Any]:
        if self._pool is not None:
            with self._pool.connection() as conn, conn.cursor() as cur:
                yield cur
        else:
            with self._lock:
                cur = self._sqlite.cursor()
                try:
                    yield cur
                    self._sqlite.commit()
                finally:
                    cur.close()

    def _q(self, sql: str) -> str:
        return sql if self.kind == "postgresql" else sql.replace("%s", "?")

    def _init(self) -> None:
        with self._cur() as cur:
            if self.kind == "postgresql":
                cur.execute(SCHEMA_PG)
            else:
                cur.executescript(SCHEMA_SQLITE)

    def ping(self) -> bool:
        try:
            with self._cur() as cur:
                cur.execute("SELECT 1")
                return cur.fetchone()[0] == 1
        except Exception:
            return False

    # Plans -------------------------------------------------------------------------------------
    def save_plan(self, share_id: str, payload: dict) -> datetime:
        created = _now()
        with self._cur() as cur:
            cur.execute(self._q("INSERT INTO plans (share_id, site_id, site_hash, kind, payload, created_at) VALUES (%s,%s,%s,%s,%s,%s)"),
                        (share_id, payload.get("siteId"), payload["siteHash"], payload.get("kind") or "plan",
                         json.dumps(payload), created if self.kind == "postgresql" else created.isoformat()))
        return created

    def get_plan(self, share_id: str) -> dict | None:
        with self._cur() as cur:
            cur.execute(self._q("SELECT payload, created_at FROM plans WHERE share_id = %s"), (share_id,))
            row = cur.fetchone()
        if not row:
            return None
        payload = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        created = row[1] if isinstance(row[1], datetime) else datetime.fromisoformat(row[1])
        return {**payload, "shareId": share_id, "createdAt": created.isoformat()}

    def count_plans(self) -> int:
        with self._cur() as cur:
            cur.execute("SELECT count(*) FROM plans")
            return int(cur.fetchone()[0])

    # Feed cache --------------------------------------------------------------------------------
    def cache_put(self, key: str, payload: Any, source: str) -> datetime:
        at = _now()
        with self._cur() as cur:
            cur.execute(self._q(
                "INSERT INTO feed_cache (key, payload, source, fetched_at) VALUES (%s,%s,%s,%s) "
                "ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at"),
                (key, json.dumps(payload), source, at if self.kind == "postgresql" else at.isoformat()))
        return at

    def cache_get(self, key: str) -> tuple[Any, str, datetime] | None:
        with self._cur() as cur:
            cur.execute(self._q("SELECT payload, source, fetched_at FROM feed_cache WHERE key = %s"), (key,))
            row = cur.fetchone()
        if not row:
            return None
        payload = row[0] if not isinstance(row[0], str) else json.loads(row[0])
        at = row[2] if isinstance(row[2], datetime) else datetime.fromisoformat(row[2])
        return payload, row[1], at
