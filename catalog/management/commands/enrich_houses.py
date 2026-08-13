"""Backfill HouseLore — the "long view" depth for houses (codes, essence, real
history). Idempotent; records model_id + enriched_at. See docs/taste-graph.md.

    python manage.py enrich_houses --limit 3       # try a few
    python manage.py enrich_houses                 # all houses missing lore
    python manage.py enrich_houses --brand schiaparelli
    python manage.py enrich_houses --force         # re-enrich everything

Needs ANTHROPIC_API_KEY. Uses a capable model (accuracy of real house history
matters), so this is slower than the piece pass — ~15s per house.
"""
import os
import time

import anthropic
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from catalog.enrich import HOUSE_MODEL_ID, enrich_house
from catalog.models import Brand, HouseLore


class Command(BaseCommand):
    help = "Enrich houses with codes, essence and real history (Claude)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--brand", type=str, default=None, help="only this brand key")
        parser.add_argument("--force", action="store_true", help="re-enrich already-enriched houses")
        parser.add_argument("--sleep", type=float, default=0.0)

    def handle(self, *args, **opts):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise CommandError("ANTHROPIC_API_KEY is not set. Add it to .env or export it.")

        qs = Brand.objects.all()
        if opts["brand"]:
            qs = qs.filter(key=opts["brand"])
        if not opts["force"]:
            qs = qs.filter(lore__isnull=True)
        qs = qs.order_by("name")
        if opts["limit"]:
            qs = qs[: opts["limit"]]

        houses = list(qs)
        total = len(houses)
        if not total:
            self.stdout.write(self.style.WARNING("Nothing to enrich (all done, or no matches)."))
            return

        self.stdout.write(f"Enriching {total} house(s) on {HOUSE_MODEL_ID}…")
        client = anthropic.Anthropic(timeout=120.0, max_retries=1)
        done = failed = 0

        for i, brand in enumerate(houses, 1):
            try:
                lore = enrich_house(brand, client=client)
            except Exception as e:
                failed += 1
                self.stderr.write(self.style.ERROR(f"  [{i}/{total}] {brand.name} — {type(e).__name__}: {e}"))
                continue

            HouseLore.objects.update_or_create(
                brand=brand,
                defaults=dict(
                    codes=lore["codes"], essence=lore["essence"], history=lore["history"],
                    directors=lore["directors"], known=lore["known"],
                    model_id=HOUSE_MODEL_ID, enriched_at=timezone.now(),
                ),
            )
            done += 1
            mark = "✓known" if lore["known"] else "·derived"
            self.stdout.write(f"  [{i}/{total}] {brand.name[:32]:32} {mark:8} {len(lore['codes'])} codes, {len(lore['history'])} milestones, {len(lore['directors'])} directors")
            if opts["sleep"]:
                time.sleep(opts["sleep"])

        style = self.style.SUCCESS if not failed else self.style.WARNING
        self.stdout.write(style(f"Enriched {done}, failed {failed}, of {total}."))
