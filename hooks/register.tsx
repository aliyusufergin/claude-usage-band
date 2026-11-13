import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { ModelInfo, Snapshot } from '../types'
import {
  colorOf,
  countdown,
  formatPercent,
  hasReset,
  isSameWindow,
  labelOf,
  levelOf,
  nameOf,
  pie,
  prettyModel,
  toSnapshot,
} from './format'

const snapAtom = atom({ plugin: 'usage-band', key: 'snap' } as const, null)
const modelAtom = atom({ plugin: 'usage-band', key: 'model' } as const, {})
const prefsAtom = atom({ plugin: 'usage-band', key: 'prefs' } as const, { isHidden: false })

// $.store keys, kept across sessions.
const PREFS_KEY = 'prefs'
const ALERTED_KEY = 'alerted'

/** A toast at the first, a toast and a system notification at the second. */
const TOAST_AT = 80
const NOTIFY_AT = 95

type Alerted = Record<string, { level: number; resetsAt?: string }>

type Part = { text: string; color?: string; dim?: boolean }
type Layout = { showPies: boolean; showReset: boolean }

const SEP: Part = { text: '   ' }

/** Widest first; the band takes the first one that fits its columns. */
const LAYOUTS: Layout[] = [
  { showPies: true, showReset: true },
  { showPies: false, showReset: true },
  { showPies: false, showReset: false },
]

const buildParts = (snap: Snapshot | null, model: ModelInfo, now: number, layout: Layout): Part[] => {
  const meter = (label: string, percent: number | undefined): Part[] => {
    if (percent === undefined) return [{ text: `${label} —`, dim: true }]
    const color = colorOf(percent)
    const parts: Part[] = [{ text: `${label} `, dim: true }]
    if (layout.showPies) parts.push({ text: `${pie(percent)} `, color })
    parts.push({ text: formatPercent(percent), color })
    return parts
  }

  const groups: Part[][] = []

  if (model.model) {
    const group: Part[] = [{ text: `⏺ ${prettyModel(model.model)}`, color: 'claude' }]
    if (model.effort) group.push({ text: ` ${model.effort}`, dim: true })
    groups.push(group)
  }

  groups.push(meter('ctx', snap?.contextPercent))

  for (const limit of snap?.limits ?? []) {
    // The window closed while idle: the reading is stale until the next request.
    if (hasReset(limit.resetsAt, now)) {
      groups.push([{ text: `${labelOf(limit.kind)} sıfırlandı`, dim: true }])
      continue
    }
    const group = meter(labelOf(limit.kind), limit.percent)
    const left = layout.showReset ? countdown(limit.resetsAt, now) : undefined
    if (left) group.push({ text: ` ↻${left}`, dim: true })
    groups.push(group)
  }

  return groups.flatMap((group, i) => (i === 0 ? group : [SEP, ...group]))
}

// Kod noktası sayar: ⏺ ◑ gibi karakterler terminalde tek hücre.
const widthOf = (parts: Part[]) => parts.reduce((n, p) => n + [...p.text].length, 0)

async function readAlerted($: EngineInterface): Promise<Alerted> {
  const value = await $.store.get(ALERTED_KEY)
  return value && typeof value === 'object' ? (value as Alerted) : {}
}

async function alertLimits($: EngineInterface, limits: SessionRateLimit[], notify: boolean) {
  const alerted = await readAlerted($)
  const next: Alerted = { ...alerted }
  const now = await $.clock.now()
  let isChanged = false

  for (const limit of limits) {
    const prev = alerted[limit.kind]
    const isSame = prev !== undefined && isSameWindow(prev.resetsAt, limit.resetsAt)
    const was = isSame ? prev.level : 0
    const level = levelOf(limit.percentUsed, [TOAST_AT, NOTIFY_AT])
    if (isSame && level === was) continue

    next[limit.kind] = { level, resetsAt: limit.resetsAt }
    isChanged = true
    // Only rising past a threshold alerts; a new window or a drop re-arms it.
    if (level <= was) continue

    const left = countdown(limit.resetsAt, now)
    const text = [`${nameOf(limit.kind)} kullanım %${Math.round(limit.percentUsed)}`, left && `sıfırlanmaya ${left}`]
      .filter(Boolean)
      .join(' · ')
    $.ui.toast(text, { timeoutMs: 8000 })
    if (notify && level >= NOTIFY_AT && was < NOTIFY_AT) {
      await $.ui.notify(text, { title: 'Claude kullanım limiti' })
    }
  }

  if (isChanged) await $.store.set(ALERTED_KEY, next)
}

export const register: Register = (on, options) => {
  const notify = options?.notify !== false

  let tick: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const stored = (await $.store.get(PREFS_KEY)) as { isHidden?: unknown } | undefined
    if (stored?.isHidden === true) await update($, prefsAtom, () => ({ isHidden: true }))

    const model = await $.session.model()
    await update($, modelAtom, m => (m.model ? m : { ...m, model }))

    const usage = await $.session.usage()
    await update($, snapAtom, () => toSnapshot(usage))

    await $.command.register({ name: 'usage-band', description: 'Kullanım bandını gizle/göster' })

    // Countdowns move while the session is idle: redraw once a minute.
    // Skipped while nothing on the band depends on the time.
    const redraw = async () => {
      if ((await read($, prefsAtom)).isHidden) return
      if (!(await read($, snapAtom))?.limits.length) return
      await $.ui.invalidate('ui.render')
    }
    tick?.cancel()
    tick = $.clock.every(60_000, () => {
      void redraw()
    })

    return result
  })

  on('session.end', ($, e, next) => {
    tick?.cancel()
    tick = undefined
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    await update($, prefsAtom, p => ({ isHidden: !p.isHidden }))
    const prefs = await read($, prefsAtom)
    await $.store.set(PREFS_KEY, prefs)
    return { text: prefs.isHidden ? 'Kullanım bandı gizlendi.' : 'Kullanım bandı gösteriliyor.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapAtom, () => toSnapshot(e))
    if (e.changed.includes('rateLimits')) await alertLimits($, e.rateLimits, notify)
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
    if ((await read($, prefsAtom)).isHidden) return next(e)

    const snap = await read($, snapAtom)
    const model = await read($, modelAtom)
    if (!snap && !model.model) return next(e)

    const now = await $.clock.now()
    const candidates = LAYOUTS.map(layout => buildParts(snap, model, now, layout))
    const parts = candidates.find(p => widthOf(p) <= e.props.bodyColumns) ?? candidates[candidates.length - 1] ?? []

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box width="100%" justifyContent="center">
        {parts.map((p, i) => (
          <Text key={`p${i}`} color={p.color} dimColor={p.dim} wrap="truncate">
            {p.text}
          </Text>
        ))}
      </Box>
    )
  })
}
