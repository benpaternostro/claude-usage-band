import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { GitHead, Limit, Segment, Snapshot } from '../types'
import { cacheText, cacheTtl } from './cache'
import { BAR_CELLS, BAR_PX, CACHE_WORD, DESKTOP, GIT_WORD, ICON_PX, OPEN_GLYPH, TERMINAL, WORKTREE_NOTE, fitBand, roomOf } from './fit'
import { HEAD_ARGV, branchName, isDetached, parseHead } from './git'

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)
const isOpen = atom({ plugin: 'usage-band', key: 'isOpen' } as const, false)
const cacheExpiresAt = atom({ plugin: 'usage-band', key: 'cacheExpiresAt' } as const, null)
const git = atom({ plugin: 'usage-band', key: 'git' } as const, null)

// Full-width glyphs: the same size as the app's close control, and the same
// advance as each other, so the toggle never moves.
export { OPEN_GLYPH }
export const CLOSE_GLYPH = '－'

const SHORT_LABELS: Record<string, string> = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Credits' }
const LONG_LABELS: Record<string, string> = {
  five_hour: 'Session limit',
  seven_day: 'Weekly · all models',
  spend_limit: 'Usage credits',
}

// The app's usage popover: blue fill on a dark track; context categories in theme colours.
const BLUE = '#4a80e8'
const AMBER = '#e0a526'
const RED = '#e5484d'
const TRACK = '#8888884d'
const BUFFER = '#8888888c'
const HOVER_BG = '#8888881f'
// The whole branch name over the short one, on the desktop: the band's dark
// grey as a meter under the pointer lights it, opaque so the name hides what
// it covers.
const TIP_BG = '#2e2e2e'
const TIP_TEXT = '#f2f2f2'
const THEME: Record<string, string> = {
  permission: BLUE,
  suggestion: BLUE,
  claude: '#d97757',
  success: '#3fae6a',
  warning: AMBER,
  error: RED,
  inactive: '#b4b4b4',
  promptBorder: '#b4b4b4',
  remember: '#a48fd8',
  purple_FOR_SUBAGENTS_ONLY: '#a48fd8',
  cyan_FOR_SUBAGENTS_ONLY: '#4fb3c4',
}
const BY_RANK = [BLUE, '#d97757', '#3fae6a', AMBER, '#b4b4b4', '#a48fd8', '#4fb3c4']
// Braille blanks: drawn empty, never trimmed as spaces are. About a cell's
// worth for each cell of bar.
const hitLabel = (px: number) => '⠀'.repeat(Math.max(1, Math.round((BAR_CELLS * px) / BAR_PX)))

// Desktop icons, 24-unit strokes in a grey that reads on light and dark themes.
const ICON_GREY = '#8c8c8c'
const ICONS = {
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10M18 8v1a4 4 0 0 1-4 4h-4a4 4 0 0 0-4 4"/>',
  worktree: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v1a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-1M12 12v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
}
const svgIcon = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${ICON_GREY}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const SVG_DIVIDER = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="14"><rect width="1" height="14" fill="${ICON_GREY}" fill-opacity="0.45"/></svg>`

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

// A fill turns amber from 80% of the way to its limit, and red from 95%.
export const fillColor = (used: number, limit = 100) => {
  const way = limit > 0 ? used / limit : 0
  return way >= 0.95 ? RED : way >= 0.8 ? AMBER : BLUE
}

// The context's limit is where it auto-compacts, or the window when it never does.
export const contextColor = (s: Snapshot) => fillColor(s.tokens ?? 0, s.autoCompactAt ?? s.window)

export const limitBar = (l: Limit, now: number): Bar => {
  const percent = Math.min(100, Math.max(0, l.percentUsed))
  const reset = resetText(l, now)
  const name = LONG_LABELS[l.kind] ?? l.kind
  return {
    parts: [{ color: fillColor(percent), part: percent / 100, title: `${name} · ${percent}% used${reset ? ` · ${reset}` : ''}` }],
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

// A bar wound into a ring, for a row with no room for bars: the fill as one
// arc in its colour, clockwise from the top, on the same track.
const svgRing = (part: number, size: number, color: string) => {
  const c = size / 2
  const r = c - 1.25
  const around = 2 * Math.PI * r
  const arc = Math.min(1, Math.max(0, part)) * around
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke-width="2">` +
    `<g transform="rotate(-90 ${c} ${c})"><circle cx="${c}" cy="${c}" r="${r}" stroke="${TRACK}"/>` +
    (arc > 0
      ? `<circle cx="${c}" cy="${c}" r="${r}" stroke="${color}" stroke-linecap="round" stroke-dasharray="${arc.toFixed(2)} ${around.toFixed(2)}"/>`
      : '') +
    `</g></svg>`
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

