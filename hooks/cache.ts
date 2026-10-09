import type { Limit } from '../types'

type CacheOptions = {
  force5m?: string
  ttl?: string
  setting?: unknown
  enable1h?: string
  limits: Limit[]
}

// Limits identify the subscription default. The host does not expose its
// billing mode, so this remains an estimate when no TTL is configured.
export const cacheTtl = ({ force5m, ttl, setting, enable1h, limits }: CacheOptions): number => {
  if (force5m === '1') return 300_000
  for (const value of [ttl, setting]) {
    if (value === '5m') return 300_000
    if (value === '1h') return 3_600_000
  }
  if (enable1h === '1') return 3_600_000
  const plan = limits.filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')
  return plan.length > 0 && plan.every(l => l.percentUsed < 100) ? 3_600_000 : 300_000
}

// Whole minutes until the last one, then seconds: the label keeps its width
// rather than changing every second. The band puts a clock or "Cache" before it.
export const cacheText = (expiresAt: number | null, now: number): string => {
  if (expiresAt === null) return '—'
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  if (seconds === 0) return 'expired'
  return seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)}m`
}
