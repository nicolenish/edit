"""Fill Collection.image_url with free/legal archive imagery from Wikimedia Commons
(docs/archive-imagery.md Phase 2). Only attaches an image whose own year plausibly
matches the collection's — nothing anachronistic. Idempotent; re-run safely.

    python manage.py resolve_archive_images --brand schiaparelli
    python manage.py resolve_archive_images                 # every house with collections
    python manage.py resolve_archive_images --force         # re-resolve even filled ones

No API key needed. Commons only serves freely-licensed media; each file's exact
licence + attribution is stored on the Collection row.
"""
import time

from django.core.management.base import BaseCommand
from django.db.models import Count

from catalog.archive import assign_to_collections, search_house_images
from catalog.models import Brand, Collection


class Command(BaseCommand):
    help = "Resolve free archive imagery for collections (Wikimedia Commons)."

    def add_arguments(self, parser):
        parser.add_argument("--brand", type=str, default=None)
        parser.add_argument("--limit", type=int, default=None, help="max houses to process")
        parser.add_argument("--force", action="store_true", help="re-resolve collections that already have an image")

    def handle(self, *args, **opts):
        brands = (
            Brand.objects.annotate(n=Count("collections")).filter(n__gt=0).order_by("name")
        )
        if opts["brand"]:
            brands = brands.filter(key=opts["brand"])
        brands = list(brands)
        if opts["limit"]:
            brands = brands[: opts["limit"]]

        if not brands:
            self.stdout.write(self.style.WARNING("No houses with collections. Run enrich_collections first."))
            return

        self.stdout.write(f"Resolving archive imagery for {len(brands)} house(s) from Wikimedia Commons…")
        houses = filled_total = 0

        for i, b in enumerate(brands, 1):
            cols = list(b.collections.all().order_by("order"))
            targets = cols if opts["force"] else [c for c in cols if not c.image_url]
            if not targets:
                continue
            # Search by the FOUNDER-era couturier, never the current CD: "Chanel Matthieu
            # Blazy" buries the period archive, but "Chanel Gabrielle Chanel" surfaces it —
            # and the founder's name disambiguates homonyms (Balmain the house vs the suburb).
            lore = getattr(b, "lore", None)
            founder = b.founder or (lore.directors[0].get("name", "") if lore and lore.directors else "")
            try:
                pool = search_house_images(b.name, designer=founder, founded=b.founded)
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"  [{i}/{len(brands)}] {b.name} — {type(e).__name__}: {e}"))
                continue

            filled = assign_to_collections(targets, pool)
            houses += 1
            filled_total += filled
            note = f"{filled}/{len(targets)} tiles from {len(pool)} candidates"
            self.stdout.write(f"  [{i}/{len(brands)}] {b.name[:30]:30} {note}")
            time.sleep(0.4)  # be polite to the Commons API

        self.stdout.write(self.style.SUCCESS(f"Filled {filled_total} collection tiles across {houses} house(s)."))
