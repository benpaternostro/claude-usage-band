// The band's width budget. The meters' words, the cache and the toggle keep
// their size; the bars give way first, down to a stub or on the desktop to a
// ring, then the branch is cut short, then it goes, then meters go whole from
// the right. The band's wrapping row still drops whatever this misjudges on
// the terminal and the desktop, so nothing ever overlaps there.

export type Meter = { label: string; percent: string; note: string }
export type BandText = { meters: Meter[]; branch?: string; worktree: boolean; cache: string }
// The bars' width (cells on the terminal, px on the desktop), whether rings
// stand in for them, the branch as drawn: absent when it does not fit, and
// how many meters are drawn, from the left: absent when all of them are.
export type Fit = { bar: number; isRing?: boolean; branch?: string; meters?: number }

export type Model = {
  bar: { min: number; max: number }
  // A ring `size` wide stands in for bars narrower than `min`, and sits
  // `closer` to its figure than a bar does. Without one the bars stop at `min`.
  ring?: { size: number; closer: number }
  text: (s: string) => number
  // Between the band's row items: the meters and the branch.
  gap: number
  // A meter with no bar.
  meter: (m: Meter) => number
  git: (branch: string, worktree: boolean) => number
  // The cache and the toggle, with the gap before them.
  right: (cache: string) => number
}

// The words the terminal spells out where the desktop draws icons.
export const GIT_WORD = 'git'
export const WORKTREE_NOTE = '· worktree'
export const CACHE_WORD = 'Cache'
export const OPEN_GLYPH = '＋'

export const BAR_CELLS = 8
export const BAR_PX = 48
export const ICON_PX = 13
export const RING_PX = 14
// A branch keeps this many characters, the ellipsis included, or goes.
const BRANCH_MIN = 8

const isWide = (c: number) =>
  (c >= 0x1100 && c <= 0x115f) ||
  (c >= 0x2e80 && c <= 0xa4cf) ||
  (c >= 0xac00 && c <= 0xd7a3) ||
  (c >= 0xf900 && c <= 0xfaff) ||
  (c >= 0xfe30 && c <= 0xfe4f) ||
  (c >= 0xff00 && c <= 0xff60) ||
  (c >= 0xffe0 && c <= 0xffe6) ||
  (c >= 0x1f300 && c <= 0x1faff) ||
  c >= 0x20000

export const cells = (s: string) => [...s].reduce((n, c) => n + (isWide(c.codePointAt(0) ?? 0) ? 2 : 1), 0)

// Terminal cells are exact: the engine lays the band out in `bodyColumns`.
// A meter is padded a cell each side, its words a cell apart; the branch is
// "git main │" after a cell of padding, the divider a cell further off.
export const TERMINAL: Model = {
  bar: { min: 3, max: BAR_CELLS },
  text: cells,
  gap: 1,
  meter: m => 2 + cells(m.label) + 2 + cells(m.percent) + (m.note ? 1 + cells(m.note) : 0),
  git: (branch, worktree) => 1 + cells(GIT_WORD) + 1 + cells(branch) + (worktree ? 1 + cells(WORKTREE_NOTE) : 0) + 3,
  right: cache => 2 + cells(CACHE_WORD) + 1 + cells(cache) + 2 + cells(OPEN_GLYPH),
}

