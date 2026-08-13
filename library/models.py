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
