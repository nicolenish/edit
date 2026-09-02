"""Piece enrichment — the vision/LLM pass that gives the taste graph its depth.

For one Product we send its image + title to a fast Claude model and force a
category-aware structured attribute object out via structured outputs. The object
is stored on PieceAttribute, and flattened to `dim:value` piece_tags so pattern
derivation (docs/taste-graph.md §5) is a plain aggregation.

Single responsibility: `enrich_product(product)` -> (attributes_dict, piece_tags).
The management command `enrich_pieces` drives the batch; ingest can call it per row.
"""
from __future__ import annotations

import re

import anthropic

# Fast model — this is a few-hundred-item, cost-sensitive batch (docs §4).
MODEL_ID = "claude-haiku-4-5"

CATEGORIES = ["apparel", "footwear", "jewelry", "bag", "accessory", "activewear"]

# One flat, category-aware schema. Shared dims are required (they hold cross-category
# taste — a "soft rose" or "sculptural gold" across a ring AND a coat). Category-specific
# blocks are optional: the model fills only the ones that apply and omits the rest.
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "category": {
            "type": "string",
            "enum": CATEGORIES,
            "description": "The kind of object shown.",
        },
        # -- shared: true of any piece, this is where cross-category taste lives --
        "material": {
            "type": "string",
            "description": "Dominant material, one or two words, lowercase. "
            "e.g. cotton, silk, wool, cashmere, leather, denim, linen, gold, "
            "silver, pearl, enamel, gemstone, suede, technical.",
        },
        "palette": {
            "type": "array",
            "items": {"type": "string"},
            "description": "1-3 colour families, lowercase. e.g. black, ecru, rose, "
            "olive, camel, navy, gold, undyed, multi.",
        },
        "formality": {
            "type": "string",
            "enum": ["casual", "day", "evening", "occasion", "active"],
            "description": "How dressed-up the piece reads.",
        },
        "descriptors": {
            "type": "array",
            "items": {"type": "string"},
            "description": "2-3 free aesthetic words, lowercase. e.g. sculptural, "
            "soft, romantic, minimal, playful, structured.",
        },
        # -- apparel --
        "garment_type": {"type": "string", "description": "apparel only: e.g. coat, dress, sweater, trouser, skirt, top."},
        "silhouette": {"type": "string", "description": "apparel only: e.g. oversized, tailored, bias-cut, a-line, boxy."},
        "neckline": {"type": "string", "description": "apparel only: e.g. collar, crew, v-neck, boat, halter."},
        "length": {"type": "string", "description": "apparel only: e.g. cropped, midi, maxi, mini, full."},
        "details": {
            "type": "array",
            "items": {"type": "string"},
            "description": "apparel only: notable construction details, lowercase. "
            "e.g. pleated, undyed, structured, ruffled, quilted.",
        },
        # -- footwear --
        "shoe_type": {"type": "string", "description": "footwear only: flat, heel, boot, sneaker, mule, ballet, sandal."},
        "heel": {"type": "string", "description": "footwear only: e.g. none, kitten, block, stiletto."},
        "toe": {"type": "string", "description": "footwear only: e.g. round, pointed, square, almond."},
        # -- jewelry --
        "jewelry_type": {"type": "string", "description": "jewelry only: necklace, ring, earring, bracelet, cuff, brooch."},
        "motif": {"type": "string", "description": "jewelry only: e.g. chain, solitaire, hoop, signet, pendant."},
        "scale": {"type": "string", "description": "jewelry only: e.g. delicate, statement, chunky."},
        # -- bag / accessory --
        "bag_type": {"type": "string", "description": "bag/accessory only: e.g. tote, shoulder, clutch, crossbody, belt, scarf, hat."},
        "structure": {"type": "string", "description": "bag/accessory only: e.g. structured, slouchy, soft."},
        "hardware": {"type": "string", "description": "bag/accessory only: e.g. gold, silver, none, chain."},
        # -- activewear --
        "activewear_type": {"type": "string", "description": "activewear only: legging, short, sports-bra, jacket, tank."},
        "support": {"type": "string", "description": "activewear only: e.g. light, medium, high."},
        "technical": {"type": "string", "description": "activewear only: e.g. compression, moisture-wicking, seamless."},
    },
    "required": ["category", "material", "palette", "formality", "descriptors"],
}

