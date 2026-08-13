// The taste-graph contract — mirrors docs/taste-graph.md §8. The backend
// (catalog/graph.py + /api/graph/) will emit exactly these shapes; the mock in
// mock.ts fills them today so the desk renders before the endpoint exists.

// Display types. The API models notes as one `note` type (docs §2); the desk
// splits `clipping` out because its card looks different from a handwritten note.
export type GraphNodeType =
  | 'piece'
  | 'house'
  | 'pattern'
  | 'board'
  | 'note'
  | 'clipping'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  subtitle?: string // "2 shared tags", "9 things", city…
  tags: string[]
  image?: string | null // null → placeholder tile
  followed?: boolean
  suggested?: boolean
  weight?: number // pattern strength (count)
  date?: string | null // ISO — when it entered your world; drives the "by day clipped" lens
  x: number
  y: number
}

// How a line reads: direct (solid membership), pattern (dotted neutral, a derived
// trait), or a coloured dotted line for why two houses are kindred.
export type EdgeDim = 'direct' | 'pin' | 'pattern' | 'aesthetic' | 'region' | 'price'

export interface GraphEdge {
  from: string
  to: string
  type: string // made-by | pinned-to | exhibits | embodies | adjacent | feeds
  derived: boolean // false = structural (solid), true = inferred
  dim: EdgeDim // drives stroke style + colour
  weight?: number
  dashed?: boolean
}

// The index (left rail) lists EVERYTHING, grouped; the desk (nodes) is a curated subset.
export interface IndexItem {
  id: string
  label: string
  sub?: string
  followed?: boolean
  suggested?: boolean
  onDesk?: boolean // currently drawn on the desk — the curated-default signal
  pinned?: boolean
  weight?: number
  count?: number
}
export interface GraphIndex {
  pieces: IndexItem[]
  houses: IndexItem[]
  patterns: IndexItem[]
  boards: IndexItem[]
  notes: IndexItem[]
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  index: GraphIndex
  stats: { pinned: number; follows: number }
  openThread: { label: string; nodeId: string } | null
  focus: string | null
}

// The List view — the whole library grouped with thumbnails.
export interface ListItem {
  node_id: string
  label: string
  sub: string
  image?: string | null
  followed?: boolean
}
export interface GraphList {
  houses: ListItem[]
  pieces: ListItem[]
  kindred: ListItem[]
  boards: ListItem[]
  archived: ListItem[]
  clips: ListItem[]
}

// A board opened as its own composed sub-graph: only the items gathered onto it, at
// their per-board positions, with the graph lines drawn between them.
export interface BoardGraph {
  board: { slug: string; name: string; description: string; tags: string[]; count: number; isOpenThread: boolean }
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface NodeMetaRow {
  k: string
  v: string
}
export interface NodeLink {
  id: string
  title: string
  kind: string
}
export interface NodeBoardRef {
  id: string
  name: string
}

export interface NodeDetail {
  id: string
  type: GraphNodeType
  kind: string // "Piece · node", "Pattern · derived from you"…
  title: string
  desc: string
  image?: string | null
  tags: string[]
  meta: NodeMetaRow[]
  connected: NodeLink[]
  boards: NodeBoardRef[]
  isHouse: boolean
  canPin: boolean
  codes?: string[] // house: signature house codes, surfaced on the panel
  url?: string // piece: buy link out
  price?: string // piece: price display
  house?: string // piece: house name (stockist label)
  clip?: ClipEditable // capture clips: the editable payload
}

export interface ClipEditable {
  id: string
  kind: string
  title: string
  text: string
  url: string
  image_url: string
  tags: string[]
  board_slug: string | null
}

// The house "long view" — history & lineage expanded modal.
export interface StudyFact { k: string; v: string }
export interface StudyMilestone { year: string; head: string; text: string }
export interface StudyLineage { id: string; name: string; rel: string; note: string }
export interface StudyLook { label: string; note: string; image?: string | null }
export interface StudyCollection {
  season: string
  year: string
  title: string
  why: string
  image?: string | null
  credit?: string
  source?: string
  sourceUrl?: string | null
}
export interface StudyDirector { name: string; era: string; current: boolean; vision: string; collections?: StudyCollection[] }

export interface HouseStudy {
  title: string
  city: string
  era: string
  lede: string
  codes: string[] // signature house codes (design aesthetics/motifs)
  aside: string
  facts: StudyFact[]
  history: StudyMilestone[]
  directors: StudyDirector[]
  lineage: StudyLineage[]
  looks: StudyLook[]
  lookNote: string
  connected: NodeLink[]
}
