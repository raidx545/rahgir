"""Async cache with a Redis backend and an in-process fallback.

Production (many users): set REDIS_URL — cache is shared across all workers and
survives restarts, so repeated routes/geocodes/LLM narrations are instant and
external APIs are hit far less (protects free-tier quotas too).

Dev (no Redis): falls back to an in-process TTL dict automatically. Same API,
no config needed. If Redis is configured but unreachable, we log once and
degrade to memory rather than failing requests.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, Awaitable, Callable, Optional

from .config import settings

log = logging.getLogger("rahgir.cache")


class _MemoryTTL:
    """Tiny in-process TTL store (per-worker; fine for dev / single process)."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[float, str]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires, val = item
            if expires and expires < time.time():
                self._data.pop(key, None)
                return None
            return val

    async def set(self, key: str, val: str, ttl: int) -> None:
        async with self._lock:
            self._data[key] = (time.time() + ttl if ttl else 0, val)


class Cache:
    def __init__(self) -> None:
        self._redis = None
        self._mem = _MemoryTTL()
        self._backend = "memory"
        self._counts: dict[str, int] = {}  # in-memory daily quota counters

    async def connect(self) -> None:
        if not settings.redis_url:
            log.info("No REDIS_URL set — using in-process cache (dev mode).")
            return
        try:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(
                settings.redis_url, encoding="utf-8", decode_responses=True
            )
            await self._redis.ping()
            self._backend = "redis"
            log.info("Cache backend: Redis (%s).", settings.redis_url)
        except Exception as e:  # noqa: BLE001 — degrade gracefully
            log.warning("Redis unavailable (%s) — falling back to in-process cache.", e)
            self._redis = None

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    @property
    def backend(self) -> str:
        return self._backend if self._redis is not None else "memory"

    async def get(self, key: str) -> Optional[str]:
        if self._redis is not None:
            try:
                return await self._redis.get(key)
            except Exception as e:  # noqa: BLE001
                log.warning("Redis GET failed (%s) — using memory.", e)
        return await self._mem.get(key)

    async def set(self, key: str, val: str, ttl: int) -> None:
        if self._redis is not None:
            try:
                await self._redis.set(key, val, ex=ttl)
                return
            except Exception as e:  # noqa: BLE001
                log.warning("Redis SET failed (%s) — using memory.", e)
        await self._mem.set(key, val, ttl)

    async def get_json(self, key: str) -> Optional[Any]:
        raw = await self.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def set_json(self, key: str, value: Any, ttl: int) -> None:
        await self.set(key, json.dumps(value, default=str), ttl)

    async def incr_daily(self, name: str, cap: int) -> bool:
        """Increment a per-day counter; return False once it exceeds `cap`.

        Used as a spend guardrail for paid APIs. cap<=0 disables the limit.
        Shared across workers via Redis; per-process in the memory fallback.
        """
        if cap <= 0:
            return True
        import datetime

        key = f"rahgir:quota:{name}:{datetime.date.today().isoformat()}"
        if self._redis is not None:
            try:
                n = await self._redis.incr(key)
                if n == 1:
                    await self._redis.expire(key, 172800)  # 2 days
                return n <= cap
            except Exception as e:  # noqa: BLE001
                log.warning("Redis incr failed (%s) — using memory counter.", e)
        n = self._counts.get(key, 0) + 1
        self._counts = {k: v for k, v in self._counts.items() if k.endswith(datetime.date.today().isoformat())}
        self._counts[key] = n
        return n <= cap

    async def cached_json(
        self, key: str, ttl: int, producer: Callable[[], Awaitable[Any]]
    ) -> Any:
        """Return cached JSON for `key`, or run `producer()`, cache, and return it."""
        hit = await self.get_json(key)
        if hit is not None:
            return hit
        value = await producer()
        await self.set_json(key, value, ttl)
        return value


def make_key(*parts: Any) -> str:
    """Deterministic short key from arbitrary parts."""
    raw = "|".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]
    return f"rahgir:{digest}"


cache = Cache()
