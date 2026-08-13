import type { Tier, Occasion } from './types'

export const PLACEHOLDER_BG =
  'repeating-linear-gradient(135deg,#efede8,#efede8 9px,#f6f4f0 9px,#f6f4f0 18px)'

export const OCCASIONS: { key: Occasion; label: string }[] = [
  { key: 'casual', label: 'Casual' },
  { key: 'datenight', label: 'Date Night' },
  { key: 'events', label: 'Events' },
  { key: 'athleisure', label: 'Athleisure' },
  { key: 'jewelry', label: 'Jewelry' },
]

export const OCCASION_LABEL: Record<string, string> = OCCASIONS.reduce(
  (m, o) => ({ ...m, [o.key]: o.label }),
  {} as Record<string, string>,
)

export interface TierSection {
  key: Tier
  label: string
  no: string
  range: string
  blurb: string
}

export const TIERS: TierSection[] = [
  {
    key: 'luxury',
    label: 'Luxury Designer',
    no: '01',
    range: '$800+',
    blurb: 'Runway houses and couture ateliers.',
  },
  {
    key: 'premium',
    label: 'Affordable Luxury',
    no: '02',
    range: '$300 - $800',
    blurb: 'Considered materials and atelier finish, without the house markup.',
  },
  {
    key: 'contemporary',
    label: 'Contemporary',
    no: '03',
    range: 'Under $300',
    blurb: 'Independent studios and everyday staples worth owning.',
  },
]

export const TIER_BY_KEY: Record<string, TierSection> = TIERS.reduce(
  (m, t) => ({ ...m, [t.key]: t }),
  {} as Record<string, TierSection>,
)

export const RATIOS = ['3/4', '4/5', '1/1', '3/4', '4/5', '3/4']

export const SIZES = ['XS', 'S', 'M', 'L', 'XL']
