import { useNavigate } from 'react-router-dom'
import type { Product } from '../api/types'
import { usePin, useUnpin } from '../api/hooks'
import ImageTile from './ImageTile'

interface ProductCardProps {
  product: Product
  serif?: boolean
}

export default function ProductCard({ product: p, serif }: ProductCardProps) {
  const navigate = useNavigate()
  const pin = usePin()
  const unpin = useUnpin()

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (p.pinned) unpin.mutate(p.id)
    else pin.mutate({ product: p.id })
  }

  const open = () => navigate(`/brand/${p.brand_key}`)

  const flag = p.is_new ? 'New' : ''

  return (
    <div
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}
    >
      <ImageTile src={p.image_url} ratio="3/4">
        {flag && (
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              fontSize: 11,
              background: 'rgba(255,255,255,.92)',
              padding: '4px 8px',
              color: 'var(--muted)',
            }}
          >
            {flag}
          </span>
        )}
        <button
          onClick={togglePin}
          aria-label={p.pinned ? 'Unpin' : 'Pin'}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 34,
            height: 34,
            borderRadius: 999,
            border: 'none',
            background: 'rgba(255,255,255,.9)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            transition: 'transform .3s cubic-bezier(.19,1,.22,1)',
            color: p.pinned ? 'var(--accent)' : '#d6d2ca',
          }}
        >
          ♥
        </button>
      </ImageTile>
      <div style={{ fontSize: 12.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        {p.brand_name}
      </div>
      <div
        style={
          serif
            ? { fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.25 }
            : { fontSize: 14, lineHeight: 1.35, color: '#3d3830' }
        }
      >
        {p.title}
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
        <span>{p.price_display}</span>
        {p.color && <span style={{ color: '#c4c0b8' }}>{p.color}</span>}
      </div>
    </div>
  )
}
