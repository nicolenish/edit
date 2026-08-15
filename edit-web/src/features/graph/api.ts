// Data layer for the Graph Desk. USE_MOCK serves the collar-theory mock so the
// desk works before the backend exists; flip it to false once catalog/graph.py +
// /api/graph/ (docs §8) are live — the component code doesn't change.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { GraphResponse, NodeDetail, HouseStudy, BoardGraph, GraphList, GraphLenses } from './types'
import { MOCK_GRAPH, MOCK_DETAILS } from './mock'

export const USE_MOCK = false

export const graphKeys = {
  graph: (focus?: string | null, lens?: Record<string, string[]>, depth?: number, sharedOnly?: boolean) => ['graph', focus ?? null, lens ?? null, depth ?? 1, !!sharedOnly] as const,
  node: (id: string) => ['graph-node', id] as const,
}

async function fetchGraph(focus?: string | null, lens?: Record<string, string[]>, depth?: number, sharedOnly?: boolean): Promise<GraphResponse> {
  if (USE_MOCK) return MOCK_GRAPH
  // each facet's picks go over as one comma-separated value
  const lensParams = Object.fromEntries(Object.entries(lens || {}).filter(([, v]) => v.length).map(([k, v]) => [k, v.join(',')]))
  const { data } = await api.get<GraphResponse>('/graph/', {
    params: { ...(focus ? { focus, ...(depth && depth > 1 ? { depth } : {}) } : {}), ...(sharedOnly ? { shared: 1 } : {}), ...lensParams },
  })
  return data
}

export function useGraph(focus?: string | null, lens?: Record<string, string[]>, depth?: number, sharedOnly?: boolean) {
  return useQuery<GraphResponse>({
    // keep the previous desk on screen while a lens/focus change loads — otherwise the whole
    // view (and any open lens picker) would unmount to the loading state on every pick
    placeholderData: keepPreviousData,
    queryKey: graphKeys.graph(focus, lens, depth, sharedOnly),
    queryFn: () => fetchGraph(focus, lens, depth, sharedOnly),
  })
}

// The lens picker's options — available facet slices with counts.
export function useGraphLenses() {
  return useQuery<GraphLenses>({
    queryKey: ['graph-lenses'],
    queryFn: async () => {
      const { data } = await api.get<GraphLenses>('/graph/lenses/')
      return data
    },
  })
}

// The house long-view study (history & lineage). `key` is a house node id or a bare key.
export function useHouseStudy(houseNodeId: string | null) {
  const key = houseNodeId?.startsWith('house:') ? houseNodeId.slice('house:'.length) : houseNodeId
  return useQuery<HouseStudy>({
    queryKey: ['house-study', key ?? ''],
    enabled: !!key,
    queryFn: async () => {
      const { data } = await api.get<HouseStudy>(`/graph/house/${key}/study/`)
      return data
    },
  })
}

// The whole library, grouped with thumbnails — fetched lazily when List view opens.
export function useGraphList(enabled: boolean) {
  return useQuery<GraphList>({
    queryKey: ['graph-list'],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<GraphList>('/graph/list/')
      return data
    },
  })
}

// A board as its own composed sub-graph — only its gathered items + lines between them.
export function useBoardGraph(slug: string | null) {
  return useQuery<BoardGraph>({
    queryKey: ['board-graph', slug ?? ''],
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await api.get<BoardGraph>(`/graph/board/${slug}/`)
      return data
    },
  })
}

// Add / remove an item on a board's canvas (any node id). Invalidates that board's graph.
export function useBoardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ slug, nodeId, x, y, remove }: { slug: string; nodeId: string; x?: number; y?: number; remove?: boolean }) => {
      if (remove) { await api.delete(`/graph/board/${slug}/items/`, { data: { node_id: nodeId } }); return }
      await api.post(`/graph/board/${slug}/items/`, { node_id: nodeId, x, y })
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['board-graph', v.slug] })
      qc.invalidateQueries({ queryKey: ['graph'] })  // board counts on the total desk
    },
  })
}

