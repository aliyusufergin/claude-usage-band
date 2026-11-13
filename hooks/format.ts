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
  contextTokens: u.context.tokens,
  contextWindow: u.context.window,
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
export const formatDuration = (ms: number) => {
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

const WINDOWS: Record<string, number> = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 86_400_000,
}

/**
 * The pace of a limit's window: the usage it ends at if spent at the rate so
 * far, and how long until it runs out at that rate. Undefined when the window
 * is unknown or too young (under a tenth gone) for the rate to mean much.
 */
export const paceOf = (kind: string, percent: number, resetsAt: string | undefined, now: number) => {
  const length = WINDOWS[kind]
  if (!length || !resetsAt || percent <= 0) return undefined
  const left = Date.parse(resetsAt) - now
  if (Number.isNaN(left) || left <= 0 || left > length) return undefined
  const elapsed = length - left
  if (elapsed < length / 10) return undefined
  const projected = (percent / elapsed) * length
  const untilFull = percent >= 100 ? 0 : (elapsed * (100 - percent)) / percent
  return { projected, untilFull, isAhead: projected > 100 && untilFull < left }
}

export const colorOf = (percent: number, warnAt = 70, dangerAt = 90) =>
  percent >= dangerAt ? 'error' : percent >= warnAt ? 'warning' : 'success'

const clamp = (percent: number) => Math.min(100, Math.max(0, percent))

/** /context gibi disk hücreleri: ⛁ dolu, ⛀ yarım, ⛶ boş. */
export const cells = (percent: number, width: number) => {
  let filled = ''
  let empty = ''
  for (let i = 0; i < width; i++) {
    const v = (clamp(percent) / 100) * width - i
    if (v >= 0.75) filled += '⛁'
    else if (v >= 0.25) filled += '⛀'
    else empty += '⛶'
  }
  return { filled, empty }
}

/** Tek karakterlik pasta: ○ ◔ ◑ ◕ ●. */
export const pie = (percent: number) => '○◔◑◕●'.charAt(Math.round(clamp(percent) / 25))

export const formatPercent = (p: number) => `${Math.round(p)}%`

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

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
