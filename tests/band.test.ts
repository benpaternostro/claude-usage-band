import type { SessionContextBreakdown } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { CLOSE_GLYPH, OPEN_GLYPH, contextBar, kTokens, relative, resetIn, resetText, textCells } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 40,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The raw figure (a subagent's last response) is small; the breakdown is the real fill.
const RAW = {
  context: { tokens: 18_000, window: 200_000, percent: 9 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 36 },
    { kind: 'seven_day', percentUsed: 19 },
  ],
  cost: { usd: 1.234 },
}

const BREAKDOWN = {
  categories: [
    { name: 'Messages', tokens: 60_000, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 28_400, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
    { name: 'Free space', tokens: 78_600, color: 'inactive', isDeferred: false, kind: 'free' },
  ],
  totalTokens: 88_400,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  percentage: 44,
  autoCompactThreshold: 167_000,
  isAutoCompactEnabled: true,
} as unknown as SessionContextBreakdown

test('helpers format figures', async () => {
  expect(kTokens(88_400)).toBe('88.4k')
  expect(kTokens(200_000)).toBe('200k')
  expect(relative(61 * 60_000)).toBe('1h 1m')
  expect(relative(61 * 60_000, true)).toBe('1 hr 1 min')
  const session = { kind: 'five_hour', percentUsed: 36, resetsAt: new Date(61 * 60_000).toISOString() }
  expect(resetIn(session, 0)).toBe('1h 1m')
  expect(resetText(session, 0)).toBe('Resets in 1 hr 1 min')
  expect(textCells([{ color: '#fff', part: 0.5 }], 10)).toEqual({ cells: [{ color: '#fff', n: 5 }], free: 5 })
  const bar = contextBar({
    tokens: 100,
    window: 200,
    limits: [],
    buffer: 20,
    segments: [
      { name: 'Messages', tokens: 30, color: '#4a80e8' },
      { name: 'System tools', tokens: 10, color: '#b4b4b4' },
    ],
  })
  expect(bar.parts.map(p => p.part)).toEqual([0.375, 0.125, 0.1])
  expect(bar.parts[0]?.title).toBe('Messages · 30 (15%)')
  expect(bar.rest).toBe('Free space · 80 (40%)')
})

test('band shows the /context fill and opens the drawer in place of the band', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, ...RAW, context: { ...RAW.context, breakdown: BREAKDOWN } } }))

  await $.session.measure({ ...RAW, changed: ['context', 'rateLimits', 'cost'] })

  for (const [surface, maxRows] of [['terminal', 40], ['desktop', 9]] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND, props: { ...BAND.props, maxRows } })
    expect((await ui.find({ key: 'ctx-pct' }))?.text).toBe('44%')
    expect((await ui.find({ key: 'lim-five_hour-label' }))?.text).toBe('Session')
    expect((await ui.find({ key: 'details' }))?.text).toBe(OPEN_GLYPH)

    await ui.press({ key: 'details' })
    expect((await ui.find({ key: 'details' }))?.text).toBe(CLOSE_GLYPH)
    expect(await ui.find({ type: 'Text', text: 'Context window' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '88.4k / 200k (44%)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Session limit' })).toBeDefined()
    expect(await ui.find({ key: 'compact-now' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Messages' })).toBeDefined()
    expect(await ui.find({ key: 'ctx' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '$1.23' })).toBeDefined()

    await ui.press({ key: 'details' })
    expect((await ui.find({ key: 'details' }))?.text).toBe(OPEN_GLYPH)
    expect(await ui.find({ key: 'd-ctx' })).toBeUndefined()

    for (const key of ['ctx-label', 'ctx-hit']) {
      await ui.press({ key })
      expect((await ui.find({ key: 'details' }))?.text).toBe(CLOSE_GLYPH)
      await ui.press({ key: 'details' })
    }
    await ui.unmount()
  }
})
