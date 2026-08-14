# Multi-focus — holding several houses side by side

## The gap

Single focus isolates *one* node's neighborhood. There's no way to hold two or
three houses at once and see where they overlap. "Houses as a lens" was the wrong
shape for this — entities aren't facets. This is a **focus-set / comparison**
capability, layered on the focus machinery we already have.

## The core idea

Focus becomes a **set**. Each focused house is an **anchor**, pinned as a pole on
the stage. We draw the *union* of their neighborhoods; any node reachable from more
than one anchor drifts to the middle and gets highlighted.

The force layout does the work for us — shared kindred / aesthetics are linked to
multiple poles, so they settle *between* them. An emergent Venn appears without us
ever drawing one.

> Union is the substrate; the **intersection is the insight**. The connective
> tissue between the houses — what they share — is exactly what we emphasize.

## Interaction

- **Plain click (index)** — focus one house. Unchanged.
- **⌘ / ⇧-click (index)** — add / remove a house from the focus set.
- **"+ Compare" affordance** — an explicit control (on index-row hover, and in the
  focus bar) for discoverability; not everyone reaches for modifier-click.
- **Focus-set bar** — replaces the single focus header: a row of removable chips,
  one per anchor, plus "clear all". Same language as the lens pills.
- **"Only shared" toggle** — collapse to the intersection: hide the exclusive
  neighbors, show just what the anchors have in common. The power view for
  "why are these kin?"

## Layout / physics

- Anchors pinned as fixed poles, auto-spread (2 → left/right, 3 → triangle …).
- Exclusive neighbors cluster around their own anchor.
- Shared neighbors, linked to multiple anchors, settle between them.
- **Shared** nodes highlighted with the muted terracotta accent (outline + brought
  forward). Exclusive nodes stay normal, slightly receded. Anchors keep the house
  style with a subtle anchor ring.

## Decisions (recommended)

- Default = **union view**, shared highlighted. "Only shared" = intersection.
- **Lenses compose**: the focus set is the substrate, lenses filter *within* it —
  exactly how single focus + lens already behaves. No conflict.
- **Scope**: houses first (the named gap), but the backend stays node-agnostic
  (`focus` is already a node id), so pieces / boards get it for free later.
- **Caps**: a per-anchor neighbor cap (each house fairly represented) plus a global
  ceiling. Depth defaults to 1 in multi-focus — depth × anchors explodes fast; the
  depth control still exists for the single-anchor case.

## Backend

- `focus` accepts comma-separated ids → a focus set.
- Union the neighborhoods; tag each node with `sharedBy` (which anchors reach it)
  and a `shared` degree.
- Response `focus` becomes an array of anchors; nodes carry their `shared` degree;
  anchors are flagged fixed so the client pins them.

## Frontend

- `useGraph(focus: string | string[], …)`.
- Focus-set bar (chips + "clear all"), "+ Compare", "Only shared" toggle.
- Layout: pin anchors as poles; highlight shared nodes; recede exclusives.

## Phasing

1. **Set + union.** ✅ *Shipped 2026-08-14.* Backend focus-set + `shared` tagging;
   COMPARE chip bar (removable, cap 5); ⌘/⇧-click to accumulate; anchors seeded as
   poles with exclusives fanned out and shared nodes pulled to centre; anchor pole
   ring + shared highlight. Multi-focus lays out fresh (ignores saved/posOverride) and
   drags are transient, so the main arrangement is never disturbed.
2. **Comparison emphasis.** "Only shared" intersection toggle (shared-by-all) — the
   Venn payoff. Shared-by-≥2 highlight already lands in Phase 1.
3. **(Optional) Reach.** Compare from the house panel and on-desk; generalize the
   affordances beyond houses.

## Locked decisions (2026-08-14)

- **Max anchors = 5.** Beyond that the poles turn to mush; the "+ compare" /
  ⌘-click stops adding once five are held.
- **"Shared" = shared-by-≥2 is highlighted**; **shared-by-all** is what the
  "Only shared" toggle isolates. (With two anchors these collapse to the same set.)
- **Poles auto-spread on first view, but stay draggable.** We seed fixed pole
  positions when the focus set changes, then release them to normal drag once
  placed — same feel as the rest of the desk.
