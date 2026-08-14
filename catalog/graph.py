"""The taste graph — a projection of the relational data plus derived inference.

`build_graph(focus=None)` assembles the desk: structural edges read straight from
FKs (Product→Brand, Pin→Board, Follow), pattern nodes derived by aggregating the
vision-enriched `piece_tags` across the corpus, adjacency borrowed from the Discover
engine, then a readable ~15-30-node neighbourhood curated out of it. See
docs/taste-graph.md §2-§7. `build_node_detail(id)` backs the detail panel.

Everything here is derived on the fly — no Pattern table. The only stored state is
NodePosition (the "Yours" arrangement).
"""
from __future__ import annotations

from collections import Counter, defaultdict

from .discover import discover, REGION_TAGS
from .models import Brand, NodePosition, PieceAttribute, Product

# ── tunables ──
WEIGHT_PIN = 3          # a pinned piece counts this much more than a followed-house piece
PATTERN_MIN_WEIGHT = 4  # a tag needs at least this weight to become a pattern
N_DESK_PATTERNS = 8     # strongest patterns shown as desk nodes (rest live in the Index)
DESK_DIM_CAP = 2        # …but at most this many from any one dimension, so the desk
                        #   isn't a wall of adjectives — palette/material/neckline surface too
N_DESK_HOUSES = 7       # houses that embody the desk patterns
N_DESK_PIECES = 8       # pinned pieces + exemplars
N_SUGGEST = 5           # suggested houses — diversified across aesthetic / region / price
N_DESK_CLIPS = 12       # most-recent clips on the desk; older ones stay in the List/index
EMBODY_MIN = 2          # a house embodies a pattern only if ≥ this many of its pieces carry it
EMBODY_TOP_HOUSES = 3   # …and only the strongest few houses per pattern draw the line
EXHIBIT_TOP_PATTERNS = 3  # a piece draws lines to at most its strongest few patterns

# Dimensions that are filter facets, not taste signals — kept out of patterns.
FACET_DIMS = {"formality"}

# ── node id helpers (synthetic, stable) ──
def piece_id(p): return f"piece:{p.id}"
def house_id(b): return f"house:{b.key}"
def pattern_id(tag): return f"pattern:{tag}"       # tag is already `dim:value`
def board_id(b): return f"board:{b.slug}"
def note_id(e): return f"note:{e.id}"


def humanize(tag: str) -> str:
    """`descriptor:sculptural` → 'Sculptural', `neckline:collar` → 'Collar'."""
    _, _, value = tag.partition(":")
    return value.replace("-", " ").strip().title() or tag


# ── corpus ──
class _Piece:
    __slots__ = ("product", "brand", "tags", "category", "pinned", "boards", "date")

    def __init__(self, product, brand, tags, category, pinned, boards, date):
        self.product = product
        self.brand = brand
        self.tags = tags
        self.category = category
        self.pinned = pinned
        self.boards = boards  # list of Board this piece is pinned to
        self.date = date      # when it entered your world (pinned, else published)

    @property
    def weight(self):
        return WEIGHT_PIN if self.pinned else 1


def _iso(dt):
    return dt.isoformat() if dt else None


def _load_corpus():
    """Enriched pieces of followed houses + pin/board wiring + follow dates."""
    from library.models import Board, Follow, Pin

    pins = list(Pin.objects.select_related("product", "board"))
    boards_by_product = defaultdict(list)
    pin_date, pinned_ids = {}, set()
    for pin in pins:
        boards_by_product[pin.product_id].append(pin.board)
        pinned_ids.add(pin.product_id)
        pin_date[pin.product_id] = pin.pinned_at

    pieces = []
    attrs = (
        PieceAttribute.objects
        .select_related("product__brand")
        .filter(product__brand__follow__isnull=False)
    )
    for a in attrs:
        p = a.product
        pieces.append(_Piece(
            product=p, brand=p.brand, tags=list(a.piece_tags or []),
            category=a.category, pinned=p.id in pinned_ids,
            boards=boards_by_product.get(p.id, []),
            date=pin_date.get(p.id) or p.published_at or p.created_at,
        ))
    boards = list(Board.objects.filter(archived=False))
    follow_date = dict(Follow.objects.values_list("brand__key", "created_at"))
    return pieces, boards, follow_date


# ── pattern derivation (docs §5) ──
class _Pattern:
    __slots__ = ("tag", "label", "weight", "houses", "categories", "piece_ids", "score")

    def __init__(self, tag, weight, houses, categories, piece_ids, total_pieces):
        self.tag = tag
        self.label = humanize(tag)
        self.weight = weight
        self.houses = houses            # set of brand keys
        self.categories = categories    # set of category strings
        self.piece_ids = piece_ids      # set of product ids
        cat_spread = max(1, len(categories))
        ubiquity = weight / total_pieces if total_pieces else 0
        # cross-category spread lifts a pattern; near-ubiquitous tags (present in
        # almost everything) are damped so genuine leanings beat filler.
        distinct = 1 - min(ubiquity, 0.9)
        self.score = weight * (1 + 0.5 * (cat_spread - 1)) * (0.4 + 0.6 * distinct)


def derive_patterns(pieces) -> list[_Pattern]:
    weight, houses, cats, pids = (Counter(), defaultdict(set), defaultdict(set), defaultdict(set))
    for pc in pieces:
        for tag in pc.tags:
            if tag.split(":", 1)[0] in FACET_DIMS:
                continue
            weight[tag] += pc.weight
            houses[tag].add(pc.brand.key)
            if pc.category:
                cats[tag].add(pc.category)
            pids[tag].add(pc.product.id)
    total = len(pieces)
    out = [
        _Pattern(tag, w, houses[tag], cats[tag], pids[tag], total)
        for tag, w in weight.items()
        if w >= PATTERN_MIN_WEIGHT
    ]
    out.sort(key=lambda p: (-p.score, p.tag))
    return out


# ── seed layout (deterministic, wrapping bands; overridden by NodePosition) ──
# Houses band on top, pieces below, patterns as the anchor row, boards + suggestions
# to the sides. Each type wraps to a new row so 30+ nodes don't overflow. The client
# fits the actual bounding box, so exact extents only need to avoid overlap.
_LAYOUT = {  # kind: (x0, y0, per_row, x_step, y_step)
    "house":    (120, 60, 6, 250, 160),
    "piece":    (160, 560, 5, 275, 190),
    "pattern":  (140, 1000, 8, 195, 150),
    "board":    (1620, 560, 2, 260, 190),
    "clipping": (1560, 60, 2, 250, 160),   # suggested houses reuse this right-side band
    "note":     (160, 1240, 4, 280, 150),
}


def _seed_xy(kind, i):
    x0, y0, per, xs, ys = _LAYOUT.get(kind, (200, 700, 5, 260, 190))
    r, c = divmod(i, per)
    # deterministic jitter so the seed reads as a scatter, not a rigid grid
    jx, jy = ((i * 37) % 44) - 22, ((i * 53) % 34) - 17
    return [x0 + c * xs + jx, y0 + r * ys + jy]


