# ÉDIT — a personal fashion almanac

Follow independent & major fashion houses, pin what you love, browse by occasion & price
tier, and keep a style diary. Shoppable brands are pulled live from their Shopify catalogues;
runway-only houses come in as editorial profiles.

Stack: **Django 4.2 + DRF** (backend), **React 18 + Vite + TypeScript** (frontend),
**SQLite** for local dev (one env var away from Postgres). Mirrors the `network_ai` layout.

## Layout
```
core/            Django project (settings, urls, wsgi)
catalog/         Brand, Product, Look + the Shopify ingestion engine (ingest.py, categorize.py)
library/         Follow, Board, Pin, DiaryEntry, Connection (your personal data)
seed/seed.json   curated starter data (34 shoppable brands, 238 products, 50 editorial houses)
edit-web/        React + Vite + TS frontend
prototype/       the design prototype this was built from (edit.html) — reference only
*.py, *.json     the research/ingestion scripts used to build the seed (pull.py, resolve*.py …)
```

## Run it

**Backend** (from repo root):
```bash
python3 -m venv .venv && ./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_edit        # load the curated data
./.venv/bin/python manage.py runserver 8020
```

**Frontend** (in a second terminal):
```bash
cd edit-web && npm install && npm run dev      # http://localhost:5173 (proxies /api -> :8020)
```

## The ingestion engine
`catalog/ingest.py :: ingest_brand(url)` detects a Shopify store, pulls `/products.json`
(resilient: retries + page-size fallback), categorizes each item into an occasion + price
tier, and upserts the Brand and all its Products. Exposed at `POST /api/brands/ingest/ {url}`.
Non-Shopify sites return 422.

## API (base `/api/`)
```
GET  /brands/?kind=&tier=&followed=true      list houses (shoppable + editorial)
GET  /brands/<key>/                          detail + products (shoppable) or looks (editorial)
POST /brands/ingest/  {url}                  pull a live Shopify catalogue
POST|DELETE /brands/<key>/follow/            follow / unfollow
GET  /products/?occasion=&tier=&brand=&followed_only=&limit=
GET  /feed/?limit=                           What's New (newest first, "since"/"earlier")
GET|POST /boards/     GET /boards/<slug>/    boards + their pins
GET|POST /pins/       DELETE /pins/<product_id>/
GET /diary/  GET|PUT /diary/<YYYY-MM-DD>/    style diary
GET /connections/  PATCH /connections/<platform>/   Instagram/Pinterest/Camera toggles
GET /taste/                                  "your eye, so far" readout from pins
```

## Notes
- **Single-user v0** — no auth yet; personal data (pins/follows/boards) is global. Multi-user
  is a later phase (add a `user` FK + JWT, mirroring network_ai).
- The seed carries a curated subset per brand; run the live ingest endpoint to pull a brand's
  full catalogue (e.g. Totême returns ~250 products).
- Editorial houses show real runway images where the house's own site allows hotlinking
  (Robert Wun, Nour Hammour); enterprise-CDN maisons (Chanel, Dior, …) show placeholder tiles.
