"""Occasion + tier categorization — the productionized version of the prototype's
`pull.py` heuristics. Brand-level overrides win over keyword matching."""

# brand-key overrides (match the prototype's ATHLEISURE / JEWELRY sets)
ATHLEISURE_KEYS = {"hermanoskoumori", "bandit", "currentlyrunning"}
JEWELRY_KEYS = {"beabongiasca", "eliou__", "mariemas"}

_EVENTS = [
    "gown", "maxi", "full length", "full-length", "tuxedo", "wedding", "bridal",
    "floor length", "floor-length", "cape", "caftan", "kaftan", "ball gown",
    "blazer", "suit", "tailored", "tailoring", "sequin", "embellished", "crystal", "feather",
]
_DATENIGHT = [
    "mini dress", "midi dress", "slip dress", "corset", "bustier", "cocktail",
    "halter", "backless", "cut-out", "cutout", "strapless", "satin", "going out",
]
_NOT_DATE_DRESS = ["shirt dress", "shirtdress", "knit dress", "sweater dress", "t-shirt dress"]


def occasion_for(brand_key, title, product_type="", tags=None):
    if brand_key in ATHLEISURE_KEYS:
        return "athleisure"
    if brand_key in JEWELRY_KEYS:
        return "jewelry"
    parts = [title or "", product_type or ""] + [t for t in (tags or []) if isinstance(t, str)]
    s = " ".join(parts).lower()
    if any(k in s for k in _EVENTS):
        return "events"
    if any(k in s for k in _DATENIGHT):
        return "datenight"
    if "dress" in s and not any(k in s for k in _NOT_DATE_DRESS):
        return "datenight"
    return "casual"


def tier_for(price):
    try:
        p = float(price)
    except (TypeError, ValueError):
        p = 0.0
    if p >= 800:
        return "luxury"
    if p >= 300:
        return "premium"
    return "contemporary"