// Outside a repository, or with no commit yet, the band shows no branch.
async function refreshGit($: EngineInterface) {
  let head: GitHead | null = null
  try {
    const ran = await $.process.run(HEAD_ARGV, { timeoutMs: 5000 })
    if (ran.exitCode === 0) {
      const sha = isDetached(ran.stdout) ? (await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { timeoutMs: 5000 })).stdout : ''
      head = parseHead(ran.stdout, sha)
    }
  } catch {
    // No git on the host: no branch.
  }
  await update($, git, () => head)
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
    await Promise.all([refresh($), refreshGit($)])
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

  // A turn may switch the branch or move into a worktree; so may the person,
  // outside the session, between turns.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await refreshGit($)
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
    const head = await read($, git)

    // A wide bar spans `width` cells on the terminal: the drawer's inner width
    // unless it sits in a narrower column. A narrow one is `width` cells, or px
    // on the desktop.
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
          <Svg key={id} source={svgBar(bar, width, 4, 1)} alt={label} width={width} height={4} />
        )
      }
      const { cells, free } = textCells(bar.parts, isWide ? Math.max(10, width) : width)
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

    // A desktop cell is about 8px wide: the band's inner gaps take half of one
    // there. Terminal gaps are whole cells.
    const isDesktop = e.surface === 'desktop'
    const half = isDesktop ? 0.5 : 1
    const percentText = (percent: number | undefined) => (percent === undefined ? '—' : `${percent}%`)

    const meters = [
      // One fill, as the limits have: at this size the context's grey
      // categories vanish into the track. The drawer breaks it down.
      { id: 'ctx', label: 'Context', b: { parts: [{ color: contextColor(s), part: Math.min(1, (s.percent ?? 0) / 100) }] }, percent: s.percent, note: '' },
      ...s.limits.map(l => ({
        id: `lim-${l.kind}`,
        label: SHORT_LABELS[l.kind] ?? l.kind,
        b: limitBar(l, now),
        percent: l.percentUsed,
        note: resetIn(l, now),
      })),
    ]
    // The bars narrow, then turn to rings on the desktop, then the branch
    // shortens, before anything is dropped.
    const model = isDesktop ? DESKTOP : TERMINAL
    const fit = fitBand(
      {
        meters: meters.map(m => ({ label: m.label, percent: percentText(m.percent), note: m.note })),
        branch: head ? branchName(head) : undefined,
        worktree: head?.worktree !== undefined,
        cache: cacheLabel,
      },
      roomOf(model, e.props.bodyColumns),
      model,
    )

    const svg = (id: string, source: string, alt: string, width: number, height: number) => {
      if (e.surface !== 'desktop') return null
      const { Svg } = $.ui.resolve(e)
      return <Svg key={id} source={source} alt={alt} width={width} height={height} />
    }
    const icon = (id: string, body: string, alt: string) => svg(id, svgIcon(body), alt, ICON_PX, ICON_PX)

    const meter = ({ id, label, b, percent, note }: (typeof meters)[number]) => (
      <Box
        key={id}
        flexDirection="row"
        alignItems="center"
        columnGap={half}
        paddingX={half}
        flexShrink={0}
        hover={{ backgroundColor: HOVER_BG }}
      >
        {/* Only Buttons take a press, so each word of the meter is one: a click
            anywhere on its text opens the drawer. */}
        <Button key={`${id}-label`} plain dimColor label={label} onPress={() => toggle($)} />
        {/* A bar or ring takes no press, so on the desktop a blank plain Button
            lies over it. On a text surface that Button would paint over the bar's
            cells, so there the label and figures take the press alone. */}
        {/* A ring sits closer to its figure than to its label, so the two read
            as one. */}
        <Box key={`${id}-fill`} flexDirection="row" alignItems="center" columnGap={fit.isRing ? 0 : half}>
          <Box flexDirection="row" alignItems="center">
            {fit.isRing
              ? svg(`${id}-bar`, svgRing((percent ?? 0) / 100, fit.bar, b.parts[0]?.color ?? BLUE), `${label} ${percent ?? 0}%`, fit.bar, fit.bar)
              : bar(`${id}-bar`, b, `${label} ${percent ?? 0}%`, false, fit.bar)}
            {isDesktop && (
              <Box position="absolute" top={0} left={0}>
                <Button key={`${id}-hit`} plain label={hitLabel(fit.bar)} hover={{ inverse: false }} onPress={() => toggle($)} />
              </Box>
            )}
          </Box>
          <Button key={`${id}-pct`} plain label={percentText(percent)} onPress={() => toggle($)} />
        </Box>
        {note !== '' && <Button key={`${id}-note`} plain dimColor label={note} onPress={() => toggle($)} />}
      </Box>
    )

    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2 * half}>
        {/* One row that wraps onto a hidden second one: whatever the fit
            misjudges leaves whole, from the right, rather than overlapping or
            being cut mid-word. The branch sits last and grows to push itself
            right, so it is the first to go, with the divider that parts it
            from the cache. On the desktop the meters' own padding spaces them. */}
        <Box key="meters" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={model.gap} height={1} flexGrow={1} flexShrink={1} overflow="hidden">
          {meters.map(meter)}
          {head && fit.branch !== undefined && (
            <Box key="git" flexDirection="row" justifyContent="flex-end" alignItems="center" columnGap={half} paddingLeft={isDesktop ? 0 : 1} flexGrow={1} flexShrink={0}>
              <Box key="git-name" flexDirection="row" alignItems="center" columnGap={half}>
                {isDesktop && icon('git-icon', head.worktree === undefined ? ICONS.branch : ICONS.worktree, head.worktree === undefined ? 'Branch' : 'Worktree branch')}
                {/* The terminal has no icons: a label stands in, as "Cache" does. */}
                {!isDesktop && <Text dimColor>{GIT_WORD}</Text>}
                <Text>{fit.branch}</Text>
                {/* A name shown short is whole under the pointer, drawn over the
                    row and ending where the short one does. Unkeyed, so the
                    pointer on the name reveals it. An interactive Svg's
                    tooltip would sit in a frame that paints white each redraw.
                    Terminal cells cover what is under them; the desktop needs
                    a ground. */}
                {fit.branch !== head.branch && (
                  <Box
                    position="absolute"
                    top={0}
                    right={0}
                    display="none"
                    hover={{ display: 'flex' }}
                    backgroundColor={isDesktop ? TIP_BG : undefined}
                    paddingX={isDesktop ? half : 0}
                  >
                    <Text color={isDesktop ? TIP_TEXT : undefined}>{head.branch}</Text>
                  </Box>
                )}
              </Box>
              {!isDesktop && head.worktree !== undefined && <Text dimColor>{WORKTREE_NOTE}</Text>}
              <Box key="git-divider" marginLeft={half} flexDirection="row" alignItems="center">
                {/* With an empty alt the desktop drew nothing here. */}
                {isDesktop ? svg('divider', SVG_DIVIDER, 'Separator', 1, 14) : <Text dimColor>│</Text>}
              </Box>
            </Box>
          )}
        </Box>
        <Box key="band-right" flexDirection="row" alignItems="center" columnGap={2 * half} flexShrink={0}>
          {/* The time's Button pads it enough from the clock, so they sit as
              close as the branch and its icon; the terminal's word keeps a cell. */}
          <Box key="cache" flexDirection="row" alignItems="center" columnGap={isDesktop ? 0 : half}>
            {/* An icon or a dim word, then the value bright, as the branch is. */}
            {isDesktop ? icon('cache-icon', ICONS.clock, 'Prompt cache') : <Button key="cache-label" plain dimColor label={CACHE_WORD} onPress={() => toggle($)} />}
            <Button key="cache-time" plain label={cacheLabel} onPress={() => toggle($)} />
          </Box>
          {toggleButton}
        </Box>
      </Box>
    )
  })
}
