import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBrand } from '../../api/hooks'
import { TIERS } from '../../api/constants'
import ImageTile from '../../components/ImageTile'
import ProductCard from '../../components/ProductCard'
import FollowButton from '../../components/FollowButton'

export default function BrandDetail() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const { data: brand, isLoading, isError } = useBrand(key)

  const looks = brand?.looks ?? []
  const isEditorial = brand?.kind === 'editorial'
  const lookCount = looks.length

  const [look, setLook] = useState(0)
  useEffect(() => setLook(0), [key])

  const step = useCallback(
    (dir: number) => {
      if (!lookCount) return
      setLook((l) => (l + dir + lookCount) % lookCount)
    },
    [lookCount],
  )

  useEffect(() => {
    if (!isEditorial) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditorial, step])

  if (isLoading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Reading the house…</div>
  if (isError || !brand) return <div style={{ padding: 32, color: 'var(--muted)' }}>House not found.</div>

  const tierLabel = TIERS.find((t) => t.key === brand.tier)?.label ?? brand.tier
  const cur = looks[Math.min(look, Math.max(lookCount - 1, 0))]
  const lookNo = String((cur?.index ?? look) + 1).padStart(2, '0')

  return (
    <div style={{ outline: 'none' }}>
      <section style={{ padding: '34px 32px 0' }}>
        <button
          onClick={() => navigate('/almanac')}
          style={{
            border: 'none',
            background: 'none',
            font: 'inherit',
            fontSize: 12.5,
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '0 0 26px',
          }}
        >
          ← Almanac
        </button>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 32,
            alignItems: 'end',
            borderBottom: '1px solid var(--ink)',
            paddingBottom: 26,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--serif)',
                fontWeight: 400,
                fontSize: 'clamp(48px,8vw,128px)',
                lineHeight: 0.9,
                letterSpacing: '-.035em',
                margin: 0,
              }}
            >
              {brand.name}
            </h2>
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--muted)', marginTop: 18 }}>
              {brand.city && <span>{brand.city}</span>}
              {brand.founded && <span>Founded {brand.founded}</span>}
              {(brand.designer || brand.founder) && <span>{brand.designer || brand.founder}</span>}
              <span>{tierLabel}</span>
            </div>
          </div>
          <FollowButton
            brandKey={brand.key}
            followed={brand.followed}
            variant="solid"
            followLabel="Follow this house"
          />
        </div>
        {brand.story && (
          <p
            style={{
              maxWidth: '52ch',
              margin: '26px 0 0',
              fontFamily: 'var(--serif)',
              fontSize: 21,
              lineHeight: 1.5,
              color: '#3d3830',
            }}
          >
            {brand.story}
          </p>
        )}
      </section>

      {isEditorial ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 44, padding: '34px 32px 60px', alignItems: 'start' }}>
          <div>
            <ImageTile src={cur?.image_url} ratio="3/4" padding={18}>
              <span
                style={{
                  fontFamily: 'ui-monospace,Menlo,monospace',
                  fontSize: 11,
                  color: 'var(--muted)',
                  position: 'relative',
                  background: 'rgba(255,255,255,.72)',
                  padding: '2px 6px',
                }}
              >
                runway look {lookNo} — {brand.name}, {cur?.season || brand.season || 'Runway'}
              </span>
              <button
                onClick={() => step(-1)}
                aria-label="Previous look"
                style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '22%', border: 'none', background: 'none', cursor: 'w-resize', fontSize: 20, color: 'var(--muted)' }}
              >
                ‹
              </button>
              <button
                onClick={() => step(1)}
                aria-label="Next look"
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '22%', border: 'none', background: 'none', cursor: 'e-resize', fontSize: 20, color: 'var(--muted)' }}
              >
                ›
              </button>
            </ImageTile>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, fontSize: 13, color: 'var(--muted)' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                Look {lookNo} / {String(lookCount).padStart(2, '0')}
              </span>
              <span>← → to move</span>
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 16, scrollbarWidth: 'thin' }}>
              {looks.map((lk, i) => (
                <div
                  key={lk.id}
                  onClick={() => setLook(i)}
                  style={{
                    flex: 'none',
                    width: 44,
                    height: 58,
                    background: 'repeating-linear-gradient(135deg,#efede8,#efede8 6px,#f6f4f0 6px,#f6f4f0 12px)',
                    border: `1px solid ${i === look ? 'var(--ink)' : 'var(--hairline)'}`,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ position: 'sticky', top: 88 }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14 }}>
              About the house
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#3d3830' }}>
              {brand.story || 'An editorial house followed for its runway shows.'}
            </p>
            <p style={{ margin: '20px 0 0', fontSize: 12.5, lineHeight: 1.6, color: '#a8a49c' }}>
              {lookCount} looks on file{cur?.season ? ` — ${cur.season}` : ''}. Use ‹ › or the arrow keys to move through the show.
            </p>
          </div>
        </section>
      ) : (
        <section style={{ padding: '38px 32px 80px' }}>
          <div style={{ fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--hairline)', paddingBottom: 14, marginBottom: 34 }}>
            The collection · {brand.products.length} pieces
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '40px 22px' }}>
            {brand.products.map((p) => (
              <ProductCard key={p.id} product={p} serif />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
