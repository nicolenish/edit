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
    source = models.CharField(max_length=40, blank=True)  # shopify / wix / blocked
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
