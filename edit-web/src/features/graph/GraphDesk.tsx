import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGraph, useGraphNode, savePositions, usePinNode, useFollowNode, useHouseStudy, useCreateBoard, useCapture, useUpdateClip, useDeleteClip, useBoardGraph, useBoardItem, saveBoardPositions, useUpdateBoard, useGraphList, useDeleteBoard, useUploadImage, useAddBoardLocal } from './api'
import type { GraphNode, GraphNodeType, HouseStudy, IndexItem, ClipEditable, ListItem } from './types'

const STAGE_W = 2400
const STAGE_H = 1600
const KEY = 'nishi.desk.v1'
const STRIPE = 'repeating-linear-gradient(45deg, #efece5 0 8px, #f7f5f0 8px 16px)'
const ACCENT = '#8f4331' // terracotta — UI accent (buttons, pins)
const INK = '#141310'
// kindred-line colours — brighter/saturated so thin dotted lines still read
const LINE_AESTHETIC = '#d24327' // design/aesthetic
const LINE_REGION = '#4e9b34'    // where founded / region
const LINE_PRICE = '#356fd0'     // price point / tier
const DOT = '2 5'                // dotted dasharray for indirect lines

// index groups, in order

type Lens = 'free' | 'diary'
type View = 'graph' | 'list'

interface Persisted {
  pos?: Record<string, [number, number]>
  lens?: Lens
}

function loadPersisted(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || {}
  } catch {
    return {}
  }
}

