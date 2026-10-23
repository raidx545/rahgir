"""Pure-python geometry helpers: distances, polyline sampling, ETA."""
from __future__ import annotations

import math
from datetime import datetime, timedelta

EARTH_R_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    to_r = math.radians
    d_lat = to_r(lat2 - lat1)
    d_lon = to_r(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_r(lat1)) * math.cos(to_r(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return EARTH_R_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def cumulative_distances(polyline: list[tuple[float, float]]) -> list[float]:
    """Return running distance-from-start (km) for each vertex."""
    cum = [0.0]
    for (la1, lo1), (la2, lo2) in zip(polyline, polyline[1:]):
        cum.append(cum[-1] + haversine_km(la1, lo1, la2, lo2))
    return cum


def sample_polyline(
    polyline: list[tuple[float, float]], step_km: float
) -> list[tuple[tuple[float, float], float]]:
    """Sample the polyline every ~step_km.

    Returns [((lat, lon), dist_from_start_km), ...], always including
    the first and last vertices.
    """
    if not polyline:
        return []
    cum = cumulative_distances(polyline)
    total = cum[-1]
    if total == 0:
        return [(polyline[0], 0.0)]

    targets = [0.0]
    d = step_km
    while d < total:
        targets.append(d)
        d += step_km
    targets.append(total)

    samples: list[tuple[tuple[float, float], float]] = []
    j = 0
    for t in targets:
        while j < len(cum) - 1 and cum[j + 1] < t:
            j += 1
        # linear interpolation between vertex j and j+1
        if j >= len(polyline) - 1:
            samples.append((polyline[-1], total))
            continue
        seg = cum[j + 1] - cum[j]
        frac = 0.0 if seg == 0 else (t - cum[j]) / seg
        (la1, lo1), (la2, lo2) = polyline[j], polyline[j + 1]
        lat = la1 + (la2 - la1) * frac
        lon = lo1 + (lo2 - lo1) * frac
        samples.append(((lat, lon), t))
    return samples


def min_dist_to_polyline_km(
    lat: float, lon: float, polyline: list[tuple[float, float]]
) -> float:
    """Approximate shortest distance from a point to the route (vertex-based)."""
    return min(haversine_km(lat, lon, pla, plo) for pla, plo in polyline)


def eta_at(departure: datetime, total_duration_min: float, dist_km: float, total_km: float) -> datetime:
    """Linear ETA: assume constant average speed along the route."""
    if total_km <= 0:
        return departure
    frac = max(0.0, min(1.0, dist_km / total_km))
    return departure + timedelta(minutes=total_duration_min * frac)
