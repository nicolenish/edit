# Plan: keeping the taste graph legible — lenses, focus, clusters + authored boards

Status: **proposal.** Nothing here is built yet; the phased order is at the end.

---

## The reframe (the why)

The desk is trying to be two things at once: **a complete map** of your taste *and* **a
surface to think on**. Those fight — a map wants completeness, a thinking surface wants
focus. Today the automation optimises for the map (compose everything it can), so it
drowns the thinking. As the library grows this only gets worse.

The composition is already capped (`catalog/graph.py`): `N_DESK_PATTERNS=8`,
`N_DESK_HOUSES=7`, `N_DESK_PIECES=8`, `N_SUGGEST=5` — ~28 nodes. **But clips are
uncapped** (every clip lands on the desk), and each clip can now pull its house onto the
desk too (the brand link we just shipped). So the pressure is real and growing.

The fix is to split the roles and make the default a **deliberate slice**, not the firehose:

| Surface | Role | Connections |
|---|---|---|
| **List** | browse/search everything | none |
| **Graph** | the system's map — *lensed & focused* | auto-derived |
| **Boards** | your authored compositions | **manual** (+ optional auto overlay) |

So: the graph is where you *discover* what relates; a board is where you *decide* what
goes together. List carries the burden of "show me everything," which frees the graph
from needing completeness.

> **Naming note.** The current `lens` state (`'free' | 'diary'`, the "Yours / By day
> clipped" toggle) is really **arrangement** — it controls *position*, not *which nodes*.
> This plan introduces a separate *filter* axis. To avoid collision I'll rename the
> existing state `arrangement` and use **lens** for the new filter concept.

---

## Part A — Graph legibility

### A1. Lenses (facet views) — *the highest-leverage change*

A **lens** is a saved filter the desk obeys; you look at **one lens at a time**. It turns
an overwhelming whole into a handful of intentional slices.

**Kinds of lens**
- *Facet* (auto-generated from your data): region (`French`, `Italian`…), price tier
  (`luxury` / `premium` / `contemporary`), a single aesthetic tag (`minimalist`),
  category (`eveningwear`), or a single kindred trait (`Black`, `Tailored`).
- *State*: `pinned only`, `followed only`, `this month`.
- *Saved* (hand-built): you combine facets and save with a name ("French eveningwear").

**UX**
- A lens picker (chips or a dropdown) next to the arrangement toggle in the desk header.
- Selecting a lens re-composes the desk from only the matching slice. "All" clears it.
- Active lens shown as a removable chip; a "＋ save this view" when a facet combo is on.

**Backend** (`catalog/graph.py`, `views.py`)
- `build_graph(focus=None, lens=None)` — `lens` is a filter spec (e.g.
  `{"region":"french"}`, `{"tier":"luxury","state":"pinned"}`). Applied to the corpus
  *before* composition, so the top-N picks come from the slice, not the whole.
- New `/api/graph/lenses/` (GET) returning the available auto-facet lenses with counts,
  so the picker is data-driven (only offer facets that exist).
- `useGraph(focus, lens)` passes the lens through as query params.

**Data model**
- Auto-facet & state lenses need **no storage** (computed).
- Saved lenses: start in **localStorage** (like the arrangement pref). If you want them
  cross-device later, add a tiny `SavedView(name, spec_json)` model + CRUD endpoints.

**Effort:** Medium. Filter logic in `build_graph` + a data-driven picker.
**Risk:** low; composition already isolates the "pick nodes" step.

### A2. Focus-first (local graph)

Change the default from "auto-assemble everything" to "anchor on one thing and show its
neighborhood," with the full map as an explicit zoom-out.

**UX**
- Click any node → **Focus**: desk shows that node + its 1–2 hop neighbours only.
- An "expand" affordance on a focused node walks one hop further out.
- A breadcrumb: `Focused on Givenchy · show full map`. Esc clears.
- **Default home** anchors on something meaningful rather than the whole graph — options:
  your **open-thread board**, your **most recent pins/clips**, or a gentle "pick a
  starting point" empty state. (Recommend: open thread if set, else recent activity.)

**Backend**
- `build_graph(focus=node_id, depth=1|2)` must become a *real neighbourhood filter*.
  Today `focus` only *marks* the node (`"focus": focus if focus in node_ids`) — it does
  not restrict the set. Add: compute the focus node's neighbours (via the same edge
  rules) out to `depth`, and compose only those.

**Frontend**
- A `focus` state (node id) + depth; when set, `useGraph(focus, …)` fetches the
  neighbourhood. The detail panel gains a "Focus on the desk" action.

**Effort:** Medium. Neighbourhood query + focus UI + default-anchor logic.
**Dependency:** independent of A1, but they compose (a lens *and* a focus).

### A3. Cluster collapse (semantic zoom) — *scale endgame, do last*

When zoomed out, fold a group into a single **hub node** you expand on click, so node
count stays sane no matter how big the library gets.

