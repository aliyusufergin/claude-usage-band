import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { ModelInfo, Prefs, Snapshot } from '../types'
import { readConfig } from './config'
import type { Config } from './config'
import {
  bar,
  colorOf,
  countdown,
  formatCost,
  formatPercent,
  formatTokens,
  isSameWindow,
  labelOf,
  levelOf,
  nameOf,
  prettyModel,
  toSnapshot,
} from './format'

const snapAtom = atom({ plugin: 'usage-band', key: 'snap' } as const, null)
const modelAtom = atom({ plugin: 'usage-band', key: 'model' } as const, {})
const compactAtom = atom({ plugin: 'usage-band', key: 'compactAt' } as const, null)
const prefsAtom = atom({ plugin: 'usage-band', key: 'prefs' } as const, { isHidden: false, isCompact: false })

// $.store keys, kept across sessions.
const PREFS_KEY = 'prefs'
const ALERTED_KEY = 'alerted'

type Alerted = Record<string, { level: number; resetsAt?: string }>

type Part = { text: string; color?: string; dim?: boolean }
type Layout = { barWidth: number; showReset: boolean; showCompact: boolean }

const SEP: Part = { text: ' │ ', dim: true }

/** Widest first; the band takes the first one that fits its columns. */
const layoutsFor = (config: Config, prefs: Prefs): Layout[] => {
  const widest = prefs.isCompact ? 0 : config.barWidth
  return [
    { barWidth: widest, showReset: config.showReset, showCompact: config.showCompact },
    { barWidth: Math.min(widest, 5), showReset: config.showReset, showCompact: config.showCompact },
    { barWidth: 0, showReset: config.showReset, showCompact: config.showCompact },
    { barWidth: 0, showReset: false, showCompact: config.showCompact },
    { barWidth: 0, showReset: false, showCompact: false },
  ]
}

export const buildParts = (
  snap: Snapshot | null,
  model: ModelInfo,
  compactAt: number | null,
  now: number,
  layout: Layout,
  config: Config,
): Part[] => {
  const meter = (label: string, percent: number | undefined): Part[] => {
    if (percent === undefined) return [{ text: `${label} —`, dim: true }]
    const color = colorOf(percent, config.warnAt, config.dangerAt)
    const parts: Part[] = [{ text: `${label} `, dim: true }]
    if (layout.barWidth > 0) parts.push({ text: `${bar(percent, layout.barWidth)} `, color })
    parts.push({ text: formatPercent(percent), color })
    return parts
  }

  const groups: Part[][] = []

  const effort = config.showEffort ? model.effort : undefined
  if (config.showModel && model.model) {
    const group: Part[] = [{ text: prettyModel(model.model), color: 'claude' }]
    if (effort) group.push({ text: ` · ${effort}`, dim: true })
    groups.push(group)
  } else if (effort) {
    groups.push([{ text: effort, dim: true }])
  }

  const ctx = meter('ctx', snap?.contextPercent)
  if (layout.showCompact && compactAt !== null && snap?.contextTokens !== undefined) {
    const left = compactAt - snap.contextTokens
    ctx.push(
      left > 0
        ? { text: ` · compact'a ${formatTokens(left)}`, dim: true }
        : { text: ' · compact yakın', color: 'warning' },
    )
  }
  groups.push(ctx)

  for (const limit of snap?.limits ?? []) {
    const group = meter(labelOf(limit.kind), limit.percent)
    const left = layout.showReset ? countdown(limit.resetsAt, now) : undefined
    if (left) group.push({ text: ` ↻${left}`, dim: true })
    groups.push(group)
  }

  if (config.showCost && snap?.costUsd !== undefined) groups.push([{ text: formatCost(snap.costUsd), dim: true }])

  return groups.flatMap((group, i) => (i === 0 ? group : [SEP, ...group]))
}

const widthOf = (parts: Part[]) => parts.reduce((n, p) => n + p.text.length, 0)

async function readAlerted($: EngineInterface): Promise<Alerted> {
  const value = await $.store.get(ALERTED_KEY)
  return value && typeof value === 'object' ? (value as Alerted) : {}
}

async function readPrefs($: EngineInterface): Promise<Prefs | undefined> {
  const value = (await $.store.get(PREFS_KEY)) as Partial<Prefs> | undefined
  if (!value || typeof value !== 'object') return undefined
  return { isHidden: value.isHidden === true, isCompact: value.isCompact === true }
}

async function savePrefs($: EngineInterface, fn: (p: Prefs) => Prefs) {
  await update($, prefsAtom, fn)
  const prefs = await read($, prefsAtom)
  await $.store.set(PREFS_KEY, prefs)
  return prefs
}

