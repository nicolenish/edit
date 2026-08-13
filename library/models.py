import uuid

from django.db import models

from catalog.models import Brand, Product


class Follow(models.Model):
    brand = models.OneToOneField(Brand, related_name="follow", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Follow {self.brand.name}"


class Board(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)          # "what it's for" — a note to your future self
    tags = models.JSONField(default=list, blank=True)   # comma-separated tags from the compose form
    is_open_thread = models.BooleanField(default=False)  # the one board pinned in the header as your current focus
    archived = models.BooleanField(default=False)        # soft-hidden from the lists, restorable
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.name


class Pin(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, related_name="pins", on_delete=models.CASCADE)
    board = models.ForeignKey(Board, related_name="pins", on_delete=models.CASCADE)
    note = models.CharField(max_length=300, blank=True)
    pinned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("product", "board")]
        ordering = ["-pinned_at"]


class BoardItem(models.Model):
    """One thing gathered onto a board's own canvas. A board is a *composed sub-graph* —
    the total desk is everything; a board is a specific set you assembled (an event, an
    outfit to style) with its own freeform arrangement. `node_id` is any graph synthetic id
    (`piece:<uuid>`, `house:<key>`, `pattern:<dim:value>`, `clip:<uuid>`, `note:<uuid>`);
    x/y is the position on *this* board (a node can sit differently on different boards)."""

    board = models.ForeignKey(Board, related_name="items", on_delete=models.CASCADE)
    node_id = models.CharField(max_length=200)
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("board", "node_id")]
        ordering = ["added_at"]

    def __str__(self):
        return f"{self.board.name} ← {self.node_id}"


class Clip(models.Model):
    """The capture inbox — anything you clip: a thought, an image, a link, a house or a
    piece. Claude classifies the `kind` on capture; it renders as that node type on the
    desk and stays editable. Promotion to a real Brand/Product (ingestion) is a later step."""

    KIND_CHOICES = [
        ("note", "Note"),        # a plain thought → note node
        ("clip", "Clipping"),    # an image / link / editorial → clipping node
        ("piece", "Piece"),      # a specific garment you clipped → piece node
        ("house", "House"),      # a fashion house you clipped → house node
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default="note")
    title = models.CharField(max_length=200, blank=True)
    text = models.TextField(blank=True)
    url = models.URLField(max_length=1000, blank=True)
    image_url = models.URLField(max_length=1000, blank=True)
    tags = models.JSONField(default=list, blank=True)
    board = models.ForeignKey(Board, related_name="clips", null=True, blank=True, on_delete=models.SET_NULL)
    model_id = models.CharField(max_length=60, blank=True)  # classifier provenance
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.title or self.text[:30]}"


class DiaryEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField(unique=True)
    note = models.TextField(blank=True)
    moods = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]


class Connection(models.Model):
    """Diary 'pin from' sources — Instagram / Pinterest / Camera roll toggles."""

    platform = models.CharField(max_length=40, unique=True)
    connected = models.BooleanField(default=False)
    detail = models.CharField(max_length=200, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
