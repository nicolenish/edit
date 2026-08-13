"""Backfill signature Collections per creative director — the archive-imagery text
layer (docs/archive-imagery.md Phase 1). Additive: reads each house's already-derived
directors and names their signature collections. Idempotent per house.

    python manage.py enrich_collections --brand schiaparelli
    python manage.py enrich_collections                # all houses with directors
    python manage.py enrich_collections --force        # re-derive everything

Needs ANTHROPIC_API_KEY. Only houses that have director lore produce collections.
"""
import os

import anthropic
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.enrich import HOUSE_MODEL_ID, enrich_collections
from catalog.models import Brand, Collection, HouseLore


class Command(BaseCommand):
    help = "Derive each director's signature collections (Claude)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--brand", type=str, default=None)
        parser.add_argument("--force", action="store_true", help="re-derive houses that already have collections")

    def handle(self, *args, **opts):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise CommandError("ANTHROPIC_API_KEY is not set.")

        lores = HouseLore.objects.select_related("brand").exclude(directors=[])
        if opts["brand"]:
            lores = lores.filter(brand__key=opts["brand"])
        if not opts["force"]:
            done_ids = set(Collection.objects.values_list("brand_id", flat=True))
            lores = [lo for lo in lores if lo.brand_id not in done_ids]
        else:
            lores = list(lores)
        if opts["limit"]:
            lores = lores[: opts["limit"]]

        total = len(lores)
        if not total:
            self.stdout.write(self.style.WARNING("Nothing to enrich (all done, or no directors)."))
            return

        self.stdout.write(f"Deriving collections for {total} house(s) on {HOUSE_MODEL_ID}…")
        client = anthropic.Anthropic(timeout=120.0, max_retries=1)
        done = failed = 0

        for i, lore in enumerate(lores, 1):
            brand = lore.brand
            try:
                cols = enrich_collections(brand, lore.directors, client=client)
            except Exception as e:
                failed += 1
                self.stderr.write(self.style.ERROR(f"  [{i}/{total}] {brand.name} — {type(e).__name__}: {e}"))
                continue

            with transaction.atomic():
                brand.collections.all().delete()
                for order, c in enumerate(cols):
                    Collection.objects.create(
                        brand=brand, director_name=c["director"], season=c["season"], year=c["year"],
                        title=c["title"], why=c["why"], order=order, model_id=HOUSE_MODEL_ID,
                    )
            done += 1
            self.stdout.write(f"  [{i}/{total}] {brand.name[:32]:32} {len(cols)} collections")

        style = self.style.SUCCESS if not failed else self.style.WARNING
        self.stdout.write(style(f"Enriched {done}, failed {failed}, of {total}."))