# ── lenses: filter the corpus to a deliberate slice before composing (docs/graph-views.md A1) ──
# A lens facet holds a *list* of values — multiple picks OR within a category, AND across
# categories. `_lens_vals` tolerates either a str or a list for robustness.
def _lens_vals(lens, key):
    v = (lens or {}).get(key)
    if not v:
        return []
    return [v] if isinstance(v, str) else list(v)


def _brand_region_ok(b, regions):
    btags = [t.lower() for t in (b.tags or [])]
    city = (b.city or "").lower()
    return any(r in btags or city == r for r in regions)


def _recent_cutoff():
    from django.utils import timezone
    return timezone.now() - timezone.timedelta(days=30)


def _apply_lens(pieces, lens):
    """Keep only the pieces that match the active lens. Region/tier/aesthetic filter by the
    piece's house; kindred by the piece's own tags; state by pinned/recency. Within a facet
    the picks are OR'd; across facets they're AND'd."""
    if not lens:
        return pieces
    out = pieces
    regions = [r.lower() for r in _lens_vals(lens, "region")]
    if regions:
        out = [pc for pc in out if _brand_region_ok(pc.brand, regions)]
    tiers = _lens_vals(lens, "tier")
    if tiers:
        out = [pc for pc in out if pc.brand.tier in tiers]
    aesthetics = [a.lower() for a in _lens_vals(lens, "aesthetic")]
    if aesthetics:
        out = [pc for pc in out if any(
            a in [t.lower() for t in (pc.brand.tags or [])] or any(a == t.split(":", 1)[-1].lower() for t in pc.tags)
            for a in aesthetics)]
    kindreds = _lens_vals(lens, "kindred")
    if kindreds:
        out = [pc for pc in out if any(k in pc.tags for k in kindreds)]
    states = _lens_vals(lens, "state")
    if states:
        cutoff = _recent_cutoff()
        out = [pc for pc in out if ("pinned" in states and pc.pinned)
               or ("recent" in states and pc.date and pc.date >= cutoff)]
    return out


def _house_matches_lens(b, lens):
    """A bare house/suggestion matches only the brand-level facets (region/tier/aesthetic);
    kindred & state are piece/clip-level, so a bare house can't satisfy them."""
    if not lens:
        return True
    if _lens_vals(lens, "kindred") or _lens_vals(lens, "state"):
        return False
    regions = [r.lower() for r in _lens_vals(lens, "region")]
    if regions and not _brand_region_ok(b, regions):
        return False
    tiers = _lens_vals(lens, "tier")
    if tiers and b.tier not in tiers:
        return False
    aesthetics = [a.lower() for a in _lens_vals(lens, "aesthetic")]
    if aesthetics and not any(a in [t.lower() for t in (b.tags or [])] for a in aesthetics):
        return False
    return True


def _clip_matches_lens(clip, lens, brand):
    """Does a clip belong under the lens? `brand` is clip.brand resolved to a Brand (or None).
    Brand-level facets need a resolvable house; kindred matches the clip's own tags."""
    if not lens:
        return True
    regions = [r.lower() for r in _lens_vals(lens, "region")]
    if regions and not (brand and _brand_region_ok(brand, regions)):
        return False
    tiers = _lens_vals(lens, "tier")
    if tiers and not (brand and brand.tier in tiers):
        return False
    aesthetics = [a.lower() for a in _lens_vals(lens, "aesthetic")]
    if aesthetics:
        clip_vals = [str(t).replace("-", " ").lower() for t in (clip.tags or [])]
        btags = [t.lower() for t in (brand.tags or [])] if brand else []
        if not any(a in btags or a in clip_vals for a in aesthetics):
            return False
    kindreds = _lens_vals(lens, "kindred")
    if kindreds:
        clip_vals = [str(t).replace("-", " ").lower() for t in (clip.tags or [])]
        if not any(k.split(":", 1)[-1].replace("-", " ").lower() in clip_vals for k in kindreds):
            return False
    states = _lens_vals(lens, "state")
    if states:
        if not (("pinned" in states and clip.board)
                or ("recent" in states and clip.created_at >= _recent_cutoff())):
            return False
    return True


def _board_matches_lens(board, lens, filtered_ids, brand_by_key):
    """A board shows under a lens only if it holds something matching it — a member piece
    that survived the corpus filter, or a member house that matches the brand-level facets."""
    if not lens:
        return True
    for it in board.items.all():
        nid = it.node_id
        if nid.startswith("piece:") and nid.split(":", 1)[1] in filtered_ids:
            return True
        if nid.startswith("house:"):
            b = brand_by_key.get(nid.split(":", 1)[1])
            if b and _house_matches_lens(b, lens):
                return True
    return False


# ── focus mode: isolate one node's neighbourhood, walked out from the corpus (A2) ──
FOCUS_PIECES = 8        # pieces pulled in for a focused house / kindred
FOCUS_PATTERNS = 4      # kindred nodes pulled in per piece
FOCUS_KIN_HOUSES = 6    # kindred houses pulled in for a focused house
FOCUS_CAP = 48          # neighbourhood size ceiling


def _focus_members(focus_id, pieces, by_product, brands_by_key, depth):
    """BFS out from the focus node over the corpus (not the capped desk) to `depth` hops,
    so focusing a house shows its actual pieces + kindred, even beyond the desk."""
    by_house = defaultdict(list)
    for pc in pieces:
        by_house[pc.brand.key].append(pc)

    def pat_tags(pc):
        return [t for t in pc.tags if t.split(":", 1)[0] not in FACET_DIMS][:FOCUS_PATTERNS]

    def neighbors(nid):
        kind, _, rest = nid.partition(":")
        out = []
        if kind == "house":
            for pc in by_house.get(rest, [])[:FOCUS_PIECES]:
                out.append(piece_id(pc.product))
                out += [pattern_id(t) for t in pat_tags(pc)]
            b = brands_by_key.get(rest)
            if b:
                aes = {t.lower() for t in (b.tags or [])} - REGION_TAGS
                kin = [k for k, bb in brands_by_key.items()
                       if k != rest and ({t.lower() for t in (bb.tags or [])} & aes)]
                out += [house_id_from_key(k) for k in kin[:FOCUS_KIN_HOUSES]]
        elif kind == "piece":
            pc = by_product.get(rest)
            if pc:
                out.append(house_id(pc.brand))
                out += [pattern_id(t) for t in pat_tags(pc)]
        elif kind == "pattern":
            for pc in [p for p in pieces if rest in p.tags][:FOCUS_PIECES]:
                out.append(piece_id(pc.product)); out.append(house_id(pc.brand))
        return out

    members, frontier = {focus_id}, [focus_id]
    for _ in range(max(1, depth)):
        nxt = []
        for nid in frontier:
            for nb in neighbors(nid):
                if nb not in members and len(members) < FOCUS_CAP:
                    members.add(nb); nxt.append(nb)
        frontier = nxt
    return members


