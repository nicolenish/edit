from django.contrib import admin

from .models import Brand, Product, Look, PieceAttribute


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "tier", "city", "source", "last_ingested_at")
    list_filter = ("kind", "tier", "source")
    search_fields = ("name", "key", "domain")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("title", "brand", "occasion", "tier", "price_display", "available")
    list_filter = ("occasion", "tier", "available", "brand")
    search_fields = ("title",)


@admin.register(Look)
class LookAdmin(admin.ModelAdmin):
    list_display = ("brand", "index", "season")
    list_filter = ("brand",)


@admin.register(PieceAttribute)
class PieceAttributeAdmin(admin.ModelAdmin):
    list_display = ("product", "category", "model_id", "enriched_at")
    list_filter = ("category", "model_id")
    search_fields = ("product__title",)
