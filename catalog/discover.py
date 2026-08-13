"""Discovery engine — recommend labels the user doesn't follow yet, based on the
aesthetic/region tags, tiers and cities of the houses they DO follow.

Returns two lists:
  for_you  — highest affinity to the current following
  expand   — deliberately adjacent: novel aesthetics to broaden the eye
"""
from collections import Counter

from django.db.models import Count

from .models import Brand

REGION_TAGS = {
    "french", "italian", "scandinavian", "british", "american", "australian",
    "japanese", "korean", "belgian", "dutch", "spanish", "other-intl",
}


def _profile():
    followed = list(Brand.objects.filter(follow__isnull=False))
    tag_freq, cities, tiers = Counter(), Counter(), Counter()
    for b in followed:
        for t in (b.tags or []):
            tag_freq[t] += 1
        if b.city:
            cities[b.city] += 1
        if b.tier:
            tiers[b.tier] += 1
    return followed, tag_freq, cities, tiers


def _reason(cand, followed, tag_freq):
    """Cite the followed house that shares the MOST with this candidate, and name
    the most distinctive (rarest in your following) shared aesthetic tag."""
    ctags = set(cand.tags or [])
    best_f, best_shared = None, []
    for f in followed:
        shared = [t for t in (ctags & set(f.tags or [])) if t not in REGION_TAGS]
        if len(shared) > len(best_shared):
            best_f, best_shared = f, shared
    if best_f and best_shared:
        tag = min(best_shared, key=lambda t: tag_freq[t])  # most distinctive shared tag
        return f"Because you follow {best_f.name} — both {tag}"
    if cand.city:
        same = next((f for f in followed if f.city == cand.city), None)
        if same:
            return f"Also from {cand.city}, like {same.name}"
    return "An editor's pick for your eye"


def discover(limit=12, expand_limit=6):
    followed, tag_freq, cities, tiers = _profile()
    top_tags = {t for t, _ in tag_freq.most_common(8)}
    candidates = Brand.objects.filter(in_library=False, dismissed=False).annotate(
        product_count=Count("products", distinct=True),
        look_count=Count("looks", distinct=True),
    )

    scored = []
    for c in candidates:
        ctags = set(c.tags or [])
        score = float(sum(tag_freq[t] for t in ctags if t in tag_freq))
        if c.tier and tiers.get(c.tier):
            score += tiers[c.tier] * 0.5
        if c.city and cities.get(c.city):
            score += cities[c.city] * 1.0
        novelty = len([t for t in ctags if t not in top_tags and t not in REGION_TAGS])
        scored.append({
            "brand": c,
            "score": score,
            "novelty": novelty,
            "reason": _reason(c, followed, tag_freq),
        })

    scored.sort(key=lambda x: (-x["score"], x["brand"].name))
    for_you = scored[:limit]
    rest = scored[limit:]
    rest.sort(key=lambda x: (-x["novelty"], -x["score"]))
    expand = rest[:expand_limit]
    note = (f"Drawn from the {len(followed)} houses you follow — tag, tier and city."
            if followed else "Follow a few houses and this re-reads itself.")
    return for_you, expand, note
