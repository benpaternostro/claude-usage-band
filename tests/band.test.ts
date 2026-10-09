import type { SessionContextBreakdown } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { CLOSE_GLYPH, OPEN_GLYPH, contextBar, contextColor, fillColor, kTokens, relative, resetIn, resetText, textCells } from '../hooks/register'
import { branchName, isDetached, parseHead } from '../hooks/git'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 40,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The raw figure (a subagent's last response) is small; the breakdown is the real fill.
const RAW = {
  context: { tokens: 18_000, window: 200_000, percent: 9 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 36, resetsAt: new Date((2 * 60 + 14) * 60_000).toISOString() },
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

const BLUE = '#4a80e8'
const AMBER = '#e0a526'
const RED = '#e5484d'

test('a fill turns amber, then red, as it nears its limit', async () => {
  expect([0, 79, 80, 94, 95, 100].map(p => fillColor(p))).toEqual([BLUE, BLUE, AMBER, AMBER, RED, RED])
  // The context's limit is the auto-compact point, or the window without one.
  const ctx = { window: 200_000, limits: [], segments: [] }
  expect(contextColor({ ...ctx, tokens: 132_000, autoCompactAt: 167_000 })).toBe(BLUE)
  expect(contextColor({ ...ctx, tokens: 140_000, autoCompactAt: 167_000 })).toBe(AMBER)
  expect(contextColor({ ...ctx, tokens: 160_000, autoCompactAt: 167_000 })).toBe(RED)
  expect(contextColor({ ...ctx, tokens: 140_000 })).toBe(BLUE)
  expect(contextColor({ ...ctx, tokens: 160_000 })).toBe(AMBER)
  expect(contextColor({ ...ctx })).toBe(BLUE)
})

test('git head names the branch, a detached sha, and a linked worktree', async () => {
  const main = ['C:/r/.git', 'C:/r/.git', 'C:/r', 'main', ''].join('\n')
  expect(parseHead(main)).toEqual({ branch: 'main' })
  expect(isDetached(main)).toBe(false)
  const detached = ['/r/.git', '/r/.git', '/r', 'HEAD', ''].join('\n')
  expect(isDetached(detached)).toBe(true)
  expect(parseHead(detached, 'abc1234\n')).toEqual({ branch: 'abc1234' })
  expect(parseHead(detached)).toBe(null)
  const linked = ['C:/r/.git/worktrees/fix', 'C:/r/.git', 'C:/r/.claude/worktrees/fix', 'fix-band', ''].join('\r\n')
  expect(parseHead(linked)).toEqual({ branch: 'fix-band', worktree: 'fix' })
  expect(parseHead('')).toBe(null)
  // The name after its last slash.
  expect(branchName({ branch: 'main' })).toBe('main')
  expect(branchName({ branch: 'feature/NEXT-1777' })).toBe('NEXT-1777')
  expect(branchName({ branch: 'claude/new-session-35d9df', worktree: 'new-session-35d9df' })).toBe('new-session-35d9df')
  expect(branchName({ branch: 'feature/a-very-long-branch-name' }, 16)).toBe('a-very-long-bra…')
})

test('band shows the /context fill and opens the drawer in place of the band', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, ...RAW, context: { ...RAW.context, breakdown: BREAKDOWN } } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: ['/r/.git/worktrees/fix', '/r/.git', '/r/.claude/worktrees/fix', 'fix-band', ''].join('\n'),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.measure({ ...RAW, changed: ['context', 'rateLimits', 'cost'] })
  await $.session.start({ cwd: '/r/.claude/worktrees/fix', surface: 'terminal', isInteractive: true })

  for (const [surface, maxRows] of [['terminal', 40], ['desktop', 9]] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND, props: { ...BAND.props, maxRows } })
    expect((await ui.find({ key: 'ctx-pct' }))?.text).toBe('44%')
    // The band's context bar is one blue fill; the drawer has the categories.
    if (surface === 'terminal') {
      const cells = ((await ui.find({ key: 'ctx-bar' }))?.children ?? []) as { props?: { color?: string } }[]
      expect(cells[0]?.props?.color).toBe(BLUE)
      expect(cells.filter(c => c.props?.color === BLUE)).toHaveLength(1)
    }
    expect((await ui.find({ key: 'lim-five_hour-label' }))?.text).toBe('Session')
    expect((await ui.find({ key: 'details' }))?.text).toBe(OPEN_GLYPH)
    expect((await ui.find({ key: 'lim-five_hour-pct' }))?.text).toBe('36%')
    // The reset time is always shown, not only under the pointer.
    expect((await ui.find({ key: 'lim-five_hour-note' }))?.text).toBe('2h 14m')
    expect(await ui.find({ key: 'lim-seven_day-note' })).toBeUndefined()
    // The terminal spells out what the desktop's icons say.
    const isDesktop = surface === 'desktop'
    expect((await ui.find({ key: 'cache-time' }))?.text).toBe('—')
    expect((await ui.find({ key: 'cache-label' }))?.text).toBe(isDesktop ? undefined : 'Cache')
    expect(await ui.find({ type: 'Text', text: 'fix-band' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: 'git' })) !== undefined).toBe(!isDesktop)
    expect((await ui.find({ type: 'Text', text: '· worktree' })) !== undefined).toBe(!isDesktop)
    // Three bars, then the branch icon, the divider and the clock.
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(isDesktop ? 6 : 0)

    await ui.press({ key: 'details' })
    expect((await ui.find({ key: 'details' }))?.text).toBe(CLOSE_GLYPH)
    expect(await ui.find({ type: 'Text', text: 'Context window' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '88.4k / 200k (44%)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Session limit' })).toBeDefined()
    expect(await ui.find({ key: 'compact-now' })).toBeDefined()
    if (surface !== 'desktop') {
      // A limit bar fits its half-width column: (120 - 2 padding - 4 gap) / 2.
      const cells = (await ui.find({ key: 'd-lim-bar-five_hour' }))?.text ?? ''
      expect(cells.length).toBe(57)
    }
    expect(await ui.find({ type: 'Text', text: 'Messages' })).toBeDefined()
    expect(await ui.find({ key: 'ctx' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '$1.23' })).toBeDefined()

    await ui.press({ key: 'details' })
    expect((await ui.find({ key: 'details' }))?.text).toBe(OPEN_GLYPH)
    expect(await ui.find({ key: 'd-ctx' })).toBeUndefined()

    // The blank hit Button over a bar is desktop-only: on a text surface it paints over the bar.
    expect((await ui.find({ key: 'ctx-hit' })) !== undefined).toBe(surface === 'desktop')
    for (const key of surface === 'desktop' ? ['ctx-label', 'ctx-hit'] : ['ctx-label']) {
      await ui.press({ key })
      expect((await ui.find({ key: 'details' }))?.text).toBe(CLOSE_GLYPH)
      await ui.press({ key: 'details' })
    }
    await ui.unmount()
  }
})

