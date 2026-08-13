"""Resolve free/legal archive imagery for Collections from Wikimedia Commons.

Decision (docs/archive-imagery.md): free/legal only; museum object photography is
acceptable. The Met's own API turns out barren for 20th-century couture (its Costume
Institute pieces are rights-restricted and image-less), but Wikimedia Commons carries
the same museum object photography re-hosted as CC0 — plus genuinely public-domain and
CC-BY period couture. So Commons is the primary source.

The unit of truth is a *house's* free imagery pool. We never claim a photo IS a given
runway season — we only attach an image to a collection tile when the image's own year
plausibly matches that collection's year (±YEAR_SLOP), so nothing anachronistic shows.
Collections we can't back with a justified image keep their placeholder tile.
"""
import re
import urllib.parse
import urllib.request

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
_UA = "NishiAlmanac/0.1 (personal fashion research; contact https://github.com/nicolenish/edit)"

# Words that make a Commons hit likely to BE a garment/object photo…
_GARMENT = re.compile(
    r"\b(dress|gown|coat|suit|ensemble|jacket|evening|cocktail|robe|skirt|blouse|"
    r"cape|corset|bodice|hat|shoe|shoes|boot|handbag|bag|costume|fashion|couture|"
    r"garment|textile|silk|wool|velvet|embroider)\w*",
    re.I,
)
# …and words that mark it as NOT the fashion (the astronomer, the tomb, ephemera).
_NOISE = re.compile(
    r"\b(tomb|tombe|grave|cemeter|crater|mars|astronom|excavation|theban|"
    r"portrait|patent|signature|autograph|stamp|logo|plaque|building|facade|"
    r"storefront|boutique|exterior|street|map|diagram|book|poster|advertisement)\w*",
    re.I,
)
_YEAR = re.compile(r"\b(1[89]\d{2}|20[0-2]\d)\b")
YEAR_SLOP = 4       # a garment's date may sit this far from the collection's and still "fit"
PERIOD_MAX = 1975   # Commons free fashion imagery is period work; a "year" past this is
                    # almost always an *exhibition* photo of an older piece — an anachronism
                    # trap (a 1938 gown shot at a 2022 show). Modern collections keep placeholders.


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        import json
        return json.load(r)


def _clean(v):
    """extmetadata values are HTML fragments — strip tags/entities to plain text."""
    if not v:
        return ""
    v = re.sub(r"<[^>]+>", " ", v)
    v = re.sub(r"&[a-z]+;", " ", v)
    return re.sub(r"\s+", " ", v).strip()


def search_house_images(house, designer="", founded="", limit=40):
    """Return a scored, cleaned pool of free Commons images for one house.

    Each item: {title, url, page, license, license_url, credit, year, score}.
    Only images with a resolvable thumbnail and a (free) license are returned;
    Commons only serves freely-licensed media, so every hit is legal to use — we
    still record the exact licence + attribution per file.
    """
    terms = house if not designer or designer.lower() in house.lower() else f"{house} {designer}"
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"filetype:bitmap {terms}", "gsrnamespace": "6", "gsrlimit": str(limit),
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": "600",
    })
    data = _get(f"{COMMONS_API}?{q}")
    pages = (data.get("query") or {}).get("pages") or {}
    pool = []
    hkey = re.sub(r"[^a-z]", "", house.lower())
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl")
        if not thumb:
            continue
        em = ii.get("extmetadata") or {}
        license_ = _clean((em.get("LicenseShortName") or {}).get("value"))
        if not license_:
            continue
        title = (p.get("title") or "").replace("File:", "")
        blob = f"{title} {_clean((em.get('ObjectName') or {}).get('value'))} {_clean((em.get('Categories') or {}).get('value'))}"
        if _NOISE.search(blob) and not _GARMENT.search(title):
            continue
        # must actually be about this house — its key should appear in the text
        if hkey and hkey not in re.sub(r"[^a-z]", "", blob.lower()):
            continue
        artist = _clean((em.get("Artist") or {}).get("value"))
        credit = _clean((em.get("Credit") or {}).get("value"))
        ym = _YEAR.search(title) or _YEAR.search(_clean((em.get("DateTimeOriginal") or {}).get("value")))
        score = 0
        score += 3 * len(_GARMENT.findall(blob))
        if "MET" in title or "museum" in credit.lower() or "metropolitan" in credit.lower():
            score += 2  # museum object photography — exactly what was approved
        if ym:
            score += 1
        pool.append({
            "title": title,
            "url": ii.get("url") or thumb,   # full-res original
            "thumb": thumb,
            "page": (ii.get("descriptionshorturl") or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(p.get('title',''))}"),
            "license": license_,
            "credit": (artist or credit or "Wikimedia Commons"),
            "year": int(ym.group(1)) if ym else None,
            "score": score,
        })
    pool.sort(key=lambda d: d["score"], reverse=True)
    return pool


def assign_to_collections(collections, pool):
    """Attach pool images to collection rows without anachronism.

    A collection gets the highest-scoring *unused* image whose year is within
    YEAR_SLOP of the collection's year. Collections with no year, or no era-matching
    image, are left untouched (placeholder stays). Returns the number filled.
    """
    used = set()
    filled = 0
    for col in collections:
        cy = None
        m = _YEAR.search(col.year or "") or _YEAR.search(col.season or "")
        if m:
            cy = int(m.group(1))
        if cy is None:
            continue
        if cy > PERIOD_MAX + YEAR_SLOP:
            continue  # a modern collection — no free runway imagery exists; keep the placeholder
        best = None
        for img in pool:
            if id(img) in used or img["year"] is None or img["year"] > PERIOD_MAX:
                continue
            if abs(img["year"] - cy) <= YEAR_SLOP:
                best = img
                break
        if not best:
            continue
        used.add(id(best))
        col.image_url = best["url"]
        col.source = "wikimedia"
        col.source_url = best["page"]
        col.license = best["license"]
        col.credit = f'{best["credit"]} · {best["license"]} · Wikimedia Commons'[:300]
        col.save(update_fields=["image_url", "source", "source_url", "license", "credit"])
        filled += 1
    return filled
