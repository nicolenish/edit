"""Fill Brand.hero_image_url (the modal's main picture) with a free/legal image from
Wikimedia Commons for houses that have none. Reuses the archive image search, but takes
the single best representative image of any era — preferring public-domain / CC0 so the
hero carries no attribution debt.

    python manage.py resolve_house_images            # all houses missing a hero
    python manage.py resolve_house_images --limit 8  # try a handful first
    python manage.py resolve_house_images --force     # re-resolve everyone

No API key needed. Search is anchored on the founder-era couturier (not the current CD),
which surfaces recognisable garments and disambiguates homonyms.
"""
import time

from django.core.management.base import BaseCommand

from catalog.archive import search_house_images
from catalog.models import Brand


def _pd_first(pool):
    """Prefer a public-domain / CC0 image (no attribution needed), else the top-scored."""
    pool.sort(key=lambda d: (
        0 if ("public domain" in (d["license"] or "").lower() or "cc0" in (d["license"] or "").lower()) else 1,
        -d["score"],
    ))
    return pool[0] if pool else None


class Command(BaseCommand):
    help = "Resolve a free hero image per house from Wikimedia Commons."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--brand", type=str, default=None)
        parser.add_argument("--force", action="store_true", help="re-resolve houses that already have a hero")

    def handle(self, *args, **opts):
        houses = Brand.objects.all().order_by("name")
        if opts["brand"]:
            houses = houses.filter(key=opts["brand"])
        elif not opts["force"]:
            houses = houses.filter(hero_image_url="")
        houses = list(houses)
        if opts["limit"]:
            houses = houses[: opts["limit"]]

        if not houses:
            self.stdout.write(self.style.WARNING("Every house already has a hero image."))
            return

        self.stdout.write(f"Resolving hero images for {len(houses)} house(s) from Wikimedia Commons…")
        filled = 0
        for i, b in enumerate(houses, 1):
            lore = getattr(b, "lore", None)
            founder = b.founder or (lore.directors[0].get("name", "") if lore and lore.directors else "")
            try:
                pool = search_house_images(b.name, designer=founder)
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"  [{i}/{len(houses)}] {b.name} — {type(e).__name__}: {e}"))
                continue
            top = _pd_first(pool)
            if not top:
                self.stdout.write(f"  [{i}/{len(houses)}] {b.name[:28]:28} — no match")
                continue
            b.hero_image_url = top["url"]
            b.save(update_fields=["hero_image_url"])
            filled += 1
            self.stdout.write(f"  [{i}/{len(houses)}] {b.name[:28]:28} [{top['license'][:12]}] {top['title'][:34]}")
            time.sleep(0.4)  # be polite to the Commons API

        self.stdout.write(self.style.SUCCESS(f"Filled {filled} hero image(s) of {len(houses)} house(s)."))
