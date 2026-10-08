import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Limit, Segment, Snapshot } from '../types'
import { cacheText, cacheTtl } from './cache'

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)
const isOpen = atom({ plugin: 'usage-band', key: 'isOpen' } as const, false)
const cacheExpiresAt = atom({ plugin: 'usage-band', key: 'cacheExpiresAt' } as const, null)

// Full-width glyphs: the same size as the app's close control, and the same
// advance as each other, so the toggle never moves.
export const OPEN_GLYPH = '＋'
export const CLOSE_GLYPH = '－'

const SHORT_LABELS: Record<string, string> = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Credits' }
const LONG_LABELS: Record<string, string> = {
  five_hour: 'Session limit',
  seven_day: 'Weekly · all models',
  spend_limit: 'Usage credits',
}

// The app's usage popover: blue fill on a dark track; context categories in theme colours.
const BLUE = '#4a80e8'
const TRACK = '#8888884d'
const BUFFER = '#8888888c'
const HOVER_BG = '#8888881f'
const THEME: Record<string, string> = {
  permission: BLUE,
  suggestion: BLUE,
  claude: '#d97757',
  success: '#3fae6a',
  warning: '#e0a526',
  error: '#e5484d',
  inactive: '#b4b4b4',
  promptBorder: '#b4b4b4',
  remember: '#a48fd8',
  purple_FOR_SUBAGENTS_ONLY: '#a48fd8',
  cyan_FOR_SUBAGENTS_ONLY: '#4fb3c4',
}
const BY_RANK = [BLUE, '#d97757', '#3fae6a', '#e0a526', '#b4b4b4', '#a48fd8', '#4fb3c4']
const BAR_PX = 56
const BAR_CELLS = 8
// Braille blanks: drawn empty, never trimmed as spaces are.
const HIT_LABEL = '⠀'.repeat(BAR_CELLS)

type Usage = { context: SessionContextUsage; rateLimits: SessionRateLimit[]; cost?: SessionCost }
type Part = { color: string; part: number; title?: string; tokens?: number }
// What the bar's empty track says under the pointer.
type Bar = { parts: Part[]; rest?: string; restTokens?: number }

const limitsOf = (u: Usage): Limit[] =>
  u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }))

// The breakdown is what /context and the popover show; the raw figure is the last
// response's input, which can be a subagent's, so it is only the fallback.
export const toSnapshot = (u: Usage, prev: Snapshot | null): Snapshot => {
  const b = u.context.breakdown
  if (!b) {
    return {
      tokens: u.context.tokens,
      window: u.context.window,
      percent: u.context.percent,
      limits: limitsOf(u),
      usd: u.cost?.usd,
      segments: prev?.segments ?? [],
      buffer: prev?.buffer,
      autoCompactAt: prev?.autoCompactAt,
    }
  }
  const segments: Segment[] = b.categories
    .filter(c => c.kind === 'used' && c.tokens > 0)
    .sort((x, y) => y.tokens - x.tokens)
    .map((c, i) => ({ name: c.name, tokens: c.tokens, color: THEME[c.color] ?? BY_RANK[i % BY_RANK.length] ?? BLUE }))
  const buffer = b.categories.filter(c => c.kind === 'buffer').reduce((a, c) => a + c.tokens, 0)
  return {
    tokens: b.totalTokens,
    window: b.rawMaxTokens,
    percent: b.percentage,
    limits: limitsOf(u),
    usd: u.cost?.usd,
    segments,
    buffer: buffer > 0 ? buffer : undefined,
    autoCompactAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
  }
}

