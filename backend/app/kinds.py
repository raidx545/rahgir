"""Category semantics that work for BOTH POI vocabularies.

OpenTripMap uses `kinds` (e.g. "historic,architecture"); Google Places uses
`types` (e.g. "hindu_temple,tourist_attraction"). Both are stored in
Place.kinds as a comma-joined string, and every consumer goes through here so
the ranking/labelling logic is provider-agnostic.
"""
from __future__ import annotations

# theme -> tokens that count as a match (OTM kinds ∪ Google types)
THEME_TOKENS: dict[str, tuple[str, ...]] = {
    "foodie": (
        # OTM
        "foods", "restaurants", "marketplaces", "cafes",
        # Google
        "restaurant", "cafe", "bakery", "meal_takeaway", "food",
        "market", "supermarket",
    ),
    "heritage": (
        "historic", "architecture", "monuments", "fortifications",
        "museums", "cultural",
        "tourist_attraction", "historical_landmark", "museum", "art_gallery",
        "monument",
    ),
    "nature": (
        "natural", "gardens", "beaches", "geological", "view_points",
        "park", "national_park", "hiking_area", "garden", "zoo",
    ),
    "religious": (
        "religion", "temples", "churches", "mosques",
        "hindu_temple", "church", "mosque", "synagogue", "place_of_worship",
    ),
    "balanced": (),
}

_FOOD = (
    "foods", "restaurants", "marketplaces",
    "restaurant", "cafe", "bakery", "meal_takeaway", "food", "market",
)
_OUTDOOR = (
    "natural", "view_points", "gardens",
    "park", "national_park", "garden", "hiking_area",
)

# token -> short human label (first match wins, order matters)
_LABELS: tuple[tuple[str, str], ...] = (
    ("restaurant", "Food"), ("cafe", "Food"), ("bakery", "Food"),
    ("meal_takeaway", "Food"), ("foods", "Food"),
    ("market", "Market"), ("supermarket", "Market"), ("marketplaces", "Market"),
    ("hindu_temple", "Spiritual"), ("church", "Spiritual"),
    ("mosque", "Spiritual"), ("synagogue", "Spiritual"),
    ("place_of_worship", "Spiritual"), ("religion", "Spiritual"),
    ("museum", "Museum"), ("art_gallery", "Museum"), ("museums", "Museum"),
    ("historical_landmark", "Heritage"), ("historic", "Heritage"),
    ("fortifications", "Fort"), ("monument", "Monument"),
    ("architecture", "Architecture"), ("cultural", "Cultural"),
    ("national_park", "Nature"), ("park", "Nature"), ("garden", "Nature"),
    ("hiking_area", "Nature"), ("zoo", "Nature"), ("natural", "Nature"),
    ("tourist_attraction", "Attraction"),
)


def _tokens(kinds: str) -> list[str]:
    return [k.strip() for k in (kinds or "").split(",") if k.strip()]


def theme_match(kinds: str, theme: str) -> float:
    wanted = THEME_TOKENS.get(theme, ())
    if not wanted:
        return 0.5  # balanced: neutral
    toks = _tokens(kinds)
    return 1.0 if any(t in wanted for t in toks) else 0.0


def themes_match(kinds: str, themes: list[str]) -> float:
    """Best match across several selected themes."""
    if not themes:
        return 0.5
    return max(theme_match(kinds, t) for t in themes)


def google_types_for(themes: list[str]) -> list[str]:
    """Google Nearby Search includedTypes covering the selected themes.

    Only returns valid Table-A types (see GOOGLE_THEME_TYPES). Empty result ⇒
    caller should fall back to a broad default set.
    """
    out: list[str] = []
    seen: set[str] = set()
    for t in themes:
        for typ in GOOGLE_THEME_TYPES.get(t, ()):
            if typ not in seen:
                seen.add(typ)
                out.append(typ)
    return out


# Google Places (New) "Table A" includedTypes per theme (validated subset).
GOOGLE_THEME_TYPES: dict[str, tuple[str, ...]] = {
    "foodie": ("restaurant", "cafe", "bakery", "market"),
    "heritage": ("tourist_attraction", "historical_landmark", "museum", "art_gallery"),
    "nature": ("park", "national_park", "hiking_area"),
    "religious": ("hindu_temple", "church", "mosque"),
    "balanced": (),  # ⇒ broad default
}


def is_food(kinds: str) -> bool:
    return any(t in _FOOD for t in _tokens(kinds))


def is_outdoor(kinds: str) -> bool:
    return any(t in _OUTDOOR for t in _tokens(kinds))


def pretty_kind(kinds: str) -> str:
    toks = _tokens(kinds)
    for token, label in _LABELS:
        if token in toks:
            return label
    return toks[0].replace("_", " ").title() if toks else "Place"
