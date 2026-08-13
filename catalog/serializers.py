from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .models import Brand, Product, Look


def _followed_keys():
    from library.models import Follow
    return set(Follow.objects.values_list("brand__key", flat=True))


def _pinned_product_ids():
    from library.models import Pin
    return set(str(pid) for pid in Pin.objects.values_list("product_id", flat=True))


class ProductSerializer(serializers.ModelSerializer):
    brand_key = serializers.CharField(source="brand.key", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    is_new = serializers.SerializerMethodField()
    pinned = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "brand_key", "brand_name", "title", "price", "price_display",
            "currency", "color", "occasion", "tier", "image_url", "image2_url",
            "url", "available", "published_at", "is_new", "pinned",
        ]

    def get_is_new(self, obj):
        if not obj.published_at:
            return False
        return (timezone.now() - obj.published_at) < timedelta(days=30)

    def get_pinned(self, obj):
        pinned = self.context.get("pinned_ids")
        if pinned is None:
            pinned = _pinned_product_ids()
        return str(obj.id) in pinned


class LookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Look
        fields = ["id", "index", "image_url", "season"]


class BrandSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)
    look_count = serializers.IntegerField(read_only=True)
    followed = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = [
            "id", "key", "name", "kind", "domain", "url", "city", "founded",
            "founder", "designer", "story", "tier", "season", "hero_image_url",
            "source", "tags", "in_library", "last_ingested_at",
            "product_count", "look_count", "followed",
        ]

    def get_followed(self, obj):
        followed = self.context.get("followed_keys")
        if followed is None:
            followed = _followed_keys()
        return obj.key in followed


class BrandDetailSerializer(BrandSerializer):
    products = ProductSerializer(many=True, read_only=True)
    looks = LookSerializer(many=True, read_only=True)

    class Meta(BrandSerializer.Meta):
        fields = BrandSerializer.Meta.fields + ["products", "looks"]
