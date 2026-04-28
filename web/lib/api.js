const BASE = process.env.NEXT_PUBLIC_BOT_API_URL || ''

export async function getStats() {
  try {
    const r = await fetch(`${BASE}/api/public/stats`, { next: { revalidate: 300 } })
    if (!r.ok) return { players: '—', cards: '—', factions: {} }
    return r.json()
  } catch { return { players: '—', cards: '—', factions: {} } }
}

export async function getFeaturedCards(limit = 8) {
  try {
    const r = await fetch(`${BASE}/api/public/cards/featured?limit=${limit}`, { next: { revalidate: 600 } })
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export async function getCards({ rarity, anime, page = 1, limit = 24 } = {}) {
  const params = new URLSearchParams({ page, limit })
  if (rarity) params.set('rarity', rarity)
  if (anime)  params.set('anime', anime)
  try {
    const r = await fetch(`${BASE}/api/public/cards?${params}`, { next: { revalidate: 300 } })
    if (!r.ok) return { cards: [], total: 0, pages: 1 }
    return r.json()
  } catch { return { cards: [], total: 0, pages: 1 } }
}

export async function getLeaderboard({ faction, limit = 10 } = {}) {
  const params = new URLSearchParams({ limit })
  if (faction) params.set('faction', faction)
  try {
    const r = await fetch(`${BASE}/api/public/leaderboard?${params}`, { next: { revalidate: 120 } })
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export async function getEvents() {
  try {
    const r = await fetch(`${BASE}/api/public/events`, { next: { revalidate: 300 } })
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export const RARITY_COLOR = {
  exceptional: '#f59e0b',
  special:     '#8b5cf6',
  rare:        '#3b82f6',
  common:      '#6b7280',
  radiant:     '#06b6d4',
}

export const RARITY_BG = {
  exceptional: 'linear-gradient(135deg, #78350f, #f59e0b)',
  special:     'linear-gradient(135deg, #4c1d95, #8b5cf6)',
  rare:        'linear-gradient(135deg, #1e3a5f, #3b82f6)',
  common:      'linear-gradient(135deg, #1f2937, #6b7280)',
  radiant:     'linear-gradient(135deg, #0c4a6e, #06b6d4)',
}

export const RARITY_LABEL = {
  exceptional: 'EXCEPTIONAL',
  special:     'SPECIAL',
  rare:        'RARE',
  common:      'COMMON',
  radiant:     'RADIANT',
}
