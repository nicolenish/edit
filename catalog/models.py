import uuid

from django.db import models

TIER_CHOICES = [
    ("luxury", "Luxury Designer"),
    ("premium", "Affordable Luxury"),
    ("contemporary", "Contemporary"),
]
OCCASION_CHOICES = [
    ("casual", "Casual"),
    ("datenight", "Date Night"),
    ("events", "Events"),
    ("athleisure", "Athleisure"),
    ("jewelry", "Jewelry"),
]
KIND_CHOICES = [("shoppable", "Shoppable"), ("editorial", "Editorial")]


class Brand(models.Model):
    """A fashion house. `shoppable` brands have Products (pulled from Shopify);
    `editorial` houses have Looks (runway imagery or placeholder tiles)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default="shoppable")

    domain = models.CharField(max_length=200, blank=True)
    url = models.URLField(max_length=400, blank=True)

    # editorial / provenance metadata (applies to both kinds)
    city = models.CharField(max_length=120, blank=True)
    founded = models.CharField(max_length=12, blank=True)
    founder = models.CharField(max_length=200, blank=True)
    designer = models.CharField(max_length=200, blank=True)
    story = models.TextField(blank=True)
    tier = models.CharField(max_length=14, choices=TIER_CHOICES, blank=True)
    season = models.CharField(max_length=120, blank=True)  # editorial latest collection

    hero_image_url = models.URLField(max_length=1000, blank=True)
    source = models.CharField(max_length=40, blank=True)  # shopify / wix / blocked / candidate
    tags = models.JSONField(default=list, blank=True)  # aesthetic + region tags
    in_library = models.BooleanField(default=True)  # False = discovery candidate, not yet in the almanac
    dismissed = models.BooleanField(default=False)  # "not for me" — hidden from discovery
    last_ingested_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    brand = models.ForeignKey(Brand, related_name="products", on_delete=models.CASCADE)
    external_id = models.CharField(max_length=80, blank=True)
    title = models.CharField(max_length=300)
    handle = models.CharField(max_length=300, blank=True)
    url = models.URLField(max_length=1000, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    price_display = models.CharField(max_length=40, blank=True)
    currency = models.CharField(max_length=8, default="USD")
    color = models.CharField(max_length=160, blank=True)
    occasion = models.CharField(max_length=16, choices=OCCASION_CHOICES, default="casual")
    tier = models.CharField(max_length=14, choices=TIER_CHOICES, blank=True)
    image_url = models.URLField(max_length=1000, blank=True)
    image2_url = models.URLField(max_length=1000, blank=True)
    available = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at"]
        unique_together = [("brand", "external_id")]

    def __str__(self):
        return f"{self.brand.name} — {self.title}"


class PieceAttribute(models.Model):
    """Vision-derived, category-aware attributes for one Product — the depth
    layer the taste graph derives patterns from. See docs/taste-graph.md §4.

    `attributes` holds the full structured object a Claude vision pass returns
    (category, shared dims, category-specific block). `piece_tags` is that object
    flattened to a list of `dim:value` strings so pattern counting is a plain
    aggregation. `model_id` + `enriched_at` record provenance for reproducibility."""

    product = models.OneToOneField(
        Product, related_name="attribute", on_delete=models.CASCADE
    )
    category = models.CharField(max_length=20, blank=True)  # apparel/footwear/jewelry/…
    attributes = models.JSONField(default=dict, blank=True)  # full structured object
    piece_tags = models.JSONField(default=list, blank=True)  # flattened dim:value tags
    model_id = models.CharField(max_length=60, blank=True)
    enriched_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"attrs<{self.product.title[:40]}>"


class HouseLore(models.Model):
    """LLM-derived depth for a house's "long view" (docs/taste-graph.md house study):
    its house codes (signature aesthetics/motifs), a one-line essence, and a real
    history (founding rationale + milestones). `known` records whether the model
    genuinely recognised the house vs. derived it from the brief."""

    brand = models.OneToOneField(Brand, related_name="lore", on_delete=models.CASCADE)
    codes = models.JSONField(default=list, blank=True)      # ["the human body", "surrealism", …]
    essence = models.CharField(max_length=400, blank=True)  # one sharp sentence — the core idea
    history = models.JSONField(default=list, blank=True)     # [{year, head, text}, …]
    directors = models.JSONField(default=list, blank=True)   # [{name, era, current, vision}, …] creative directors
    known = models.BooleanField(default=False)               # model recognised this specific house
    model_id = models.CharField(max_length=60, blank=True)
    enriched_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"lore<{self.brand.name}>"


class Collection(models.Model):
    """A signature collection under a creative director — the archive imagery layer
    (docs/archive-imagery.md). `why` is a critic's one-liner; the image fields are filled
    later by resolve_archive_images from museum open-access sources (CC0/CC)."""

    brand = models.ForeignKey(Brand, related_name="collections", on_delete=models.CASCADE)
    director_name = models.CharField(max_length=200, blank=True)
    season = models.CharField(max_length=80, blank=True)   # "Fall 2019", "Spring 2003"
    year = models.CharField(max_length=12, blank=True)
    title = models.CharField(max_length=200, blank=True)
    why = models.TextField(blank=True)                     # a critic's read of the collection
    order = models.PositiveIntegerField(default=0)         # chronological within the house
    # filled by the image resolver (Phase 2) — only ever a usably-licensed image
    image_url = models.URLField(max_length=1000, blank=True)
    source = models.CharField(max_length=60, blank=True)   # wikimedia · met · vam · europeana
    source_url = models.URLField(max_length=1000, blank=True)  # the file/object page — attribution + verification
    license = models.CharField(max_length=80, blank=True)  # CC0 · CC-BY · public domain
    credit = models.CharField(max_length=300, blank=True)
    model_id = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ["brand", "order"]

    def __str__(self):
        return f"{self.brand.name} — {self.title or self.season}"


class NodePosition(models.Model):
    """The saved "Yours" arrangement on the taste-graph desk — one x/y per node id
    (docs/taste-graph.md §7). Node ids are the graph's synthetic ids
    (`piece:<uuid>`, `house:<key>`, `pattern:<dim>:<value>`, `board:<slug>`…),
    so this isn't a FK. Single-user v1."""

    node_id = models.CharField(max_length=200, unique=True)
    x = models.FloatField()
    y = models.FloatField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.node_id} @ ({self.x:.0f},{self.y:.0f})"


class Look(models.Model):
    """One runway look for an editorial house. Blank image_url => placeholder tile."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    brand = models.ForeignKey(Brand, related_name="looks", on_delete=models.CASCADE)
    index = models.PositiveIntegerField(default=0)
    image_url = models.URLField(max_length=1000, blank=True)
    season = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["index"]
        unique_together = [("brand", "index")]

    def __str__(self):
        return f"{self.brand.name} — Look {self.index + 1}"