def _focus_subgraph(focus_id, pieces, by_product, brands_by_key, follow_date, saved, depth):
    """Resolve the focus neighbourhood into nodes + edges (positions: saved, else seeded)."""
    from library.models import Clip as ClipModel

    clip_house_id = None
    if focus_id.startswith("clip:"):
        members = {focus_id}
        c0 = ClipModel.objects.filter(id=focus_id.split(":", 1)[1]).first()
        if c0 and c0.brand:
            b = (Brand.objects.filter(name__iexact=c0.brand).first()
                 or Brand.objects.filter(name__icontains=c0.brand).first())
            if b and b.key in brands_by_key:
                clip_house_id = house_id(b)
                members |= _focus_members(clip_house_id, pieces, by_product, brands_by_key, depth)
    else:
        members = _focus_members(focus_id, pieces, by_product, brands_by_key, depth)

    counters = defaultdict(int)

    def place(nid, kind):
        if nid in saved:
            return saved[nid]
        i = counters[kind]; counters[kind] += 1
        return _seed_xy(kind, i)

    nodes, member_pieces, member_houses, member_patterns = [], {}, {}, set()
    for nid in members:
        kind, _, rest = nid.partition(":")
        if kind == "piece":
            pc = by_product.get(rest)
            if not pc:
                continue
            x, y = place(nid, "piece")
            nodes.append({"id": nid, "type": "piece", "label": pc.product.title, "subtitle": pc.brand.name,
                          "tags": _pills_from_tags(pc.tags), "image": pc.product.image_url or None,
                          "date": _iso(pc.date), "x": x, "y": y})
            member_pieces[nid] = (pc.product, set(pc.tags), pc.brand)
        elif kind == "house":
            b = brands_by_key.get(rest)
            if not b:
                continue
            x, y = place(nid, "house")
            nodes.append({"id": nid, "type": "house", "label": b.name, "subtitle": b.city or "",
                          "tags": (b.tags or [])[:2], "image": b.hero_image_url or None, "followed": b.key in follow_date,
                          "date": _iso(follow_date.get(b.key)), "x": x, "y": y})
            member_houses[nid] = b
        elif kind == "pattern":
            x, y = place(nid, "pattern")
            nodes.append({"id": nid, "type": "pattern", "label": humanize(rest), "subtitle": "kindred",
                          "tags": [], "image": None, "date": None, "x": x, "y": y})
            member_patterns.add(rest)
        elif kind == "clip":
            c = ClipModel.objects.filter(id=rest).first()
            if not c:
                continue
            _KT = {"note": "note", "clip": "clipping", "piece": "piece", "house": "house"}
            x, y = place(nid, "note")
            nodes.append({"id": nid, "type": _KT.get(c.kind, "note"),
                          "label": c.title or c.piece_name or (c.text[:40] if c.text else "Clipping"),
                          "subtitle": c.brand or "clipped", "tags": (c.tags or [])[:3], "image": c.image_url or None,
                          "date": _iso(c.created_at), "x": x, "y": y})

    node_id_set = {n["id"] for n in nodes}
    edges, seen = [], set()

    def once(a, b, etype, derived, dim, **kw):
        if a not in node_id_set or b not in node_id_set or a == b or (a, b, etype) in seen:
            return
        seen.add((a, b, etype)); edges.append({"from": a, "to": b, "type": etype, "derived": derived, "dim": dim, **kw})

    for nid, (p, tags, brand) in member_pieces.items():
        once(nid, house_id(brand), "made-by", False, "direct")
        for t in member_patterns:
            if t in tags:
                once(nid, pattern_id(t), "exhibits", True, "pattern")
    if clip_house_id:
        once(focus_id, clip_house_id, "made-by", False, "direct")
    hlist = list(member_houses.items())
    for i in range(len(hlist)):
        for j in range(i + 1, len(hlist)):
            (na, ba), (nb, bb) = hlist[i], hlist[j]
            dim = _house_kindred_dim(ba, bb)
            if dim:
                once(na, nb, "adjacent", True, dim, dashed=True)
    return {"nodes": nodes, "edges": edges}