// Rename / re-describe / re-tag a board after creation. Slug stays fixed.
export function useUpdateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ slug, name, description, tags, open_thread, archived }: { slug: string; name?: string; description?: string; tags?: string; open_thread?: boolean; archived?: boolean }) => {
      const { data } = await api.patch(`/boards/${slug}/`, { name, description, tags, open_thread, archived })
      return data
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['board-graph', v.slug] })
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-list'] })
      qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}

// Delete a board for good — takes its arrangement with it.
export function useDeleteBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (slug: string) => { await api.delete(`/boards/${slug}/`) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-list'] })
      qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}

// Add board-only moodboard content (note / image / color / link) — never enters the graph.
export function useAddBoardLocal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ slug, ...body }: { slug: string; local_kind: 'note' | 'image' | 'color' | 'link'; text?: string; image_url?: string; color?: string; url?: string; x?: number; y?: number }) => {
      const { data } = await api.post(`/graph/board/${slug}/local/`, body)
      return data as { node_id: string; count: number }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['board-graph', v.slug] })
      qc.invalidateQueries({ queryKey: ['graph'] })
    },
  })
}

// Manual connections you draw on a board — create / relabel / delete (board-only).
export function useBoardEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ slug, from, to, label, remove }: { slug: string; from: string; to: string; label?: string; remove?: boolean }) => {
      if (remove) { await api.delete(`/graph/board/${slug}/edges/`, { data: { from, to } }); return }
      await api.post(`/graph/board/${slug}/edges/`, { from, to, label })
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['board-graph', v.slug] }),
  })
}

// Persist a board's own arrangement (positions scoped to this board).
export async function saveBoardPositions(slug: string, positions: Record<string, { x: number; y: number }>) {
  if (!Object.keys(positions).length) return
  await api.patch(`/graph/board/${slug}/positions/`, positions)
}

export function useGraphNode(id: string | null) {
  return useQuery<NodeDetail>({
    queryKey: graphKeys.node(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      if (USE_MOCK) return MOCK_DETAILS[id!]
      const { data } = await api.get<NodeDetail>(`/graph/node/${id}/`)
      return data
    },
  })
}

// Persist the "Yours" arrangement. Mock keeps it in localStorage; real mode PATCHes.
export async function savePositions(positions: Record<string, { x: number; y: number }>) {
  if (USE_MOCK || !Object.keys(positions).length) return
  await api.patch('/graph/positions/', positions)
}

// Pin / follow write straight to the real endpoints, then invalidate the graph so the
// desk recomposes — pinning literally draws the line, following folds a suggestion in.
export function usePinNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, boardSlug, pinned }: { productId: string; boardSlug: string; pinned: boolean }) => {
      if (USE_MOCK) return
      if (pinned) await api.delete(`/pins/${productId}/`)
      else await api.post('/pins/', { product: productId, board: boardSlug })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-node'] })
      qc.invalidateQueries({ queryKey: ['pins'] })
    },
  })
}

// Create a board — it lands on the desk as its own node after the graph refetches.
export function useCreateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, description, tags }: { name: string; description: string; tags: string }) => {
      const { data } = await api.post('/boards/', { name, description, tags })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}

// Upload a pasted/picked image; returns a /media/ URL to use as a clip's image.
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File | Blob) => {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/', fd)
      return data.url
    },
  })
}

// Capture — clip a thought / link / image; Claude classifies it into a node kind.
export function useCapture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { text?: string; url?: string; image_url?: string; brand?: string; piece_name?: string; board?: string }) => {
      const { data } = await api.post('/capture/', payload)
      return data as { node_id: string; kind: string; title: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-node'] })
    },
  })
}

export function useUpdateClip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; kind?: string; title?: string; brand?: string; piece_name?: string; text?: string; url?: string; image_url?: string; tags?: string; board?: string }) => {
      const { data } = await api.patch(`/clips/${id}/`, patch)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-node'] })
    },
  })
}

export function useDeleteClip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/clips/${id}/`) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-node'] })
    },
  })
}

export function useFollowNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brandKey, followed }: { brandKey: string; followed: boolean }) => {
      if (USE_MOCK) return
      if (followed) await api.delete(`/brands/${brandKey}/follow/`)
      else await api.post(`/brands/${brandKey}/follow/`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['graph'] })
      qc.invalidateQueries({ queryKey: ['graph-node'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
    },
  })
}
