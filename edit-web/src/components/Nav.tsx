import { NavLink } from 'react-router-dom'
import { usePins, useBrands } from '../api/hooks'

const links = [
  { to: '/', label: "What's New", end: true },
  { to: '/boards', label: 'Boards', end: false },
  { to: '/diary', label: 'Diary', end: false },
  { to: '/almanac', label: 'Almanac', end: false },
]

export default function Nav() {
  const { data: pins } = usePins()
  const { data: followed } = useBrands({ followed: true })

  const pinnedCount = pins?.length ?? 0
  const followCount = followed?.length ?? 0

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 24,
        padding: '13px 32px',
        background: '#fff',
        borderBottom: '1px solid var(--hairline)',
        fontSize: 12.5,
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink)' }}>
        ÉDIT
      </span>
      <div style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            style={({ isActive }) => ({
              padding: '4px 0',
              color: isActive ? 'var(--ink)' : '#a8a49c',
              transition: 'color .3s',
            })}
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <span style={{ color: 'var(--muted)' }}>
        {pinnedCount} pinned · {followCount} followed
      </span>
    </div>
  )
}
