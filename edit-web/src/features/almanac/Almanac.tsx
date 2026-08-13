import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrands, useFeed } from '../../api/hooks'
import { TIERS } from '../../api/constants'
import type { Brand } from '../../api/types'
import ImageTile from '../../components/ImageTile'
import FollowButton from '../../components/FollowButton'
import IngestLabel from '../../components/IngestLabel'

export default function Almanac() {
  const navigate = useNavigate()
  const { data: brands, isLoading } = useBrands()
  const { data: feed } = useFeed(60)

  const sorted = useMemo(
    () => (brands ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [brands],
  )

  const followCount = sorted.filter((b) => b.followed).length
  const pieceCount = feed?.count ?? sorted.reduce((t, b) => t + b.product_count + b.look_count, 0)

  // numbered index grouped by tier
  const groups = useMemo(() => {
    let n = 0
    return TIERS.map((sec) => {
      const rows = sorted
        .filter((b) => b.tier === sec.key)
        .map((b) => {
          n += 1
          return { brand: b, no: String(n).padStart(2, '0') }
        })
      return { section: sec, rows }
    })
  }, [sorted])

  const featured = sorted[1] ?? sorted[0]

  const open = (key: string) => navigate(`/brand/${key}`)

  const pieceLabel = (b: Brand) =>
    b.kind === 'editorial' ? `${b.look_count} looks` : `${b.product_count}`

  return (
    <div>
      <section
        style={{
          minHeight: '76vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '0 32px 56px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(56px,10.5vw,170px)',
            lineHeight: 0.92,
            letterSpacing: '-.03em',
            maxWidth: '14ch',
          }}
        >
          The brands worth knowing.
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 40,
            marginTop: 44,
            flexWrap: 'wrap',
          }}
        >
          <p style={{ maxWidth: '44ch', margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--muted)' }}>
            A reading room for independent labels — followed, pinned, and filed by price tier. Not a store.{' '}
            <span style={{ fontFamily: 'var(--hand)', fontSize: 25, color: 'var(--accent)' }}>an index of taste.</span>
          </p>
          <div style={{ display: 'flex', gap: 32, fontSize: 13, color: 'var(--muted)' }}>
            <span>{sorted.length} labels</span>
            <span>{pieceCount} pieces</span>
            <span>3 tiers</span>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,32%) 1fr', gap: 56, padding: '0 32px' }}>
        <aside>
          <div
            style={{
              position: 'sticky',
              top: 74,
              maxHeight: 'calc(100vh - 74px)',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              padding: '40px 12px 32px 0',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr auto',
                gap: 12,
                paddingBottom: 6,
                fontSize: 12,
                color: '#a8a49c',
              }}
            >
              <span>Number</span>
              <span>Label</span>
              <span>Pieces</span>
            </div>
            {groups.map((g) => (
              <div key={g.section.key} style={{ borderTop: '1px solid var(--ink)', marginTop: 20 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr auto',
                    gap: 12,
                    padding: '7px 0 6px',
                    fontSize: 11.5,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                  }}
                >
                  <span>{g.section.no}</span>
                  <span>{g.section.label}</span>
                  <span style={{ color: '#a8a49c', textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' }}>
                    {g.section.range}
                  </span>
                </div>
                {g.rows.map(({ brand: b, no }) => (
                  <div
                    key={b.key}
                    tabIndex={0}
                    onClick={() => open(b.key)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(b.key))}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '52px 1fr auto',
                      gap: 12,
                      alignItems: 'baseline',
                      padding: '7px 0 6px',
                      borderTop: '1px solid var(--hairline)',
                      cursor: 'pointer',
                      fontSize: 13.5,
                      lineHeight: 1.3,
                    }}
                  >
                    <span style={{ color: '#a8a49c', fontVariantNumeric: 'tabular-nums' }}>{no}</span>
                    <span>
                      {b.name} {b.city && <span style={{ color: '#a8a49c' }}>/ {b.city}</span>}
                    </span>
                    <span style={{ color: b.followed ? 'var(--accent)' : '#a8a49c', fontVariantNumeric: 'tabular-nums' }}>
                      {pieceLabel(b)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          <section style={{ padding: '56px 0 40px', borderBottom: '1px solid var(--hairline)' }}>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 'clamp(38px,5.2vw,80px)',
                lineHeight: 0.98,
                letterSpacing: '-.03em',
              }}
            >
              Index of every
              <br />
              <em>house</em> we read,
              <br />
              filed by tier.
            </div>
            <p style={{ maxWidth: '44ch', margin: '26px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
              The index stays with you — click a line to open the house and its latest show. Labels you follow are
              marked in terracotta.
            </p>
          </section>

          {featured && (
            <section style={{ padding: '70px 0', borderBottom: '1px solid var(--hairline)' }}>
              <div
                style={{
                  fontFamily: 'var(--hand)',
                  fontSize: 32,
                  color: 'var(--accent)',
                  marginBottom: 12,
                  transform: 'rotate(-1.4deg)',
                  transformOrigin: 'left',
                }}
              >
                House of the week
              </div>
              <div
                onClick={() => open(featured.key)}
                style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 40, alignItems: 'center', cursor: 'pointer' }}
              >
                <ImageTile src={featured.hero_image_url} ratio="4/5" padding={16} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h3
                    style={{
                      fontFamily: 'var(--serif)',
                      fontWeight: 400,
                      fontSize: 'clamp(34px,4.4vw,64px)',
                      lineHeight: 1,
                      letterSpacing: '-.03em',
                      margin: 0,
                    }}
                  >
                    {featured.name}
                  </h3>
                  {featured.story && (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: 'var(--serif)',
                        fontSize: 20,
                        lineHeight: 1.5,
                        color: '#3d3830',
                        maxWidth: '34ch',
                      }}
                    >
                      {featured.story}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 26, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
                    {featured.founded && <span>Founded {featured.founded}</span>}
                    {(featured.founder || featured.designer) && <span>{featured.founder || featured.designer}</span>}
                    {featured.city && <span>{featured.city}</span>}
                    <span>{TIERS.find((t) => t.key === featured.tier)?.label}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--hand)', fontSize: 25, color: 'var(--accent)' }}>
                    read the house, then the show →
                  </span>
                </div>
              </div>
            </section>
          )}

          <section style={{ padding: '80px 0', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
              <h2
                style={{
                  fontFamily: 'var(--serif)',
                  fontWeight: 400,
                  fontSize: 14,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                The Houses
              </h2>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{followCount} followed</span>
            </div>
            {isLoading ? (
              <div style={{ color: 'var(--muted)' }}>Loading houses…</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 28 }}>
                {sorted.map((b) => (
                  <div
                    key={b.key}
                    onClick={() => open(b.key)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer' }}
                  >
                    <ImageTile src={b.hero_image_url} ratio="4/5" padding={14} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>{b.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{pieceLabel(b)}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12.5,
                        color: 'var(--muted)',
                      }}
                    >
                      <FollowButton brandKey={b.key} followed={b.followed} />
                      <span>{b.kind === 'editorial' ? 'Runway ↗' : 'Shop ↗'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ padding: '96px 0' }}>
            <IngestLabel />
          </section>

          <footer
            style={{
              borderTop: '1px solid var(--hairline)',
              padding: '28px 0',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
              fontSize: 12.5,
              color: 'var(--muted)',
            }}
          >
            <span>ÉDIT</span>
            <span>{followCount ? `Following ${followCount} labels` : 'No labels followed yet'}</span>
            <span>© 2026</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
