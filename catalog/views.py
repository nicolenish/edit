from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import graph as graphlib
from .ingest import ingest_brand, IngestError
from .models import Brand, NodePosition, Product
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


# ── taste graph (docs/taste-graph.md §8) ──
@api_view(["GET"])
def graph(request):
    # each facet may carry multiple comma-separated values (OR within, AND across facets)
    lens = {k: [v for v in request.GET[k].split(",") if v]
            for k in ("region", "tier", "aesthetic", "kindred", "state") if request.GET.get(k)}
    return Response(graphlib.build_graph(focus=request.GET.get("focus"), lens=lens or None))


@api_view(["GET"])
def graph_lenses(request):
    """Available facet lenses (region / tier / aesthetic / kindred / state) with counts."""
    return Response(graphlib.build_graph_lenses())


@api_view(["GET"])
def graph_node(request, node_id):
    detail = graphlib.build_node_detail(node_id)
    if detail is None:
        return Response({"detail": "No such node"}, status=status.HTTP_404_NOT_FOUND)
    return Response(detail)


@api_view(["GET"])
def graph_house_study(request, key):
    """The long view — a house's history & lineage (docs: house study modal)."""
    study = graphlib.build_house_study(key)
    if study is None:
        return Response({"detail": "No such house"}, status=status.HTTP_404_NOT_FOUND)
    return Response(study)


@api_view(["PATCH"])
def graph_positions(request):
    """Save the "Yours" arrangement: {"<node_id>": {"x":.., "y":..}, …}."""
    saved = 0
    for node_id, pos in (request.data or {}).items():
        try:
            x, y = float(pos["x"]), float(pos["y"])
        except (KeyError, TypeError, ValueError):
            continue
        NodePosition.objects.update_or_create(node_id=node_id, defaults={"x": x, "y": y})
        saved += 1
    return Response({"saved": saved})


@api_view(["GET"])
def graph_list(request):
    """The whole library, grouped with thumbnails — the List view's data."""
    return Response(graphlib.build_graph_list())


@api_view(["GET"])
def graph_board(request, slug):
    """A board as its own composed sub-graph — only its gathered items + the lines between them."""
    data = graphlib.build_board_graph(slug)
    if data is None:
        return Response({"detail": "No such board"}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)


@api_view(["POST"])
def graph_board_local(request, slug):
    """Add board-only 'moodboard' content — a note / image / color / link that lives on
    this board and never enters the main graph. The server mints its `local:<uuid>` id."""
    import uuid as _uuid

    from library.models import Board, BoardItem

    board = Board.objects.filter(slug=slug).first()
    if not board:
        return Response({"detail": "No such board"}, status=status.HTTP_404_NOT_FOUND)
    data = request.data or {}
    kind = data.get("local_kind")
    if kind not in ("note", "image", "color", "link"):
        return Response({"detail": "local_kind must be note|image|color|link"}, status=400)
    try:
        x = float(data.get("x", 320))
        y = float(data.get("y", 240))
    except (TypeError, ValueError):
        x, y = 320.0, 240.0
    item = BoardItem.objects.create(
        board=board, node_id=f"local:{_uuid.uuid4().hex}", x=x, y=y, local_kind=kind,
        text=(data.get("text") or "").strip(), image_url=(data.get("image_url") or "").strip(),
        color=(data.get("color") or "").strip(), url=(data.get("url") or "").strip(),
    )
    return Response({"node_id": item.node_id, "count": board.items.count()}, status=status.HTTP_201_CREATED)


@api_view(["POST", "DELETE"])
def graph_board_items(request, slug):
    """Add (POST {node_id}) or remove (DELETE {node_id}) an item on a board's canvas.
    New items drop at a given position or a default, so they land where you dropped them."""
    from library.models import Board, BoardItem

    board = Board.objects.filter(slug=slug).first()
    if not board:
        return Response({"detail": "No such board"}, status=status.HTTP_404_NOT_FOUND)
    node_id = (request.data or {}).get("node_id")
    if not node_id:
        return Response({"detail": "node_id is required"}, status=400)

    if request.method == "DELETE":
        BoardItem.objects.filter(board=board, node_id=node_id).delete()
        return Response({"removed": node_id, "count": board.items.count()})

    try:
        x = float((request.data or {}).get("x", 320))
        y = float((request.data or {}).get("y", 240))
    except (TypeError, ValueError):
        x, y = 320.0, 240.0
    item, created = BoardItem.objects.get_or_create(board=board, node_id=node_id, defaults={"x": x, "y": y})
    return Response({"node_id": node_id, "added": created, "count": board.items.count()},
                    status=status.HTTP_201_CREATED if created else 200)


@api_view(["PATCH"])
def graph_board_positions(request, slug):
    """Save a board's own arrangement: {"<node_id>": {"x":.., "y":..}, …} — scoped to this board."""
    from library.models import Board, BoardItem

    board = Board.objects.filter(slug=slug).first()
    if not board:
        return Response({"detail": "No such board"}, status=status.HTTP_404_NOT_FOUND)
    saved = 0
    for node_id, pos in (request.data or {}).items():
        try:
            x, y = float(pos["x"]), float(pos["y"])
        except (KeyError, TypeError, ValueError):
            continue
        updated = BoardItem.objects.filter(board=board, node_id=node_id).update(x=x, y=y)
        saved += updated
    return Response({"saved": saved})