# ── build the desk ──
def build_graph(focus: str | None = None, lens: dict | None = None, depth: int = 1) -> dict:
    pieces, boards, follow_date = _load_corpus()
    pieces = _apply_lens(pieces, lens)
    # under a lens, clips / boards / suggestions must also match it — else they leak across
    # every slice. These support the gates below.
    lens_ids = {str(pc.product.id) for pc in pieces} if lens else set()
    lens_brands = {b.key: b for b in Brand.objects.all()} if lens else {}
    patterns = derive_patterns(pieces)
    # strongest patterns, but capped per dimension so the desk spans palette / material /
    # neckline / descriptor rather than eight near-synonymous adjectives.
    desk_patterns, dim_count = [], Counter()
    for pat in patterns:
        dim = pat.tag.split(":", 1)[0]
        if dim_count[dim] >= DESK_DIM_CAP:
            continue
        desk_patterns.append(pat); dim_count[dim] += 1
        if len(desk_patterns) >= N_DESK_PATTERNS:
            break
    desk_tags = {p.tag for p in desk_patterns}

    by_product = {pc.product.id: pc for pc in pieces}
    pinned_pieces = [pc for pc in pieces if pc.pinned]

    # houses that most embody the desk patterns (+ houses of pinned pieces)
    house_score = Counter()
    houses_by_key = {}
    for pat in desk_patterns:
        for pc in pieces:
            if pat.tag in pc.tags:
                house_score[pc.brand.key] += pat.score / max(1, len(pat.houses))
                houses_by_key[pc.brand.key] = pc.brand
    for pc in pinned_pieces:
        house_score[pc.brand.key] += 5
        houses_by_key[pc.brand.key] = pc.brand
    desk_house_keys = [k for k, _ in house_score.most_common(N_DESK_HOUSES)]

    # desk pieces: pinned first, then one exemplar per desk pattern not yet covered
    desk_pieces, seen_pieces = [], set()
    for pc in pinned_pieces:
        desk_pieces.append(pc); seen_pieces.add(pc.product.id)
    for pat in desk_patterns:
        if len(desk_pieces) >= N_DESK_PIECES:
            break
        exemplar = max(
            (pc for pc in pieces if pat.tag in pc.tags and pc.product.id not in seen_pieces),
            key=lambda pc: len(desk_tags & set(pc.tags)), default=None,
        )
        if exemplar:
            desk_pieces.append(exemplar); seen_pieces.add(exemplar.product.id)

    # suggestions — diversified across aesthetic / region / price so the desk shows
    # all three kindred-line colours (docs: connection grammar).
    suggest_specs = _diverse_suggestions([houses_by_key[k] for k in desk_house_keys], N_SUGGEST)

    # ── assemble nodes ──
    nodes, node_ids = [], set()
    saved = {np.node_id: (np.x, np.y) for np in NodePosition.objects.all()}

    def add(node):
        nid = node["id"]
        if nid in node_ids:
            return
        node["x"], node["y"] = saved.get(nid, (node["x"], node["y"]))
        nodes.append(node); node_ids.add(nid)

    for i, pat in enumerate(desk_patterns):
        x, y = _seed_xy("pattern", i)
        add({"id": pattern_id(pat.tag), "type": "pattern", "label": pat.label,
             "subtitle": f"{pat.weight} things", "tags": [], "image": None,
             "weight": pat.weight, "date": None, "x": x, "y": y})  # derived, undated

    for i, key in enumerate(desk_house_keys):
        b = houses_by_key[key]
        x, y = _seed_xy("house", i)
        add({"id": house_id(b), "type": "house", "label": b.name,
             "subtitle": b.city or "", "tags": (b.tags or [])[:2],
             "image": b.hero_image_url or None, "followed": True,
             "date": _iso(follow_date.get(b.key)), "x": x, "y": y})

    for i, pc in enumerate(desk_pieces):
        x, y = _seed_xy("piece", i)
        add({"id": piece_id(pc.product), "type": "piece", "label": pc.product.title,
             "subtitle": pc.brand.name, "tags": _piece_pills(pc),
             "image": pc.product.image_url or None, "date": _iso(pc.date), "x": x, "y": y})
        add_house(pc.brand, nodes, node_ids, saved, follow_date)  # ensure the piece's house is present

    for i, b in enumerate(boards):
        if lens and not _board_matches_lens(b, lens, lens_ids, lens_brands):
            continue  # under a lens, only boards holding something matching it
        x, y = _seed_xy("board", i)
        add({"id": board_id(b), "type": "board", "label": b.name,
             "subtitle": f"{b.pins.count()} things", "tags": [], "image": None,
             "date": _iso(b.created_at), "x": x, "y": y})

    for i, (cand, _anchor, _dim, reason) in enumerate(suggest_specs):
        if lens and not _house_matches_lens(cand, lens):
            continue  # a suggestion must fit the active slice too
        x, y = _seed_xy("clipping", i)  # reuse the right-edge lane for ghosts
        add({"id": house_id(cand), "type": "house", "label": cand.name,
             "subtitle": reason, "tags": (cand.tags or [])[:2], "image": cand.hero_image_url or None,
             "followed": False, "suggested": True, "date": None, "x": x, "y": y})

    # captured clips — the inbox (your notes / clippings / clipped pieces & houses). Only the
    # most recent N land on the desk (older ones stay searchable in the List/index) — clips are
    # the one uncapped source, so this keeps the desk from filling up (docs/graph-views.md).
    from library.models import Clip as ClipModel
    _KIND_TYPE = {"note": "note", "clip": "clipping", "piece": "piece", "house": "house"}
    all_clips = list(ClipModel.objects.select_related("board").order_by("-created_at"))
    clips = all_clips[:N_DESK_CLIPS]
    clip_pins, clip_house_edges, clip_pattern_edges = [], [], []
    # a clip's freeform tags ("black", "halter neckline") → the desk's kindred nodes, matched
    # on the pattern's value (the part after its dim), so a clip joins the traits it shares.
    val_to_pattern = {}
    for pat in desk_patterns:
        val = (pat.tag.split(":", 1)[1] if ":" in pat.tag else pat.tag).replace("-", " ").lower()
        val_to_pattern.setdefault(val, pat.tag)
    for i, clip in enumerate(clips):
        nid = f"clip:{clip.id}"
        # resolve the clip's house once — used for both the lens gate and its edge
        cbrand = None
        if clip.brand:
            cbrand = (Brand.objects.filter(name__iexact=clip.brand).first()
                      or Brand.objects.filter(name__icontains=clip.brand).first())
        if lens and not _clip_matches_lens(clip, lens, cbrand):
            continue  # under a lens, only clips that fit the slice
        x, y = _seed_xy("note", i)
        add({"id": nid, "type": _KIND_TYPE.get(clip.kind, "note"),
             "label": clip.title or clip.piece_name or (clip.text[:40] if clip.text else "Clipping"),
             "subtitle": clip.brand or "clipped", "tags": (clip.tags or [])[:3], "image": clip.image_url or None,
             "date": _iso(clip.created_at), "x": x, "y": y})
        if clip.board:
            clip_pins.append((nid, board_id(clip.board)))
        # link to its house, if the brand names one we know
        if cbrand:
            add_house(cbrand, nodes, node_ids, saved, follow_date)
            clip_house_edges.append((nid, house_id(cbrand)))
        # link to the kindred traits it shares
        for t in (clip.tags or []):
            tnorm = str(t).replace("-", " ").lower().strip()
            hit = val_to_pattern.get(tnorm)
            if not hit:
                for val, ptag in val_to_pattern.items():
                    if val in tnorm.split() or (len(val) > 3 and val in tnorm):
                        hit = ptag
                        break
            if hit:
                clip_pattern_edges.append((nid, hit))

    # ── assemble edges (only between included nodes) ──
    # `dim` drives how the line reads (docs: connection grammar):
    #   direct  — solid, a factual membership (piece→house, your pin)
    #   pattern — dotted neutral, a derived trait shared with a pattern node
    #   aesthetic / region / price — dotted, coloured; why two houses are kindred
    edges = []

    def edge(a, b, etype, derived, dim, dashed=False, weight=None):
        if a in node_ids and b in node_ids and a != b:
            e = {"from": a, "to": b, "type": etype, "derived": derived, "dim": dim}
            if dashed:
                e["dashed"] = True
            if weight is not None:
                e["weight"] = weight
            edges.append(e)

    seen_edges = set()

    def once(a, b, etype, derived, dim, **kw):
        k = (a, b, etype)
        if k in seen_edges:
            return
        seen_edges.add(k); edge(a, b, etype, derived, dim, **kw)

    pat_score = {pat.tag: pat.score for pat in desk_patterns}
    for pc in desk_pieces:
        once(piece_id(pc.product), house_id(pc.brand), "made-by", False, "direct")       # solid
        for board in pc.boards:
            once(piece_id(pc.product), board_id(board), "pinned-to", False, "pin")        # solid accent
        # only the piece's strongest few patterns draw a line, or the desk hairballs
        carried = sorted((t for t in pc.tags if t in desk_tags), key=lambda t: -pat_score[t])
        for tag in carried[:EXHIBIT_TOP_PATTERNS]:
            once(piece_id(pc.product), pattern_id(tag), "exhibits", True, "pattern")       # dotted

    # house → pattern (embodies): only the strongest few houses per pattern, and only
    # where the house genuinely leans into it (≥ EMBODY_MIN pieces).
    desk_house_set = {k[len("house:"):] for k in node_ids if k.startswith("house:")}
    house_pat = defaultdict(int)
    for pc in pieces:
        if pc.brand.key in desk_house_set:
            for pat in desk_patterns:
                if pat.tag in pc.tags:
                    house_pat[(pc.brand.key, pat.tag)] += 1
    by_pattern = defaultdict(list)
    for (bkey, tag), n in house_pat.items():
        if n >= EMBODY_MIN:
            by_pattern[tag].append((n, bkey))
    for tag, hs in by_pattern.items():
        for n, bkey in sorted(hs, reverse=True)[:EMBODY_TOP_HOUSES]:
            once(house_id_from_key(bkey), pattern_id(tag), "embodies", True, "pattern", weight=n)

    # pattern → board (feeds): a board's pinned pieces carry the pattern
    for board in boards:
        board_tags = set()
        for pin in board.pins.select_related("product"):
            pc = by_product.get(pin.product_id)
            if pc:
                board_tags |= set(pc.tags)
        for pat in desk_patterns:
            if pat.tag in board_tags:
                once(pattern_id(pat.tag), board_id(board), "feeds", True, "pattern")

    # house → suggested house (adjacent): one dotted line per suggestion, coloured by the
    # dimension it was surfaced on (aesthetic / region / price).
    for cand, anchor, dim, _reason in suggest_specs:
        once(house_id(anchor), house_id(cand), "adjacent", True, dim, dashed=True)

    # clip → board: a clip pinned to a board draws the accent line
    for nid, bid in clip_pins:
        once(nid, bid, "pinned-to", False, "pin")
    # clip → its house (solid) and the kindred traits it shares (dotted)
    for nid, hid in clip_house_edges:
        once(nid, hid, "made-by", False, "direct")
    for nid, ptag in clip_pattern_edges:
        once(nid, pattern_id(ptag), "exhibits", True, "pattern")

    # ── focus mode: replace the desk with the focused node's neighbourhood (A2). The index
    # rail / stats below are unchanged, so you can still navigate and clear focus.
    focused_on = None
    if focus:
        by_product_str = {str(pc.product.id): pc for pc in pieces}
        brands_by_key = {b.key: b for b in Brand.objects.all()}  # resolve any house, not just corpus ones
        fg = _focus_subgraph(focus, pieces, by_product_str, brands_by_key, follow_date, saved, depth)
        if fg["nodes"]:
            nodes, edges = fg["nodes"], fg["edges"]
            node_ids = {n["id"] for n in nodes}
            focused_on = next((n["label"] for n in nodes if n["id"] == focus), None) or focus

    from library.models import DiaryEntry, Follow, Pin

    # ── the index — the left rail. With no lens it's the FULL catalogue; under a lens it
    # narrows to the slice (pieces/patterns already do via the filtered corpus). List view
    # stays the unfiltered browse-all.
    followed_keys = set(Follow.objects.values_list("brand__key", flat=True))
    index_houses = sorted(
        ({"id": house_id(b), "label": b.name, "sub": b.city or "",
          "followed": b.key in followed_keys, "suggested": not b.in_library,
          "onDesk": house_id(b) in node_ids}
         for b in Brand.objects.all()
         if not lens or house_id(b) in node_ids or _house_matches_lens(b, lens)),
        key=lambda h: (not h["followed"], h["label"]),
    )
    index_pieces = sorted(
        ({"id": piece_id(pc.product), "label": pc.product.title, "sub": pc.brand.name,
          "onDesk": piece_id(pc.product) in node_ids, "pinned": pc.pinned}
         for pc in pieces),
        key=lambda p: (not p["pinned"], p["label"]),
    )
    index_patterns = [{"id": pattern_id(p.tag), "label": p.label, "weight": p.weight} for p in patterns]
    index_boards = [{"id": board_id(b), "label": b.name, "count": b.pins.count()}
                    for b in boards if not lens or _board_matches_lens(b, lens, lens_ids, lens_brands)]
    index_notes = [] if lens else [{"id": note_id(e), "label": (e.note[:44] or str(e.date))} for e in DiaryEntry.objects.all()]

    # fold captured clips into the index; under a lens, only clips that fit the slice
    on_desk_clips = {f"clip:{c.id}" for c in clips}
    for clip in all_clips:
        if lens:
            cb = ((Brand.objects.filter(name__iexact=clip.brand).first()
                   or Brand.objects.filter(name__icontains=clip.brand).first()) if clip.brand else None)
            if not _clip_matches_lens(clip, lens, cb):
                continue
        cid = f"clip:{clip.id}"
        item = {"id": cid, "label": clip.title or clip.text[:40] or "Clipping", "onDesk": cid in on_desk_clips}
        if clip.kind == "house":
            index_houses.insert(0, {**item, "followed": False, "suggested": False, "sub": "clipped"})
        elif clip.kind == "piece":
            index_pieces.insert(0, {**item, "pinned": False, "sub": "clipped"})
        else:
            index_notes.insert(0, item)

    # "Open thread" — the board you've deliberately marked as your current focus.
    thread_board = next((b for b in boards if getattr(b, "is_open_thread", False)), None)
    open_thread = {"label": thread_board.name, "nodeId": board_id(thread_board)} if thread_board else None

    return {
        "nodes": nodes,
        "edges": edges,
        "index": {
            "pieces": index_pieces, "houses": index_houses, "patterns": index_patterns,
            "boards": index_boards, "notes": index_notes,
        },
        "stats": {
            "pinned": Pin.objects.values("product").distinct().count(),
            "follows": Follow.objects.count(),
        },
        "openThread": open_thread,
        "focus": ({"id": focus, "label": focused_on, "count": len(node_ids)} if focused_on else None),
    }


