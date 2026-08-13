import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.dateparse import parse_datetime

from catalog.models import Brand, Product, Look


class Command(BaseCommand):
    help = "Seed brands, products and editorial houses from seed/seed.json (the curated prototype data)."

    @transaction.atomic
    def handle(self, *args, **options):
        path = Path(settings.BASE_DIR) / "seed" / "seed.json"
        data = json.loads(path.read_text())

        b_count = p_count = e_count = look_count = 0

        for b in data["brands"]:
            Brand.objects.update_or_create(
                key=b["key"],
                defaults=dict(
                    name=b["name"], kind="shoppable", domain=b.get("domain", ""),
                    url=b.get("url", ""), hero_image_url=b.get("hero_image_url", ""),
                    tier=b.get("tier", ""), founder=b.get("founder", ""),
                    founded=b.get("founded", ""), city=b.get("city", ""),
                    story=b.get("story", ""), source=b.get("source", "shopify"),
                ),
            )
            b_count += 1

        for e in data["editorial"]:
            looks = e.get("looks", [])
            hero = next((u for u in looks if u), "")
            brand, _ = Brand.objects.update_or_create(
                key=e["key"],
                defaults=dict(
                    name=e["name"], kind="editorial", designer=e.get("designer", ""),
                    city=e.get("city", ""), founded=e.get("founded", ""),
                    story=e.get("story", ""), tier=e.get("tier", "luxury"),
                    season=e.get("season", ""), source=e.get("source", "blocked"),
                    hero_image_url=hero,
                ),
            )
            brand.looks.all().delete()
            for i, url in enumerate(looks):
                Look.objects.create(brand=brand, index=i, image_url=url or "", season=e.get("season", ""))
                look_count += 1
            e_count += 1

        brands_by_key = {b.key: b for b in Brand.objects.all()}
        for p in data["products"]:
            brand = brands_by_key.get(p["brand_key"])
            if not brand:
                continue
            Product.objects.update_or_create(
                brand=brand, external_id=p["external_id"],
                defaults=dict(
                    title=p["title"][:300], color=p.get("color", ""),
                    price=p.get("price", 0), price_display=p.get("price_display", ""),
                    occasion=p.get("occasion", "casual"), tier=p.get("tier", ""),
                    image_url=p.get("image_url", ""), image2_url=p.get("image2_url", ""),
                    url=p.get("url", ""), available=p.get("available", True),
                    published_at=parse_datetime(p["published_at"]) if p.get("published_at") else None,
                ),
            )
            p_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {b_count} shoppable brands, {p_count} products, "
            f"{e_count} editorial houses ({look_count} looks)."
        ))
