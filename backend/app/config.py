"""Runtime configuration, loaded from environment / .env."""
from __future__ import annotations

import re

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- external API keys (BYO) ---
    ors_api_key: str = ""
    otm_api_key: str = ""
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.0-flash-001"

    # POI provider: "otm" (free, default) or "google" (Places API, paid, richer)
    poi_provider: str = "otm"
    google_places_api_key: str = ""
    poi_photos: bool = True  # fetch photo refs (Google only) for the top stops
    google_daily_cap: int = 5000  # max Google API calls/day (0 = unlimited)

    # --- pipeline tuning ---
    sample_km: float = 25.0
    poi_radius_m: int = 8000
    poi_min_rate: int = 2
    poi_per_waypoint: int = 10
    max_ranked: int = 12

    # --- caching (Redis for production; in-process fallback if empty) ---
    redis_url: str = ""
    ttl_geocode_s: int = 60 * 60 * 24 * 30  # town coords never move
    ttl_route_s: int = 60 * 60 * 24 * 7  # roads change rarely
    ttl_pois_s: int = 60 * 60 * 24 * 7
    ttl_narration_s: int = 60 * 60 * 24 * 7  # LLM "famous for" is stable
    ttl_trip_s: int = 60 * 60 * 24  # full trip result

    # --- safety ---
    cors_origins: str = "*"  # comma-separated list in production
    rate_limit_trip: str = "20/minute"  # per-IP budget for POST /trip
    rate_limit_default: str = "120/minute"

    # --- misc ---
    request_timeout_s: float = 30.0

    # A `.env` line like `REDIS_URL=   # comment` leaves an empty value, and the
    # loader can capture the comment as the value. Strip inline `#` comments
    # defensively so a copied-template .env never breaks startup.
    @field_validator(
        "ors_api_key", "otm_api_key", "openrouter_api_key", "openrouter_model",
        "poi_provider", "google_places_api_key", "redis_url", "cors_origins",
        "rate_limit_trip", "rate_limit_default",
        mode="before",
    )
    @classmethod
    def _strip_inline_comment(cls, v):
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("#"):
                return ""
            return re.split(r"\s+#", s, maxsplit=1)[0].strip()
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def require(self, *names: str) -> None:
        """Raise a clear error if any required key is unset."""
        missing = [n for n in names if not getattr(self, n)]
        if missing:
            raise RuntimeError(
                "Missing required config: "
                + ", ".join(m.upper() for m in missing)
                + ". Set them in backend/.env (see .env.example)."
            )


settings = Settings()
