import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { readConfig } from '../hooks/config'
import { countdown, isSameWindow, levelOf, prettyModel } from '../hooks/format'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const SURFACES = ['terminal', 'desktop'] as const
const FIVE_HOUR_RESET = '2026-10-17T13:12:00Z'

const measure = (fiveHour: number, sevenDay: number, fiveHourReset = FIVE_HOUR_RESET) => ({
  context: { tokens: 84_000, window: 200_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: fiveHourReset },
    { kind: 'seven_day', percentUsed: sevenDay, resetsAt: '2026-10-20T12:00:00Z' },
  ],
  cost: { usd: 1.237 },
  changed: ['context', 'rateLimits', 'cost'] as ('context' | 'rateLimits' | 'cost')[],
})

type Seen = { toasts: string[]; notices: string[] }

/** Stands in for the engine beneath the plugin, recording toasts and notifications. */
const engine = (on: On, stored?: Record<string, unknown>): Seen => {
  const seen: Seen = { toasts: [], notices: [] }
  mock.clock(on, { now: NOW })
  mock.store(on, stored)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: {
        window: 200_000,
        breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 144_000 },
      },
      rateLimits: [],
    } as never,
  }))
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_$, e) => {
    seen.notices.push(e.text)
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  // The engine's own band: nothing.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return seen
}

const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

const runCommand = (args: string) => ({
  command: 'usage-band',
  args,
  origin: { kind: 'composer' } as never,
  presentation: {} as never,
})

describe('format', () => {
  test('countdown in Turkish units', () => {
    expect(countdown('2026-10-17T12:45:00Z', NOW)).toBe('45d')
    expect(countdown('2026-10-17T13:12:00Z', NOW)).toBe('1s12d')
    expect(countdown('2026-10-20T16:00:00Z', NOW)).toBe('3g4s')
    expect(countdown(undefined, NOW)).toBe(undefined)
  })

  test('model names', () => {
    expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
    expect(prettyModel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
    expect(prettyModel('sonnet')).toBe('Sonnet')
  })

  test('threshold levels and windows', () => {
    expect(levelOf(79.9, [80, 95])).toBe(0)
    expect(levelOf(80, [80, 95])).toBe(80)
    expect(levelOf(96, [80, 95])).toBe(95)
    expect(isSameWindow('2026-10-17T13:12:00Z', '2026-10-17T13:14:00Z')).toBe(true)
    expect(isSameWindow('2026-10-17T13:12:00Z', '2026-10-17T18:12:00Z')).toBe(false)
  })

  test('config falls back to defaults on bad values', () => {
    const config = readConfig({ barWidth: 50, showCost: 'yes', toastAt: 75 })
    expect(config.barWidth).toBe(20)
    expect(config.showCost).toBe(true)
    expect(config.toastAt).toBe(75)
  })
})

for (const surface of SURFACES) {
  test(`band shows every segment on ${surface}`, async ($, on) => {
    engine(on)

    await $.session.measure(measure(23, 61))
    for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })) {
      // drain
    }
    // The model change makes the next measurement re-read the compaction threshold.
    await $.session.measure(measure(23, 61))

    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: bandProps(200) })
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

    expect(text).toContain('Opus 5.5 · high')
    expect(text).toContain("ctx ▓▓▓░░░░░ 42% · compact'a 60k")
    expect(text).toContain('5h ▓▓░░░░░░ 23% ↻1s12d')
    expect(text).toContain('7d ▓▓▓▓▓░░░ 61% ↻3g')
    expect(text).toContain('$1.24')
  })
}

test('options hide segments and narrow the bars', { options: { showCost: false, showModel: false, barWidth: 4 } }, async ($, on) => {
  engine(on)
  await $.session.measure(measure(50, 61))

  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(200) })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(text).not.toContain('$')
  expect(text).toContain('5h ▓▓░░ 50%')
})

test('narrow band drops the bars, then the countdowns', async ($, on) => {
  engine(on)
  await $.session.measure(measure(23, 61))

  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(40) })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(text).not.toContain('▓')
  expect(text).toContain('5h 23%')
})

test('/usage-band hides the band and toggles compact mode', async ($, on) => {
  engine(on)
  await $.session.measure(measure(23, 61))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(200) })

  expect((await $.command.run(runCommand('kompakt'))).text).toBe('Kullanım bandı kompakt modda.')
  const compact = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(compact).toContain('5h 23%')
  expect(compact).not.toContain('▓')

  expect((await $.command.run(runCommand(''))).text).toBe('Kullanım bandı gizlendi.')
  expect(await ui.findAll({ type: 'Text', text: '5h' })).toHaveLength(0)

  expect((await $.command.run(runCommand(''))).text).toBe('Kullanım bandı gösteriliyor.')
  expect(await ui.findAll({ type: 'Text', text: '5h' })).not.toHaveLength(0)
})

test('alerts once per threshold per window, notifying at the critical one', async ($, on) => {
  const seen = engine(on)

  await $.session.measure(measure(50, 10))
  await $.session.measure(measure(81, 10))
  await $.session.measure(measure(85, 10, '2026-10-17T13:14:00Z'))
  await $.session.measure(measure(96, 10))
  await $.session.measure(measure(2, 10, '2026-10-17T18:12:00Z'))
  await $.session.measure(measure(82, 10, '2026-10-17T18:12:00Z'))

  expect(seen.toasts).toEqual([
    '5 saatlik kullanım %81 · sıfırlanmaya 1s12d',
    '5 saatlik kullanım %96 · sıfırlanmaya 1s12d',
    '5 saatlik kullanım %82 · sıfırlanmaya 6s12d',
  ])
  expect(seen.notices).toEqual(['5 saatlik kullanım %96 · sıfırlanmaya 1s12d'])
})

test('an alert already given in an earlier session is not repeated', async ($, on) => {
  const seen = engine(on, { alerted: { five_hour: { level: 80, resetsAt: FIVE_HOUR_RESET } } })

  await $.session.measure(measure(83, 10))

  expect(seen.toasts).toEqual([])
})