test('a long branch shows its last part, narrows the bars or turns them to rings, then is shortened, then goes', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, ...RAW, context: { ...RAW.context, breakdown: BREAKDOWN } } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: ['/r/.git', '/r/.git', '/r', 'feature/usage-band-shrink-bars', ''].join('\n'),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.measure({ ...RAW, changed: ['context', 'rateLimits', 'cost'] })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })

  const mount = (surface: 'terminal' | 'desktop', bodyColumns: number) =>
    $.ui.mount({ plugin: 'usage-band', surface, ...BAND, props: { ...BAND.props, bodyColumns } })

  // Stub bars, and the name cut to the cells the row has left. The whole
  // name waits, hidden, for the pointer.
  let ui = await mount('terminal', 102)
  expect((await ui.find({ key: 'ctx-bar' }))?.text?.length).toBe(3)
  expect(await ui.find({ type: 'Text', text: 'usage-band-shrink-ba…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'feature/usage-band-shrink-bars' })).toBeDefined()
  await ui.unmount()

  // Too narrow to keep eight characters: the branch goes and the bars widen again.
  ui = await mount('terminal', 80)
  expect(await ui.find({ type: 'Text', text: 'git' })).toBeUndefined()
  expect((await ui.find({ key: 'ctx-bar' }))?.text?.length).toBe(5)
  await ui.unmount()

  // The desktop's bars would be too narrow to read, so rings take their place
  // and the name stays whole. The kit keeps no Svg keys, but the meters' are
  // the first three Svgs.
  ui = await mount('desktop', 88)
  const svgs = await ui.findAll({ type: 'Svg' })
  const rings = svgs.slice(0, 3)
  expect(rings.map(svg => svg.props.width)).toEqual([14, 14, 14])
  // Each one blue arc, the context's included.
  expect(rings.every(svg => String(svg.props.source).includes('<circle'))).toBe(true)
  expect(rings.every(svg => String(svg.props.source).match(/stroke="#4a80e8"/g)?.length === 1)).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'usage-band-shrink-bars' })).toBeDefined()
  // The whole name waits, hidden, for the pointer, on a ground of its own:
  // no frame, which would paint white.
  const full = await ui.find({ type: 'Text', text: 'feature/usage-band-shrink-bars' })
  expect(full?.props.color).toBe('#f2f2f2')
  expect(svgs.some(svg => svg.props.isInteractive)).toBe(false)
  await ui.unmount()
})

test('the band and the drawer draw a fill near its limit amber or red', async ($, on) => {
  mock.clock(on)
  const near = {
    ...RAW,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 96 },
      { kind: 'seven_day', percentUsed: 85 },
    ],
  }
  // 140k of the 167k at which the session auto-compacts.
  const breakdown = { ...BREAKDOWN, totalTokens: 140_000, percentage: 70 }
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, ...near, context: { ...near.context, breakdown } } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.measure({ ...near, changed: ['context', 'rateLimits', 'cost'] })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })

  const fill = async (ui: { find: (q: { key: string }) => Promise<{ children: unknown[] } | undefined> }, key: string) =>
    (((await ui.find({ key }))?.children ?? []) as { props?: { color?: string } }[])[0]?.props?.color

  const terminal = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect(await fill(terminal, 'ctx-bar')).toBe(AMBER)
  expect(await fill(terminal, 'lim-five_hour-bar')).toBe(RED)
  expect(await fill(terminal, 'lim-seven_day-bar')).toBe(AMBER)
  await terminal.press({ key: 'details' })
  expect(await fill(terminal, 'd-lim-bar-five_hour')).toBe(RED)
  // The drawer stays open across mounts: close it for the desktop's band.
  await terminal.press({ key: 'details' })
  await terminal.unmount()

  // The desktop's bars, the first three Svgs.
  const desktop = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', ...BAND })
  const bars = (await desktop.findAll({ type: 'Svg' })).slice(0, 3).map(svg => String(svg.props.source))
  expect([AMBER, RED, AMBER].map((color, i) => bars[i]?.includes(`fill="${color}"`))).toEqual([true, true, true])
  await desktop.unmount()
})
