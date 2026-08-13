import { useNavigate } from 'react-router-dom'
import { useDiscover, useFollowBrand, useDismiss } from '../../api/hooks'
import { TIERS } from '../../api/constants'
import type { DiscoverBrand } from '../../api/types'
import ImageTile from '../../components/ImageTile'

export default function Discover() {
  const { data, isLoading } = useDiscover()

  const forYou = data?.for_you ?? []
  const expand = data?.expand ?? []
  const bothEmpty = !isLoading && forYou.length === 0 && expand.length === 0

  return (
    <div style={{ padding: '32px 32px 96px' }}>
      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ink)', marginBottom: 40 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(38px,5vw,64px)', letterSpacing: '-.02em', margin: 0 }}>
          Discover
        </h2>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8, maxWidth: '60ch' }}>
          {data?.note ?? 'Reading your library for houses to try next.'}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '80px 0', color: 'var(--muted)' }}>Reading adjacent houses…</div>
      ) : bothEmpty ? (
        <div style={{ padding: '70px 0', maxWidth: '44ch' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, lineHeight: 1.25, marginBottom: 12 }}>
            Nothing to suggest yet.
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
            Follow a few more houses and this fills in.
          </p>
        </div>
      ) : (
        <>
          <Section title="For your eye" caption="Closest to what you already follow" brands={forYou} />
          <Section title="Broaden the eye" caption="Deliberately different, to widen the field" brands={expand} />
        </>
      )}
    </div>
  )
}

function Section({ title, caption, brands }: { title: string; caption: string; brands: DiscoverBrand[] }) {
  if (brands.length === 0) return null
  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 28, gap: 20, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--hand)', fontSize: 30, color: 'var(--ink)', fontWeight: 400, margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{caption}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 32 }}>
        {brands.map((b) => (
          <DiscoverCard key={b.key} brand={b} />
        ))}
      </div>
    </section>
  )
}

function DiscoverCard({ brand: b }: { brand: DiscoverBrand }) {
  const navigate = useNavigate()
  const follow = useFollowBrand()
  const dismiss = useDismiss()

  const tierLabel = TIERS.find((t) => t.key === b.tier)?.label ?? b.tier

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div onClick={() => navigate(`/brand/${b.key}`)} style={{ cursor: 'pointer' }}>
        <ImageTile src={b.hero_image_url} ratio="4/5" padding={14} caption={b.name} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 22, lineHeight: 1.1 }}>{b.name}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {b.city ? `${b.city} · ` : ''}
          {tierLabel}
        </span>

        {b.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {b.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 999,
                  padding: '3px 9px',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {b.reason && (
          <span style={{ fontFamily: 'var(--hand)', fontSize: 20, color: 'var(--accent)', lineHeight: 1.2 }}>
            {b.reason}
          </span>
        )}

        {b.story && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#3d3830' }}>{b.story}</p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
        <button
          onClick={() => follow.mutate({ key: b.key, followed: false })}
          disabled={follow.isPending}
          style={{
            border: '1px solid var(--ink)',
            background: 'none',
            font: 'inherit',
            fontSize: 12.5,
            padding: '9px 18px',
            borderRadius: 999,
            cursor: 'pointer',
            transition: 'all .3s',
          }}
        >
          {follow.isPending ? 'Following…' : 'Follow'}
        </button>
        <button
          onClick={() => dismiss.mutate(b.key)}
          disabled={dismiss.isPending}
          style={{
            border: 'none',
            background: 'none',
            font: 'inherit',
            fontSize: 12.5,
            color: '#c4c0b8',
            cursor: 'pointer',
            padding: '9px 4px',
            transition: 'color .3s',
          }}
        >
          Not for me
        </button>
      </div>
    </div>
  )
}