export const kTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${n}`

export const relative = (ms: number, isLong = false) => {
  const mins = Math.max(1, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (isLong) return d > 0 ? `${d} d ${h} hr` : h > 0 ? `${h} hr ${m} min` : `${m} min`
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const resetIn = (l: Limit, now: number) => {
  const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  return at > now ? relative(at - now) : ''
}

// Under a day: "Resets in 1 hr 8 min"; longer: "Resets Thu 7:00 AM".
export const resetText = (l: Limit, now: number) => {
  const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  if (!(at > now)) return ''
  if (at - now < 86_400_000) return `Resets in ${relative(at - now, true)}`
  try {
    const when = new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    return `Resets ${when.replace(',', '')}`
  } catch {
    return `Resets in ${relative(at - now, true)}`
  }
}

const share = (tokens: number, window: number) => `${Math.round((tokens / window) * 100)}%`

// Category segments scaled to the window's fill, then the buffer; the rest is track.
export const contextBar = (s: Snapshot): Bar => {
  if (s.window <= 0) return { parts: [] }
  const tokens = s.tokens ?? 0
  const fill = Math.min(1, tokens / s.window)
  const total = s.segments.reduce((a, x) => a + x.tokens, 0)
  const used: Part[] =
    fill <= 0
      ? []
      : total <= 0
        ? [{ color: BLUE, part: fill, tokens, title: `Used · ${kTokens(tokens)} (${share(tokens, s.window)})` }]
        : s.segments.map(x => ({
            color: x.color,
            part: (x.tokens / total) * fill,
            tokens: x.tokens,
            title: `${x.name} · ${kTokens(x.tokens)} (${share(x.tokens, s.window)})`,
          }))
  const bufferPart = s.buffer ? Math.min(1 - fill, s.buffer / s.window) : 0
  const parts =
    bufferPart > 0
      ? [...used, { color: BUFFER, part: bufferPart, tokens: s.buffer, title: `Autocompact buffer · ${kTokens(s.buffer ?? 0)} (${share(s.buffer ?? 0, s.window)})` }]
      : used
  const free = Math.max(0, s.window - tokens - (bufferPart > 0 ? (s.buffer ?? 0) : 0))
  return { parts, restTokens: free, rest: `Free space · ${kTokens(free)} (${share(free, s.window)})` }
}

export const limitBar = (l: Limit, now: number): Bar => {
  const percent = Math.min(100, Math.max(0, l.percentUsed))
  const reset = resetText(l, now)
  const name = LONG_LABELS[l.kind] ?? l.kind
  return {
    parts: [{ color: BLUE, part: percent / 100, title: `${name} · ${percent}% used${reset ? ` · ${reset}` : ''}` }],
    rest: `${100 - percent}% left${reset ? ` · ${reset}` : ''}`,
  }
}

const svgBar = (bar: Bar, width: number, height: number, gap: number) => {
  let x = 0
  const rects = bar.parts
    .map(p => {
      const w = p.part * width
      const isLast = x + w >= width - 0.5
      const r = `<rect x="${x.toFixed(2)}" width="${Math.max(0, isLast ? w : w - gap).toFixed(2)}" height="${height}" fill="${p.color}"/>`
      x += w
      return r
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<clipPath id="c"><rect width="${width}" height="${height}" rx="${height / 2}"/></clipPath>` +
    `<g clip-path="url(#c)"><rect width="${width}" height="${height}" fill="${TRACK}"/>${rects}</g></svg>`
  )
}


export const textCells = (parts: Part[], width: number) => {
  const cells: { color: string; n: number }[] = []
  let used = 0
  for (const p of parts) {
    const n = Math.min(width - used, Math.round(p.part * width))
    if (n > 0) {
      cells.push({ color: p.color, n })
      used += n
    }
  }
  return { cells, free: Math.max(0, width - used) }
}

// The summary breakdown is a local estimate: it sends no API request.
async function refresh($: EngineInterface) {
  const prev = await read($, snapshot)
  let usage: Usage
  try {
    usage = await $.session.usage({ breakdown: 'summary' })
  } catch {
    usage = await $.session.usage()
  }
  await update($, snapshot, () => toSnapshot(usage, prev))
}

async function toggle($: EngineInterface) {
  await update($, isOpen, open => !open)
}