// The model whose compaction threshold `compactAtom` holds.
let compactFor: string | undefined
let isCompactKnown = false

async function refreshCompact($: EngineInterface, config: Config) {
  if (!config.showCompact) return
  const { model } = await read($, modelAtom)
  if (isCompactKnown && compactFor === model) return
  // `summary` estimates locally: no token-count requests.
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  const at = breakdown?.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null
  await update($, compactAtom, () => at)
  compactFor = model
  isCompactKnown = breakdown !== undefined
}

async function alertLimits($: EngineInterface, limits: SessionRateLimit[], config: Config) {
  const thresholds = [...new Set([config.toastAt, config.notifyAt])].sort((a, b) => a - b)
  const alerted = await readAlerted($)
  const next: Alerted = { ...alerted }
  const now = await $.clock.now()
  let isChanged = false

  for (const limit of limits) {
    const prev = alerted[limit.kind]
    const isSame = prev !== undefined && isSameWindow(prev.resetsAt, limit.resetsAt)
    const was = isSame ? prev.level : 0
    const level = levelOf(limit.percentUsed, thresholds)
    if (isSame && level === was) continue

    next[limit.kind] = { level, resetsAt: limit.resetsAt }
    isChanged = true
    // Only rising past a threshold alerts; a new window or a drop re-arms it.
    if (level <= was) continue

    const left = countdown(limit.resetsAt, now)
    const text = `${nameOf(limit.kind)} kullanım %${Math.round(limit.percentUsed)}${left ? ` · sıfırlanmaya ${left}` : ''}`
    $.ui.toast(text, { timeoutMs: 8000 })
    if (config.notify && level >= config.notifyAt && was < config.notifyAt) {
      await $.ui.notify(text, { title: 'Claude kullanım limiti' })
    }
  }

  if (isChanged) await $.store.set(ALERTED_KEY, next)
}

export const register: Register = (on, options) => {
  const config = readConfig(options)
  // A reload may bring new options: read the threshold afresh.
  isCompactKnown = false

  let tick: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const prefs = await readPrefs($)
    if (prefs) await update($, prefsAtom, () => prefs)

    const model = await $.session.model()
    await update($, modelAtom, m => (m.model ? m : { ...m, model }))

    const usage = await $.session.usage()
    await update($, snapAtom, () => toSnapshot(usage))
    await refreshCompact($, config)

    await $.command.register({
      name: 'usage-band',
      description: 'Kullanım bandını gizle/göster; "kompakt" ile çubukları aç/kapa',
      argumentHint: '[kompakt]',
    })

    // Countdowns move while the session is idle: redraw once a minute.
    tick?.cancel()
    tick = $.clock.every(60_000, () => {
      void $.ui.invalidate('ui.render')
    })

    return result
  })

  on('session.end', ($, e, next) => {
    tick?.cancel()
    tick = undefined
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'kompakt' || arg === 'compact') {
      const prefs = await savePrefs($, p => ({ isHidden: false, isCompact: !p.isCompact }))
      return { text: prefs.isCompact ? 'Kullanım bandı kompakt modda.' : 'Kullanım bandı tam modda.' }
    }
    const prefs = await savePrefs($, p => ({ ...p, isHidden: !p.isHidden }))
    return { text: prefs.isHidden ? 'Kullanım bandı gizlendi.' : 'Kullanım bandı gösteriliyor.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapAtom, () => toSnapshot(e))
    if (e.changed.includes('context')) await refreshCompact($, config)
    if (e.changed.includes('rateLimits')) await alertLimits($, e.rateLimits, config)
    return next(e)
  })

  // The model and effort the main loop actually sends, after /model or a fallback.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      const current = await read($, modelAtom)
      if (current.model !== e.model || current.effort !== effort) {
        await update($, modelAtom, () => ({ model: e.model, effort }))
      }
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const prefs = await read($, prefsAtom)
    if (prefs.isHidden) return next(e)

    const snap = await read($, snapAtom)
    const model = await read($, modelAtom)
    if (!snap && !model.model) return next(e)

    const compactAt = await read($, compactAtom)
    const now = await $.clock.now()
    const columns = e.props.bodyColumns
    const candidates = layoutsFor(config, prefs).map(layout => buildParts(snap, model, compactAt, now, layout, config))
    const parts = candidates.find(p => widthOf(p) <= columns) ?? candidates[candidates.length - 1] ?? []

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {parts.map((p, i) => (
          <Text key={`p${i}`} color={p.color} dimColor={p.dim} wrap="truncate">
            {p.text}
          </Text>
        ))}
      </Box>
    )
  })
}
