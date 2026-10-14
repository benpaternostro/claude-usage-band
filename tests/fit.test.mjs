import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DESKTOP, TERMINAL, VSCODE, fitBand, roomOf } from '../hooks/fit.ts'

// The terminal fixes 63 cells: Context 44% (14), Session 36% 2h 14m (21),
// Weekly 19% (13), the two gaps between them, and "Cache —  ＋" (13).
const BAND = {
  meters: [
    { label: 'Context', percent: '44%', note: '' },
    { label: 'Session', percent: '36%', note: '2h 14m' },
    { label: 'Weekly', percent: '19%', note: '' },
  ],
  worktree: false,
  cache: '—',
}
// "git <name> │" and the gap before it: 39 cells.
const LONG = 'feature/usage-band-shrink-bars'

const width = (fit, model, t = BAND) =>
  t.meters.reduce((w, m) => w + model.meter(m), 0) +
  (t.meters.length - 1) * model.gap +
  t.meters.length * (fit.isRing ? fit.bar - model.ring.closer : fit.bar) +
  (fit.branch === undefined ? 0 : model.gap + model.git(fit.branch, t.worktree)) +
  model.right(t.cache)

test('the bars keep their full width while the row has room', () => {
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, 120, TERMINAL), { bar: 8, branch: 'main' })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 140, TERMINAL), { bar: 8, branch: LONG })
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, roomOf(DESKTOP, 200), DESKTOP), { bar: 48, branch: 'main' })
})

test('a long branch narrows the bars before it is shortened', () => {
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 114, TERMINAL), { bar: 4, branch: LONG })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 111, TERMINAL), { bar: 3, branch: LONG })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 110, TERMINAL), { bar: 3, branch: 'feature/usage-band-shrink-ba…' })
})

test('on the desktop, rings stand in for bars too narrow to read, before the branch is shortened', () => {
  const ring = { bar: DESKTOP.ring.size, isRing: true }
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 800, DESKTOP), { bar: 42, branch: LONG })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 760, DESKTOP), { bar: 29, branch: LONG })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 750, DESKTOP), { ...ring, branch: LONG })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, roomOf(DESKTOP, 88), DESKTOP), { ...ring, branch: 'feature/usage-band-shrink-…' })
  // A short name is kept whole beside rings, or not at all.
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, roomOf(DESKTOP, 70), DESKTOP), { ...ring, branch: 'main' })
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, roomOf(DESKTOP, 69), DESKTOP), ring)
  // With the branch gone, the bars come back if they can.
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, roomOf(DESKTOP, 72), DESKTOP), { bar: 35 })
})

test('a branch that cannot keep eight characters goes, and the bars take back its room', () => {
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 89, TERMINAL), { bar: 3, branch: 'feature…' })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 88, TERMINAL), { bar: 8 })
  assert.deepEqual(fitBand({ ...BAND, branch: LONG }, 80, TERMINAL), { bar: 5 })
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, 84, TERMINAL), { bar: 7 })
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, 72, TERMINAL), { bar: 3 })
})

test('what the fit keeps always fits, on either surface', () => {
  for (const [model, rooms] of [
    [TERMINAL, Array.from({ length: 120 }, (_, i) => 60 + i)],
    [DESKTOP, Array.from({ length: 60 }, (_, i) => roomOf(DESKTOP, 40 + i * 2))],
    [VSCODE, Array.from({ length: 80 }, (_, i) => roomOf(VSCODE, 60 + i * 2))],
  ]) {
    for (const branch of ['main', LONG, `${LONG}-and-then-some-more`]) {
      for (const worktree of [false, true]) {
        let last = { bar: 0, chars: 0, meters: 0 }
        for (const room of rooms) {
          const t = { ...BAND, branch, worktree }
          const fit = fitBand(t, room, model)
          assert.ok(fit.isRing ? fit.bar === model.ring.size : fit.bar >= model.bar.min && fit.bar <= model.bar.max)
          // Unless even the narrowest meters overflow, the row holds.
          const least = model.ring ? { bar: model.ring.size, isRing: true } : { bar: model.bar.min }
          if (width(least, model, t) <= room) {
            assert.ok(width(fit, model, t) <= room, `${branch} at ${room}`)
          }
          // A wider row never drops a meter, nor shortens the branch or the
          // bars it kept.
          const chars = fit.branch === undefined ? 0 : [...fit.branch].length
          const meters = fit.meters ?? t.meters.length
          assert.ok(meters >= last.meters)
          if (chars > 0 && last.chars > 0) assert.ok(chars >= last.chars)
          if (chars === last.chars && meters === last.meters) assert.ok(fit.bar >= last.bar)
          last = { bar: fit.bar, chars, meters }
        }
      }
    }
  }
})

test('when even the narrowest meters overflow, they go whole from the right, the first kept', () => {
  const ring = { bar: VSCODE.ring.size, isRing: true }
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, roomOf(VSCODE, 50), VSCODE), ring)
  // Two meters may have room for bars again.
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, roomOf(VSCODE, 45), VSCODE), { bar: 45, meters: 2 })
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, roomOf(VSCODE, 30), VSCODE), { bar: 48, meters: 1 })
  assert.deepEqual(fitBand(BAND, 10, VSCODE), { ...ring, meters: 1 })
  assert.deepEqual(fitBand(BAND, 55, TERMINAL), { bar: 3, meters: 2 })
  // What is kept fits, down to the one meter that always stays.
  for (const [model, rooms] of [
    [TERMINAL, Array.from({ length: 40 }, (_, i) => 30 + i)],
    [VSCODE, Array.from({ length: 40 }, (_, i) => roomOf(VSCODE, 25 + i))],
  ]) {
    for (const room of rooms) {
      const fit = fitBand({ ...BAND, branch: 'main' }, room, model)
      const kept = { ...BAND, meters: BAND.meters.slice(0, fit.meters ?? BAND.meters.length) }
      if (kept.meters.length > 1) assert.ok(width(fit, model, kept) <= room, `${room}`)
    }
  }
})