export default function GraphDesk() {
  const { data: graph, isLoading } = useGraph()
  const [view, setView] = useState<View>('graph')
  const listQ = useGraphList(view === 'list')
  const persisted = useRef<Persisted>(loadPersisted())

  const pinMut = usePinNode()
  const followMut = useFollowNode()
  const boardMut = useCreateBoard()

  const [open, setOpen] = useState<string | null>(null)
  const [study, setStudy] = useState<string | null>(null) // house node id → the long view
  const [compose, setCompose] = useState(false) // new-board form open
  // A board opens as its own composed sub-graph: the desk shows only that board's items.
  const [boardSlug, setBoardSlug] = useState<string | null>(null)
  const [editingBoard, setEditingBoard] = useState(false)   // board title/description editor open
  const [followHover, setFollowHover] = useState(false)     // hover on Following → reveals "Unfollow"
  const boardQ = useBoardGraph(boardSlug)
  const boardItemMut = useBoardItem()
  const updateBoardMut = useUpdateBoard()
  const deleteBoardMut = useDeleteBoard()
  const addLocalMut = useAddBoardLocal()
  const inBoard = !!boardSlug
  const deskGraph = inBoard ? boardQ.data : graph            // what the canvas draws
  const deskNodes = deskGraph?.nodes ?? []
  const deskEdges = deskGraph?.edges ?? []
  const boardPos = useRef<Record<string, [number, number]>>({}) // per-board drag overrides
  const boardItemMutRef = useRef(boardItemMut)                    // latest, for the drag effect
  boardItemMutRef.current = boardItemMut
  const [lens, setLens] = useState<Lens>(persisted.current.lens || 'free')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})   // index sections hidden
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})        // index sections un-capped
  // Pin / follow are backend truth: a house is followed iff node.followed, a piece is
  // pinned iff it has a pinned-to edge. Toggling calls the API and refetches the graph.
  const followedOf = useCallback((n: GraphNode) => !!n.followed, [])

  // ── imperative geometry state (never triggers re-render) ──
  const stageRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tx = useRef(0)
  const ty = useRef(0)
  const scale = useRef(1)
  const posOverride = useRef<Record<string, [number, number]>>(persisted.current.pos || {})
  const dragged = useRef(false)
  const zTop = useRef(20)
  const fitted = useRef(false)

  const save = useCallback(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pos: posOverride.current, lens }))
    } catch { /* private mode */ }
  }, [lens])

  // Backend position persistence is separate and fires ONLY on a real drag — never on
  // the mount/persist effect, so a fresh desk keeps its seed layout.
  const persistPositions = useCallback(() => {
    savePositions(
      Object.fromEntries(Object.entries(posOverride.current).map(([k, [x, y]]) => [k, { x, y }])),
    )
  }, [])

  const applyTransform = useCallback(() => {
    if (panRef.current) panRef.current.style.transform = `translate(${tx.current}px, ${ty.current}px) scale(${scale.current})`
  }, [])

  const updateEdges = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.querySelectorAll<SVGLineElement>('line[data-from]').forEach((l) => {
      const a = nodeRefs.current[l.dataset.from!]
      const b = nodeRefs.current[l.dataset.to!]
      if (!a || !b) return
      l.setAttribute('x1', String(a.offsetLeft + a.offsetWidth / 2))
      l.setAttribute('y1', String(a.offsetTop + a.offsetHeight / 2))
      l.setAttribute('x2', String(b.offsetLeft + b.offsetWidth / 2))
      l.setAttribute('y2', String(b.offsetTop + b.offsetHeight / 2))
    })
  }, [])

  const applyPositions = useCallback(() => {
    if (inBoard) {
      // a board is freeform: each node at its per-board position (drag override wins).
      ;(deskGraph?.nodes || []).forEach((n) => {
        const el = nodeRefs.current[n.id]
        if (!el) return
        const p = boardPos.current[n.id] || [n.x, n.y]
        el.style.left = `${p[0]}px`; el.style.top = `${p[1]}px`
      })
      let t = 0
      const tick = () => { updateEdges(); if ((t += 16) < 700) requestAnimationFrame(tick) }
      tick()
      return
    }
    if (!graph) return
    if (lens === 'diary') {
      // x = when it entered your world, on a shared time axis; y = a lane per type.
      // Undated, Nishi-derived nodes (patterns) sit in a lane of their own at the bottom.
      const times = graph.nodes.filter((n) => n.date).map((n) => Date.parse(n.date!))
      const min = times.length ? Math.min(...times) : 0
      const max = times.length ? Math.max(...times) : 1
      const span = max - min || 1
      const laneY: Record<string, number> = { house: 150, piece: 480, clipping: 480, board: 810, note: 810 }
      const xL = 180, xR = STAGE_W - 300
      const stackAt: Record<string, number> = {}
      let undated = 0
      graph.nodes.forEach((n) => {
        const el = nodeRefs.current[n.id]
        if (!el) return
        if (n.date) {
          const x = xL + ((Date.parse(n.date) - min) / span) * (xR - xL)
          const lane = laneY[n.type] ?? 480
          const key = `${n.type}:${Math.round(x / 60)}` // stagger nodes landing near the same day
          const stack = (stackAt[key] = (stackAt[key] || 0) + 1) - 1
          el.style.left = `${x}px`; el.style.top = `${lane + stack * 42}px`
        } else {
          el.style.left = `${xL + undated * 250}px`; el.style.top = `${1160}px`
          undated += 1
        }
      })
    } else {
      graph.nodes.forEach((n) => {
        const el = nodeRefs.current[n.id]
        if (!el) return
        const p = posOverride.current[n.id] || [n.x, n.y]
        el.style.left = `${p[0]}px`
        el.style.top = `${p[1]}px`
      })
    }
    // animate edges alongside the CSS transition (~700ms)
    let t = 0
    const tick = () => { updateEdges(); if ((t += 16) < 700) requestAnimationFrame(tick) }
    tick()
  }, [graph, lens, updateEdges, inBoard, deskGraph])

  const fit = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const w = stage.clientWidth, h = stage.clientHeight
    // frame the actual node bounding box, not the whole canvas — the seed layout's
    // extent varies with how many nodes the desk holds.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    Object.values(nodeRefs.current).forEach((n) => {
      if (!n || n.style.display === 'none') return
      x0 = Math.min(x0, n.offsetLeft); y0 = Math.min(y0, n.offsetTop)
      x1 = Math.max(x1, n.offsetLeft + n.offsetWidth); y1 = Math.max(y1, n.offsetTop + n.offsetHeight)
    })
    const pad = 44
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = STAGE_W; y1 = STAGE_H }
    scale.current = Math.max(0.25, Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0), 1))
    tx.current = (w - (x1 - x0) * scale.current) / 2 - x0 * scale.current
    ty.current = (h - (y1 - y0) * scale.current) / 2 - y0 * scale.current
    applyTransform()
    updateEdges()
  }, [applyTransform, updateEdges])

  const zoom = useCallback((f: number) => {
    const stage = stageRef.current
    if (!stage) return
    const w = stage.clientWidth, h = stage.clientHeight
    const k = Math.min(1.5, Math.max(0.3, scale.current * f))
    tx.current = w / 2 - (w / 2 - tx.current) * (k / scale.current)
    ty.current = h / 2 - (h / 2 - ty.current) * (k / scale.current)
    scale.current = k
    applyTransform()
  }, [applyTransform])

  const focusNode = useCallback((id: string) => {
    const el = nodeRefs.current[id]
    const stage = stageRef.current
    if (!el || !stage) return
    const h = stage.clientHeight
    const panelW = panelRef.current ? panelRef.current.offsetWidth : 0
    const avail = Math.max(240, stage.clientWidth - panelW)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    Object.values(nodeRefs.current).forEach((n) => {
      if (!n || n.style.display === 'none') return
      x0 = Math.min(x0, n.offsetLeft); y0 = Math.min(y0, n.offsetTop)
      x1 = Math.max(x1, n.offsetLeft + n.offsetWidth); y1 = Math.max(y1, n.offsetTop + n.offsetHeight)
    })
    const pad = 26
    scale.current = Math.max(0.5, Math.min((avail - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0), 1))
    const cx = el.offsetLeft + el.offsetWidth / 2, cy = el.offsetTop + el.offsetHeight / 2
    const clamp = (want: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(want, lo), hi))
    tx.current = clamp(avail / 2 - cx * scale.current, avail - pad - x1 * scale.current, pad - x0 * scale.current)
    ty.current = clamp(h / 2 - cy * scale.current, h - pad - y1 * scale.current, pad - y0 * scale.current)
    applyTransform()
  }, [applyTransform])

  // position nodes before first paint (avoids a flash at 0,0)
  useLayoutEffect(() => { applyPositions() }, [applyPositions, view])

  // wire pan / zoom / drag once the stage is mounted (graph view only)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || view !== 'graph' || !deskGraph) return

    if (!fitted.current) { fit(); fitted.current = true } else { applyTransform(); updateEdges() }

    let mode: 'node' | 'pan' | null = null
    let sx = 0, sy = 0, ox = 0, oy = 0, el: HTMLElement | null = null, moved = 0
    let boardHover: string | null = null   // a board node the dragged card is hovering over

    // which board node (if any) sits under a dragged card's centre — for drag-to-board.
    const boardUnder = (card: HTMLElement) => {
      const cx = card.offsetLeft + card.offsetWidth / 2, cy = card.offsetTop + card.offsetHeight / 2
      for (const [id, bel] of Object.entries(nodeRefs.current)) {
        if (!bel || !id.startsWith('board:') || id === card.dataset.node || bel.style.display === 'none') continue
        if (cx >= bel.offsetLeft && cx <= bel.offsetLeft + bel.offsetWidth && cy >= bel.offsetTop && cy <= bel.offsetTop + bel.offsetHeight)
          return { id, el: bel }
      }
      return null
    }
    const clearHover = () => {
      if (boardHover) { const h = nodeRefs.current[boardHover]; if (h) h.style.outline = '' }
      boardHover = null
    }

    const onDown = (e: MouseEvent) => {
      const node = (e.target as HTMLElement).closest('[data-node]') as HTMLElement | null
      sx = e.clientX; sy = e.clientY; moved = 0
      if (node) {
        mode = 'node'; el = node
        ox = parseFloat(node.style.left); oy = parseFloat(node.style.top)
        node.style.transition = 'none'
        node.style.cursor = 'grabbing'
        node.style.zIndex = String((zTop.current += 1))
      } else {
        mode = 'pan'; ox = tx.current; oy = ty.current; stage.style.cursor = 'grabbing'
      }
    }
    const onMove = (e: MouseEvent) => {
      if (!mode) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy))
      if (mode === 'node' && el) {
        el.style.left = `${ox + dx / scale.current}px`
        el.style.top = `${oy + dy / scale.current}px`
        updateEdges()
        // in the total graph, dropping a card on a board node files it there — highlight the target
        if (!inBoard && !el.dataset.node!.startsWith('board:')) {
          const hit = boardUnder(el)
          if ((hit?.id ?? null) !== boardHover) {
            clearHover()
            if (hit) { boardHover = hit.id; hit.el.style.outline = `2px solid ${ACCENT}`; hit.el.style.outlineOffset = '3px' }
          }
        }
      } else if (mode === 'pan') {
        tx.current = ox + dx; ty.current = oy + dy; applyTransform()
      }
    }
    const onUp = () => {
      if (mode === 'node' && el) {
        el.style.cursor = 'grab'
        el.style.transition = 'left .55s cubic-bezier(.2,.8,.2,1), top .55s cubic-bezier(.2,.8,.2,1)'
        dragged.current = moved > 4
        const nid = el.dataset.node!
        const hit = !inBoard && dragged.current && !nid.startsWith('board:') ? boardUnder(el) : null
        clearHover()
        if (hit) {
          // dropped onto a board → add it to that board, and snap the card back (file, not move)
          boardItemMutRef.current.mutate({ slug: hit.id.slice('board:'.length), nodeId: nid })
          el.style.left = `${ox}px`; el.style.top = `${oy}px`; updateEdges()
        } else if (dragged.current) {
          const xy: [number, number] = [parseFloat(el.style.left), parseFloat(el.style.top)]
          if (inBoard) {
            boardPos.current[nid] = xy
            saveBoardPositions(boardSlug!, { [nid]: { x: xy[0], y: xy[1] } })
          } else {
            posOverride.current[nid] = xy
            if (lens !== 'free') setLens('free')
            save()
            persistPositions()
          }
        }
      }
      if (mode === 'pan') stage.style.cursor = 'grab'
      mode = null; el = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = stage.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const k = Math.min(1.5, Math.max(0.3, scale.current * (e.deltaY > 0 ? 0.92 : 1.08)))
      tx.current = mx - (mx - tx.current) * (k / scale.current)
      ty.current = my - (my - ty.current) * (k / scale.current)
      scale.current = k; applyTransform()
    }

    stage.addEventListener('mousedown', onDown)
    stage.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      stage.removeEventListener('mousedown', onDown)
      stage.removeEventListener('wheel', onWheel)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [view, deskGraph, inBoard, boardSlug, fit, applyTransform, updateEdges, save, persistPositions, lens])

  useEffect(() => {
    const onResize = () => fit()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStudy((s) => { if (s) return null; setOpen(null); return null }) }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey) }
  }, [fit])

  // persist the lens choice (positions persist to the backend on drag)
  useEffect(() => { save() }, [save])

  // ── handlers ──
  const openNode = useCallback((id: string) => {
    if (dragged.current) { dragged.current = false; return }
    setOpen(id)
    setTimeout(() => focusNode(id), 20)
  }, [focusNode])

  const focusFromIndex = useCallback((id: string) => {
    if (view !== 'graph') setView('graph')
    setOpen(id)
    setTimeout(() => focusNode(id), 60)
  }, [view, focusNode])

  // opening a board switches the desk into *that board's own graph* — only its items,
  // freely arranged, lines between them — not a modal, not a filter of the total desk.
  const enterBoard = useCallback((boardNodeId: string) => {
    const slug = boardNodeId.startsWith('board:') ? boardNodeId.slice('board:'.length) : boardNodeId
    setOpen(null); setStudy(null); setView('graph')
    boardPos.current = {}
    fitted.current = false
    setBoardSlug(slug)
  }, [])

  const exitBoard = useCallback(() => {
    setOpen(null); setStudy(null); setEditingBoard(false)
    boardPos.current = {}
    fitted.current = false
    setBoardSlug(null)
  }, [])

  // pinned-to edges are the source of truth for "is this piece pinned".
  const backendPinned = useMemo(
    () => new Set((graph?.edges || []).filter((e) => e.type === 'pinned-to').map((e) => e.from)),
    [graph],
  )
  const isPinned = (id: string) => backendPinned.has(id)
  const isPinnedTo = (pieceId: string, boardId: string) =>
    (graph?.edges || []).some((e) => e.type === 'pinned-to' && e.from === pieceId && e.to === boardId)

  const togglePin = useCallback((boardNodeId: string) => {
    if (!open || !open.startsWith('piece:')) return
    const slug = boardNodeId.slice('board:'.length)
    const wasPinned = isPinnedTo(open, boardNodeId)
    pinMut.mutate({ productId: open.slice('piece:'.length), boardSlug: slug, pinned: wasPinned })
    // keep the board's canvas in sync — pinning a piece to a board also places it there.
    boardItemMut.mutate({ slug, nodeId: open, remove: wasPinned })
  }, [open, pinMut, graph, boardItemMut])

  const toggleFollow = useCallback((houseNodeId: string, followed: boolean) => {
    if (!houseNodeId.startsWith('house:')) return
    followMut.mutate({ brandKey: houseNodeId.slice('house:'.length), followed })
  }, [followMut])

  const switchLens = useCallback((next: Lens) => {
    setLens(next)
    setTimeout(() => applyPositions(), 0)
  }, [applyPositions])

  // ── derived counts (backend truth) ──
  const followCount = graph?.stats.follows ?? 0
  const pinnedCount = graph?.stats.pinned ?? 0
  const boardCount = (id: string) => {
    const node = graph?.nodes.find((n) => n.id === id)
    return parseInt(node?.subtitle || '0', 10) || 0
  }

  const detail = useGraphNode(open)
  const studyData = useHouseStudy(study)

  if (isLoading || !graph) {
    return <div style={{ ...uppercase, padding: 40, color: '#7d776b', fontFamily: 'Newsreader, serif' }}>Assembling the desk…</div>
  }

  const openObj = open ? graph.nodes.find((n) => n.id === open) : undefined
  const openFollowed = openObj ? followedOf(openObj) : false

  // the index lists the FULL catalogue from graph.index, but shows a CURATED default per
  // section (what's on the desk / pinned / strongest), with "show all" for the tail.
  const onDeskOr = (items: IndexItem[], min: number) => {
    const active = items.filter((it) => it.onDesk)
    return active.length >= min ? active : items.slice(0, Math.max(min, active.length))
  }
  // Boards first (yours), sticky under the search box. Pieces are search-only — the
  // catalogue grows without bound, so you find a piece by typing rather than scrolling.
  const indexGroups = [
    { key: 'boards', label: 'Boards', kind: 'board' as const, items: graph.index.boards, curated: graph.index.boards, sticky: true, searchOnly: false },
    { key: 'houses', label: 'Houses', kind: 'house' as const, items: graph.index.houses, curated: onDeskOr(graph.index.houses, 8), sticky: false, searchOnly: false },
    { key: 'pieces', label: 'Pieces', kind: 'piece' as const, items: graph.index.pieces, curated: [] as IndexItem[], sticky: false, searchOnly: true },
    { key: 'patterns', label: 'Kindred', kind: 'pattern' as const, items: graph.index.patterns, curated: graph.index.patterns.slice(0, 12), sticky: false, searchOnly: false },
    { key: 'clippings', label: 'Clippings & notes', kind: 'note' as const, items: graph.index.notes, curated: graph.index.notes, sticky: false, searchOnly: false },
  ]
  const q = query.trim().toLowerCase()
  const matchesItem = (it: { label: string; sub?: string }) => !q || (it.label + ' ' + (it.sub || '')).toLowerCase().includes(q)
  const matchesNode = (n: GraphNode) => !q || (n.label + ' ' + n.tags.join(' ') + ' ' + (n.subtitle || '')).toLowerCase().includes(q)
  const anyHits = indexGroups.some((g) => g.items.some(matchesItem))

  let counter = 0

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto', background: '#fbfaf8', color: INK, overflow: 'hidden' }}>

      {/* ── status rail ── */}
      <header style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1fr auto', gap: 24, alignItems: 'baseline', padding: '12px 22px', borderBottom: `1px solid ${INK}`, ...railType }}>
        <Link to="/" style={{ color: INK }}>
          <div>Nishi 西</div>
          <div style={{ color: '#7d776b' }}>Taste graph</div>
        </Link>
        <div>
          <div style={{ color: '#7d776b' }}>Open thread</div>
          {graph.openThread ? (
            <button onClick={() => enterBoard(graph.openThread!.nodeId)}
              style={{ ...railBtn, padding: 0, color: INK, textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {graph.openThread.label}
            </button>
          ) : (
            <div style={{ color: '#a09a8d', fontStyle: 'italic' }}>no board set</div>
          )}
        </div>
        <div>
          <div style={{ color: '#7d776b' }}>Your graph</div>
          <div>{pinnedCount} pinned · {followCount} followed</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <button onClick={() => setView('graph')} style={{ ...railBtn, color: view === 'graph' ? INK : '#7d776b' }}>Graph</button>
          <button onClick={() => setView('list')} style={{ ...railBtn, color: view === 'list' ? INK : '#7d776b' }}>List</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '218px 1fr', minHeight: 0 }}>

        {/* ── index of everything ── */}
        <aside style={{ borderRight: `1px solid ${INK}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#f6f4ef' }}>
          <div style={{ padding: '11px 13px 10px', borderBottom: '1px solid rgba(20,19,16,.28)' }}>
            <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16, paddingBottom: 9 }}>Index of everything</div>
            <div style={{ position: 'relative' }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pieces, houses, kindred…"
                style={{ width: '100%', border: '1px solid rgba(20,19,16,.28)', background: '#fff', padding: '7px 26px 7px 9px', fontFamily: 'Newsreader, serif', fontSize: 13, color: INK, outline: 'none' }} />
              {query && (
                <button onClick={() => setQuery('')} title="Clear search"
                  style={{ position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)', width: 20, height: 20, display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'none', border: 'none', color: '#7d776b', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>
          </div>
          <div style={{ overflow: 'auto', flex: 1, paddingBottom: 20 }}>
            {indexGroups.map((g) => {
              const searching = !!q
              if (g.searchOnly && !searching) return null // pieces: search to find them
              const all = g.items.filter(matchesItem)
              if (!all.length && g.key !== 'boards') return null
              const isCollapsed = collapsed[g.key] && !searching
              // when searching, show every match; otherwise the curated set unless "show all"
              const shown = searching ? all : (showAll[g.key] ? g.items : g.curated)
              const hiddenCount = all.length - g.curated.length
              return (
                <div key={g.key} style={g.sticky ? { position: 'sticky', top: 0, zIndex: 2, background: '#f6f4ef', boxShadow: '0 1px 0 rgba(20,19,16,.28)' } : undefined}>
                  <button onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                    style={{ ...indexHead, width: '100%', cursor: 'pointer', textAlign: 'left', background: g.sticky ? '#f6f4ef' : 'none', border: 'none' }}>
                    <span style={{ color: '#a09a8d' }}>{isCollapsed ? '▸' : '▾'}</span><span>{g.label}</span>
                    {g.key === 'boards' && !searching ? (
                      <span onClick={(e) => { e.stopPropagation(); setCompose(true); setOpen(null); setStudy(null) }}
                        style={{ cursor: 'pointer', letterSpacing: '.18em', textTransform: 'uppercase', color: ACCENT }}>+ new</span>
                    ) : (
                      <span>{all.length}</span>
                    )}
                  </button>
                  {!isCollapsed && shown.map((it) => {
                    counter += 1
                    return (
                      <button key={it.id} onClick={() => {
                        if (g.kind === 'board') enterBoard(it.id)
                        else if (inBoard) boardItemMut.mutate({ slug: boardSlug!, nodeId: it.id })
                        else if (study && g.kind === 'house') setStudy(it.id)  // switch the long view in place
                        else focusFromIndex(it.id)
                      }} style={indexRow}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fffdf9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                        <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, color: '#a09a8d', fontVariantNumeric: 'tabular-nums' }}>{String(counter).padStart(2, '0')}</span>
                        <span style={{ fontFamily: 'Newsreader, serif', fontSize: 12.5, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
                        {g.kind === 'house' && (
                          <span title={it.followed ? 'following' : 'suggested'}
                            style={{ width: 7, height: 7, borderRadius: '50%', alignSelf: 'center', background: it.followed ? ACCENT : 'transparent', border: it.followed ? 'none' : '1px solid #b6b0a3' }} />
                        )}
                        {g.kind === 'pattern' && <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, color: '#a09a8d' }}>{it.weight}</span>}
                        {g.kind === 'board' && <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, color: '#a09a8d' }}>{it.count}</span>}
                      </button>
                    )
                  })}
                  {!isCollapsed && !searching && hiddenCount > 0 && (
                    <button onClick={() => setShowAll((s) => ({ ...s, [g.key]: !s[g.key] }))}
                      style={{ width: '100%', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid rgba(20,19,16,.14)', padding: '7px 13px 7px 49px', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 12, color: ACCENT }}>
                      {showAll[g.key] ? 'show fewer' : `show all ${all.length}`}
                    </button>
                  )}
                </div>
              )
            })}
            {!anyHits && <div style={{ padding: '18px 13px', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 14, color: '#7d776b' }}>Nothing by that name yet — clip it below.</div>}
          </div>
          <div style={{ borderTop: '1px solid rgba(20,19,16,.28)', padding: '11px 13px', fontFamily: 'Reenie Beanie, cursive', fontSize: 23, color: ACCENT }}>drag pins to think — the lines follow</div>
        </aside>

        {/* ── right column: desk or list ── */}
        <div style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          <div style={{ display: view === 'graph' ? 'flex' : 'none', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '8px 16px', borderBottom: '1px solid rgba(20,19,16,.28)', ...railType }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {inBoard ? (
                <>
                  <button onClick={exitBoard} style={{ ...lensBtn(false), color: ACCENT }}>← Everything</button>
                  <span style={{ color: '#7d776b' }}>Board</span>
                  <span style={{ fontFamily: 'Newsreader, serif', fontSize: 17, textTransform: 'none', letterSpacing: 0 }}>{boardQ.data?.board.name || '…'}</span>
                  <button onClick={() => setEditingBoard(true)} title="Rename / edit description"
                    style={{ ...lensBtn(false), color: '#7d776b' }}>edit</button>
                  <button
                    onClick={() => boardQ.data && updateBoardMut.mutate({ slug: boardSlug!, open_thread: !boardQ.data.board.isOpenThread })}
                    title="Pin this board in the header as your open thread"
                    style={{ ...lensBtn(!!boardQ.data?.board.isOpenThread), color: boardQ.data?.board.isOpenThread ? ACCENT : '#7d776b' }}>
                    {boardQ.data?.board.isOpenThread ? '★ open thread' : 'make open thread'}
                  </button>
                  <span style={{ color: '#a09a8d' }}>{boardQ.data ? `${boardQ.data.board.count} things` : ''}</span>
                </>
              ) : (
                <>
                  <span style={{ color: '#7d776b' }}>Arrangement</span>
                  <button onClick={() => switchLens('free')} style={lensBtn(lens === 'free')}>Yours</button>
                  <button onClick={() => switchLens('diary')} style={lensBtn(lens === 'diary')}>By day clipped</button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {inBoard ? (
                <span style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 26, textTransform: 'none', letterSpacing: 0, color: '#7d776b' }}>
                  add from the index · drag to arrange · ✕ to remove
                </span>
              ) : lens === 'diary' && (
                <span style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 26, textTransform: 'none', letterSpacing: 0, color: '#7d776b' }}>
                  drag anything to go back to your own arrangement
                </span>
              )}
              <button onClick={() => zoom(1 / 1.15)} style={iconBtn}>−</button>
              <button onClick={() => zoom(1.15)} style={iconBtn}>+</button>
              <button onClick={() => fit()} style={{ ...iconBtn, width: 'auto', padding: '6px 12px', letterSpacing: '.14em' }}>Recentre</button>
            </div>
          </div>

          {view === 'graph' ? (
            <div ref={stageRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', cursor: 'grab', backgroundImage: 'linear-gradient(rgba(20,19,16,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(20,19,16,.07) 1px, transparent 1px)', backgroundSize: '34px 34px' }}>
              <div ref={panRef} style={{ position: 'absolute', top: 0, left: 0, width: STAGE_W, height: STAGE_H, transformOrigin: '0 0', willChange: 'transform' }}>

                <svg ref={svgRef} width={STAGE_W} height={STAGE_H} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                  {/* direct — solid, a factual membership (piece → house) */}
                  <g stroke={INK} strokeOpacity=".3" strokeWidth="1">
                    {deskEdges.filter((e) => e.dim === 'direct').map((e, i) => <line key={i} data-from={e.from} data-to={e.to} />)}
                  </g>
                  {/* indirect — derived pattern trait, dotted neutral */}
                  <g stroke={INK} strokeOpacity=".34" strokeWidth="1" strokeDasharray={DOT} strokeLinecap="round">
                    {deskEdges.filter((e) => e.dim === 'pattern').map((e, i) => <line key={i} data-from={e.from} data-to={e.to} />)}
                  </g>
                  {/* kindred houses — dotted, coloured by why (aesthetic / region / price) */}
                  <g stroke={LINE_AESTHETIC} strokeWidth="1.9" strokeDasharray={DOT} strokeLinecap="round">
                    {deskEdges.filter((e) => e.dim === 'aesthetic').map((e, i) => <line key={i} data-from={e.from} data-to={e.to} />)}
                  </g>
                  <g stroke={LINE_REGION} strokeWidth="1.9" strokeDasharray={DOT} strokeLinecap="round">
                    {deskEdges.filter((e) => e.dim === 'region').map((e, i) => <line key={i} data-from={e.from} data-to={e.to} />)}
                  </g>
                  <g stroke={LINE_PRICE} strokeWidth="1.9" strokeDasharray={DOT} strokeLinecap="round">
                    {deskEdges.filter((e) => e.dim === 'price').map((e, i) => <line key={i} data-from={e.from} data-to={e.to} />)}
                  </g>
                  {/* pins — your deliberate act, solid accent ("pinning draws the line") */}
                  <g stroke={ACCENT} strokeWidth="1.6">
                    {deskEdges.filter((e) => e.dim === 'pin').map((e, i) => <line key={i} data-from={e.from} data-to={e.to} />)}
                  </g>
                </svg>

                {!inBoard && lens === 'diary' && (() => {
                  const times = graph.nodes.filter((n) => n.date).map((n) => Date.parse(n.date!))
                  if (!times.length) return null
                  const min = Math.min(...times), max = Math.max(...times)
                  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                  return (
                    <>
                      <DayMark left={180} top={60} width={280}>{fmt(min)} — earliest</DayMark>
                      <DayMark left={STAGE_W - 560} top={60} width={280}>{fmt(max)} — latest</DayMark>
                      <div style={{ position: 'absolute', left: 180, top: 1120, width: STAGE_W - 480, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: '#7d776b', borderTop: `1px solid ${INK}`, paddingTop: 6 }}>No date — Nishi noticed, and yours</div>
                    </>
                  )
                })()}

                {deskNodes.map((n) => (
                  <NodeCard
                    key={n.id}
                    node={n}
                    followed={followedOf(n)}
                    pinned={isPinned(n.id)}
                    count={n.type === 'board' ? boardCount(n.id) : undefined}
                    highlighted={open === n.id}
                    innerRef={(el) => { nodeRefs.current[n.id] = el }}
                    onOpen={() => {
                      if (n.type === 'board') enterBoard(n.id)
                      else if (n.id.startsWith('local:')) { if (n.type === 'link' && n.url) window.open(n.url, '_blank', 'noopener') }
                      else openNode(n.id)
                    }}
                    onRemove={inBoard ? () => boardItemMut.mutate({ slug: boardSlug!, nodeId: n.id, remove: true }) : undefined}
                  />
                ))}
              </div>

              {/* legend — what the lines mean */}
              <div style={{ position: 'absolute', left: 14, bottom: 14, zIndex: 5, background: 'rgba(251,250,248,.9)', border: '1px solid rgba(20,19,16,.22)', padding: '9px 12px', display: 'grid', gap: 5, fontFamily: 'Newsreader, serif', fontSize: 11, color: '#45413a' }}>
                <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7d776b', paddingBottom: 2 }}>How things connect</div>
                <LegendRow color={INK} dotted={false} label="Direct — made by, pinned" />
                <LegendRow color={INK} dotted label="Shared kindred" faint />
                <LegendRow color={LINE_AESTHETIC} dotted label="Kindred · aesthetic" />
                <LegendRow color={LINE_REGION} dotted label="Kindred · where founded" />
                <LegendRow color={LINE_PRICE} dotted label="Kindred · price point" />
              </div>

              {inBoard && (
                <BoardAddBar onAdd={(payload) => {
                  const n = deskNodes.length
                  addLocalMut.mutate({ slug: boardSlug!, ...payload, x: 260 + (n % 6) * 46, y: 170 + (n % 6) * 46 })
                }} />
              )}
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 22px 44px' }}>
              {listQ.isLoading || !listQ.data ? (
                <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16, color: '#7d776b' }}>Gathering the library…</div>
              ) : (() => {
                const groups = [
                  { key: 'boards' as const, label: 'Boards' },
                  { key: 'houses' as const, label: 'Houses' },
                  { key: 'pieces' as const, label: 'Pieces' },
                  { key: 'kindred' as const, label: 'Kindred' },
                  { key: 'clips' as const, label: 'Clippings' },
                ]
                const archivedItems = listQ.data!.archived.filter(matchesItem)
                const hitTotal = groups.reduce((s, g) => s + listQ.data![g.key].filter(matchesItem).length, 0) + archivedItems.length
                if (!hitTotal) return <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16, color: '#7d776b' }}>Nothing by that name.</div>
                const slugOf = (nodeId: string) => nodeId.replace('board:', '')
                return (
                  <>
                    {groups.map((g) => {
                      const items = listQ.data![g.key].filter(matchesItem)
                      if (!items.length) return null
                      return (
                        <section key={g.key} style={{ marginBottom: 30 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: `1px solid ${INK}`, paddingBottom: 6, marginBottom: 14 }}>
                            <h3 style={{ margin: 0, fontFamily: 'Newsreader, serif', fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase' }}>{g.label}</h3>
                            <span style={{ fontFamily: 'Newsreader, serif', fontSize: 12, color: '#a09a8d' }}>{items.length}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px 18px' }}>
                            {items.map((it) => (
                              <ListRow key={it.node_id} item={it} kindOf={g.key}
                                onOpen={() => (g.key === 'boards' ? enterBoard(it.node_id) : openNode(it.node_id))} />
                            ))}
                          </div>
                        </section>
                      )
                    })}
                    {archivedItems.length > 0 && (
                      <section style={{ marginBottom: 30 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid rgba(20,19,16,.3)', paddingBottom: 6, marginBottom: 14 }}>
                          <h3 style={{ margin: 0, fontFamily: 'Newsreader, serif', fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7d776b' }}>Archived</h3>
                          <span style={{ fontFamily: 'Newsreader, serif', fontSize: 12, color: '#a09a8d' }}>{archivedItems.length}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px 18px' }}>
                          {archivedItems.map((it) => (
                            <ArchivedRow key={it.node_id} item={it}
                              onRestore={() => updateBoardMut.mutate({ slug: slugOf(it.node_id), archived: false })}
                              onDelete={() => deleteBoardMut.mutate(slugOf(it.node_id))} />
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {/* ── detail pop-out ── */}
          {open && detail.data && (
            <aside ref={panelRef as React.RefObject<HTMLElement>} onClick={(e) => e.stopPropagation()}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 40, width: 'min(430px, 40%)', minWidth: 260, overflow: 'auto', background: '#fbfaf8', borderLeft: `1px solid ${INK}`, boxShadow: '-18px 0 40px -30px rgba(20,19,16,.9)', animation: 'slideIn .4s cubic-bezier(.2,.8,.2,1) both' }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fbfaf8', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 20px', borderBottom: `1px solid ${INK}`, ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.18em' }}>
                <span>{detail.data.kind}</span>
                <button onClick={() => setOpen(null)} style={{ cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'Newsreader, serif', fontSize: 15, letterSpacing: '.18em', textTransform: 'uppercase' }}>Close ×</button>
              </div>

              <div style={{ borderBottom: '1px solid rgba(20,19,16,.28)', padding: 20 }}>
                {detail.data.image ? (
                  <div style={{ aspectRatio: '4/5', border: '1px solid rgba(20,19,16,.16)', overflow: 'hidden', background: STRIPE }}>
                    <img src={detail.data.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', aspectRatio: '4/5', background: STRIPE, border: '1px solid rgba(20,19,16,.16)' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '.16em', color: '#8b857a' }}>IMAGE</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 14 }}>
                  {detail.data.tags.map((t) => <span key={t} style={pill(13)}>{t}</span>)}
                </div>
              </div>

              <div style={{ padding: '20px 20px 34px', minWidth: 0 }}>
                <h2 style={{ fontFamily: 'Newsreader, serif', fontWeight: 400, fontSize: 33, lineHeight: 1.06, margin: 0 }}>{detail.data.title}</h2>
                <p style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 17, lineHeight: 1.55, color: '#35322a', margin: '12px 0 0', maxWidth: '42ch' }}>{detail.data.desc}</p>

                {detail.data.type === 'house' && detail.data.codes && detail.data.codes.length > 0 && (
                  <div style={{ paddingTop: 16 }}>
                    <div style={{ ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.18em', color: '#7d776b', paddingBottom: 8 }}>House codes</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detail.data.codes.map((c, i) => <span key={i} style={pill(12.5)}>{c}</span>)}
                    </div>
                  </div>
                )}

                {detail.data.isHouse && (() => {
                  const followed = detail.data.followed ?? openFollowed
                  return (
                  <>
                    <button onClick={() => toggleFollow(open, followed)} disabled={followMut.isPending}
                      onMouseEnter={() => setFollowHover(true)} onMouseLeave={() => setFollowHover(false)}
                      style={{ width: '100%', cursor: followMut.isPending ? 'default' : 'pointer', marginTop: 18,
                        background: followed ? (followHover ? ACCENT : INK) : 'none',
                        color: followed ? '#fbfaf8' : INK,
                        border: `1px solid ${followed && followHover ? ACCENT : INK}`,
                        padding: 11, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase' }}>
                      {followed ? (followHover ? 'Unfollow' : 'Following ✓') : (followMut.isPending ? 'Following…' : 'Follow this house')}
                    </button>
                    <button onClick={() => setStudy(open)}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(20,19,16,.3)'; e.currentTarget.style.color = INK }}
                      style={{ width: '100%', cursor: 'pointer', marginTop: 8, background: 'none', color: INK, border: '1px solid rgba(20,19,16,.3)', padding: 11, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase' }}>
                      The long view — history &amp; lineage ↗
                    </button>
                  </>
                  )
                })()}

                <div style={{ borderTop: `1px solid ${INK}`, marginTop: 20 }}>
                  {detail.data.meta.map((row) => (
                    <div key={row.k} style={{ display: 'grid', gridTemplateColumns: '104px 1fr', borderBottom: '1px solid rgba(20,19,16,.18)' }}>
                      <div style={{ padding: '9px 12px 9px 0', ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.18em', color: '#7d776b' }}>{row.k}</div>
                      <div style={{ padding: '9px 0', fontFamily: 'Newsreader, serif', fontSize: 16 }}>{row.v}</div>
                    </div>
                  ))}
                </div>

                {detail.data.clip && <ClipEditor clip={detail.data.clip} boards={graph.index.boards} onClose={() => setOpen(null)} />}

                <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 21, padding: '22px 0 4px' }}>Connected to</div>
                {detail.data.connected.map((l) => (
                  <button key={l.id} onClick={() => openNode(l.id)}
                    style={{ width: '100%', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid rgba(20,19,16,.18)', padding: '11px 0', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'Newsreader, serif', fontSize: 17 }}>{l.title}</span>
                    <span style={{ ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.16em', color: '#7d776b' }}>{l.kind}</span>
                    <span style={{ fontFamily: 'Newsreader, serif', fontSize: 14, color: ACCENT }}>↗</span>
                  </button>
                ))}

                {detail.data.type === 'piece' && detail.data.url && (
                  <>
                    <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 21, padding: '26px 0 4px' }}>Where to buy</div>
                    <a href={detail.data.url} target="_blank" rel="noopener noreferrer"
                      onMouseEnter={(e) => (e.currentTarget.style.paddingLeft = '8px')}
                      onMouseLeave={(e) => (e.currentTarget.style.paddingLeft = '0px')}
                      style={{ borderBottom: '1px solid rgba(20,19,16,.18)', padding: '11px 0', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'baseline', transition: 'padding-left .3s ease', color: INK }}>
                      <span style={{ fontFamily: 'Newsreader, serif', fontSize: 17 }}>{detail.data.house || 'The house'} — direct</span>
                      <span style={{ fontFamily: 'Newsreader, serif', fontSize: 14, color: '#45413a' }}>{detail.data.price}</span>
                      <span style={{ fontFamily: 'Newsreader, serif', fontSize: 14, color: ACCENT }}>↗</span>
                    </a>
                  </>
                )}

                {detail.data.canPin && (
                  <>
                    <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 21, padding: '26px 0 4px' }}>Pin to a board</div>
                    {detail.data.boards.map((b) => {
                      const on = isPinnedTo(open, b.id)
                      return (
                        <button key={b.id} onClick={() => togglePin(b.id)}
                          style={{ width: '100%', cursor: 'pointer', textAlign: 'left', background: on ? '#f2e6c9' : 'none', color: INK, border: `1px solid ${INK}`, padding: '11px 13px', marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'baseline', fontFamily: 'Newsreader, serif' }}>
                          <span style={{ fontSize: 17 }}>{b.name}</span>
                          <span style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase' }}>{on ? 'pinned — unpin' : 'pin here'}</span>
                        </button>
                      )
                    })}
                    <div style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 26, color: ACCENT, paddingTop: 10 }}>pinning draws the line on the desk</div>
                  </>
                )}
              </div>
            </aside>
          )}

          {/* ── house study: the long view ── */}
          {study && studyData.data && (
            <HouseStudy
              study={studyData.data}
              onClose={() => setStudy(null)}
              onOpenHouse={(id) => setStudy(id)}
              onOpenNode={(id) => { setStudy(null); openNode(id) }}
            />
          )}

          {/* ── new board ── */}
          {compose && (
            <ComposePanel
              pending={boardMut.isPending}
              onClose={() => setCompose(false)}
              onCreate={(name, description, tags) => boardMut.mutate({ name, description, tags }, { onSuccess: () => setCompose(false) })}
            />
          )}

          {/* ── edit this board's title / description ── */}
          {editingBoard && inBoard && boardQ.data && (
            <ComposePanel
              editing
              pending={updateBoardMut.isPending}
              initial={{ name: boardQ.data.board.name, description: boardQ.data.board.description, tags: (boardQ.data.board.tags || []).join(', ') }}
              onClose={() => setEditingBoard(false)}
              onCreate={(name, description, tags) => updateBoardMut.mutate({ slug: boardSlug!, name, description, tags }, { onSuccess: () => setEditingBoard(false) })}
              onArchive={() => updateBoardMut.mutate({ slug: boardSlug!, archived: true }, { onSuccess: () => { setEditingBoard(false); exitBoard() } })}
              onDelete={() => deleteBoardMut.mutate(boardSlug!, { onSuccess: () => { setEditingBoard(false); exitBoard() } })}
            />
          )}
        </div>
      </div>

      {/* ── capture bar ── */}
      <CaptureBar boards={graph.index.boards} onCaptured={(id) => openNode(id)} />
    </div>
  )
}

// ── node card ──
function NodeCard({ node, followed, pinned, count, highlighted, innerRef, onOpen, onRemove }: {
  node: GraphNode
  followed: boolean
  pinned: boolean
  count?: number
  highlighted: boolean
  innerRef: (el: HTMLDivElement | null) => void
  onOpen: () => void
  onRemove?: () => void
}) {
  const isPattern = node.type === 'pattern'
  const isBoard = node.type === 'board'
  const isNote = node.type === 'note'
  const suggested = node.suggested && !followed

  const base: React.CSSProperties = {
    position: 'absolute', width: cardWidth(node.type), cursor: 'grab', userSelect: 'none',
    padding: '11px 13px 13px', border: `1px solid ${INK}`,
    transition: 'left .55s cubic-bezier(.2,.8,.2,1), top .55s cubic-bezier(.2,.8,.2,1)',
  }
  if (isPattern) Object.assign(base, { background: INK, color: '#fbfaf8', outline: `1px solid ${highlighted ? ACCENT : INK}`, outlineOffset: 4 })
  else if (isNote) Object.assign(base, { background: '#f2e6c9', boxShadow: '3px 3px 0 rgba(20,19,16,.1)' })
  else if (suggested) Object.assign(base, { background: '#fbfaf8', borderStyle: 'dashed', borderColor: 'rgba(20,19,16,.5)', opacity: 0.72 })
  else Object.assign(base, { background: '#fff', boxShadow: '3px 3px 0 rgba(20,19,16,.1)' })
  if (isBoard) Object.assign(base, { backgroundImage: 'radial-gradient(rgba(20,19,16,.16) 1px, transparent 1px)', backgroundSize: '16px 16px' })
  if (highlighted && !isPattern) Object.assign(base, { outline: `1px solid ${ACCENT}`, outlineOffset: 4 })

  const showPinmark = pinned && !isPattern && !isBoard

  return (
    <div ref={innerRef} data-node={node.id} onClick={onOpen} style={base}>
      {showPinmark && <span style={{ position: 'absolute', top: -5, right: -5, width: 10, height: 10, background: ACCENT }} />}
      {onRemove && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="Remove from this board"
          style={{ position: 'absolute', top: -9, right: -9, width: 20, height: 20, borderRadius: '50%', border: `1px solid ${INK}`, background: '#fbfaf8', color: INK, cursor: 'pointer', fontSize: 12, lineHeight: '18px', padding: 0, zIndex: 3 }}>×</button>
      )}
      {renderBody(node, count, suggested, followed)}
    </div>
  )
}

function renderBody(node: GraphNode, count: number | undefined, suggested: boolean | undefined, followed: boolean) {
  const eyebrow = (text: string, dark = false, dashed = false) => (
    <div style={{ fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: dark ? 'rgba(251,250,248,.62)' : '#7d776b', borderBottom: dashed ? '1px dashed rgba(20,19,16,.3)' : `1px solid ${dark ? 'rgba(251,250,248,.28)' : 'rgba(20,19,16,.2)'}`, paddingBottom: 6 }}>{text}</div>
  )
  const title = (size: number, pad = '7px 0 9px', color?: string) => (
    <div style={{ fontFamily: 'Newsreader, serif', fontSize: size, padding: pad, color }}>{node.label}</div>
  )
  const tagPills = node.tags.length > 0 && (
    <div style={{ display: 'flex', gap: 6, paddingTop: 8 }}>{node.tags.slice(0, 2).map((t) => <span key={t} style={pill(12)}>{t}</span>)}</div>
  )
  const shot = (ratio: string, label: string) => node.image ? (
    <div style={{ aspectRatio: ratio, border: '1px solid rgba(20,19,16,.12)', overflow: 'hidden', background: STRIPE }}>
      <img src={node.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  ) : (
    <div style={{ display: 'grid', placeItems: 'center', aspectRatio: ratio, background: STRIPE, border: '1px solid rgba(20,19,16,.12)' }}>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '.14em', color: '#8b857a' }}>{label}</span>
    </div>
  )

  switch (node.type) {
    case 'house':
      if (suggested !== undefined && node.suggested) {
        return <>
          <div style={{ fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7d776b', borderBottom: '1px dashed rgba(20,19,16,.3)', paddingBottom: 6 }}>
            House · {followed ? 'following' : 'suggested'}
          </div>
          <div style={{ fontFamily: 'Newsreader, serif', fontSize: 19, paddingTop: 7 }}>{node.label}</div>
          {node.subtitle && <div style={{ ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.1em', color: '#7d776b', paddingTop: 5 }}>{node.subtitle}</div>}
        </>
      }
      return <>{eyebrow('House')}<div style={{ fontFamily: 'Newsreader, serif', fontSize: 19, paddingTop: 7 }}>{node.label}</div>{tagPills}</>
    case 'piece':
      return <>{eyebrow('Piece')}{title(19)}{shot('4/3', 'PIECE SHOT')}{tagPills}</>
    case 'clipping':
      return <>{eyebrow('Clipping')}{title(18)}{shot('3/4', 'RUNWAY')}</>
    case 'pattern':
      return <>{eyebrow('Kindred', true)}<div style={{ fontFamily: 'Newsreader, serif', fontSize: 20, paddingTop: 7 }}>{node.label}</div>
        <div style={{ ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 12, letterSpacing: '.1em', color: 'rgba(251,250,248,.62)', paddingTop: 5 }}>{node.weight} things</div></>
    case 'board':
      return <>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7d776b' }}>{node.id === 'collartheory' ? 'Board · open thread' : 'Board'}</div>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 21, paddingTop: 4 }}>{node.label}</div>
        <div style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
          <span style={{ flex: 1, aspectRatio: '3/4', background: 'repeating-linear-gradient(45deg, #efece5 0 7px, #f7f5f0 7px 14px)', border: '1px solid rgba(20,19,16,.12)' }} />
          <span style={{ flex: 1, aspectRatio: '3/4', background: 'repeating-linear-gradient(45deg, #efece5 0 7px, #f7f5f0 7px 14px)', border: '1px solid rgba(20,19,16,.12)' }} />
          <span style={{ flex: 1, aspectRatio: '3/4', background: node.id === 'tokyo' ? '#e3e6ef' : '#e7e2d6', border: '1px solid rgba(20,19,16,.12)' }} />
        </div>
        <div style={{ ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.12em', color: '#7d776b', paddingTop: 8 }}>{count ?? node.subtitle} things</div>
      </>
    case 'note':
      return <>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#6d5f3a' }}>{node.subtitle}</div>
        <p style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 30, lineHeight: 1.28, margin: '5px 0 0', color: '#221d10' }}>{node.label}</p>
      </>
    case 'swatch':
      return <>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7d776b' }}>Swatch</div>
        <div style={{ aspectRatio: '3 / 2', marginTop: 8, border: '1px solid rgba(20,19,16,.2)', background: node.color || '#000' }} />
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, paddingTop: 7, color: '#45413a' }}>{node.label}</div>
      </>
    case 'link':
      return <>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7d776b' }}>Link ↗</div>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 18, paddingTop: 6 }}>{node.label}</div>
        {node.url && <div style={{ fontFamily: 'Newsreader, serif', fontSize: 12, color: ACCENT, paddingTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.url.replace(/^https?:\/\//, '')}</div>}
      </>
    default:
      return null
  }
}

function DayMark({ left, top, width, children }: { left: number; top: number; width: number; children: React.ReactNode }) {
  return <div style={{ position: 'absolute', left, top, width, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: ACCENT, borderBottom: `1px solid ${INK}`, paddingBottom: 6 }}>{children}</div>
}

// ── clip editor — captures are editable: retype, re-tag, re-board, or delete ──
function ClipEditor({ clip, boards, onClose }: { clip: ClipEditable; boards: IndexItem[]; onClose: () => void }) {
  const update = useUpdateClip()
  const del = useDeleteClip()
  const [kind, setKind] = useState(clip.kind)
  const [text, setText] = useState(clip.text)
  const [tags, setTags] = useState(clip.tags.join(', '))
  const [board, setBoard] = useState(clip.board_slug || '')
  const boardSlug = (id: string) => id.replace('board:', '')
  const label: React.CSSProperties = { display: 'block', ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.18em', color: '#7d776b', paddingTop: 14 }
  const field: React.CSSProperties = { width: '100%', marginTop: 5, border: '1px solid rgba(20,19,16,.28)', background: '#fff', padding: '8px', fontFamily: 'Newsreader, serif', fontSize: 15, color: INK, outline: 'none' }
  return (
    <div style={{ borderTop: `1px solid ${INK}`, marginTop: 20, paddingTop: 4 }}>
      <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 21, padding: '14px 0 0' }}>Edit clip</div>
      <label style={label}>Type <span style={{ textTransform: 'none', letterSpacing: 0, color: '#a09a8d' }}>— Nishi's guess, change if wrong</span></label>
      <select value={kind} onChange={(e) => setKind(e.target.value)} style={field}>
        <option value="note">Note — a thought</option>
        <option value="clip">Clipping — image / link</option>
        <option value="piece">Piece — a garment</option>
        <option value="house">House — a label</option>
      </select>
      <label style={label}>Text</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...field, resize: 'vertical', fontWeight: 300, lineHeight: 1.5 }} />
      <label style={label}>Tags — comma separated</label>
      <input value={tags} onChange={(e) => setTags(e.target.value)} style={field} />
      <label style={label}>Board</label>
      <select value={board} onChange={(e) => setBoard(e.target.value)} style={field}>
        <option value="">no board</option>
        {boards.map((b) => <option key={b.id} value={boardSlug(b.id)}>→ {b.label}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button disabled={update.isPending} onClick={() => update.mutate({ id: clip.id, kind, text, tags, board })}
          style={{ flex: 1, cursor: 'pointer', background: INK, color: '#fbfaf8', border: 'none', padding: 11, ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em' }}>
          {update.isPending ? 'Saving…' : update.isSuccess ? 'Saved ✓' : 'Save'}
        </button>
        <button onClick={() => del.mutate(clip.id, { onSuccess: onClose })}
          style={{ cursor: 'pointer', background: 'none', color: ACCENT, border: `1px solid rgba(20,19,16,.3)`, padding: '11px 14px', ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em' }}>Delete</button>
      </div>
    </div>
  )
}

// ── capture bar — the inbox: clip a thought / link / image → Claude types it ──
function CaptureBar({ boards, onCaptured }: { boards: IndexItem[]; onCaptured: (nodeId: string) => void }) {
  const capture = useCapture()
  const uploadImage = useUploadImage()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [image, setImage] = useState('')
  const [board, setBoard] = useState('')
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const boardSlug = (id: string) => id.replace('board:', '')
  const submit = () => {
    if (!text.trim() && !url.trim() && !image.trim()) return
    capture.mutate(
      { text: text.trim(), url: url.trim(), image_url: image.trim(), board: board || undefined },
      { onSuccess: (d) => { setText(''); setUrl(''); setImage(''); setOpen(false); onCaptured(d.node_id) } },
    )
  }
  const takeImageFile = (file: File | Blob) => {
    setOpen(true)
    uploadImage.mutate(file, { onSuccess: (u) => setImage(u) })
  }
  // paste an image straight from the clipboard (right-click → Copy Image, then ⌘V)
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    if (item) { const f = item.getAsFile(); if (f) { e.preventDefault(); takeImageFile(f) } }
  }
  const fieldStyle: React.CSSProperties = { flex: 1, minWidth: 0, border: 'none', borderBottom: '1px solid rgba(20,19,16,.28)', background: 'none', padding: '5px 0', fontFamily: 'Newsreader, serif', fontSize: 14, color: INK, outline: 'none' }
  return (
    <footer style={{ display: 'grid', gridTemplateColumns: '218px 1fr auto', alignItems: 'center', borderTop: `1px solid ${INK}`, background: '#fbfaf8' }}>
      <div style={{ padding: '14px 18px', borderRight: `1px solid ${INK}`, ...uppercase, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', color: '#7d776b' }}>Capture<br />text · image · link</div>
      <div style={{ padding: '10px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith('image/')) { e.preventDefault(); takeImageFile(f) } }}>
        <input value={text} onFocus={() => setOpen(true)} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="Clip a piece, a house, a thought…"
          style={{ border: 'none', background: 'none', padding: '4px 0', fontFamily: 'Newsreader, serif', fontSize: 20, color: INK, outline: 'none', width: '100%' }} />
        {open && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="paste a link…" style={fieldStyle} />
            <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="paste an image, or a URL…" style={fieldStyle} />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) takeImageFile(f) }} />
            <button onClick={() => fileRef.current?.click()}
              style={{ cursor: 'pointer', background: 'none', border: '1px solid rgba(20,19,16,.3)', padding: '5px 10px', fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#45413a' }}>
              {uploadImage.isPending ? 'Uploading…' : 'Add image'}
            </button>
            {image && <img src={image} alt="" style={{ height: 34, width: 34, objectFit: 'cover', border: '1px solid rgba(20,19,16,.3)' }} />}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 18px' }}>
        <select value={board} onChange={(e) => setBoard(e.target.value)}
          style={{ border: '1px solid rgba(20,19,16,.28)', background: '#fff', padding: '8px 6px', fontFamily: 'Newsreader, serif', fontSize: 12, color: '#45413a', outline: 'none' }}>
          <option value="">no board</option>
          {boards.map((b) => <option key={b.id} value={boardSlug(b.id)}>→ {b.label}</option>)}
        </select>
        <button disabled={capture.isPending} onClick={submit}
          style={{ cursor: capture.isPending ? 'default' : 'pointer', opacity: capture.isPending ? 0.6 : 1, background: INK, color: '#fbfaf8', border: 'none', padding: '11px 18px', fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase' }}>
          {capture.isPending ? 'Clipping…' : 'Clip it'}
        </button>
      </div>
    </footer>
  )
}

// ── new board compose panel ──
function ComposePanel({ pending, onClose, onCreate, initial, editing, onArchive, onDelete }: {
  pending: boolean
  onClose: () => void
  onCreate: (name: string, description: string, tags: string) => void
  initial?: { name?: string; description?: string; tags?: string }
  editing?: boolean
  onArchive?: () => void
  onDelete?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(initial?.name ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [tags, setTags] = useState(initial?.tags ?? '')
  const label: React.CSSProperties = { display: 'block', fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: '#7d776b' }
  return (
    <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 45, width: 'min(430px, 40%)', minWidth: 260, overflow: 'auto', background: '#f6f4ef', borderLeft: `1px solid ${INK}`, boxShadow: '-18px 0 40px -30px rgba(20,19,16,.9)', animation: 'slideIn .35s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 20px', borderBottom: `1px solid ${INK}`, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>
        <span>{editing ? 'Edit board' : 'New board'}</span>
        <button onClick={onClose} style={{ cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'Newsreader, serif', fontSize: 15, letterSpacing: '.18em', textTransform: 'uppercase' }}>Close ×</button>
      </div>
      <div style={{ padding: '20px 20px 30px' }}>
        <h2 style={{ fontFamily: 'Newsreader, serif', fontWeight: 400, fontSize: 31, lineHeight: 1.06, margin: '0 0 6px' }}>{editing ? 'Rename the thought.' : 'Give the thought a name.'}</h2>
        <p style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: '#35322a', margin: '0 0 20px' }}>{editing ? 'The title and note are yours to revise as the board finds its shape.' : 'It lands on the desk as its own pin. Pin anything to it and the line draws itself.'}</p>

        <label style={label}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Loud silver, quiet clothes"
          style={{ width: '100%', margin: '6px 0 18px', border: 'none', borderBottom: `1px solid ${INK}`, background: 'none', padding: '8px 0', fontFamily: 'Newsreader, serif', fontSize: 22, color: INK, outline: 'none' }} />

        <label style={label}>What it&rsquo;s for</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder="A sentence to your future self…"
          style={{ width: '100%', margin: '6px 0 18px', border: '1px solid rgba(20,19,16,.28)', background: '#fff', padding: 10, fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: INK, outline: 'none', resize: 'vertical' }} />

        <label style={label}>Tags — comma separated</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="silver, jewellery, loud"
          style={{ width: '100%', margin: '6px 0 22px', border: 'none', borderBottom: '1px solid rgba(20,19,16,.28)', background: 'none', padding: '8px 0', fontFamily: 'Newsreader, serif', fontSize: 17, color: INK, outline: 'none' }} />

        <button disabled={pending || !name.trim()} onClick={() => onCreate(name.trim(), desc.trim(), tags.trim())}
          style={{ width: '100%', cursor: pending || !name.trim() ? 'default' : 'pointer', opacity: pending || !name.trim() ? 0.5 : 1, background: INK, color: '#fbfaf8', border: 'none', padding: 13, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase' }}>
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Put it on the desk'}
        </button>
        {!editing && <div style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 26, color: ACCENT, paddingTop: 10 }}>boards are just nodes — you can link them to each other</div>}

        {editing && (onArchive || onDelete) && (
          <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid rgba(20,19,16,.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {onArchive && (
              <button onClick={onArchive}
                style={{ width: '100%', cursor: 'pointer', background: 'none', border: `1px solid ${INK}`, padding: 11, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: INK }}>
                Archive — hide, keep it
              </button>
            )}
            {onDelete && (confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onDelete}
                  style={{ flex: 1, cursor: 'pointer', background: '#8f2f22', border: 'none', padding: 11, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#fbfaf8' }}>
                  Delete for good
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  style={{ cursor: 'pointer', background: 'none', border: '1px solid rgba(20,19,16,.4)', padding: '11px 14px', fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7d776b' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                style={{ width: '100%', cursor: 'pointer', background: 'none', border: '1px solid rgba(143,47,34,.6)', padding: 11, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8f2f22' }}>
                Delete permanently
              </button>
            ))}
            <div style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 22, color: '#7d776b' }}>archived boards live in List — you can bring them back</div>
          </div>
        )}
      </div>
    </aside>
  )
}

// one row in the List view — thumbnail + name + context, clickable into the desk / board.
function ListRow({ item, kindOf, onOpen }: { item: ListItem; kindOf: string; onOpen: () => void }) {
  const isKindred = kindOf === 'kindred'
  const isBoard = kindOf === 'boards'
  return (
    <button onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#fffdf9')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 12, alignItems: 'center', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid rgba(20,19,16,.12)', padding: '8px 4px', cursor: 'pointer', width: '100%' }}>
      <div style={{ width: 54, height: 54, border: '1px solid rgba(20,19,16,.16)', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center', background: isKindred ? INK : STRIPE, backgroundImage: isBoard ? 'radial-gradient(rgba(20,19,16,.2) 1px, transparent 1px)' : undefined, backgroundSize: isBoard ? '10px 10px' : undefined }}>
        {item.image ? <img src={item.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : isKindred ? <span style={{ fontFamily: 'Newsreader, serif', fontSize: 19, color: '#fbfaf8' }}>{item.label[0]}</span>
          : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 16, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 12, color: '#7d776b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
      </div>
    </button>
  )
}

// the moodboard add bar — board-only note / image / color / link that never enters the graph.
type LocalPayload = { local_kind: 'note' | 'image' | 'color' | 'link'; text?: string; image_url?: string; color?: string; url?: string }
function BoardAddBar({ onAdd }: { onAdd: (p: LocalPayload) => void }) {
  const [kind, setKind] = useState<'note' | 'image' | 'color' | 'link' | null>(null)
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState('#b8860b')
  const [image, setImage] = useState('')
  const upload = useUploadImage()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const reset = () => { setKind(null); setText(''); setUrl(''); setImage(''); setColor('#b8860b') }
  const takeFile = (f: File | Blob) => upload.mutate(f, { onSuccess: (u) => setImage(u) })
  const add = () => {
    if (kind === 'note' && text.trim()) onAdd({ local_kind: 'note', text: text.trim() })
    else if (kind === 'image' && image) onAdd({ local_kind: 'image', image_url: image, text: text.trim() })
    else if (kind === 'color') onAdd({ local_kind: 'color', color })
    else if (kind === 'link' && url.trim()) onAdd({ local_kind: 'link', url: url.trim(), text: text.trim() })
    else return
    reset()
  }
  const wrap: React.CSSProperties = { position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 6, background: 'rgba(251,250,248,.97)', border: `1px solid ${INK}`, boxShadow: '0 4px 20px -12px rgba(20,19,16,.8)', padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: '80%' }
  const btn: React.CSSProperties = { cursor: 'pointer', background: 'none', border: '1px solid rgba(20,19,16,.3)', padding: '6px 10px', fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#45413a' }
  const field: React.CSSProperties = { border: 'none', borderBottom: `1px solid ${INK}`, background: 'none', padding: '5px 2px', fontFamily: 'Newsreader, serif', fontSize: 14, color: INK, outline: 'none' }
  if (!kind) {
    return (
      <div style={wrap} onPaste={() => {}}>
        <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: '#7d776b' }}>Add to board</span>
        <button style={btn} onClick={() => setKind('note')}>＋ Note</button>
        <button style={btn} onClick={() => setKind('image')}>＋ Image</button>
        <button style={btn} onClick={() => setKind('color')}>＋ Color</button>
        <button style={btn} onClick={() => setKind('link')}>＋ Link</button>
      </div>
    )
  }
  return (
    <div style={wrap}
      onPaste={(e) => { if (kind === 'image') { const it = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/')); const f = it?.getAsFile(); if (f) { e.preventDefault(); takeFile(f) } } }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { if (kind === 'image') { const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) { e.preventDefault(); takeFile(f) } } }}>
      {kind === 'note' && <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="a note, a vibe…" style={{ ...field, width: 240 }} />}
      {kind === 'image' && <>
        <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="paste/drop an image, or a URL" style={{ ...field, width: 220 }} />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) takeFile(f) }} />
        <button style={btn} onClick={() => fileRef.current?.click()}>{upload.isPending ? '…' : 'pick'}</button>
        {image && <img src={image} alt="" style={{ height: 28, width: 28, objectFit: 'cover', border: '1px solid rgba(20,19,16,.3)' }} />}
      </>}
      {kind === 'color' && <>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 34, height: 30, border: '1px solid rgba(20,19,16,.3)', background: 'none', cursor: 'pointer' }} />
        <input value={color} onChange={(e) => setColor(e.target.value)} style={{ ...field, width: 90, fontFamily: 'ui-monospace, monospace' }} />
      </>}
      {kind === 'link' && <>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="label" style={{ ...field, width: 120 }} />
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="https://…" style={{ ...field, width: 200 }} />
      </>}
      <button style={{ ...btn, background: INK, color: '#fbfaf8', borderColor: INK }} onClick={add}>Add</button>
      <button style={btn} onClick={reset}>×</button>
    </div>
  )
}

// an archived board in the List view — muted, with restore + a two-click delete.
function ArchivedRow({ item, onRestore, onDelete }: { item: ListItem; onRestore: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const btn: React.CSSProperties = { cursor: 'pointer', background: 'none', border: '1px solid rgba(20,19,16,.3)', padding: '5px 9px', fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#45413a' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 10, alignItems: 'center', borderBottom: '1px solid rgba(20,19,16,.12)', padding: '8px 4px', opacity: 0.85 }}>
      <div style={{ width: 40, height: 40, border: '1px solid rgba(20,19,16,.16)', backgroundImage: 'radial-gradient(rgba(20,19,16,.2) 1px, transparent 1px)', backgroundSize: '9px 9px' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 11, color: '#7d776b' }}>{item.sub} · archived</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onRestore} style={btn}>restore</button>
        {confirm
          ? <button onClick={onDelete} style={{ ...btn, color: '#fbfaf8', background: '#8f2f22', borderColor: '#8f2f22' }}>sure?</button>
          : <button onClick={() => setConfirm(true)} style={{ ...btn, color: '#8f2f22', borderColor: 'rgba(143,47,34,.5)' }}>delete</button>}
      </div>
    </div>
  )
}

function LegendRow({ color, dotted, label, faint }: { color: string; dotted: boolean; label: string; faint?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 8, alignItems: 'center', opacity: faint ? 0.7 : 1 }}>
      <span style={{ borderTop: `${dotted ? '2px dotted' : '1.5px solid'} ${color}`, opacity: faint ? 0.6 : 1 }} />
      <span>{label}</span>
    </div>
  )
}

// ── house study: the long view (history & lineage) ──
function HouseStudy({ study, onClose, onOpenHouse, onOpenNode }: {
  study: HouseStudy
  onClose: () => void
  onOpenHouse: (id: string) => void
  onOpenNode: (id: string) => void
}) {
  const portrait = study.looks.find((l) => l.image)?.image
  const sectionH: React.CSSProperties = { fontFamily: 'Newsreader, serif', fontWeight: 400, fontSize: 13, letterSpacing: '.2em', textTransform: 'uppercase', margin: 0 }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 55, overflow: 'auto', background: '#fbfaf8', animation: 'fadeUp .35s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fbfaf8', display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'baseline', padding: '12px 24px', borderBottom: `1px solid ${INK}`, fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>
        <span>House study · {study.title}{study.city ? ` · ${study.city}` : ''}</span>
        <button onClick={onClose} onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)} onMouseLeave={(e) => (e.currentTarget.style.color = INK)}
          style={{ cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', letterSpacing: '.18em', textTransform: 'uppercase', color: INK }}>Back to the desk ×</button>
      </div>

      {/* hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', borderBottom: `1px solid ${INK}` }}>
        <div style={{ padding: '34px 28px 36px', borderRight: `1px solid ${INK}` }}>
          <div style={{ fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: ACCENT }}>{study.era}</div>
          <h1 style={{ fontFamily: 'Newsreader, serif', fontWeight: 400, fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 0.98, letterSpacing: '-.02em', margin: '8px 0 0' }}>{study.title}</h1>
          {study.lede && <p style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 20, lineHeight: 1.5, color: '#35322a', margin: '18px 0 0', maxWidth: '48ch' }}>{study.lede}</p>}
          {study.codes.length > 0 && (
            <div style={{ paddingTop: 22 }}>
              <div style={{ fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7d776b', paddingBottom: 10 }}>House codes</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {study.codes.map((c, i) => (
                  <span key={i} style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 15, border: `1px solid rgba(20,19,16,.28)`, borderRadius: 999, padding: '4px 13px', color: '#221d10' }}>{c}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ borderTop: `1px solid ${INK}`, marginTop: 24 }}>
            {study.facts.map((f) => (
              <div key={f.k} style={{ display: 'grid', gridTemplateColumns: '132px 1fr', borderBottom: '1px solid rgba(20,19,16,.18)' }}>
                <div style={{ padding: '10px 12px 10px 0', fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: '#7d776b' }}>{f.k}</div>
                <div style={{ padding: '10px 0', fontFamily: 'Newsreader, serif', fontSize: 17 }}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '34px 28px 36px' }}>
          <div style={{ aspectRatio: '4/5', border: '1px solid rgba(20,19,16,.16)', overflow: 'hidden', background: 'repeating-linear-gradient(45deg, #efece5 0 10px, #f7f5f0 10px 20px)', display: 'grid', placeItems: 'center' }}>
            {portrait ? <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '.16em', color: '#8b857a' }}>ARCHIVE PORTRAIT</span>}
          </div>
          {study.aside && <div style={{ fontFamily: 'Reenie Beanie, cursive', fontSize: 28, color: ACCENT, paddingTop: 12 }}>{study.aside}</div>}
        </div>
      </div>

      {/* the long view + lineage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', borderBottom: `1px solid ${INK}` }}>
        <section style={{ padding: '30px 28px 36px', borderRight: `1px solid ${INK}` }}>
          <h2 style={{ ...sectionH, marginBottom: 18 }}>The long view</h2>
          {study.history.length ? study.history.map((h, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '86px 1fr', gap: 18, padding: '15px 0', borderTop: '1px solid rgba(20,19,16,.2)' }}>
              <div style={{ fontFamily: 'Newsreader, serif', fontSize: 19, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>{h.year || '·'}</div>
              <div>
                <div style={{ fontFamily: 'Newsreader, serif', fontSize: 20, lineHeight: 1.3 }}>{h.head}</div>
                {h.text && <p style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 16, lineHeight: 1.55, color: '#45413a', margin: '5px 0 0', maxWidth: '54ch' }}>{h.text}</p>}
              </div>
            </div>
          )) : <p style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16, color: '#7d776b' }}>The archive is still thin — it fills in as you save.</p>}
        </section>

        <aside style={{ padding: '30px 28px 36px' }}>
          <h2 style={{ ...sectionH, marginBottom: 14 }}>Lineage</h2>
          {study.lineage.map((l) => (
            <button key={l.id} onClick={() => onOpenHouse(l.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: '12px 0', borderTop: '1px solid rgba(20,19,16,.2)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: 'Newsreader, serif', fontSize: 18 }}>{l.name}</span>
                <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7d776b' }}>{l.rel}</span>
              </div>
              <div style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 15, color: '#45413a', paddingTop: 3 }}>{l.note}</div>
            </button>
          ))}
          {study.connected.length > 0 && (
            <>
              <h2 style={{ ...sectionH, margin: '30px 0 14px' }}>In your graph</h2>
              {study.connected.map((m) => (
                <button key={m.id} onClick={() => onOpenNode(m.id)} style={{ width: '100%', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid rgba(20,19,16,.2)', padding: '11px 0', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'Newsreader, serif', fontSize: 17 }}>{m.title}</span>
                  <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7d776b' }}>{m.kind}</span>
                  <span style={{ fontFamily: 'Newsreader, serif', fontSize: 14, color: ACCENT }}>↗</span>
                </button>
              ))}
            </>
          )}
        </aside>
      </div>

      {/* creative direction — current + past directors and their vision */}
      {study.directors.length > 0 && (
        <section style={{ padding: '30px 28px 36px', borderBottom: `1px solid ${INK}` }}>
          <h2 style={{ ...sectionH, marginBottom: 18 }}>Creative direction</h2>
          {study.directors.map((d, i) => (
            <div key={i} style={{ padding: '18px 0', borderTop: '1px solid rgba(20,19,16,.2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr', gap: 24 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'Newsreader, serif', fontSize: 22 }}>{d.name}</span>
                    {d.current && <span style={{ fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#fbfaf8', background: ACCENT, padding: '2px 8px' }}>Current</span>}
                  </div>
                  <div style={{ fontFamily: 'Newsreader, serif', fontSize: 14, color: '#8f4331', paddingTop: 3, fontVariantNumeric: 'tabular-nums' }}>{d.era}</div>
                </div>
                <p style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 16, lineHeight: 1.55, color: '#35322a', margin: 0, textWrap: 'pretty' }}>{d.vision}</p>
              </div>
              {(d.collections?.length ?? 0) > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, paddingTop: 16 }}>
                  {d.collections!.map((c, j) => (
                    <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ aspectRatio: '3/4', border: '1px solid rgba(20,19,16,.16)', overflow: 'hidden', background: 'repeating-linear-gradient(45deg, #efece5 0 9px, #f7f5f0 9px 18px)', display: 'grid', placeItems: 'center' }}>
                        {c.image ? <img src={c.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 8, letterSpacing: '.14em', color: '#8b857a' }}>ARCHIVE</span>}
                      </div>
                      <div style={{ fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: ACCENT }}>{c.season}</div>
                      <div style={{ fontFamily: 'Newsreader, serif', fontSize: 15, lineHeight: 1.25 }}>{c.title}</div>
                      <div style={{ fontFamily: 'Newsreader, serif', fontWeight: 300, fontSize: 13, lineHeight: 1.45, color: '#45413a' }}>{c.why}</div>
                      {c.credit && (c.sourceUrl
                        ? <a href={c.sourceUrl} target="_blank" rel="noreferrer" style={{ fontFamily: 'Newsreader, serif', fontSize: 10, color: '#8b857a', textDecoration: 'none', borderBottom: '1px solid rgba(20,19,16,.15)' }}>{c.credit}</a>
                        : <div style={{ fontFamily: 'Newsreader, serif', fontSize: 10, color: '#8b857a' }}>{c.credit}</div>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* seasons in the archive */}
      {study.looks.length > 0 && (
        <section style={{ padding: '30px 28px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, paddingBottom: 16, borderBottom: `1px solid ${INK}` }}>
            <h2 style={sectionH}>Seasons in the archive</h2>
            <span style={{ fontFamily: 'Newsreader, serif', fontSize: 12, color: '#7d776b' }}>{study.lookNote}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: '22px 18px', paddingTop: 22 }}>
            {study.looks.map((k, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ aspectRatio: '3/4', border: '1px solid rgba(20,19,16,.16)', overflow: 'hidden', background: 'repeating-linear-gradient(45deg, #efece5 0 9px, #f7f5f0 9px 18px)', display: 'grid', placeItems: 'end start', padding: 10 }}>
                  {k.image ? <img src={k.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', gridArea: '1/1' }} />
                    : <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '.12em', color: '#8b857a' }}>LOOK</span>}
                </div>
                <div style={{ fontFamily: 'Newsreader, serif', fontSize: 15 }}>{k.label}</div>
                {k.note && <div style={{ fontFamily: 'Newsreader, serif', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7d776b' }}>{k.note}</div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── style helpers ──
const uppercase: React.CSSProperties = { textTransform: 'uppercase' }
const railType: React.CSSProperties = { fontFamily: 'Newsreader, serif', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }
const railBtn: React.CSSProperties = { cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', letterSpacing: '.14em', textTransform: 'uppercase', padding: 0 }
const indexHead: React.CSSProperties = { display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, padding: '13px 13px 6px', fontFamily: 'Newsreader, serif', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: ACCENT }
const indexRow: React.CSSProperties = { width: '100%', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid rgba(20,19,16,.14)', padding: '7px 13px', display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'baseline', transition: 'background .25s ease' }
const iconBtn: React.CSSProperties = { cursor: 'pointer', background: 'none', border: '1px solid rgba(20,19,16,.3)', minWidth: 26, height: 26, font: 'inherit', fontSize: 13, textTransform: 'uppercase' }
function lensBtn(active: boolean): React.CSSProperties {
  return { cursor: 'pointer', background: active ? INK : 'none', color: active ? '#fbfaf8' : INK, border: `1px solid ${active ? INK : 'rgba(20,19,16,.3)'}`, padding: '6px 12px', font: 'inherit', letterSpacing: '.14em', textTransform: 'uppercase' }
}
function pill(size: number): React.CSSProperties {
  return { fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: size, border: '1px solid rgba(20,19,16,.28)', borderRadius: 999, padding: '2px 9px' }
}
function cardWidth(type: GraphNodeType): number {
  return { piece: 226, house: 208, pattern: 194, board: 212, clipping: 176, note: 214, swatch: 168, link: 200 }[type] ?? 200
}
function shortKind(type: GraphNodeType): string {
  return { piece: 'PIECE', house: 'HOUSE', pattern: 'KINDRED', board: 'BOARD', clipping: 'CLIPPING', note: 'NOTE', swatch: 'SWATCH', link: 'LINK' }[type] ?? ''
}
