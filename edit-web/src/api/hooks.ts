import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { api } from './client'
import type {
  Brand,
  BrandDetail,
  Product,
  Feed,
  Board,
  BoardDetail,
  Pin,
  DiaryEntry,
  Connection,
  Taste,
} from './types'

export const qk = {
  brands: (params?: object) => ['brands', params ?? {}] as const,
  brand: (key: string) => ['brand', key] as const,
  products: (params?: object) => ['products', params ?? {}] as const,
  feed: (limit?: number) => ['feed', limit ?? null] as const,
  boards: () => ['boards'] as const,
  board: (slug: string) => ['board', slug] as const,
  pins: () => ['pins'] as const,
  diary: () => ['diary'] as const,
  diaryEntry: (date: string) => ['diary', date] as const,
  connections: () => ['connections'] as const,
  taste: () => ['taste'] as const,
}

// ---- Brands ----
export interface BrandFilters {
  kind?: string
  tier?: string
  followed?: boolean
}

export function useBrands(filters: BrandFilters = {}, options?: Partial<UseQueryOptions<Brand[]>>) {
  return useQuery<Brand[]>({
    queryKey: qk.brands(filters),
    queryFn: async () => {
      const { data } = await api.get<Brand[]>('/brands/', { params: filters })
      return data
    },
    ...options,
  })
}

export function useBrand(key: string | undefined) {
  return useQuery<BrandDetail>({
    queryKey: qk.brand(key ?? ''),
    enabled: !!key,
    queryFn: async () => {
      const { data } = await api.get<BrandDetail>(`/brands/${key}/`)
      return data
    },
  })
}

export function useFollowBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, followed }: { key: string; followed: boolean }) => {
      if (followed) {
        const { data } = await api.delete<{ key: string; followed: boolean }>(`/brands/${key}/follow/`)
        return data
      }
      const { data } = await api.post<{ key: string; followed: boolean }>(`/brands/${key}/follow/`)
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['brands'] })
      qc.invalidateQueries({ queryKey: qk.brand(vars.key) })
      qc.invalidateQueries({ queryKey: qk.taste() })
    },
  })
}

export interface IngestResult {
  brand?: Brand
  detail?: string
}

export function useIngestBrand() {
  const qc = useQueryClient()
  return useMutation<Brand, { detail: string }, string>({
    mutationFn: async (url: string) => {
      const { data } = await api.post<Brand>('/brands/ingest/', { url })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] })
    },
  })
}

// ---- Products ----
export interface ProductFilters {
  occasion?: string
  tier?: string
  brand?: string
  followed_only?: boolean
  limit?: number
}

export function useProducts(filters: ProductFilters = {}, enabled = true) {
  return useQuery<Product[]>({
    queryKey: qk.products(filters),
    enabled,
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products/', { params: filters })
      return data
    },
  })
}

// ---- Feed ----
export function useFeed(limit?: number) {
  return useQuery<Feed>({
    queryKey: qk.feed(limit),
    queryFn: async () => {
      const { data } = await api.get<Feed>('/feed/', { params: limit ? { limit } : {} })
      return data
    },
  })
}

// ---- Boards ----
export function useBoards() {
  return useQuery<Board[]>({
    queryKey: qk.boards(),
    queryFn: async () => {
      const { data } = await api.get<Board[]>('/boards/')
      return data
    },
  })
}

export function useBoard(slug: string | undefined) {
  return useQuery<BoardDetail>({
    queryKey: qk.board(slug ?? ''),
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await api.get<BoardDetail>(`/boards/${slug}/`)
      return data
    },
  })
}

export function useCreateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<Board>('/boards/', { name })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.boards() })
    },
  })
}

// ---- Pins ----
export function usePins() {
  return useQuery<Pin[]>({
    queryKey: qk.pins(),
    queryFn: async () => {
      const { data } = await api.get<Pin[]>('/pins/')
      return data
    },
  })
}

export function usePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ product, board }: { product: string; board?: string }) => {
      const { data } = await api.post<Pin>('/pins/', { product, board })
      return data
    },
    onSuccess: () => invalidatePinScope(qc),
  })
}

export function useUnpin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (productId: string) => {
      await api.delete(`/pins/${productId}/`)
      return productId
    },
    onSuccess: () => invalidatePinScope(qc),
  })
}

function invalidatePinScope(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.pins() })
  qc.invalidateQueries({ queryKey: qk.boards() })
  qc.invalidateQueries({ queryKey: ['board'] })
  qc.invalidateQueries({ queryKey: ['feed'] })
  qc.invalidateQueries({ queryKey: ['products'] })
  qc.invalidateQueries({ queryKey: qk.taste() })
}

// ---- Diary ----
export function useDiary() {
  return useQuery<DiaryEntry[]>({
    queryKey: qk.diary(),
    queryFn: async () => {
      const { data } = await api.get<DiaryEntry[]>('/diary/')
      return data
    },
  })
}

export function useDiaryEntry(date: string) {
  return useQuery<DiaryEntry>({
    queryKey: qk.diaryEntry(date),
    queryFn: async () => {
      const { data } = await api.get<DiaryEntry>(`/diary/${date}/`)
      return data
    },
  })
}

export function useSaveDiary(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { note: string; moods: string[] }) => {
      const { data } = await api.put<DiaryEntry>(`/diary/${date}/`, payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.diary() })
      qc.invalidateQueries({ queryKey: qk.diaryEntry(date) })
    },
  })
}

// ---- Connections ----
export function useConnections() {
  return useQuery<Connection[]>({
    queryKey: qk.connections(),
    queryFn: async () => {
      const { data } = await api.get<Connection[]>('/connections/')
      return data
    },
  })
}

export function useToggleConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ platform, connected }: { platform: string; connected: boolean }) => {
      const { data } = await api.patch<Connection>(`/connections/${platform}/`, { connected })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.connections() })
    },
  })
}

// ---- Taste ----
export function useTaste() {
  return useQuery<Taste>({
    queryKey: qk.taste(),
    queryFn: async () => {
      const { data } = await api.get<Taste>('/taste/')
      return data
    },
  })
}
