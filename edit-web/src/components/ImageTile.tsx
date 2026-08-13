import type { CSSProperties, ReactNode } from 'react'
import { PLACEHOLDER_BG } from '../api/constants'

interface ImageTileProps {
  src?: string | null
  ratio?: string
  caption?: string
  padding?: number
  children?: ReactNode
  style?: CSSProperties
}

/**
 * Product/look image tile. Shows the image with object-fit:cover when a URL is
 * present; otherwise a diagonal-stripe placeholder with an optional monospace caption.
 */
export default function ImageTile({
  src,
  ratio = '3/4',
  caption,
  padding = 12,
  children,
  style,
}: ImageTileProps) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: ratio,
        background: PLACEHOLDER_BG,
        display: 'flex',
        alignItems: 'flex-end',
        padding,
        overflow: 'hidden',
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
          }}
        />
      ) : caption ? (
        <span
          style={{
            fontFamily: 'ui-monospace,Menlo,monospace',
            fontSize: 9.5,
            color: 'var(--muted)',
            position: 'relative',
          }}
        >
          {caption}
        </span>
      ) : null}
      {children}
    </div>
  )
}