SYSTEM = (
    "You are a fashion cataloguer with a precise eye. You look at one product image "
    "and its title and describe the object's attributes. Classify the category first, "
    "then fill the shared dimensions and only the fields that apply to that category. "
    "Use lowercase, one or two words per value. Describe what you actually see; do not "
    "guess at fields the image doesn't support."
)

# We force this tool but do NOT set `strict`: a 20-field category-aware schema exceeds
# the grammar-compilation limit ("Schema is too complex for compilation"). Non-strict
# forced tool use keeps the schema as strong guidance (the field descriptions steer the
# model) and returns a structured object; we validate defensively in code.
TOOL = {
    "name": "catalog_piece",
    "description": "Record the catalogued attributes of the piece shown.",
    "input_schema": SCHEMA,
}

# Fields that are lists in the schema (flatten each element to its own tag).
_LIST_FIELDS = {"palette", "descriptors", "details"}
# Fields whose value carries taste across categories → tag prefix; the rest are
# category-specific and tagged under their own field name.
_SHARED_PREFIX = {"material": "material", "palette": "palette", "formality": "formality", "descriptors": "descriptor"}


_SCHEMA_FIELDS = set(SCHEMA["properties"])


def clean_attrs(raw: dict) -> dict:
    """Defensive validation for the non-strict tool output: keep only known schema
    fields, drop empties, coerce category to a valid enum, and force list-typed fields
    to real lists (the model sometimes returns a bare string like "camel" or
    "gold, rose" where the schema wants a list). Cheap insurance since the model isn't
    grammar-constrained."""
    out = {}
    for field, value in (raw or {}).items():
        if field not in _SCHEMA_FIELDS or value in (None, "", []):
            continue
        if field in _LIST_FIELDS:
            if isinstance(value, str):
                value = re.split(r"[,/&]", value)  # split a "gold, rose" string
            value = [v.strip() for v in value if str(v).strip()]
            if not value:
                continue
        out[field] = value
    if out.get("category") not in CATEGORIES:
        out["category"] = ""  # unknown/malformed category → leave unset, still tag the rest
    return out


def _slug(v: str) -> str:
    # lowercase, punctuation → single hyphen, trim (so "cropped, oversized" → "cropped-oversized")
    return re.sub(r"[^a-z0-9]+", "-", str(v).lower()).strip("-")


def flatten_tags(attrs: dict) -> list[str]:
    """Turn the structured object into a flat list of `dim:value` tags for pattern
    counting. Shared dims use a taste-forward prefix; category-specific fields use
    their field name. `category` itself is not a tag (it's the axis, not a value)."""
    tags: list[str] = []
    for field, value in attrs.items():
        if field == "category" or value in (None, "", []):
            continue
        prefix = _SHARED_PREFIX.get(field, field)
        values = value if field in _LIST_FIELDS else [value]
        for v in values:
            s = _slug(v)
            if s:
                tags.append(f"{prefix}:{s}")
    # de-dupe, keep order
    seen, out = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def enrich_product(product, client: anthropic.Anthropic | None = None) -> tuple[dict, list[str]]:
    """Run the vision pass for one Product. Returns (attributes, piece_tags).

    Raises if the product has no usable image, or on an API/parse error (the
    command decides how to handle those per row)."""
    if not product.image_url:
        raise ValueError("product has no image_url to enrich")

    client = client or anthropic.Anthropic()
    resp = client.messages.create(
        model=MODEL_ID,
        max_tokens=1024,
        system=SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": product.image_url}},
                    {"type": "text", "text": f"Title: {product.title}"},
                ],
            }
        ],
        tools=[TOOL],
        tool_choice={"type": "tool", "name": TOOL["name"]},
    )
    # tool_choice forces the tool, so the response carries a tool_use block whose
    # `input` is the attribute object (already parsed by the SDK).
    tool_use = next(b for b in resp.content if b.type == "tool_use")
    attrs = clean_attrs(tool_use.input)
    return attrs, flatten_tags(attrs)


