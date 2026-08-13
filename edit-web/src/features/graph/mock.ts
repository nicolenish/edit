// Mock taste graph — the "collar theory" neighbourhood from the v8 design,
// expressed in the real /api/graph/ shape so the desk renders before the backend
// endpoint exists. When catalog/graph.py + /api/graph/ land, flip USE_MOCK in
// api.ts to false and delete nothing here (handy for offline/storybook work).
import type { GraphResponse, NodeDetail } from './types'

export const MOCK_GRAPH: GraphResponse = {
  stats: { pinned: 0, follows: 1 },
  focus: null,
  nodes: [
    { id: 'maisonoda', type: 'house', label: 'Maison Oda', tags: ['sculptural', 'tokyo'], followed: true, date: '2026-03-04', x: 250, y: 150 },
    { id: 'collar', type: 'piece', label: 'Sculpted poplin collar', tags: ['collar', 'poplin'], date: '2026-03-04', x: 590, y: 280 },
    { id: 'runway', type: 'clipping', label: 'Look 22, autumn', tags: [], date: '2026-06-29', x: 900, y: 110 },
    { id: 'collartheory', type: 'board', label: 'The collar theory', subtitle: '14 things', tags: [], date: null, x: 1170, y: 110 },
    { id: 'stiff', type: 'pattern', label: 'Stiff collars', subtitle: '9 things', weight: 9, tags: [], date: null, x: 380, y: 520 },
    { id: 'note', type: 'note', label: 'Not the shirt. The collar. Ask the tailor about the grey one.', subtitle: 'Note · Jul 21', tags: [], date: '2026-07-21', x: 130, y: 660 },
    { id: 'fleuve', type: 'house', label: 'Atelier Fleuve', subtitle: '2 shared tags', tags: ['bias', 'undyed', 'french'], suggested: true, date: '2026-07-18', x: 840, y: 430 },
    { id: 'tsuki', type: 'house', label: 'Tsuki Atelier', subtitle: '3 shared tags', tags: ['japanese', 'sculptural', 'undyed'], suggested: true, date: '2026-07-18', x: 1130, y: 420 },
    { id: 'tokyo', type: 'board', label: 'Tokyo, quietly', subtitle: '31 things', tags: [], date: null, x: 700, y: 640 },
    { id: 'bias', type: 'piece', label: 'Bias slip, Atelier Fleuve', tags: [], date: '2026-06-29', x: 1060, y: 740 },
    { id: 'undyed', type: 'pattern', label: 'Unbleached cotton', subtitle: '5 things', weight: 5, tags: [], date: null, x: 480, y: 810 },
  ],
  edges: [
    { from: 'collar', to: 'maisonoda', type: 'made-by', derived: false , dim: 'direct' },
    { from: 'collar', to: 'stiff', type: 'exhibits', derived: false , dim: 'pattern' },
    { from: 'collar', to: 'runway', type: 'references', derived: false , dim: 'pattern' },
    { from: 'collar', to: 'tokyo', type: 'pinned-to', derived: false , dim: 'pin' },
    { from: 'stiff', to: 'note', type: 'references', derived: false , dim: 'pattern' },
    { from: 'stiff', to: 'tsuki', type: 'embodies', derived: false , dim: 'pattern' },
    { from: 'stiff', to: 'collartheory', type: 'feeds', derived: false , dim: 'pattern' },
    { from: 'runway', to: 'collartheory', type: 'pinned-to', derived: false , dim: 'pin' },
    { from: 'tokyo', to: 'tsuki', type: 'feeds', derived: false , dim: 'pattern' },
    { from: 'tokyo', to: 'bias', type: 'pinned-to', derived: false , dim: 'pin' },
    { from: 'bias', to: 'undyed', type: 'exhibits', derived: false , dim: 'pattern' },
    { from: 'bias', to: 'fleuve', type: 'made-by', derived: false , dim: 'direct' },
    { from: 'fleuve', to: 'undyed', type: 'embodies', derived: false , dim: 'pattern' },
    { from: 'tsuki', to: 'undyed', type: 'embodies', derived: false , dim: 'pattern' },
    { from: 'runway', to: 'bias', type: 'adjacent', derived: true, dashed: true , dim: 'aesthetic' },
  ],
  index: {
    pieces: [{ id: 'collar', label: 'Sculpted poplin collar' }, { id: 'bias', label: 'Bias slip, Atelier Fleuve' }],
    houses: [{ id: 'maisonoda', label: 'Maison Oda', followed: true }, { id: 'tsuki', label: 'Tsuki Atelier', suggested: true }, { id: 'fleuve', label: 'Atelier Fleuve', suggested: true }],
    patterns: [{ id: 'stiff', label: 'Stiff collars', weight: 9 }, { id: 'undyed', label: 'Unbleached cotton', weight: 5 }],
    boards: [{ id: 'collartheory', label: 'The collar theory', count: 14 }, { id: 'tokyo', label: 'Tokyo, quietly', count: 31 }],
    notes: [{ id: 'runway', label: 'Look 22, autumn' }, { id: 'note', label: 'Ask the tailor' }],
  },
}

