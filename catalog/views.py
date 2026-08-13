from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .ingest import ingest_brand, IngestError
from .models import Brand, Product
from .serializers import BrandSerializer, BrandDetailSerializer, ProductSerializer


def _brand_qs():
    return Brand.objects.annotate(
        product_count=Count("products", distinct=True),
        look_count=Count("looks", distinct=True),
    )


@api_view(["GET"])
def brand_list(request):
    qs = _brand_qs()
    kind = request.GET.get("kind")
    tier = request.GET.get("tier")
    if kind:
        qs = qs.filter(kind=kind)
    if tier:
        qs = qs.filter(tier=tier)
    if request.GET.get("followed") == "true":
        qs = qs.filter(follow__isnull=False)
    data = BrandSerializer(qs, many=True, context={"request": request}).data
    return Response(data)


@api_view(["GET"])
def brand_detail(request, key):
    brand = get_object_or_404(_brand_qs(), key=key)
    return Response(BrandDetailSerializer(brand, context={"request": request}).data)


@api_view(["POST"])
def brand_ingest(request):
    """Paste a brand URL -> pull its live Shopify catalogue."""
    url = (request.data.get("url") or "").strip()
    if not url:
        return Response({"detail": "A brand url is required."}, status=400)
    try:
        brand = ingest_brand(url, name=request.data.get("name") or None)
    except IngestError as exc:
        return Response({"detail": str(exc)}, status=422)
    brand = _brand_qs().get(pk=brand.pk)
    return Response(BrandSerializer(brand, context={"request": request}).data,
                    status=status.HTTP_201_CREATED)


def _product_list_data(request):
    qs = Product.objects.select_related("brand")
    occasion = request.GET.get("occasion")
    tier = request.GET.get("tier")
    brand = request.GET.get("brand")
    if occasion:
        qs = qs.filter(occasion=occasion)
    if tier:
        qs = qs.filter(tier=tier)
    if brand:
        qs = qs.filter(brand__key=brand)
    if request.GET.get("followed_only") == "true":
        qs = qs.filter(brand__follow__isnull=False)
    try:
        limit = min(int(request.GET.get("limit", 120)), 500)
    except ValueError:
        limit = 120
    qs = qs.order_by("-published_at")[:limit]
    from library.models import Pin
    ctx = {"pinned_ids": set(str(p) for p in Pin.objects.values_list("product_id", flat=True))}
    return ProductSerializer(qs, many=True, context=ctx).data


@api_view(["GET"])
def product_list(request):
    return Response(_product_list_data(request))


@api_view(["GET"])
def discover(request):
    """Brands you don't follow yet, ranked by affinity to the ones you do."""
    from .discover import discover as run
    for_you, expand, note = run()
    ctx = {"followed_keys": set()}

    def card(entry):
        data = BrandSerializer(entry["brand"], context=ctx).data
        data["product_count"] = 0
        data["look_count"] = 0
        data["reason"] = entry["reason"]
        return data

    return Response({
        "note": note,
        "for_you": [card(e) for e in for_you],
        "expand": [card(e) for e in expand],
    })


@api_view(["POST"])
def brand_dismiss(request, key):
    Brand.objects.filter(key=key).update(dismissed=True)
    return Response({"key": key, "dismissed": True})


@api_view(["GET"])
def feed(request):
    """What's New — newest shoppable products across followed (or all) labels."""
    items = _product_list_data(request)
    return Response({
        "count": len(items),
        "since": items[:9],       # "since your last visit"
        "earlier": items[9:],
        "items": items,
    })
