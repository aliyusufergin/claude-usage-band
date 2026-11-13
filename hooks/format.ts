import type { SessionContextUsage, SessionRateLimit } from 'claude-code'

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
}): Snapshot => ({
  contextPercent: u.context.percent,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
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

/** A duration: "45m", "1h12m", "3d4h". */
const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`
  const days = Math.floor(hours / 24)
  return `${days}d${hours % 24 ? `${hours % 24}h` : ''}`
}

/** Time left until `resetsAt`; undefined when unknown or already past. */
export const countdown = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (Number.isNaN(ms) || ms <= 0) return undefined
  return formatDuration(ms)
}

/** Whether the window `resetsAt` closes has already reset. */
export const hasReset = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt ? Date.parse(resetsAt) : Number.NaN
  return !Number.isNaN(at) && at <= now
}

export const colorOf = (percent: number) => (percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success')

const clamp = (percent: number) => Math.min(100, Math.max(0, percent))

/** Tek karakterlik pasta: ○ ◔ ◑ ◕ ●. */
export const pie = (percent: number) => '○◔◑◕●'.charAt(Math.round(clamp(percent) / 25))

export const formatPercent = (p: number) => `${Math.round(p)}%`

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
