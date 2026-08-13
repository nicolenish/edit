"""Backfill vision-derived PieceAttribute rows over the catalogue.

Idempotent: skips already-enriched products unless --force. Records model_id +
enriched_at per row for reproducibility. See docs/taste-graph.md §4.

    python manage.py enrich_pieces --limit 5        # try a handful first
    python manage.py enrich_pieces                  # the whole catalogue
    python manage.py enrich_pieces --brand toteme   # one house
    python manage.py enrich_pieces --force          # re-run everything

Needs ANTHROPIC_API_KEY in the environment (or .env).
"""
import os
import time

import anthropic
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from catalog.enrich import MODEL_ID, enrich_product
from catalog.models import PieceAttribute, Product


class Command(BaseCommand):
    help = "Enrich products with category-aware, vision-derived attributes (Claude)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None, help="max products to process")
        parser.add_argument("--brand", type=str, default=None, help="only this brand key")
        parser.add_argument("--force", action="store_true", help="re-enrich already-enriched products")
        parser.add_argument("--sleep", type=float, default=0.0, help="seconds to pause between calls")

    def handle(self, *args, **opts):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise CommandError(
                "ANTHROPIC_API_KEY is not set. Add it to .env or export it, then re-run."
            )

        qs = Product.objects.exclude(image_url="").select_related("brand")
        if opts["brand"]:
            qs = qs.filter(brand__key=opts["brand"])
        if not opts["force"]:
            qs = qs.filter(attribute__isnull=True)
        qs = qs.order_by("brand__name", "title")
        if opts["limit"]:
            qs = qs[: opts["limit"]]

        products = list(qs)
        total = len(products)
        if not total:
            self.stdout.write(self.style.WARNING("Nothing to enrich (all done, or no matches)."))
            return

        self.stdout.write(f"Enriching {total} product(s) on {MODEL_ID}…")
        # Bound per-call time so one slow/unfetchable image can't wedge the batch on
        # the SDK's 10-minute default; failures are isolated per row below.
        client = anthropic.Anthropic(timeout=60.0, max_retries=1)
        done = failed = 0

        for i, product in enumerate(products, 1):
            try:
                attrs, tags = enrich_product(product, client=client)
            except Exception as e:  # keep going; one bad image shouldn't halt the batch
                failed += 1
                self.stderr.write(self.style.ERROR(f"  [{i}/{total}] {product.title[:50]} — {type(e).__name__}: {e}"))
                continue

            PieceAttribute.objects.update_or_create(
                product=product,
                defaults=dict(
                    category=attrs.get("category", ""),
                    attributes=attrs,
                    piece_tags=tags,
                    model_id=MODEL_ID,
                    enriched_at=timezone.now(),
                ),
            )
            done += 1
            self.stdout.write(f"  [{i}/{total}] {product.title[:44]:44} → {attrs.get('category','?'):9} {', '.join(tags[:5])}")
            if opts["sleep"]:
                time.sleep(opts["sleep"])

        style = self.style.SUCCESS if not failed else self.style.WARNING
        self.stdout.write(style(f"Enriched {done}, failed {failed}, of {total}."))