// The desktop's text is proportional, so its widths are estimates, measured
// from the Code tab at 14px and rounded up: a cell is about 8.1px, its gaps
// half of one, and a plain Button pads its label 6px each side.
export const CELL_PX = 8.1
// The Code tab's column is about 768px wide at most; the band's padding
// leaves this much inside it.
const BAND_PX = 750
const HALF = CELL_PX / 2
const PAD = 6
const PX: [RegExp, number][] = [
  [/[ijl.,:;'|!`]/, 3.2],
  [/[ftrI()[\]{}\\]/, 4.4],
  [/[/-]/, 5.4],
  [/ /, 3.6],
  [/[scz]/, 5.8],
  [/[mwMW%—]/, 10.5],
  [/…/, 13],
  [/1/, 5.4],
  [/[0-9]/, 7.4],
  [/[A-Z]/, 8.2],
]
export const px = (s: string) =>
  [...s].reduce((n, c) => n + (isWide(c.codePointAt(0) ?? 0) ? 11 : (PX.find(([r]) => r.test(c))?.[1] ?? 7.2)), 0)
const button = (s: string) => px(s) + 2 * PAD

// A meter is padded half a cell each side, its words half a cell apart; the
// meters touch. The branch is its icon, the name and the divider. A bar much
// under half its width reads as a dash, so a ring takes its place.
export const DESKTOP: Model = {
  bar: { min: 28, max: BAR_PX },
  ring: { size: RING_PX, closer: HALF },
  text: px,
  gap: 0,
  meter: m => 2 * HALF + button(m.label) + 2 * HALF + button(m.percent) + (m.note ? HALF + button(m.note) : 0),
  git: branch => ICON_PX + HALF + px(branch) + 2 * HALF + 1,
  right: cache => 2 * HALF + ICON_PX + button(cache) + 2 * HALF + button(OPEN_GLYPH),
}

// VS Code draws every Button as a native button, plain or not, so the band's
// words there are Text and the toggle is the one button. Its layout cell is
// about 7.2px of the desktop's text measure, and Text carries no padding of
// its own, so whole cells part the words, as the desktop's buttons do; a ring
// sits half a cell from its figure.
export const VSCODE_CELL_PX = 7.2
const VSCODE_HALF = VSCODE_CELL_PX / 2
const VSCODE_PAD = 9
// The panel lays out about this many cells for each one bodyColumns counts,
// measured off VS Code's own drawing.
const VSCODE_COLUMN_CELLS = 1.3

export const VSCODE: Model = {
  bar: DESKTOP.bar,
  ring: { size: RING_PX, closer: VSCODE_HALF },
  text: px,
  gap: VSCODE_CELL_PX,
  meter: m => 2 * VSCODE_HALF + px(m.label) + 2 * VSCODE_CELL_PX + px(m.percent) + (m.note ? VSCODE_CELL_PX + px(m.note) : 0),
  git: branch => ICON_PX + VSCODE_HALF + px(branch) + 2 * VSCODE_HALF + 1,
  right: cache => 2 * VSCODE_HALF + ICON_PX + VSCODE_HALF + px(cache) + 2 * VSCODE_HALF + px(OPEN_GLYPH) + 2 * VSCODE_PAD,
}

// What the band may fill: the terminal's columns; on the desktop the pane's
// width less a margin, within the column's own; in VS Code the panel's width,
// less a cell each side for the frame it draws the band in.
export const roomOf = (model: Model, bodyColumns: number) =>
  model === DESKTOP
    ? Math.min(BAND_PX, (bodyColumns - 2) * CELL_PX)
    : model === VSCODE
      ? (bodyColumns - 2) * VSCODE_COLUMN_CELLS * VSCODE_CELL_PX
      : bodyColumns

export const clip = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s)

export const fitBand = (t: BandText, room: number, model: Model): Fit => {
  const fit = fitAll(t, room, model)
  if (t.meters.length === 0) return fit
  // Even the narrowest meters overflow: the branch is gone already, and the
  // meters go from the right until the rest fits. The first always stays.
  const least = model.ring === undefined ? model.bar.min : model.ring.size - model.ring.closer
  const takes = (k: number) =>
    t.meters.slice(0, k).reduce((w, m) => w + model.meter(m) + least, 0) + Math.max(0, k - 1) * model.gap + model.right(t.cache)
  if (takes(t.meters.length) <= room) return fit
  let k = t.meters.length - 1
  while (k > 1 && takes(k) > room) k--
  return { ...fitAll({ ...t, meters: t.meters.slice(0, k), branch: undefined }, room, model), meters: k }
}

const fitAll = (t: BandText, room: number, model: Model): Fit => {
  const n = t.meters.length
  const fixed = t.meters.reduce((w, m) => w + model.meter(m), 0) + Math.max(0, n - 1) * model.gap + model.right(t.cache)
  const barIn = (left: number) => (n === 0 ? model.bar.max : Math.min(model.bar.max, Math.floor(left / n)))
  // The narrowest the meters draw: stub bars, or rings, and the room each
  // takes from the row.
  const least: Fit = model.ring === undefined ? { bar: model.bar.min } : { bar: model.ring.size, isRing: true }
  const leastTakes = model.ring === undefined ? model.bar.min : model.ring.size - model.ring.closer
  const sized = (bar: number): Fit => (bar >= model.bar.min ? { bar } : least)
  const alone = sized(barIn(room - fixed))
  if (t.branch === undefined) return alone
  const withGit = (name: string) => fixed + (n > 0 ? model.gap : 0) + model.git(name, t.worktree)
  const whole = barIn(room - withGit(t.branch))
  if (whole >= model.bar.min) return { bar: whole, branch: t.branch }
  // The narrowest meters, and the name whole or cut to what the row has left.
  const left = room - withGit('') - n * leastTakes
  const chars = [...t.branch].length
  for (let k = chars; k >= Math.min(chars, BRANCH_MIN); k--) {
    const cut = clip(t.branch, k)
    if (model.text(cut) <= left) return { ...least, branch: cut }
  }
  // No room for the branch: it goes, and the bars take back its share.
  return alone
}