# ── the List view — the whole library as a grouped, image-bearing browse surface ──
def build_graph_list() -> dict:
    """Everything, grouped by type, with thumbnails — the scannable counterpart to the
    spatial desk. Unlike the left rail (curated / search-only pieces), this lists the full
    catalogue so List is where you actually browse."""
    from library.models import Board, Clip as ClipModel, Follow

    followed = set(Follow.objects.values_list("brand__key", flat=True))
    houses = sorted(
        ({"node_id": house_id(b), "label": b.name,
          "sub": b.city or ("following" if b.key in followed else ("suggested" if not b.in_library else "")),
          "image": b.hero_image_url or None, "followed": b.key in followed}
         for b in Brand.objects.all()),
        key=lambda h: (not h["followed"], h["label"]),
    )
    pieces = sorted(
        ({"node_id": piece_id(a.product), "label": a.product.title, "sub": a.product.brand.name,
          "image": a.product.image_url or None}
         for a in PieceAttribute.objects.select_related("product__brand").filter(product__brand__follow__isnull=False)),
        key=lambda p: (p["sub"], p["label"]),
    )
    corpus, _b, _f = _load_corpus()
    kindred = [{"node_id": pattern_id(p.tag), "label": p.label, "sub": f"{p.weight} things", "image": None}
               for p in derive_patterns(corpus)]
    boards = [{"node_id": board_id(b), "label": b.name, "sub": f"{b.items.count()} things", "image": None}
              for b in Board.objects.filter(archived=False)]
    archived = [{"node_id": board_id(b), "label": b.name, "sub": f"{b.items.count()} things", "image": None, "slug": b.slug}
                for b in Board.objects.filter(archived=True)]
    clips = [{"node_id": f"clip:{c.id}", "label": c.title or (c.text[:40] if c.text else "Clipping"),
              "sub": "clipped", "image": c.image_url or None}
             for c in ClipModel.objects.order_by("-created_at")]
    return {"houses": houses, "pieces": pieces, "kindred": kindred, "boards": boards, "archived": archived, "clips": clips}


# ── the lens picker's options — data-driven so it only offers slices that exist ──
def build_graph_lenses() -> dict:
    from django.utils import timezone

    pieces, _b, _f = _load_corpus()
    regions, tiers, aesthetics = Counter(), Counter(), Counter()
    pinned = recent = 0
    cutoff = timezone.now() - timezone.timedelta(days=30)
    for pc in pieces:
        for t in [t.lower() for t in (pc.brand.tags or [])]:
            (regions if t in REGION_TAGS else aesthetics)[t] += 1
        if pc.brand.tier:
            tiers[pc.brand.tier] += 1
        if pc.pinned:
            pinned += 1
        if pc.date and pc.date >= cutoff:
            recent += 1
    rows = lambda c, cap=None: [{"value": v, "label": v.title(), "count": n} for v, n in c.most_common(cap)]
    return {
        "region": rows(regions),
        "tier": [{"value": t, "label": TIER_LABEL.get(t, t.title()), "count": n} for t, n in tiers.most_common()],
        # full sets — the picker shows a top slice by default and searches across all of these
        "aesthetic": rows(aesthetics),
        "kindred": [{"value": p.tag, "label": p.label, "count": p.weight} for p in derive_patterns(pieces)],
        "state": [{"value": "pinned", "label": "Pinned", "count": pinned},
                  {"value": "recent", "label": "This month", "count": recent}],
    }


