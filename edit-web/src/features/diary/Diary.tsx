import { useState, useEffect } from 'react'
import {
  useDiaryEntry,
  useSaveDiary,
  usePins,
  useConnections,
  useToggleConnection,
  useTaste,
} from '../../api/hooks'
import ImageTile from '../../components/ImageTile'

const MOOD_TAGS = ['Quiet luxury', 'Plum', 'For September', 'Slip silhouette', 'Saving for']

function todayISO() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function longDate() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Diary() {
  const date = todayISO()
  const { data: entry } = useDiaryEntry(date)
  const save = useSaveDiary(date)
  const { data: pins } = usePins()
  const { data: connections } = useConnections()
  const toggleConnection = useToggleConnection()
  const { data: taste } = useTaste()

  const [note, setNote] = useState('')
  const [moods, setMoods] = useState<string[]>([])

  useEffect(() => {
    if (entry) {
      setNote(entry.note ?? '')
      setMoods(entry.moods ?? [])
    }
  }, [entry])

  const commit = (nextNote: string, nextMoods: string[]) => {
    save.mutate({ note: nextNote, moods: nextMoods })
  }

  const toggleMood = (m: string) => {
    const next = moods.includes(m) ? moods.filter((x) => x !== m) : [...moods, m]
    setMoods(next)
    commit(note, next)
  }

  const clips = pins ?? []
  const wishlist = clips.slice(0, 4)
  const wishTotal = wishlist.reduce((t, p) => t + Math.round(parseFloat(p.product.price) || 0), 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: 44, padding: '32px 32px 96px', alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 14, borderBottom: '1px solid var(--ink)' }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(30px,3.4vw,50px)', letterSpacing: '-.02em', margin: 0 }}>
            {longDate()}
          </h2>
          <span style={{ fontFamily: 'var(--hand)', fontSize: 27, color: 'var(--accent)' }}>today</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '14px 0', borderBottom: '1px solid var(--hairline)' }}>
          Today so far — {clips.length} pinned{save.isPending ? ' · saving…' : entry ? ' · saved' : ''}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => commit(note, moods)}
          placeholder="What caught your eye today?"
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'none',
            resize: 'vertical',
            fontFamily: 'var(--serif)',
            fontSize: 19,
            lineHeight: 1.55,
            color: 'var(--ink)',
            padding: '24px 0',
            minHeight: 110,
          }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 24, borderBottom: '1px solid var(--hairline)' }}>
          {MOOD_TAGS.map((m) => {
            const on = moods.includes(m)
            return (
              <span
                key={m}
                onClick={() => toggleMood(m)}
                style={{
                  fontSize: 12.5,
                  color: on ? 'var(--accent)' : 'var(--muted)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`,
                  borderRadius: 999,
                  padding: '6px 13px',
                  cursor: 'pointer',
                  transition: 'all .3s',
                }}
              >
                {m}
              </span>
            )
          })}
        </div>

        <div style={{ margin: '32px 0 16px' }}>
          <h3 style={{ fontFamily: 'var(--hand)', fontSize: 28, color: 'var(--ink)', fontWeight: 400, margin: 0 }}>
            clipped today{' '}
            <span style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: '#a8a49c' }}>
              — anything you heart lands here
            </span>
          </h3>
        </div>
        {clips.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Nothing pinned yet. Heart a piece and it lands here.</p>
        ) : (
          <div style={{ columns: 3, columnGap: 16 }}>
            {clips.map((pin) => {
              const p = pin.product
              return (
                <div key={pin.id} style={{ breakInside: 'avoid', marginBottom: 18 }}>
                  <ImageTile src={p.image_url} ratio="3/4" padding={10} caption={p.title}>
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        fontSize: 11,
                        background: 'rgba(255,255,255,.92)',
                        padding: '4px 8px',
                        color: 'var(--accent)',
                      }}
                    >
                      Pinned · {pin.board_slug}
                    </span>
                  </ImageTile>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 7, fontSize: 12.5, color: 'var(--muted)' }}>
                    <span>{p.brand_name}</span>
                    <span style={{ color: 'var(--ink)' }}>{p.price_display}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <aside>
        <div style={{ position: 'sticky', top: 74, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ border: '1px solid var(--hairline)', padding: 18 }}>
            <div style={{ fontFamily: 'var(--hand)', fontSize: 27, color: 'var(--ink)', marginBottom: 6 }}>pin from</div>
            {(connections ?? []).map((c) => (
              <div
                key={c.platform}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: '1px solid var(--hairline)' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 14, textTransform: 'capitalize' }}>{c.platform}</span>
                  <span style={{ fontSize: 12.5, color: '#a8a49c' }}>
                    {c.detail}
                    {c.connected ? ' · syncing' : ''}
                  </span>
                </div>
                <button
                  onClick={() => toggleConnection.mutate({ platform: c.platform, connected: !c.connected })}
                  style={{
                    border: '1px solid var(--hairline)',
                    background: 'none',
                    font: 'inherit',
                    fontSize: 12,
                    padding: '6px 12px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    transition: 'all .3s',
                    color: c.connected ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {c.connected ? 'Linked' : 'Connect'}
                </button>
              </div>
            ))}
          </div>

          <div style={{ background: '#faf8f5', padding: 18 }}>
            <div style={{ fontFamily: 'var(--hand)', fontSize: 28, color: 'var(--accent)', marginBottom: 4 }}>your eye, so far</div>
            <p style={{ margin: '0 0 14px', fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.5 }}>
              {taste?.readout || 'Nothing pinned yet. Clip a few pieces and your eye starts to show itself here.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(taste?.leaning ?? []).map((l) => (
                <span
                  key={l}
                  style={{ border: '1px solid #e0dbd2', background: '#fff', font: 'inherit', fontSize: 12, padding: '6px 12px', borderRadius: 999 }}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid var(--hairline)', padding: 18 }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
              Wishlist
            </div>
            {wishlist.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: '#a8a49c' }}>No pins yet.</p>
            ) : (
              <>
                {wishlist.map((pin) => (
                  <div
                    key={pin.id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: '1px solid var(--hairline)', fontSize: 13.5 }}
                  >
                    <span>
                      {pin.product.title} <span style={{ color: '#a8a49c' }}>/ {pin.product.brand_name}</span>
                    </span>
                    <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{pin.product.price_display}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 6, borderTop: '1px solid var(--ink)', fontSize: 12.5 }}>
                  <span>Total</span>
                  <span>${wishTotal.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