export const register: Register = on => {
  let ticker: ReturnType<EngineInterface['clock']['every']> | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await update($, isOpen, () => false)
    await update($, cacheExpiresAt, () => null)
    await refresh($)
    ticker ??= $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    return result
  })

  on('session.end', async (_, e, next) => {
    ticker?.cancel()
    ticker = undefined
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId || !result.usage) return result
    const usage = result.usage
    if (usage.cache_read_input_tokens + usage.cache_creation_input_tokens === 0) {
      await update($, cacheExpiresAt, () => null)
      return result
    }
    const now = await $.clock.now()
    const [force5m, ttl, enable1h, settings, session] = await Promise.all([
      $.env.get('FORCE_PROMPT_CACHING_5M'),
      $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
      $.env.get('ENABLE_PROMPT_CACHING_1H'),
      $.settings.read(),
      $.session.usage(),
    ])
    const duration = cacheTtl({ force5m, ttl, enable1h, setting: settings.promptCacheTtl, limits: limitsOf(session) })
    await update($, cacheExpiresAt, () => now + duration)
    return result
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await update($, cacheExpiresAt, () => null)
    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && e.trigger !== 'precompute' && result.skip === undefined) {
      await update($, cacheExpiresAt, () => null)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await refresh($)
    } else {
      // Limits and cost only: keep the context figures the breakdown gave.
      const limits = limitsOf(e)
      await update($, snapshot, prev => (prev ? { ...prev, limits, usd: e.cost?.usd ?? prev.usd } : toSnapshot(e, null)))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || s === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const open = await read($, isOpen)
    ticker ??= $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    const cacheLabel = cacheText(await read($, cacheExpiresAt), now)

    // A wide bar spans `width` cells on the terminal: the drawer's inner width
    // unless it sits in a narrower column.
    const bar = (id: string, bar: Bar, label: string, isWide: boolean, width = e.props.bodyColumns - 2) => {
      if (e.surface === 'desktop') {
        const { Svg } = $.ui.resolve(e)
        // A wide bar fills a row of its own, centred in it, so the text above
        // and below sits the same distance away.
        return isWide ? (
          <Box key={id} height={1} flexDirection="column" justifyContent="center">
            <Svg key={`${id}-svg`} source={svgBar(bar, 1000, 4, 4)} alt={label} height={4} />
          </Box>
        ) : (
          <Svg key={id} source={svgBar(bar, BAR_PX, 4, 1)} alt={label} width={BAR_PX} height={4} />
        )
      }
      const { cells, free } = textCells(bar.parts, isWide ? Math.max(10, width) : BAR_CELLS)
      return (
        <Box key={id}>
          {cells.map((c, i) => (
            <Text key={`${id}-${i}`} color={c.color}>
              {'━'.repeat(c.n)}
            </Text>
          ))}
          <Text dimColor>{'━'.repeat(free)}</Text>
        </Box>
      )
    }

    const dot = (id: string, color: string) => (
      <Text key={id} color={color}>
        ●
      </Text>
    )

    // The legend as a grid, as /context lays it out: each cell a dot and the
    // name on the left, the size and share aligned on the right.
    const cols = e.props.bodyColumns >= 128 ? 4 : e.props.bodyColumns >= 90 ? 3 : e.props.bodyColumns >= 60 ? 2 : 1
    const legend = (id: string, b: Bar, maxRows = Infinity) => {
      const items = [
        ...b.parts.map(p => ({ color: p.color, title: p.title ?? '', tokens: p.tokens ?? 0 })),
        ...(b.rest ? [{ color: TRACK, title: b.rest, tokens: b.restTokens ?? 0 }] : []),
      ].sort((x, y) => y.tokens - x.tokens)
      const width = Math.floor((e.props.bodyColumns - 2 - 3 * (cols - 1)) / cols)
      const rows = Array.from({ length: Math.max(1, Math.min(maxRows, Math.ceil(items.length / cols))) }, (_, r) => items.slice(r * cols, r * cols + cols))
      return (
        <Box key={id} flexDirection="column">
          {rows.map((row, r) => (
            <Box key={`${id}-r${r}`} flexDirection="row" columnGap={3}>
              {row.map((it, c) => {
                const [name, ...rest] = it.title.split(' · ')
                const value = rest.join(' · ').replace(/ \((\d+%)\)$/, '  $1')
                return (
                  <Box key={`${id}-${r}-${c}`} width={width} flexDirection="row" columnGap={1}>
                    {dot(`${id}-dot-${r}-${c}`, it.color)}
                    <Box key={`${id}-n-${r}-${c}`} flexGrow={1} flexShrink={1}>
                      <Text dimColor wrap="truncate-end">
                        {name}
                      </Text>
                    </Box>
                    <Text dimColor>{value}</Text>
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      )
    }

    // Its own keyed Box: the toggle brightens under the pointer, not the whole row.
    const toggleButton = (
      <Box key="details-box">
        <Button
          key="details"
          plain
          dimColor
          hover={{ dimColor: false }}
          label={open ? CLOSE_GLYPH : OPEN_GLYPH}
          onPress={() => toggle($)}
        />
      </Box>
    )

    const ctx = contextBar(s)
    const ctxRight =
      s.tokens === undefined ? `— / ${kTokens(s.window)}` : `${kTokens(s.tokens)} / ${kTokens(s.window)} (${s.percent ?? 0}%)`
    const toCompact =
      s.autoCompactAt !== undefined && s.tokens !== undefined ? Math.max(0, s.autoCompactAt - s.tokens) : undefined
    const compactLine =
      toCompact === undefined
        ? s.tokens === undefined
          ? 'No reply yet in this window'
          : `${kTokens(Math.max(0, s.window - s.tokens))} free`
        : toCompact < 10_000
          ? 'Auto-compacts soon'
          : `${kTokens(toCompact)} until auto-compact`

    if (open) {
      // The drawer takes the band's place and must fit it whole: past maxRows
      // the band scrolls. The limits share a row and the cost rides the compact
      // row, so the breakdown keeps its room; gaps only when all of it fits.
      const limitCols = e.props.bodyColumns >= 70 ? 2 : 1
      // The columns share the inner width; the first ones take any odd cells.
      const limitSpan = e.props.bodyColumns - 2 - 4 * (limitCols - 1)
      const limitWidth = (c: number) => Math.floor(limitSpan / limitCols) + (c < limitSpan % limitCols ? 1 : 0)
      const limitRows = Array.from({ length: Math.ceil(s.limits.length / limitCols) }, (_, r) =>
        s.limits.slice(r * limitCols, r * limitCols + limitCols),
      )
      const legendRows = Math.ceil((ctx.parts.length + (ctx.rest ? 1 : 0)) / cols)
      const base = 3 + 2 * limitRows.length
      const hasGaps = base + legendRows + 1 + limitRows.length <= e.props.maxRows
      return (
        <Box flexDirection="column" rowGap={hasGaps ? 1 : 0} paddingX={1}>
          <Box key="d-ctx" flexDirection="column">
            <Box key="d-ctx-row" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
              <Text dimColor>Context window</Text>
              <Box key="d-ctx-right" flexDirection="row" alignItems="center" columnGap={2}>
                <Text dimColor>{ctxRight}</Text>
                {toggleButton}
              </Box>
            </Box>
            {bar('d-ctx-bar', ctx, `Context ${s.percent ?? 0}%`, true)}
            {legend('d-ctx-legend', ctx, e.props.maxRows - base)}
          </Box>
          <Box key="d-compact" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
            <Box key="d-compact-left" flexDirection="row" alignItems="center" columnGap={1}>
              <Text dimColor>{compactLine}</Text>
              {s.usd !== undefined && <Text dimColor>· Session cost</Text>}
              {s.usd !== undefined && <Text dimColor>{`$${s.usd.toFixed(2)}`}</Text>}
            </Box>
            <Button key="compact-now" variant="secondary" label="Compact session" onPress={() => $.session.compact()} />
          </Box>
          {limitRows.map((row, r) => (
            <Box key={`d-lims-${r}`} flexDirection="row" columnGap={4}>
              {row.map((l, c) => {
                const reset = resetText(l, now)
                return (
                  <Box key={`d-lim-${l.kind}`} flexDirection="column" flexGrow={1} flexShrink={1} width={`${Math.floor(100 / limitCols)}%`}>
                    <Box key={`d-lim-row-${l.kind}`} flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
                      <Text wrap="truncate-end">{LONG_LABELS[l.kind] ?? l.kind}</Text>
                      <Text dimColor wrap="truncate-end">{`${reset}${reset ? '  ' : ''}${l.percentUsed}%`}</Text>
                    </Box>
                    {bar(`d-lim-bar-${l.kind}`, limitBar(l, now), `${l.kind} ${l.percentUsed}%`, true, limitWidth(c))}
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      )
    }

    const meter = (id: string, label: string, b: Bar, percent: number | undefined, note: string) => (
      <Box
        key={id}
        flexDirection="row"
        alignItems="center"
        columnGap={1}
        paddingX={1}
        flexShrink={0}
        hover={{ backgroundColor: HOVER_BG }}
      >
        {/* Only Buttons take a press, so each word of the meter is one: a click
            anywhere on its text opens the drawer. */}
        <Button key={`${id}-label`} plain dimColor label={label} onPress={() => toggle($)} />
        {/* A bar takes no press, so on the desktop a blank plain Button lies
            over it. On a text surface that Button would paint over the bar's
            cells, so there the label and figures take the press alone. */}
        <Box flexDirection="row" alignItems="center">
          {bar(`${id}-bar`, b, `${label} ${percent ?? 0}%`, false)}
          {e.surface === 'desktop' && (
            <Box position="absolute" top={0} left={0}>
              <Button key={`${id}-hit`} plain label={HIT_LABEL} hover={{ inverse: false }} onPress={() => toggle($)} />
            </Box>
          )}
        </Box>
        <Button key={`${id}-pct`} plain label={percent === undefined ? '—' : `${percent}%`} onPress={() => toggle($)} />
        {note !== '' && <Button key={`${id}-note`} plain dimColor label={note} onPress={() => toggle($)} />}
      </Box>
    )

    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
        <Box key="meters" flexDirection="row" alignItems="center" columnGap={1} flexShrink={1} overflow="hidden">
          {meter('ctx', 'Context', ctx, s.percent, '')}
          {s.limits.map(l => meter(`lim-${l.kind}`, SHORT_LABELS[l.kind] ?? l.kind, limitBar(l, now), l.percentUsed, resetIn(l, now)))}
        </Box>
        <Box key="band-right" flexDirection="row" alignItems="center" columnGap={2} flexShrink={0}>
          <Button key="cache-time" plain dimColor label={cacheLabel} onPress={() => toggle($)} />
          {toggleButton}
        </Box>
      </Box>
    )
  })
}