# ── small helpers used above ──
def house_id_from_key(key):
    return f"house:{key}"


def add_house(brand, nodes, node_ids, saved, follow_date):
    nid = house_id(brand)
    if nid in node_ids:
        return
    x, y = _seed_xy("house", len([n for n in nodes if n["type"] == "house"]))
    x, y = saved.get(nid, (x, y))
    nodes.append({"id": nid, "type": "house", "label": brand.name, "subtitle": brand.city or "",
                  "tags": (brand.tags or [])[:2], "image": brand.hero_image_url or None,
                  "followed": True, "date": _iso(follow_date.get(brand.key)), "x": x, "y": y})
    node_ids.add(nid)


def _piece_pills(pc) -> list[str]:
    """Two short, distinctive pills for a piece card — value only, no dim prefix."""
    pref = ("neckline:", "silhouette:", "material:", "descriptor:", "details:")
    vals = []
    for want in pref:
        for tag in pc.tags:
            if tag.startswith(want):
                v = tag.split(":", 1)[1].replace("-", " ")
                if v not in vals:
                    vals.append(v)
                break
        if len(vals) >= 2:
            break
    return vals[:2]


def _closest_followed(cand, followed_brands):
    ctags = set(cand.tags or [])
    best, best_shared = None, 0
    for b in followed_brands:
        shared = len(ctags & set(b.tags or []))
        if shared > best_shared:
            best, best_shared = b, shared
    return best


TIER_LABEL = {"luxury": "Luxury Designer", "premium": "Affordable Luxury", "contemporary": "Contemporary"}


def _diverse_suggestions(desk_houses, want):
    """Kindred houses to suggest, deliberately spread across the three dimensions so the
    desk shows aesthetic (terracotta), region (olive) AND price (blue) lines — not just
    aesthetic. Returns specs: [(cand_brand, anchor_brand, dim, reason)]. The dim is the
    *reason we surface it*, which is what the coloured line encodes."""
    cands = list(Brand.objects.filter(in_library=False, dismissed=False))
    specs, used = [], set()

    def add(cand, anchor, dim, reason):
        if cand.key in used or anchor is None:
            return
        used.add(cand.key)
        specs.append((cand, anchor, dim, reason))

    # aesthetic — the Discover engine's affinity picks
    for_you, _expand, _note = discover(limit=want * 3, expand_limit=0)
    for row in for_you:
        if sum(1 for s in specs if s[2] == "aesthetic") >= max(2, want - 2):
            break
        cand = row["brand"]
        anchor = max(desk_houses, key=lambda a: len(set(cand.tags or []) & set(a.tags or [])), default=None)
        if anchor and (set(cand.tags or []) & set(anchor.tags or [])):
            add(cand, anchor, "aesthetic", row["reason"])

    # region — a candidate that shares a place with a desk house
    for cand in cands:
        if any(s[2] == "region" for s in specs):
            break
        anchor = next((a for a in desk_houses
                       if (cand.city and cand.city == a.city)
                       or (set(cand.tags or []) & set(a.tags or []) & REGION_TAGS)), None)
        if anchor:
            place = cand.city or next(iter(set(cand.tags or []) & REGION_TAGS), "the same place")
            add(cand, anchor, "region", f"Also out of {place}, like {anchor.name}")

    # price — a candidate at the same tier as a desk house
    for cand in cands:
        if any(s[2] == "price" for s in specs):
            break
        anchor = next((a for a in desk_houses if cand.tier and cand.tier == a.tier), None)
        if anchor:
            add(cand, anchor, "price", f"{TIER_LABEL.get(cand.tier, cand.tier)}, like {anchor.name}")

    return specs[:want]


# ── detail panel (docs §8: /api/graph/node/<id>/) ──
def build_node_detail(node_id: str) -> dict | None:
    kind, _, rest = node_id.partition(":")
    if kind == "house":
        return _house_detail(rest)
    if kind == "piece":
        return _piece_detail(rest)
    if kind == "pattern":
        return _pattern_detail(rest)
    if kind == "board":
        return _board_detail(rest)
    if kind == "clip":
        return _clip_detail(rest)
    return None


def _clip_detail(clip_id):
    from library.models import Clip
    c = Clip.objects.filter(id=clip_id).select_related("board").first()
    if not c:
        return None
    _KIND_TYPE = {"note": "note", "clip": "clipping", "piece": "piece", "house": "house"}
    ntype = _KIND_TYPE.get(c.kind, "note")
    return {
        "id": f"clip:{c.id}", "type": ntype, "kind": f"{c.get_kind_display()} · clipped",
        "title": c.title or (c.text[:60] if c.text else "Clipping"),
        "desc": c.text or "", "image": c.image_url or None, "tags": list(c.tags or [])[:8],
        "meta": [m for m in [
            ({"k": "House", "v": c.brand} if c.brand else None),
            ({"k": "Piece", "v": c.piece_name} if c.piece_name else None),
            {"k": "Clipped", "v": c.created_at.strftime("%b %d")},
            ({"k": "Link", "v": c.url} if c.url else None),
            ({"k": "Board", "v": c.board.name} if c.board else None),
        ] if m],
        "connected": _connected(f"clip:{c.id}"), "boards": _boards_for_pin(),
        "isHouse": False, "canPin": False,
        # clip-specific: editable payload
        "clip": {"id": str(c.id), "kind": c.kind, "title": c.title, "brand": c.brand,
                 "piece_name": c.piece_name, "text": c.text, "url": c.url, "image_url": c.image_url,
                 "tags": list(c.tags or []), "board_slug": c.board.slug if c.board else None},
    }


def _connected(node_id: str) -> list[dict]:
    g = build_graph()
    by_id = {n["id"]: n for n in g["nodes"]}
    kind_label = {"piece": "Piece", "house": "House", "pattern": "Kindred", "board": "Board", "note": "Note", "clipping": "Clipping"}
    out = []
    for e in g["edges"]:
        other = e["to"] if e["from"] == node_id else (e["from"] if e["to"] == node_id else None)
        if other and other in by_id and not any(o["id"] == other for o in out):
            n = by_id[other]
            out.append({"id": other, "title": n["label"], "kind": kind_label.get(n["type"], n["type"])})
    return out


def _boards_for_pin():
    from library.models import Board
    return [{"id": board_id(b), "name": b.name} for b in Board.objects.filter(archived=False)]