# ── capture triage: classify a clipped thought / link / image into a node kind ──
CAPTURE_SYSTEM = (
    "You triage captures for a personal fashion 'second brain'. Given a thought, a link, "
    "and/or an image, classify what it is:\n"
    "- 'house' — it's about a fashion house or brand (a label name, a brand's site).\n"
    "- 'piece' — it's a specific garment or product (a particular coat, bag, shoe).\n"
    "- 'clip' — an image, a look, an editorial or an article link to save as inspiration.\n"
    "- 'note' — a plain thought, reminder, or idea in words.\n"
    "Give a short human title and 2-5 tags (aesthetic descriptors, materials, colours, "
    "silhouettes — lowercase). Prefer 'clip' when there's an image or an inspiration link, "
    "'note' for plain text. Only 'house'/'piece' when it clearly names one."
)

CAPTURE_TOOL = {
    "name": "triage_capture",
    "description": "Classify a captured item and give it a title and tags.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "kind": {"type": "string", "enum": ["note", "clip", "piece", "house"]},
            "title": {"type": "string", "description": "A short human-readable title."},
            "tags": {"type": "array", "items": {"type": "string"}, "description": "2-5 lowercase tags."},
        },
        "required": ["kind", "title", "tags"],
    },
}


def _fetchable(u: str) -> bool:
    """A URL the Anthropic API can actually load: public http(s), not a local upload."""
    return (u.startswith(("http://", "https://"))
            and "localhost" not in u and "127.0.0.1" not in u and "/media/" not in u)


def classify_capture(text="", url="", image_url="", client: anthropic.Anthropic | None = None) -> dict:
    """Triage a capture into {kind, title, tags} with a fast model (+ vision if an image)."""
    # A pasted/uploaded image with no words → it's a clipping; skip the vision call, since
    # the model can't fetch a local /media upload anyway.
    if image_url and not text and not url and not _fetchable(image_url):
        return {"kind": "clip", "title": "Clipping", "tags": [], "model_id": MODEL_ID}

    client = client or anthropic.Anthropic()
    content = []
    if image_url and _fetchable(image_url):
        content.append({"type": "image", "source": {"type": "url", "url": image_url}})
    brief = "\n".join(p for p in [f"Thought: {text}" if text else "", f"Link: {url}" if url else ""] if p)
    content.append({"type": "text", "text": brief or "(an image clipping)"})
    resp = client.messages.create(
        model=MODEL_ID, max_tokens=400, system=CAPTURE_SYSTEM,
        messages=[{"role": "user", "content": content}],
        tools=[CAPTURE_TOOL], tool_choice={"type": "tool", "name": CAPTURE_TOOL["name"]},
    )
    data = next(b for b in resp.content if b.type == "tool_use").input
    kind = data.get("kind") if data.get("kind") in ("note", "clip", "piece", "house") else "note"
    raw_tags = data.get("tags") or []
    if isinstance(raw_tags, str):  # model sometimes returns a string, not a list
        raw_tags = re.split(r"[,/]", raw_tags)
    tags = [str(t).strip().lower() for t in raw_tags if str(t).strip()][:5]
    return {"kind": kind, "title": str(data.get("title", "")).strip()[:200], "tags": tags, "model_id": MODEL_ID}


