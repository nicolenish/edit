export type BrandKind = 'shoppable' | 'editorial'
export type Tier = 'luxury' | 'premium' | 'contemporary'
export type Occasion = 'casual' | 'datenight' | 'events' | 'athleisure' | 'jewelry'

export interface Brand {
  id: string
  key: string
  name: string
  kind: BrandKind
  domain: string
  url: string
  city: string
  founded: string
  founder: string
  designer: string
  story: string
  tier: Tier
  season: string
  hero_image_url: string
  source: string
  product_count: number
  look_count: number
  followed: boolean
}

export interface Product {
  id: string
  brand_key: string
  brand_name: string
  title: string
  price: string
  price_display: string
  color: string
  occasion: Occasion | string
  tier: Tier
  image_url: string
  image2_url: string
  url: string
  available: boolean
  published_at: string
  is_new: boolean
  pinned: boolean
}

export interface Look {
  id: string
  index: number
  image_url: string
  season: string
}

export interface BrandDetail extends Brand {
  products: Product[]
  looks: Look[]
}

export interface Feed {
  count: number
  since: Product[]
  earlier: Product[]
  items: Product[]
}

export interface Board {
  id: string
  name: string
  slug: string
  pin_count: number
}

export interface Pin {
  id: string
  product: Product
  board: string
  board_slug: string
  note: string
  pinned_at: string
}

export interface BoardDetail {
  board: Board
  pins: Pin[]
}

export interface DiaryEntry {
  date: string
  note: string
  moods: string[]
}

export interface Connection {
  platform: string
  connected: boolean
  detail: string
}

export interface Taste {
  pinned: number
  leaning: string[]
  readout: string
}