def _house_detail(key):
    b = Brand.objects.filter(key=key).first()
    if not b:
        return None
    from library.models import Follow
    followed = Follow.objects.filter(brand=b).exists()
    lore = getattr(b, "lore", None)
    return {
        "id": house_id(b), "type": "house",
        "kind": "House · node" if followed else "House · suggested",
        "title": b.name, "desc": (lore.essence if lore and lore.essence else b.story) or "",
        "image": b.hero_image_url or None,
        "tags": (b.tags or [])[:6],
        "followed": followed,  # authoritative follow state for the panel's Follow/Unfollow button
        "codes": list(lore.codes) if lore else [],  # signature house codes, surfaced on the panel
        "meta": [{"k": "City", "v": b.city or "—"}, {"k": "Tier", "v": b.get_tier_display() if b.tier else "—"},
                 {"k": "Pieces", "v": str(b.products.count())}],
        "connected": _connected(house_id(b)), "boards": [], "isHouse": True, "canPin": False,
    }


def _piece_detail(pid):
    p = Product.objects.filter(id=pid).select_related("brand").first()
    if not p:
        return None
    attr = getattr(p, "attribute", None)
    tags = [t.split(":", 1)[1].replace("-", " ") for t in (attr.piece_tags if attr else [])][:6]
    return {
        "id": piece_id(p), "type": "piece", "kind": "Piece · node", "title": p.title,
        "desc": "", "image": p.image_url or None, "tags": tags,
        "meta": [{"k": "House", "v": p.brand.name},
                 {"k": "Occasion", "v": p.get_occasion_display()},
                 {"k": "Category", "v": (attr.category if attr else "") or "—"}],
        "connected": _connected(piece_id(p)), "boards": _boards_for_pin(),
        "isHouse": False, "canPin": True,
        # buy link out (docs: piece modal → where to buy)
        "url": p.url or "", "price": p.price_display or "", "house": p.brand.name,
    }


# ── house study: the long view (history & lineage) ──
def build_house_study(key):
    from library.models import Follow

    b = Brand.objects.filter(key=key).first()
    if not b:
        return None
    lore = getattr(b, "lore", None)
    follow = Follow.objects.filter(brand=b).first()
    products = list(b.products.all())
    attrs = PieceAttribute.objects.filter(product__brand=b)
    tag_counts = Counter(
        t for a in attrs for t in (a.piece_tags or []) if t.split(":", 1)[0] not in FACET_DIMS
    )
    top = tag_counts.most_common(1)
    top_label = humanize(top[0][0]) if top else ""

    era = " · ".join(p for p in [b.city, b.founded] if p) or (b.get_tier_display() if b.tier else "In your library")

    facts = []
    if b.city:
        facts.append({"k": "City", "v": b.city})
    if b.founded:
        facts.append({"k": "Founded", "v": b.founded})
    if b.founder:
        facts.append({"k": "Founder", "v": b.founder})
    elif b.designer:
        facts.append({"k": "Designer", "v": b.designer})
    if b.tier:
        facts.append({"k": "Tier", "v": b.get_tier_display()})
    directors = [dict(d) for d in (lore.directors if lore else [])]
    # attach each director's signature collections (archive imagery layer)
    cols_by_director = defaultdict(list)
    for col in b.collections.all().order_by("order"):
        cols_by_director[col.director_name].append({
            "season": col.season, "year": col.year, "title": col.title, "why": col.why,
            "image": col.image_url or None, "credit": col.credit, "source": col.source,
            "sourceUrl": col.source_url or None,
        })
    for d in directors:
        d["collections"] = cols_by_director.get(d.get("name"), [])
    current = next((d for d in directors if d.get("current")), directors[-1] if directors else None)
    if current and current.get("name"):
        facts.append({"k": "Creative director", "v": current["name"]})
    facts.append({"k": "Pieces", "v": str(len(products))})
    if follow:
        facts.append({"k": "Following since", "v": follow.created_at.strftime("%b %Y")})

    # the long view — LLM-derived house history (codes, founding rationale, milestones)
    # when available, else thin structured milestones. Always cap with a personal
    # "into your almanac" milestone that ties the house to YOUR library.
    codes = list(lore.codes) if lore else []
    if lore and lore.history:
        history = [dict(h) for h in lore.history]
    else:
        history = []
        if b.founded:
            history.append({"year": b.founded, "head": f"Founded by {b.founder}" if b.founder else "Founded",
                            "text": f"In {b.city}." if b.city else ""})
        if b.season:
            history.append({"year": "", "head": "Latest", "text": b.season})
    if follow:
        txt = f"{len(products)} pieces in your library"
        txt += f" — {top_label.lower()} keeps returning." if top_label else "."
        history.append({"year": follow.created_at.strftime("%Y"), "head": "Into your almanac", "text": txt})

    # lineage — kindred houses by shared aesthetic tags (the Discover signal)
    lineage = []
    btags = set(b.tags or [])
    if btags:
        scored = []
        for o in Brand.objects.exclude(key=key):
            shared = [t for t in (btags & set(o.tags or [])) if t not in REGION_TAGS]
            if shared:
                scored.append((len(shared), o, shared))
        scored.sort(key=lambda x: (-x[0], x[1].name))
        for n, o, sh in scored[:4]:
            note = "Both " + ", ".join(sh[:2]) + "."
            lineage.append({"id": house_id(o), "name": o.name, "rel": f"{n} shared", "note": note})

    # seasons in the archive — the house's imagery
    looks = [{"label": p.title, "note": p.get_occasion_display(), "image": p.image_url}
             for p in products if p.image_url][:8]
    if not looks:
        looks = [{"label": f"Look {lk.index + 1}", "note": lk.season or "", "image": lk.image_url or None}
                 for lk in b.looks.all()[:8]]
    look_note = f"{len(products)} in your library" if products else (b.season or "")

    # essence (a sharp one-liner) reads best as the handwritten aside; fall back to a
    # derived pattern line, then the lede.
    if lore and lore.essence:
        aside = lore.essence
    elif top_label:
        aside = f"the {top_label.lower()} runs through the whole house"
    else:
        aside = ""

    return {
        "title": b.name, "city": b.city, "era": era, "lede": b.story or "",
        "codes": codes, "aside": aside, "facts": facts, "history": history, "lineage": lineage,
        "directors": directors, "looks": looks, "lookNote": look_note, "connected": _connected(house_id(b)),
    }


def _pattern_detail(tag):
    pieces, _boards, _fd = _load_corpus()
    pats = {p.tag: p for p in derive_patterns(pieces)}
    pat = pats.get(tag)
    if not pat:
        return None
    return {
        "id": pattern_id(tag), "type": "pattern", "kind": "Kindred · from your saves",
        "title": pat.label, "desc": f"Nishi noticed this: {pat.weight} saves across "
        f"{len(pat.houses)} houses and {len(pat.categories)} categories.", "image": None,
        "tags": sorted(pat.categories),
        "meta": [{"k": "Weight", "v": f"{pat.weight} saves"},
                 {"k": "Houses", "v": str(len(pat.houses))},
                 {"k": "Categories", "v": ", ".join(sorted(pat.categories)) or "—"}],
        "connected": _connected(pattern_id(tag)), "boards": [], "isHouse": False, "canPin": False,
    }