# ── house lore: the "long view" — codes, essence, real history ──
# A capable model that actually knows fashion history (the piece pass uses fast Haiku;
# here accuracy of real house codes/milestones matters more than cost — ~84 one-time calls).
HOUSE_MODEL_ID = "claude-opus-5"

HOUSE_SYSTEM = (
    "You are a fashion historian and critic with deep knowledge of design houses. For the "
    "given house, produce:\n"
    "- HOUSE CODES — the signature aesthetic motifs, materials, silhouettes, and ideas it is "
    "known for (e.g. Schiaparelli: the human body, surrealism, trompe-l'oeil, gold; Chanel: "
    "tweed, jersey, the little black dress, costume pearls).\n"
    "- ESSENCE — one line: its core idea, or why it exists (Chanel was founded to free women "
    "from corsetry).\n"
    "- HISTORY — the founder's intent and the milestones that established those codes.\n"
    "- DIRECTORS — the creative directors who have shaped the house, in order. For each, give "
    "their tenure (era), whether they are current, and a critic's read on their VISION: how "
    "they interpreted or reinvented the house's codes (e.g. Lagerfeld at Chanel: revived a "
    "dormant house by treating its codes as a remixable vocabulary; Roseberry at Schiaparelli: "
    "turned the surrealist gold into viral, sculptural spectacle). One or two sharp sentences.\n\n"
    "If you genuinely recognise this specific house, give accurate, specific facts and set "
    "known=true. If you do NOT recognise it, set known=false and derive the codes and essence "
    "ONLY from the provided notes and tags — do NOT invent founders, dates, directors, or "
    "events you are unsure of; leave directors empty rather than guessing, and keep history to "
    "what the notes support plus the aesthetic identity. Never fabricate specifics. Write in "
    "ÉDIT's voice: precise, warm, a critic who loves clothes."
)

HOUSE_TOOL = {
    "name": "house_lore",
    "description": "Record the house's codes, essence, and real history.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "known": {"type": "boolean", "description": "true ONLY if you genuinely recognise this specific house"},
            "codes": {
                "type": "array", "items": {"type": "string"},
                "description": "3-6 signature house codes — motifs, materials, silhouettes, ideas. Short lowercase phrases, e.g. 'the human body', 'tweed', 'undyed cotton'.",
            },
            "essence": {"type": "string", "description": "One sharp sentence: the house's core idea, or why it exists."},
            "history": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {
                        "year": {"type": "string", "description": "Year or era, e.g. '1927' or '1980s'. Empty string if genuinely unknown."},
                        "head": {"type": "string", "description": "Short headline for the milestone."},
                        "text": {"type": "string", "description": "1-2 sentences: what happened and why it matters to the house's codes."},
                    },
                    "required": ["head", "text"],
                },
                "description": "3-6 milestones, founding rationale first, then the moments that set the codes.",
            },
            "directors": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string", "description": "The creative director / designer."},
                        "era": {"type": "string", "description": "Their tenure, e.g. '1983–2019' or '2019–present'."},
                        "current": {"type": "boolean", "description": "true if they currently lead the house."},
                        "vision": {"type": "string", "description": "A critic's read: how they interpreted or reinvented the house's codes. 1-2 sentences."},
                    },
                    "required": ["name", "era", "current", "vision"],
                },
                "description": "Creative directors in chronological order (empty if you don't reliably know them). Mark the current one.",
            },
        },
        "required": ["known", "codes", "essence", "history", "directors"],
    },
}


# ── signature collections per director (archive imagery layer) ──
COLLECTIONS_SYSTEM = (
    "You are a fashion historian. Given a house and its creative directors, name the "
    "SIGNATURE COLLECTIONS that defined each director's tenure — the shows people still cite. "
    "For each: which director, the season (e.g. 'Fall 2019' or 'Spring 2003'), the year, a short "
    "title or theme, and a one-sentence critic's read of why it mattered. Give 1-3 per director, "
    "chronological. Only include collections you genuinely know — never invent seasons or shows. "
    "If you don't reliably know a director's collections, omit them."
)

