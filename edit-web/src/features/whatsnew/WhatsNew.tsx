import { useMemo, useState } from 'react'
import { useFeed, useProducts, useBrands } from '../../api/hooks'
import { OCCASIONS, TIERS } from '../../api/constants'
import type { Product } from '../../api/types'
import ProductCard from '../../components/ProductCard'
import IngestLabel from '../../components/IngestLabel'

const sidebarLabel: React.CSSProperties = {
  fontSize: 11.5,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

export default function WhatsNew() {
  const [occasion, setOccasion] = useState<string | null>(null)
  const [tier, setTier] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [labelQuery, setLabelQuery] = useState('')
  const [followedOnly, setFollowedOnly] = useState(false)

  const hasActiveFilters = !!(occasion || tier || label || followedOnly)

  const feed = useFeed(60)
  const filtered = useProducts(
    {
      occasion: occasion ?? undefined,
      tier: tier ?? undefined,
      brand: label ?? undefined,
      followed_only: followedOnly || undefined,
      limit: 60,
    },
    hasActiveFilters,
  )
  const { data: labels } = useBrands({ kind: 'shoppable' })

  const since: Product[] = hasActiveFilters ? [] : feed.data?.since ?? []
  const earlier: Product[] = hasActiveFilters
    ? filtered.data ?? []
    : feed.data?.earlier ?? []

  const total = since.length + earlier.length
  const loading = hasActiveFilters ? filtered.isLoading : feed.isLoading

  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = []
    if (tier) chips.push({ label: TIERS.find((t) => t.key === tier)?.label ?? tier, clear: () => setTier(null) })
    if (occasion)
      chips.push({ label: OCCASIONS.find((o) => o.key === occasion)?.label ?? occasion, clear: () => setOccasion(null) })
    if (label)
      chips.push({
        label: labels?.find((b) => b.key === label)?.name ?? label,
        clear: () => setLabel(null),
      })
    return chips
  }, [tier, occasion, label, labels])

  const visibleLabels = (labels ?? []).filter((b) =>
    b.name.toLowerCase().includes(labelQuery.toLowerCase()),
  )

  const clearAll = () => {
    setOccasion(null)
    setTier(null)
    setLabel(null)
    setLabelQuery('')
    setFollowedOnly(false)
  }

  const feedSummary = followedOnly
    ? `${total} pieces from labels you follow`
    : `${total} pieces across ${labels?.length ?? 0} labels`

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '230px 1fr',
        gap: 44,
        padding: '28px 32px 96px',
        alignItems: 'start',
      }}
    >
      <aside>
        <div
          style={{
            position: 'sticky',
            top: 74,
            maxHeight: 'calc(100vh - 92px)',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            paddingRight: 12,
            fontSize: 13.5,
            lineHeight: 1.85,
          }}
        >
          <div style={{ ...sidebarLabel, marginBottom: 8 }}>Occasion</div>
          {[{ key: null, label: 'Everything' }, ...OCCASIONS].map((o) => (
            <div
              key={o.key ?? 'all'}
              onClick={() => setOccasion(o.key)}
              style={{ cursor: 'pointer', transition: 'color .3s', color: occasion === o.key ? 'var(--accent)' : 'var(--ink)' }}
            >
              {o.label}
            </div>
          ))}

          <div style={{ ...sidebarLabel, margin: '24px 0 8px' }}>Tier</div>
          {[{ key: null, label: 'All tiers', range: '' }, ...TIERS].map((t) => (
            <div
              key={t.key ?? 'all'}
              onClick={() => setTier(t.key)}
              style={{ cursor: 'pointer', transition: 'color .3s', color: tier === t.key ? 'var(--accent)' : 'var(--ink)' }}
            >
              {t.label} {t.range && <span style={{ color: '#c4c0b8', fontSize: 12 }}>{t.range}</span>}
            </div>
          ))}

          <div style={{ ...sidebarLabel, margin: '24px 0 8px' }}>Labels</div>
          <input
            value={labelQuery}
            onChange={(e) => setLabelQuery(e.target.value)}
            placeholder="Search labels"
            style={{
              width: '100%',
              border: '1px solid var(--hairline)',
              background: 'none',
              font: 'inherit',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              marginBottom: 8,
            }}
          />
          {visibleLabels.map((b) => (
            <div
              key={b.key}
              onClick={() => setLabel(label === b.key ? null : b.key)}
              style={{
                cursor: 'pointer',
                transition: 'color .3s',
                color: label === b.key ? 'var(--accent)' : b.followed ? 'var(--accent)' : 'var(--ink)',
              }}
            >
              {b.name}
            </div>
          ))}
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 24,
            paddingBottom: 16,
            borderBottom: '1px solid var(--ink)',
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 38, letterSpacing: '-.02em', margin: 0 }}>
              What's New
            </h2>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{feedSummary}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setFollowedOnly((v) => !v)}
              style={{
                border: '1px solid var(--hairline)',
                background: followedOnly ? '#faf3f1' : 'none',
                font: 'inherit',
                fontSize: 12.5,
                padding: '8px 14px',
                borderRadius: 999,
                cursor: 'pointer',
                transition: 'all .3s',
                color: followedOnly ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              Followed only
            </button>
            <button
              onClick={clearAll}
              style={{
                border: 'none',
                background: 'none',
                font: 'inherit',
                fontSize: 12.5,
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '8px 4px',
              }}
            >
              Clear filters
            </button>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 0 0' }}>
            {activeChips.map((c) => (
              <button
                key={c.label}
                onClick={c.clear}
                style={{
                  border: '1px solid var(--ink)',
                  background: 'none',
                  font: 'inherit',
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
              >
                {c.label} ✕
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '80px 0', color: 'var(--muted)' }}>Reading the catalogue…</div>
        ) : total === 0 ? (
          <div style={{ padding: '80px 0', maxWidth: '46ch' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 28, lineHeight: 1.25, marginBottom: 12 }}>
              Nothing here yet.
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
              Either no label you follow has dropped under these filters, or you haven't followed anyone. Both are
              fixable.
            </p>
          </div>
        ) : (
          <>
            {since.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '30px 0 22px' }}>
                  <span style={{ fontFamily: 'var(--hand)', fontSize: 27, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                    since your last visit
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                  <span style={{ fontSize: 12.5, color: '#a8a49c' }}>{since.length} pieces</span>
                </div>
                <Grid products={since} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '46px 0 22px' }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: '#a8a49c',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Earlier
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                </div>
              </>
            )}
            <Grid products={earlier} />
          </>
        )}

        <div style={{ marginTop: 72, paddingTop: 40, borderTop: '1px solid var(--hairline)' }}>
          <IngestLabel />
        </div>
      </div>
    </div>
  )
}

function Grid({ products }: { products: Product[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(215px,1fr))',
        gap: '40px 22px',
      }}
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}