def _board_detail(slug):
    from library.models import Board
    b = Board.objects.filter(slug=slug).first()
    if not b:
        return None
    return {
        "id": board_id(b), "type": "board", "kind": "Board · yours", "title": b.name,
        "desc": b.description or "", "image": None, "tags": list(b.tags or [])[:6],
        "meta": [{"k": "Contents", "v": f"{b.items.count()} things"}],
        "connected": _connected(board_id(b)), "boards": [], "isHouse": False, "canPin": False,
    }


# ── a board is its own composed sub-graph (docs: boards = specific graphs you assemble) ──
def _pills_from_tags(tags) -> list[str]:
    class _P:  # _piece_pills wants a .tags attribute
        pass
    p = _P(); p.tags = tags
    return _piece_pills(p)


def _house_kindred_dim(a, b):
    """Why two member houses are kindred — the dimension the coloured line encodes.
    Aesthetic (a shared non-region tag) is the strongest signal, then place, then price."""
    ta, tb = set(a.tags or []), set(b.tags or [])
    if (ta & tb) - REGION_TAGS:
        return "aesthetic"
    if (a.city and a.city == b.city) or (ta & tb & REGION_TAGS):
        return "region"
    if a.tier and a.tier == b.tier:
        return "price"
    return None


def build_board_graph(slug: str) -> dict | None:
    """Resolve a board's gathered items into a focused sub-graph: only its members,
    each at its per-board position, with the graph lines drawn *between* them."""
    from library.models import Board, Clip as ClipModel, DiaryEntry, Follow

    board = Board.objects.filter(slug=slug).first()
    if not board:
        return None
    items = list(board.items.all())
    pos = {it.node_id: (it.x, it.y) for it in items}
    local_items = {it.node_id: it for it in items if it.local_kind}  # board-only moodboard content
    ids = [it.node_id for it in items]

    def rest_of(prefix):
        return [nid.split(":", 1)[1] for nid in ids if nid.startswith(prefix)]

    products = {str(p.id): p for p in Product.objects.filter(id__in=rest_of("piece:")).select_related("brand")}
    attrs = {str(a.product_id): a for a in PieceAttribute.objects.filter(product_id__in=rest_of("piece:"))}
    brands = {b.key: b for b in Brand.objects.filter(key__in=rest_of("house:"))}
    clips = {str(c.id): c for c in ClipModel.objects.filter(id__in=rest_of("clip:"))}
    notes = {str(e.id): e for e in DiaryEntry.objects.filter(id__in=rest_of("note:"))}
    follow_date = dict(Follow.objects.values_list("brand__key", "created_at"))
    _KIND_TYPE = {"note": "note", "clip": "clipping", "piece": "piece", "house": "house"}

    nodes, member_pieces, member_houses, member_patterns = [], {}, {}, set()
    for nid in ids:
        kind, _, rest = nid.partition(":")
        x, y = pos.get(nid, (0, 0))
        if kind == "piece":
            p = products.get(rest)
            if not p:
                continue
            tags = list((attrs.get(rest).piece_tags if attrs.get(rest) else []) or [])
            nodes.append({"id": nid, "type": "piece", "label": p.title, "subtitle": p.brand.name,
                          "tags": _pills_from_tags(tags), "image": p.image_url or None,
                          "date": _iso(p.published_at or p.created_at), "x": x, "y": y})
            member_pieces[nid] = (p, set(tags))
        elif kind == "house":
            b = brands.get(rest)
            if not b:
                continue
            nodes.append({"id": nid, "type": "house", "label": b.name, "subtitle": b.city or "",
                          "tags": (b.tags or [])[:2], "image": b.hero_image_url or None,
                          "followed": True, "date": _iso(follow_date.get(b.key)), "x": x, "y": y})
            member_houses[nid] = b
        elif kind == "pattern":
            nodes.append({"id": nid, "type": "pattern", "label": humanize(rest), "subtitle": "kindred",
                          "tags": [], "image": None, "date": None, "x": x, "y": y})
            member_patterns.add(rest)
        elif kind == "clip":
            c = clips.get(rest)
            if not c:
                continue
            nodes.append({"id": nid, "type": _KIND_TYPE.get(c.kind, "note"),
                          "label": c.title or (c.text[:40] if c.text else "Clipping"), "subtitle": "clipped",
                          "tags": (c.tags or [])[:3], "image": c.image_url or None,
                          "date": _iso(c.created_at), "x": x, "y": y})
        elif kind == "note":
            e = notes.get(rest)
            if not e:
                continue
            nodes.append({"id": nid, "type": "note", "label": (e.note[:44] or str(e.date)),
                          "subtitle": "diary", "tags": [], "image": None, "date": _iso(getattr(e, "created_at", None)), "x": x, "y": y})
        elif kind == "local":
            it = local_items.get(nid)
            if not it:
                continue
            if it.local_kind == "note":
                nodes.append({"id": nid, "type": "note", "label": it.text or "Note", "subtitle": "note",
                              "tags": [], "image": None, "date": None, "x": x, "y": y})
            elif it.local_kind == "image":
                nodes.append({"id": nid, "type": "clipping", "label": it.text or "Image", "subtitle": "on this board",
                              "tags": [], "image": it.image_url or None, "date": None, "x": x, "y": y})
            elif it.local_kind == "color":
                nodes.append({"id": nid, "type": "swatch", "label": it.color or "#000", "subtitle": "swatch",
                              "tags": [], "image": None, "color": it.color, "date": None, "x": x, "y": y})
            elif it.local_kind == "link":
                nodes.append({"id": nid, "type": "link", "label": it.text or it.url, "subtitle": it.url,
                              "tags": [], "image": None, "url": it.url, "date": None, "x": x, "y": y})

    node_id_set = {n["id"] for n in nodes}
    edges, seen = [], set()

    def once(a, b, etype, derived, dim, **kw):
        if a not in node_id_set or b not in node_id_set or a == b or (a, b, etype) in seen:
            return
        seen.add((a, b, etype))
        edges.append({"from": a, "to": b, "type": etype, "derived": derived, "dim": dim, **kw})

    for nid, (p, tags) in member_pieces.items():
        once(nid, f"house:{p.brand.key}", "made-by", False, "direct")         # solid, if its house is here too
        for tag in member_patterns:
            if tag in tags:
                once(nid, f"pattern:{tag}", "exhibits", True, "pattern")        # dotted
    hlist = list(member_houses.items())
    for i in range(len(hlist)):
        for j in range(i + 1, len(hlist)):
            (na, ba), (nb, bb) = hlist[i], hlist[j]
            dim = _house_kindred_dim(ba, bb)
            if dim:
                once(na, nb, "adjacent", True, dim, dashed=True)                # coloured, kindred

    # your own drawn connections — authored, board-only, always shown (not gated by kinship)
    for be in board.edges.all():
        if be.from_node_id in node_id_set and be.to_node_id in node_id_set:
            edges.append({"from": be.from_node_id, "to": be.to_node_id, "type": "connects",
                          "derived": False, "dim": "authored", "label": be.label or ""})

    return {
        "board": {"slug": board.slug, "name": board.name, "description": board.description,
                  "tags": list(board.tags or []), "count": len(nodes),
                  "isOpenThread": board.is_open_thread},
        "nodes": nodes, "edges": edges,
    }
