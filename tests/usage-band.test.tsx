import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

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
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
})

const drain = async (gen: AsyncIterable<unknown>) => {
  for await (const _ of gen) {
    // drain
  }
}

type Seen = { toasts: string[]; notices: string[]; clock: ReturnType<typeof mock.clock> }

/** Stands in for the engine beneath the plugin, recording toasts and notifications. */
const engine = (on: On, stored?: Record<string, unknown>): Seen => {
  const seen: Seen = { toasts: [], notices: [], clock: mock.clock(on, { now: NOW }) }
  mock.store(on, stored)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } as never,
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
  isCollapsed: false,
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
  test('countdown in English units', () => {
    expect(countdown('2026-10-17T12:45:00Z', NOW)).toBe('45m')
    expect(countdown('2026-10-17T13:12:00Z', NOW)).toBe('1h12m')
    expect(countdown('2026-10-20T16:00:00Z', NOW)).toBe('3d4h')
    expect(countdown('2026-10-17T11:59:00Z', NOW)).toBe(undefined)
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

})

for (const surface of SURFACES) {
  test(`band shows every segment on ${surface}`, async ($, on) => {
    engine(on)

    await $.session.measure(measure(23, 61))
    await drain($.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 }))

    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: bandProps(200) })
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

    expect(text).toContain('⏺ Opus 5.5 high')
    expect(text).toContain('ctx ◑ 42%')
    expect(text).toContain('5h ◔ 23% ↻1h12m')
    expect(text).toContain('7d ◑ 61% ↻3d')
    expect(text).not.toContain('$')
    const boxes = await ui.findAll({ type: 'Box' })
    expect(boxes.some(b => b.props.justifyContent === 'center')).toBe(true)
  })
}

test('narrow band drops the pies, then the countdowns', async ($, on) => {
  engine(on)
  await $.session.measure(measure(23, 61))

  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(40) })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(text).not.toContain('◑')
  expect(text).not.toContain('◔')
  expect(text).toContain('5h 23%')
})

test('/usage-band hides and shows the band', async ($, on) => {
  engine(on)
  await $.session.measure(measure(23, 61))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(200) })

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
    '5 saatlik kullanım %81 · sıfırlanmaya 1h12m',
    '5 saatlik kullanım %96 · sıfırlanmaya 1h12m',
    '5 saatlik kullanım %82 · sıfırlanmaya 6h12m',
  ])
  expect(seen.notices).toEqual(['5 saatlik kullanım %96 · sıfırlanmaya 1h12m'])
})

test('an alert already given in an earlier session is not repeated', async ($, on) => {
  const seen = engine(on, { alerted: { five_hour: { level: 80, resetsAt: FIVE_HOUR_RESET } } })

  await $.session.measure(measure(83, 10))

  expect(seen.toasts).toEqual([])
})

test('a window that reset while idle is shown as reset', async ($, on) => {
  const seen = engine(on)
  await $.session.measure(measure(92, 61))
  await seen.clock.advance(73 * 60_000)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(200) })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(text).toContain('5h sıfırlandı')
  expect(text).not.toContain('92%')
  expect(text).toContain('7d ◑ 61%')
})

test("subagent steps leave the band's model alone", async ($, on) => {
  engine(on)
  await $.session.measure(measure(23, 61))
  await drain($.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 }))
  await drain($.turn.step({ turnId: 's', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' } as never))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps(200) })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(text).toContain('⏺ Opus 5.5 high')
  expect(text).not.toContain('Haiku')
})

test('notify off keeps the toast, skips the system notification', { options: { notify: false } }, async ($, on) => {
  const seen = engine(on)
  await $.session.measure(measure(96, 10))

  expect(seen.toasts).toHaveLength(1)
  expect(seen.notices).toEqual([])
})
