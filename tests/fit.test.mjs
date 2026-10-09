import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DESKTOP, TERMINAL, fitBand, roomOf } from '../hooks/fit.ts'

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
  assert.deepEqual(fitBand({ ...BAND, branch: 'main' }, 50, TERMINAL), { bar: 3 })
})

test('what the fit keeps always fits, on either surface', () => {
  for (const [model, rooms] of [
    [TERMINAL, Array.from({ length: 120 }, (_, i) => 60 + i)],
    [DESKTOP, Array.from({ length: 60 }, (_, i) => roomOf(DESKTOP, 40 + i * 2))],
  ]) {
    for (const branch of ['main', LONG, `${LONG}-and-then-some-more`]) {
      for (const worktree of [false, true]) {
        let last = { bar: 0, chars: 0 }
        for (const room of rooms) {
          const t = { ...BAND, branch, worktree }
          const fit = fitBand(t, room, model)
          assert.ok(fit.isRing ? fit.bar === model.ring.size : fit.bar >= model.bar.min && fit.bar <= model.bar.max)
          // Unless even the narrowest meters overflow, the row holds.
          const least = model.ring ? { bar: model.ring.size, isRing: true } : { bar: model.bar.min }
          if (width(least, model, t) <= room) {
            assert.ok(width(fit, model, t) <= room, `${branch} at ${room}`)
          }
          // A wider row never shortens the branch or the bars it kept.
          const chars = fit.branch === undefined ? 0 : [...fit.branch].length
          if (chars > 0 && last.chars > 0) assert.ok(chars >= last.chars)
          if (chars === last.chars) assert.ok(fit.bar >= last.bar)
          last = { bar: fit.bar, chars }
        }
      }
    }
  }
})