// Board targets a piece/house/etc. can be pinned to.
export const MOCK_BOARDS = [
  { id: 'collartheory', name: 'The collar theory', base: 14 },
  { id: 'tokyo', name: 'Tokyo, quietly', base: 31 },
]

export const MOCK_DETAILS: Record<string, NodeDetail> = {
  collar: {
    id: 'collar', type: 'piece', kind: 'Piece · node', title: 'Sculpted poplin collar',
    desc: 'Stands on its own without help. The reason half the things you saved this year have a neck like this.',
    tags: ['collar', 'poplin', 'sculptural', 'stiff'],
    meta: [{ k: 'House', v: 'Maison Oda' }, { k: 'Clipped', v: 'March 04 — resurfaced today' }, { k: 'Occasion', v: 'Date Night' }],
    connected: [], boards: MOCK_BOARDS.map((b) => ({ id: b.id, name: b.name })), isHouse: false, canPin: true,
  },
  maisonoda: {
    id: 'maisonoda', type: 'house', kind: 'House · node', title: 'Maison Oda',
    desc: 'Tokyo, small production, one shape refined a season at a time. You have followed them since the first collar.',
    tags: ['sculptural', 'japanese', 'minimalist'],
    meta: [{ k: 'City', v: 'Tokyo' }, { k: 'Tier', v: 'Contemporary' }, { k: 'Following', v: 'Since Nov 2024' }],
    connected: [], boards: [], isHouse: true, canPin: true,
  },
  stiff: {
    id: 'stiff', type: 'pattern', kind: 'Pattern · derived from you', title: 'Stiff collars',
    desc: 'Nishi noticed this one, you did not: nine saves across four houses and two decades, all with a neck that holds its shape.',
    tags: ['collar', 'stiff', 'structure'],
    meta: [{ k: 'First seen', v: 'Feb 2025' }, { k: 'Weight', v: '9 saves · strongest pattern' }, { k: 'Feeds', v: 'The collar theory' }],
    connected: [], boards: MOCK_BOARDS.map((b) => ({ id: b.id, name: b.name })), isHouse: false, canPin: true,
  },
  undyed: {
    id: 'undyed', type: 'pattern', kind: 'Pattern · derived from you', title: 'Unbleached cotton',
    desc: 'Five saves, all raw or undyed. Anything bleached has started to read loud to you.',
    tags: ['undyed', 'raw', 'texture'],
    meta: [{ k: 'First seen', v: 'Apr 2026' }, { k: 'Weight', v: '5 saves · growing' }, { k: 'Adjacent to', v: 'Unbleached linen, greige' }],
    connected: [], boards: MOCK_BOARDS.map((b) => ({ id: b.id, name: b.name })), isHouse: false, canPin: true,
  },
  tsuki: {
    id: 'tsuki', type: 'house', kind: 'House · suggested', title: 'Tsuki Atelier',
    desc: 'Adjacent to Maison Oda on three tags. You have not followed them yet — Nishi keeps putting them in front of you.',
    tags: ['japanese', 'sculptural', 'undyed'],
    meta: [{ k: 'City', v: 'Kyoto' }, { k: 'Tier', v: 'Contemporary' }, { k: 'Why', v: '3 shared tags with Maison Oda' }],
    connected: [], boards: [], isHouse: true, canPin: true,
  },
  fleuve: {
    id: 'fleuve', type: 'house', kind: 'House · suggested', title: 'Atelier Fleuve',
    desc: 'Makes the bias slip you clipped in June. Nishi thinks the undyed pattern runs through their whole catalogue.',
    tags: ['bias', 'undyed', 'french'],
    meta: [{ k: 'City', v: 'Paris' }, { k: 'Tier', v: 'Contemporary' }, { k: 'Why', v: '2 shared tags · one piece saved' }],
    connected: [], boards: [], isHouse: true, canPin: true,
  },
  tokyo: {
    id: 'tokyo', type: 'board', kind: 'Board · yours', title: 'Tokyo, quietly',
    desc: 'Thirty-one things that all somehow live in the same weather. Started as a packing list, became a thesis.',
    tags: ['japanese', 'minimalist', 'undyed'],
    meta: [{ k: 'Started', v: 'Jan 2025' }, { k: 'Contents', v: '31 things · 12 houses' }, { k: 'Last added', v: 'Yesterday' }],
    connected: [], boards: [], isHouse: false, canPin: false,
  },
  collartheory: {
    id: 'collartheory', type: 'board', kind: 'Board · open thread', title: 'The collar theory',
    desc: 'The thread you keep coming back to. Fourteen things and one unanswered question about what makes a collar stand up.',
    tags: ['collar', 'stiff', 'structure'],
    meta: [{ k: 'Started', v: 'Feb 2025' }, { k: 'Contents', v: '14 things' }, { k: 'Status', v: 'Open · you added yesterday' }],
    connected: [], boards: [], isHouse: false, canPin: false,
  },
  bias: {
    id: 'bias', type: 'piece', kind: 'Piece · node', title: 'Bias slip, Atelier Fleuve',
    desc: 'The other half of your eye. Nothing structural about it — which is why the link to the collar is interesting.',
    tags: ['bias', 'slip', 'undyed'],
    meta: [{ k: 'House', v: 'Atelier Fleuve' }, { k: 'Clipped', v: 'June 29' }, { k: 'Occasion', v: 'Events' }],
    connected: [], boards: MOCK_BOARDS.map((b) => ({ id: b.id, name: b.name })), isHouse: false, canPin: true,
  },
  runway: {
    id: 'runway', type: 'clipping', kind: 'Clipping · node', title: 'Look 22, autumn',
    desc: 'Same neckline three seasons on. You linked this to the bias slip yourself — the only link here Nishi did not suggest.',
    tags: ['collar', 'runway', 'archive'],
    meta: [{ k: 'Source', v: 'Runway, autumn 2024' }, { k: 'Clipped', v: 'Jun 29 · from Instagram' }, { k: 'Your link', v: 'Bias slip — "forty years apart"' }],
    connected: [], boards: MOCK_BOARDS.map((b) => ({ id: b.id, name: b.name })), isHouse: false, canPin: true,
  },
  note: {
    id: 'note', type: 'note', kind: 'Note · Jul 21', title: 'Ask the tailor',
    desc: 'Not the shirt. The collar. Ask the tailor if he can copy this on the grey one before October.',
    tags: ['collar', 'to do'],
    meta: [{ k: 'Written', v: 'Jul 21, 14:02' }, { k: 'Attached to', v: 'Sculpted poplin collar' }, { k: 'Status', v: 'Open' }],
    connected: [], boards: [], isHouse: false, canPin: false,
  },
}

// "Connected to" comes from the edges — derive it so it stays in sync with the graph.
for (const e of MOCK_GRAPH.edges) {
  for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
    const d = MOCK_DETAILS[a]
    const other = MOCK_DETAILS[b]
    if (d && other && !d.connected.some((c) => c.id === b)) {
      d.connected.push({ id: b, title: other.title, kind: other.kind.split(' ·')[0] })
    }
  }
}