COLLECTIONS_TOOL = {
    "name": "signature_collections",
    "description": "Record the signature collections for the house's directors.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "collections": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {
                        "director": {"type": "string", "description": "The creative director (match one of the names given)."},
                        "season": {"type": "string", "description": "e.g. 'Fall 2019', 'Spring/Summer 2003'."},
                        "year": {"type": "string", "description": "The year, e.g. '2019'."},
                        "title": {"type": "string", "description": "A short title or theme for the collection."},
                        "why": {"type": "string", "description": "One sentence: why this collection mattered."},
                    },
                    "required": ["director", "season", "year", "title", "why"],
                },
                "description": "Signature collections, chronological. Empty if you don't reliably know any.",
            },
        },
        "required": ["collections"],
    },
}


def enrich_collections(brand, directors, client: anthropic.Anthropic | None = None) -> list[dict]:
    """Given a house and its known directors, return their signature collections."""
    if not directors:
        return []
    client = client or anthropic.Anthropic()
    roster = "; ".join(f"{d.get('name')} ({d.get('era')})" for d in directors if d.get("name"))
    brief = (
        f"House: {brand.name}\nCity: {brand.city or '—'}\nFounded: {brand.founded or '—'}\n"
        f"Creative directors: {roster}"
    )
    resp = client.messages.create(
        model=HOUSE_MODEL_ID, max_tokens=3000, system=COLLECTIONS_SYSTEM,
        messages=[{"role": "user", "content": brief}],
        tools=[COLLECTIONS_TOOL], tool_choice={"type": "tool", "name": COLLECTIONS_TOOL["name"]},
    )
    data = next(b for b in resp.content if b.type == "tool_use").input
    out = []
    for c in (data.get("collections") or []):
        if not (c.get("season") or c.get("title")):
            continue
        out.append({
            "director": str(c.get("director", "")).strip(),
            "season": str(c.get("season", "")).strip(),
            "year": str(c.get("year", "")).strip(),
            "title": str(c.get("title", "")).strip(),
            "why": str(c.get("why", "")).strip(),
        })
    return out[:16]


def enrich_house(brand, client: anthropic.Anthropic | None = None) -> dict:
    """Derive a house's codes + essence + history. Returns a dict ready for HouseLore."""
    client = client or anthropic.Anthropic()
    brief = (
        f"House: {brand.name}\n"
        f"City: {brand.city or '—'}\n"
        f"Founded: {brand.founded or '—'}\n"
        f"Founder/designer: {brand.founder or brand.designer or '—'}\n"
        f"Tags: {', '.join(brand.tags or []) or '—'}\n"
        f"Notes: {brand.story or '—'}"
    )
    resp = client.messages.create(
        model=HOUSE_MODEL_ID,
        max_tokens=3000,
        system=HOUSE_SYSTEM,
        messages=[{"role": "user", "content": brief}],
        tools=[HOUSE_TOOL],
        tool_choice={"type": "tool", "name": HOUSE_TOOL["name"]},
    )
    data = next(b for b in resp.content if b.type == "tool_use").input
    codes = [str(c).strip() for c in (data.get("codes") or []) if str(c).strip()][:6]
    history = [
        {"year": str(h.get("year", "")).strip(), "head": str(h.get("head", "")).strip(), "text": str(h.get("text", "")).strip()}
        for h in (data.get("history") or []) if h.get("head")
    ][:6]
    directors = [
        {"name": str(d.get("name", "")).strip(), "era": str(d.get("era", "")).strip(),
         "current": bool(d.get("current")), "vision": str(d.get("vision", "")).strip()}
        for d in (data.get("directors") or []) if d.get("name")
    ][:8]
    return {
        "codes": codes,
        "essence": str(data.get("essence", "")).strip(),
        "history": history,
        "directors": directors,
        "known": bool(data.get("known")),
    }
