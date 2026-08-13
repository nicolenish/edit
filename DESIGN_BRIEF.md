# ÉDIT — Design Brief & Prompt (for iterating in Claude)

Paste the **PROMPT** block below into a new Claude chat to iterate on the visual design. Everything under it is reference Claude can draw on. There's one hard constraint about images — read the ⚠️ section first.

---

## ⚠️ Read this first: images won't load in a Claude Artifact

The real product photos are hosted on Shopify's CDN (`cdn.shopify.com`). Claude Artifacts run under a strict Content-Security-Policy that **blocks every external image, font, and script**. So in the artifact, real product images will *not* render.

**How to design around it:**
- Have Claude render every image area as a **styled placeholder tile** — a fixed `aspect-ratio` box with a subtle gradient/tone and the piece (or brand) name set in it. This keeps layout, rhythm, and motion honest.
- Do the design/motion work on placeholders. When you're happy, bring the direction back to the **local prototype** (`prototype/index.html`), which opens via `file://` in a normal browser where the real Shopify images load fine.
- (Optional) If you want a few *real* thumbnails in the artifact, ask me to export ~6 images as base64 data-URIs and I'll paste them in — data-URIs are allowed under CSP.

Fonts (Google Fonts) also won't load in an artifact — Claude should use a serif/sans **system fallback stack** there (e.g. Georgia + system-ui), and we restore Fraunces + Inter in the local version.

---

## PROMPT — paste this into Claude

> I'm designing **ÉDIT**, a personal "fashion almanac" web app: a place to follow independent/international clothing labels, pin pieces I love, and browse them by occasion. Think **editorial magazine meets an art-gallery index** — closest reference is the Obys Agency site (`experiment.obys.agency/about`): momentum scrolling, a tight numbered table-of-contents, big kinetic typography, hover-preview images, scroll-reveal animations, and a contextual custom cursor.
>
> Build it as a single self-contained HTML page (inline CSS + vanilla JS). **Do not fetch any external images, fonts, or scripts** — render every product/brand image as a styled placeholder tile (aspect-ratio box, soft gradient, piece name inside), and use a system serif + sans font stack. I'll swap real assets in later.
>
> **Structure (top to bottom):**
> 1. A brief loader, then a full-height **hero**: oversized serif headline "The brands worth knowing."
> 2. An **Index** — a tight, numbered two-column list of all the labels (`No.` / `Label` / short meta on the right), hairline rules between rows, pure white. Hovering a row floats a preview image near the cursor and nudges the row. This is the signature moment — match the Obys index feel.
> 3. **The Houses** — a directory grid of brand cards (image, name, piece count, Follow toggle, "Shop ↗").
> 4. Three occasion chapters — **Casual**, **Date Night**, **Events** — each a big serif chapter title + a mixed grid of pieces, brand name labelled on every card. A ♥ pin button on each card (persists to localStorage).
> 5. A **"Follow a label"** input (paste a URL) and a footer.
>
> **Motion:** momentum/eased scroll, line-by-line reveals (headings mask up, cards fade+rise), a custom cursor that grows and shows a contextual label ("pin", "view"), a drifting italic marquee between chapters, and a live side-rail that tracks the active chapter.
>
> **Feel:** white background, near-black warm ink `#14110b`, a single terracotta accent `#8a3b2e`, hairline warm-grey rules `#e6e3dd`. Editorial, calm, lots of negative space, confident type. Display serif for headlines, clean sans for UI/labels.
>
> Use this sample data shape (I'll provide the full set): [paste the DATA SAMPLE block below].
>
> Start by giving me the full page, then I'll direct changes.

---

## Reference appendix

### Concept & goals
- **User problem:** follows lots of brands on Instagram but never keeps up; finds SSENSE overwhelming. Wants a calm, personal wall to follow labels, pin items, and discover adjacent brands.
- **Vibe:** editorial/magazine + kinetic (Obys). Not a store; a *reading room* for labels.
- **Roadmap beyond design:** taste-learning (a "Your eye, so far" readout that profiles pins by occasion/brand/colour), then brand discovery (similar + deliberately-adjacent suggestions).

### Information architecture
- **Chapters = occasion categories** (Casual / Date Night / Events). Pieces from all brands mix within a chapter, brand-labelled.
- **The Houses** = the brand directory (all labels).
- **Index** = numbered list of every label (Obys-style), jumps to that house.

### Visual system (current local build)
| Token | Value |
|---|---|
| Background | `#ffffff` |
| Ink (text) | `#14110b` |
| Muted | `#8a857c` |
| Hairline rule | `#e6e3dd` |
| Accent | `#8a3b2e` (terracotta) |
| Image placeholder tone | `#efede8` |
| Display font | Fraunces (serif) — fallback Georgia/serif |
| UI font | Inter (sans) — fallback system-ui |
| Motion easing | `cubic-bezier(.19,1,.22,1)` |

**Tight index spec:** grid `92px | 1fr | auto`; header row `No. / Label / meta` in muted 12.5px; each row 15px with a 1px bottom rule; on hover the row pads left ~14px and the right meta darkens; hovering floats a ~210×270 preview image that lerps toward the cursor.

### Interactions to preserve
- **Pin (♥)** on each card → persists to `localStorage`, drives the pinned-only filter and the taste readout.
- **Follow** toggle per house.
- **Custom cursor** labels: `pin` / `saved` / `view`.
- **Pinned mode** (top-right button) filters the wall to pinned pieces.
- **Taste readout** (bottom-left) summarises pins: "Leaning *Events · L'IDÉE WOMAN · Plum*".

### Motion notes for the real app
The local prototype hand-rolls momentum scroll. For production (React), use **Lenis** for smooth scroll and **IntersectionObserver** (or Lenis' scroll event) for reveals — sturdier than the hand-rolled loop.

### DATA SAMPLE (give Claude this shape; full set is `prototype/data.js`)
```json
{
  "brands": {
    "toteme": { "key":"toteme", "name":"Totême", "domain":"toteme.com",
      "url":"https://toteme.com/", "hero":"<image-url>", "count":7, "primary":"datenight" },
    "khaite": { "key":"khaite", "name":"Khaite", "domain":"khaite.com",
      "url":"https://khaite.com/", "hero":"<image-url>", "count":7, "primary":"casual" }
  },
  "items": [
    { "id":"toteme-123", "brand":"toteme", "brandName":"Totême", "title":"Silk Slip Dress",
      "color":"Ivory", "price":"$690", "occasion":"datenight",
      "img":"<image-url>", "img2":"<image-url>", "url":"<product-url>", "avail":true }
  ],
  "sections": [
    {"key":"casual","label":"Casual","blurb":"Off-duty ease…"},
    {"key":"datenight","label":"Date Night","blurb":"Something with intention…"},
    {"key":"events","label":"Events","blurb":"Full-length statements…"}
  ]
}
```
*(Reminder: in the artifact, don't load the `img` URLs — render placeholders. The real `data.js` has 28 brands / 196 pieces.)*

### Files in this project
- `prototype/index.html` — the working prototype (open with `open prototype/index.html`).
- `prototype/data.js` — the real pulled data (28 brands, 196 pieces).
- `resolved_all.json` — the Instagram-handle → Shopify-store resolver output.

### Things to explore (open questions for design)
- Does the Index list **brands** (current) or should it list **chapters**, with brands nested? At 32 labels the flat brand-list reads well; revisit as it grows.
- How to show a **single brand's full story** (founder, city, creative director) — a detail view? a hover expand?
- Where discovery ("brands like this") should surface without cluttering the calm.
