from collections import Counter

from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework.decorators import api_view
from rest_framework.response import Response

from catalog.models import Brand, Product
from catalog.serializers import ProductSerializer
from .models import Follow, Board, Pin, DiaryEntry, Connection
from .serializers import BoardSerializer, PinSerializer, DiaryEntrySerializer, ConnectionSerializer


# ---- follows ----
@api_view(["POST", "DELETE"])
def follow(request, key):
    brand = get_object_or_404(Brand, key=key)
    if request.method == "POST":
        Follow.objects.get_or_create(brand=brand)
        if not brand.in_library:  # following a discovery candidate adds it to the almanac
            brand.in_library = True
            brand.save(update_fields=["in_library"])
        return Response({"key": key, "followed": True})
    Follow.objects.filter(brand=brand).delete()
    return Response({"key": key, "followed": False})


# ---- boards ----
@api_view(["GET", "POST"])
def board_list(request):
    if request.method == "POST":
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name required"}, status=400)
        slug = slugify(name) or "board"
        board, _ = Board.objects.get_or_create(slug=slug, defaults={"name": name})
        return Response(BoardSerializer(board).data, status=201)
    qs = Board.objects.annotate(pin_count=Count("pins"))
    return Response(BoardSerializer(qs, many=True).data)


@api_view(["GET"])
def board_detail(request, slug):
    board = get_object_or_404(Board.objects.annotate(pin_count=Count("pins")), slug=slug)
    pins = board.pins.select_related("product", "product__brand")
    return Response({
        "board": BoardSerializer(board).data,
        "pins": PinSerializer(pins, many=True).data,
    })


# ---- pins ----
@api_view(["GET", "POST"])
def pin_list(request):
    if request.method == "POST":
        product = get_object_or_404(Product, pk=request.data.get("product"))
        board_slug = request.data.get("board")
        board = (Board.objects.filter(slug=board_slug).first()
                 or Board.objects.order_by("created_at").first())
        if board is None:
            board = Board.objects.create(name="Saved", slug="saved")
        pin, _ = Pin.objects.get_or_create(product=product, board=board)
        return Response(PinSerializer(pin).data, status=201)
    qs = Pin.objects.select_related("product", "product__brand", "board")
    return Response(PinSerializer(qs, many=True).data)


@api_view(["DELETE"])
def pin_delete(request, product_id):
    Pin.objects.filter(product_id=product_id).delete()
    return Response(status=204)


# ---- diary ----
@api_view(["GET"])
def diary_list(request):
    return Response(DiaryEntrySerializer(DiaryEntry.objects.all(), many=True).data)


@api_view(["GET", "PUT"])
def diary_detail(request, date):
    entry = DiaryEntry.objects.filter(date=date).first()
    if request.method == "PUT":
        defaults = {"note": request.data.get("note", ""), "moods": request.data.get("moods", [])}
        entry, _ = DiaryEntry.objects.update_or_create(date=date, defaults=defaults)
    if entry is None:
        return Response({"date": date, "note": "", "moods": []})
    return Response(DiaryEntrySerializer(entry).data)


# ---- connections ----
@api_view(["GET"])
def connection_list(request):
    for platform, detail in [("instagram", "@you — saved posts"),
                             ("pinterest", "boards"), ("camera", "fits & fitting-room shots")]:
        Connection.objects.get_or_create(platform=platform, defaults={"detail": detail})
    return Response(ConnectionSerializer(Connection.objects.all(), many=True).data)


@api_view(["PATCH"])
def connection_update(request, platform):
    conn = get_object_or_404(Connection, platform=platform)
    conn.connected = bool(request.data.get("connected", conn.connected))
    conn.save()
    return Response(ConnectionSerializer(conn).data)


# ---- taste readout ----
@api_view(["GET"])
def taste(request):
    pins = Pin.objects.select_related("product", "product__brand")
    products = [p.product for p in pins]
    if not products:
        return Response({"pinned": 0, "readout": None, "leaning": []})

    def top(values):
        vals = [v for v in values if v]
        return Counter(vals).most_common(1)[0][0] if vals else None

    tier = top([p.tier for p in products])
    brand = top([p.brand.name for p in products])
    color = top([p.color for p in products])
    return Response({
        "pinned": len(products),
        "leaning": [x for x in [dict(TIER_LABELS).get(tier, tier), brand, color] if x],
        "readout": f"Leaning {dict(TIER_LABELS).get(tier, tier)}"
                   + (f" — {color.lower()} recurring" if color else ""),
    })


TIER_LABELS = [("luxury", "Luxury Designer"), ("premium", "Affordable Luxury"),
               ("contemporary", "Contemporary")]
