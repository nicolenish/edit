import type { CSSProperties } from 'react'
import { useFollowBrand } from '../api/hooks'

interface FollowButtonProps {
  brandKey: string
  followed: boolean
  variant?: 'chip' | 'solid'
  followedLabel?: string
  followLabel?: string
}

export default function FollowButton({
  brandKey,
  followed,
  variant = 'chip',
  followedLabel = 'Following',
  followLabel = 'Follow',
}: FollowButtonProps) {
  const follow = useFollowBrand()

  const base: CSSProperties = {
    font: 'inherit',
    cursor: 'pointer',
    transition: 'all .3s',
    whiteSpace: 'nowrap',
  }

  const style: CSSProperties =
    variant === 'solid'
      ? {
          ...base,
          border: '1px solid var(--ink)',
          background: 'none',
          fontSize: 13,
          padding: '12px 22px',
          borderRadius: 999,
          color: followed ? 'var(--accent)' : 'var(--ink)',
        }
      : {
          ...base,
          border: '1px solid var(--hairline)',
          background: 'none',
          fontSize: 12,
          padding: '7px 13px',
          borderRadius: 999,
          color: followed ? 'var(--accent)' : 'var(--muted)',
        }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        follow.mutate({ key: brandKey, followed })
      }}
      style={style}
    >
      {followed ? followedLabel : followLabel}
    </button>
  )
}
