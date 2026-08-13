"""Shopify ingestion — detect a store, pull its /products.json, categorize, upsert.

This is the productionized version of the prototype's pull.py: the same
`/products.json` trick, made resilient (retries + page-size fallback)."""
import re
import ssl
import json
import statistics
import urllib.request
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Brand, Product
from .categorize import occasion_for, tier_for

_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


class IngestError(Exception):
    pass


def normalize_domain(url_or_domain: str) -> str:
    d = (url_or_domain or "").strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = re.sub(r"^www\.", "", d)
    return d.split("/")[0].strip()


def slugify_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "brand"


def _fetch_products(domain: str):
    """Return the products list, or None if this isn't a reachable Shopify store."""
    for limit in (250, 100, 50):
        for _ in range(3):
            try:
                req = urllib.request.Request(
                    f"https://{domain}/products.json?limit={limit}", headers=_UA
                )
                with urllib.request.urlopen(req, timeout=25, context=_CTX) as resp:
                    if resp.status != 200:
                        continue
                    body = resp.read().decode("utf-8", "ignore")
                if '"products"' not in body:
                    return None
                data = json.loads(body)
                products = data.get("products", [])
                if products:
                    return products
            except Exception:
                continue
    return None


def _money(value):
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError):
        d = Decimal("0")
    return d, "$" + format(int(round(float(d))), ",")


def _color_from_tags(tags):
    for t in tags or []:
        if isinstance(t, str) and t.lower().startswith("colour:"):
            return t.split(":", 1)[1].strip()
    return ""


@transaction.atomic
def ingest_brand(url_or_domain: str, name: str = None, key: str = None) -> Brand:
    """Fetch a Shopify catalog and upsert the Brand + all its Products."""
    domain = normalize_domain(url_or_domain)
    if not domain:
        raise IngestError("Empty URL.")
    products_raw = _fetch_products(domain)
    if products_raw is None:
        raise IngestError(
            f"No Shopify catalog found at {domain}. It may not be a Shopify store, "
            "or its product feed is disabled."
        )

    bkey = key or slugify_key(name or domain.split(".")[0])
    brand, _ = Brand.objects.update_or_create(
        key=bkey,
        defaults=dict(
            name=name or domain.split(".")[0].title(),
            kind="shoppable",
            domain=domain,
            url=f"https://{domain}/",
            source="shopify",
        ),
    )

    prices, first_image, seen = [], "", []
    for p in products_raw:
        images = [i.get("src") for i in p.get("images", []) if i.get("src")]
        if not images:
            continue
        variants = p.get("variants", []) or []
        price, price_display = _money(variants[0]["price"] if variants else 0)
        prices.append(float(price))
        if not first_image:
            first_image = images[0]
        occ = occasion_for(bkey, p.get("title", ""), p.get("product_type", ""), p.get("tags"))
        Product.objects.update_or_create(
            brand=brand,
            external_id=str(p.get("id", "")),
            defaults=dict(
                title=p.get("title", "")[:300],
                handle=p.get("handle", "")[:300],
                url=f"https://{domain}/products/{p.get('handle','')}",
                price=price,
                price_display=price_display,
                color=_color_from_tags(p.get("tags")),
                occasion=occ,
                tier=tier_for(price),
                image_url=images[0],
                image2_url=images[1] if len(images) > 1 else images[0],
                available=any(v.get("available") for v in variants),
                published_at=parse_datetime(p.get("published_at") or p.get("created_at") or "") or None,
            ),
        )
        seen.append(str(p.get("id", "")))

    if not seen:
        raise IngestError(f"{domain} returned a feed but no products had images.")

    # prune products that vanished from the feed
    brand.products.exclude(external_id__in=seen).delete()
    brand.tier = tier_for(statistics.median(prices)) if prices else "contemporary"
    brand.hero_image_url = brand.hero_image_url or first_image
    brand.last_ingested_at = timezone.now()
    brand.save()
    return brand
