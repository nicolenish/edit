import uuid
from collections import Counter

from django.core.files.storage import default_storage
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from catalog.models import Brand, Product
from catalog.serializers import ProductSerializer
from .models import Follow, Board, Pin, DiaryEntry, Connection, Clip
from .serializers import BoardSerializer, PinSerializer, DiaryEntrySerializer, ConnectionSerializer, ClipSerializer


# ---- image uploads (pasted / picked clip images) ----
_IMG_EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def upload_image(request):
    """Store a pasted/uploaded image and return a URL to use as a clip's image.
    Accepts multipart 'file'. Returns a relative /media/… URL (proxied in dev)."""
    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "no file"}, status=400)
    ext = _IMG_EXT.get(getattr(f, "content_type", ""), "")
    if not ext:
        return Response({"detail": "unsupported image type"}, status=415)
    if f.size > 8 * 1024 * 1024:
        return Response({"detail": "image too large (max 8MB)"}, status=413)
    name = default_storage.save(f"uploads/{uuid.uuid4().hex}{ext}", f)
    return Response({"url": default_storage.url(name)}, status=201)


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
        description = (request.data.get("description") or "").strip()
        tags = request.data.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        slug = slugify(name) or "board"
        board, _ = Board.objects.get_or_create(
            slug=slug, defaults={"name": name, "description": description, "tags": tags}
        )
        return Response(BoardSerializer(board).data, status=201)
    qs = Board.objects.filter(archived=False).annotate(pin_count=Count("pins"))
    return Response(BoardSerializer(qs, many=True).data)


@api_view(["GET", "PATCH", "DELETE"])
def board_detail(request, slug):
    board = get_object_or_404(Board, slug=slug)
    if request.method == "DELETE":
        # permanent — takes its BoardItems and Pins with it (cascade)
        board.delete()
        return Response(status=204)
    if request.method == "PATCH":
        # rename / re-describe / re-tag after creation. The slug stays fixed so existing
        # BoardItems and the board-graph URL keep working; only the display fields change.
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if name:
                board.name = name
        if "description" in request.data:
            board.description = (request.data.get("description") or "").strip()
        if "tags" in request.data:
            tags = request.data.get("tags") or []
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]
            board.tags = tags
        if "open_thread" in request.data:
            # only one board is the header's "open thread" at a time
            if bool(request.data.get("open_thread")):
                Board.objects.exclude(pk=board.pk).update(is_open_thread=False)
                board.is_open_thread = True
            else:
                board.is_open_thread = False
        if "archived" in request.data:
            board.archived = bool(request.data.get("archived"))
            if board.archived:
                board.is_open_thread = False  # an archived board can't be the header thread
        board.save()
        return Response(BoardSerializer(board).data)

    board = Board.objects.annotate(pin_count=Count("pins")).get(pk=board.pk)
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


# ---- capture (the inbox) ----
@api_view(["POST"])
def capture(request):
    """Clip a thought / link / image → Claude classifies the kind → create a Clip that
    lands on the desk as that node type, optionally pinned to a board."""
    import anthropic
    from catalog.enrich import classify_capture

    text = (request.data.get("text") or "").strip()
    url = (request.data.get("url") or "").strip()
    image_url = (request.data.get("image_url") or "").strip()
    if not (text or url or image_url):
        return Response({"detail": "nothing to clip"}, status=400)

    try:
        triage = classify_capture(text=text, url=url, image_url=image_url, client=anthropic.Anthropic())
    except Exception as e:
        # if the classifier is unavailable, fall back to a plain note/clip
        triage = {"kind": "clip" if (image_url or url) else "note",
                  "title": text[:80] or url[:80] or "Clipping", "tags": [], "model_id": ""}
        _ = e

    board = None
    board_slug = (request.data.get("board") or "").strip()
    if board_slug:
        board = Board.objects.filter(slug=board_slug).first()

    clip = Clip.objects.create(
        kind=triage["kind"], title=triage["title"], text=text, url=url, image_url=image_url,
        tags=triage["tags"], board=board, model_id=triage.get("model_id", ""),
    )
    return Response(ClipSerializer(clip).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
def clip_detail(request, clip_id):
    clip = get_object_or_404(Clip, pk=clip_id)
    if request.method == "DELETE":
        clip.delete()
        return Response(status=204)
    if request.method == "PATCH":
        for field in ("kind", "title", "text", "url", "image_url"):
            if field in request.data:
                setattr(clip, field, request.data[field])
        if "tags" in request.data:
            tags = request.data["tags"]
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]
            clip.tags = tags
        if "board" in request.data:
            clip.board = Board.objects.filter(slug=request.data["board"]).first()
        clip.save()
    return Response(ClipSerializer(clip).data)
