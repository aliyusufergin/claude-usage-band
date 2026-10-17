import type { SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Snapshot } from '../types'

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'limit',
}

const NAMES: Record<string, string> = {
  five_hour: '5 saatlik',
  seven_day: 'Haftalık',
  spend_limit: 'Harcama',
}

export const labelOf = (kind: string) => LABELS[kind] ?? kind
export const nameOf = (kind: string) => NAMES[kind] ?? kind

export const toSnapshot = (u: {
  context: SessionContextUsage
  rateLimits: SessionRateLimit[]
  cost?: SessionCost
}): Snapshot => ({
  contextPercent: u.context.percent,
  contextTokens: u.context.tokens,
  contextWindow: u.context.window,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
  costUsd: u.cost?.usd,
})

/** "claude-opus-5-5[1m]" → "Opus 5.5 1M", "sonnet" → "Sonnet". */
export const prettyModel = (id: string) => {
  const is1m = /\[1m\]/i.test(id)
  const m = /(opus|sonnet|haiku|fable)(?:-(\d+)(?:-(\d{1,2}))?(?!\d))?/i.exec(id)
  const family = m?.[1]
  const base = family
    ? [family.charAt(0).toUpperCase() + family.slice(1).toLowerCase(), m[2] && (m[3] ? `${m[2]}.${m[3]}` : m[2])]
        .filter(Boolean)
        .join(' ')
    : id.replace(/^claude-/, '').replace(/\[1m\]/i, '')
  return is1m ? `${base} 1M` : base
}

/** Kalan süre: "45d", "1s12d", "3g4s" (gün, saat, dakika). */
export const countdown = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (Number.isNaN(ms)) return undefined
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes}d`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}s${minutes % 60 ? `${minutes % 60}d` : ''}`
  const days = Math.floor(hours / 24)
  return `${days}g${hours % 24 ? `${hours % 24}s` : ''}`
}

export const colorOf = (percent: number, warnAt = 70, dangerAt = 90) =>
  percent >= dangerAt ? 'error' : percent >= warnAt ? 'warning' : 'success'

export const bar = (percent: number, width: number) => {
  const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

export const formatPercent = (p: number) => `${Math.round(p)}%`

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const formatCost = (usd: number) => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

/** The highest threshold `percent` has reached, 0 below all. */
export const levelOf = (percent: number, thresholds: readonly number[]) =>
  thresholds.reduce((level, t) => (percent >= t && t > level ? t : level), 0)

/**
 * Whether two readings name the same rate-limit window: the reported reset
 * time can drift a little between responses, a new window moves it by hours.
 */
export const isSameWindow = (a: string | undefined, b: string | undefined) => {
  if (a === b) return true
  if (!a || !b) return false
  return Math.abs(Date.parse(a) - Date.parse(b)) < 15 * 60_000
}
