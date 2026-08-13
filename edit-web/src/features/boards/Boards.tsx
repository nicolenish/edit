import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoards, useBoard, useCreateBoard, useUnpin } from '../../api/hooks'
import { RATIOS } from '../../api/constants'
import ImageTile from '../../components/ImageTile'

export default function Boards() {
  const navigate = useNavigate()
  const { data: boards } = useBoards()
  const [active, setActive] = useState<string | undefined>(undefined)
  const [newName, setNewName] = useState('')
  const createBoard = useCreateBoard()
  const unpin = useUnpin()

  useEffect(() => {
    if (!active && boards && boards.length) setActive(boards[0].slug)
  }, [boards, active])

  const { data: detail } = useBoard(active)
  const pins = detail?.pins ?? []
  const activeBoard = boards?.find((b) => b.slug === active)

  const total = pins.reduce((t, p) => t + Math.round(parseFloat(p.product.price) || 0), 0)

  const addBoard = () => {
    const nm = newName.trim()
    if (!nm) return
    createBoard.mutate(nm, {
      onSuccess: (b) => {
        setActive(b.slug)
        setNewName('')
      },
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 44, padding: '32px 32px 96px', alignItems: 'start' }}>
      <aside>
        <div style={{ position: 'sticky', top: 74 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            Boards
          </div>
          {(boards ?? []).map((b) => (
            <div
              key={b.slug}
              onClick={() => setActive(b.slug)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 0',
                borderTop: '1px solid var(--hairline)',
                cursor: 'pointer',
                fontSize: 14,
                color: active === b.slug ? 'var(--ink)' : '#a8a49c',
              }}
            >
              <span>{b.name}</span>
              <span style={{ color: '#c4c0b8', fontSize: 13 }}>{b.pin_count}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addBoard()}
              placeholder="New board"
              style={{ flex: 1, minWidth: 0, border: '1px solid var(--hairline)', background: 'none', font: 'inherit', fontSize: 13, padding: '8px 10px', outline: 'none' }}
            />
            <button
              onClick={addBoard}
              style={{ border: '1px solid var(--ink)', background: 'none', font: 'inherit', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingBottom: 16,
            borderBottom: '1px solid var(--ink)',
            marginBottom: 26,
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 38, letterSpacing: '-.02em', margin: 0 }}>
              {activeBoard?.name ?? 'Boards'}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{pins.length} pins</div>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {total ? `$${total.toLocaleString()} if you bought it all` : ''}
          </span>
        </div>

        {pins.length === 0 ? (
          <div style={{ padding: '70px 0', maxWidth: '44ch' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 28, lineHeight: 1.25, marginBottom: 12 }}>An empty board.</div>
            <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
              Pin from What's New — pins land in your Saved board.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{ border: '1px solid var(--ink)', background: 'none', font: 'inherit', fontSize: 12.5, padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }}
            >
              Go to What's New
            </button>
          </div>
        ) : (
          <div style={{ columns: 4, columnGap: 20 }}>
            {pins.map((pin, i) => {
              const p = pin.product
              return (
                <div key={pin.id} style={{ breakInside: 'avoid', marginBottom: 20 }}>
                  <ImageTile src={p.image_url} ratio={RATIOS[i % RATIOS.length]}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        unpin.mutate(p.id)
                      }}
                      aria-label="Unpin"
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        border: 'none',
                        background: 'rgba(255,255,255,.9)',
                        cursor: 'pointer',
                        fontSize: 13,
                        lineHeight: 1,
                        color: 'var(--accent)',
                      }}
                    >
                      ♥
                    </button>
                  </ImageTile>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{p.brand_name}</span>
                    <span>{p.price_display}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