**UX (two flavours — recommend starting with manual)**
- *Manual collapse:* a kindred/region group can be collapsed to a hub ("24 minimalist
  houses"); click to expand in place. Explicit, predictable.
- *Semantic (auto) zoom:* below a zoom threshold, groups auto-collapse to hubs; zooming
  in expands them. Slicker, but trickier to get right.

**Backend**
- A new node type `cluster` from `build_graph` (dimension-driven: cluster houses by a
  shared kindred / region / "house family"), carrying a member count + member ids for
  expand.

**Frontend**
- Render `cluster` nodes; expand/collapse state; (for semantic zoom) tie collapse to
  `scale.current`.

**Effort:** High. New node type + expand/collapse state + zoom-aware rendering.
**Dependency:** best after A1/A2 — lenses + focus may reduce the need enough that we
scope this down.

---

## Part B — Boards

### B1. Manual connections — *the point of a board*

The auto-graph is **descriptive** (what *is* connected). A board is **authored** (what you
*want* together). Auto-edges can't say "this gown *with* this gold," "this note anchors
these three pieces," "this is the *alternative* to that." So boards get your own edges.

**UX**
- **Drag-to-connect:** hover a node to reveal a small connector handle; drag from it to
  another node → draws a manual edge. (The handle distinguishes connect from move.)
- Optional **label** on the edge ("goes with", "alt", "the vibe", "wear with") — plain
  freeform text to start; typed categories only if they earn their keep.
- Click an edge to remove it. Manual edges are **board-only** (like moodboard items).
- Rendered as a distinct style (a deliberate solid ink line, visually different from the
  faint dotted auto-kindred).

**Data model** (`library/models.py`)
- New `BoardEdge(board FK, from_node_id, to_node_id, label, created_at)`. Board-scoped.
  (Note: the existing `Connection` model is unrelated — it's diary "pin-from" sources.)

**Backend**
- `build_board_graph` includes `BoardEdge`s as edges with a new `dim: "authored"`.
- Endpoints: `POST/DELETE /api/graph/board/<slug>/edges/`.

**Frontend**
- Drag-to-connect handles + edge rendering + label input + delete. Reuses the board
  canvas drag machinery.

**Effort:** Medium–High. New model + endpoints + connect interaction + edge rendering.

### B2. Auto-edges as an optional overlay — *quick, pairs with B1*

A board should default to *your* clean canvas (your items + your manual edges), with the
system's kinship as an *optional* overlay you summon when you want context.

**UX**
- A "show kinship" toggle in the board header. **Off by default.** On → the faint dotted
  auto-kindred lines (shared trait, made-by, kindred house↔house) fade in.

**Backend:** none — `build_board_graph` already returns those edges tagged by `dim`.
**Frontend:** filter auto-edge dims by the toggle; manual (`authored`) edges always show.

**Effort:** Low (frontend-only).

---

## Suggested sequence

1. **Phase 1 — relief + a quick board win:** **A1 Lenses** + **B2 overlay toggle**.
   Lenses give the biggest immediate cut to overwhelm; B2 is nearly free and makes boards
   feel like canvases.
2. **Phase 2 — the thinking surface + authored boards:** **A2 Focus-first** +
   **B1 Manual connections**. Together these deliver the reframe: the graph becomes a
   place to focus, boards become a place to compose.
3. **Phase 3 — scale endgame:** **A3 Cluster collapse**, scoped to whatever's still
   needed after Phases 1–2.

Also worth doing early and cheaply, independent of the above: **cap clips on the desk**
(show recent-N, rest reachable via List/lens) — it's the one uncapped source today.

---

## Open questions

1. **Lens origin** — system-suggested facets, hand-saved views, or both? *(Recommend
   both; ship auto-facets first so it's useful day one.)*
2. **Saved-lens storage** — localStorage (simple, this device) vs a backend model
   (cross-device)? *(Recommend localStorage v1.)*
3. **Default home view** once focus-first lands — open-thread board, recent activity, or
   an empty "pick a start"? *(Recommend open thread → recent.)*
4. **Manual-connection labels** — plain lines, freeform labels, or typed categories?
   *(Recommend plain + optional freeform.)*
5. **Cluster dimension** — cluster by kindred, region, or house family? Manual collapse
   or auto semantic-zoom? *(Recommend kindred + manual collapse first.)*
6. **Do lenses apply only to the graph, or also filter List?** *(Recommend graph only at
   first; List keeps its own search.)*

---

## Decisions

1. Lens origin — **both** (auto-facets + hand-saved).
2. Saved-lens storage — **local** (localStorage).
3. Default home view (focus-first anchor) — **deferred.** Decide later; it's a small,
   late add. *(Confirmed: the focus machinery in A2 is the real work; choosing what the
   home anchors on is essentially one setting + a "recent activity" fallback layered on
   top — trivial to slot in once A2 exists. Until then the desk keeps composing as it
   does now.)*
4. Manual-connection labels — **plain + optional freeform** (as recommended).
5. Cluster dimension — **kindred + manual collapse first** (as recommended).
6. Lenses vs List — **separate for now** (graph only; List keeps its own search).

### Locked scope
- **Phase 1 (next):** A1 Lenses (auto-facets + localStorage saved views) + B2 board
  "show kinship" overlay toggle. Plus the cheap early fix: cap clips on the desk.
- **Phase 2:** A2 Focus-first (default anchor still TBD per #3) + B1 Manual connections
  (plain lines, optional freeform label, new `BoardEdge`).
- **Phase 3:** A3 Cluster collapse — kindred dimension, manual collapse.
