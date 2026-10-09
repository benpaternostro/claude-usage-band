import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cacheText, cacheTtl } from '../hooks/cache.ts'

test('cache countdown handles unknown, active, and expired entries', () => {
  assert.equal(cacheText(null, 0), '—')
  assert.equal(cacheText(300_000, 0), '5m')
  assert.equal(cacheText(300_000, 1000), '5m')
  assert.equal(cacheText(300_000, 60_000), '4m')
  assert.equal(cacheText(300_000, 240_000), '1m')
  assert.equal(cacheText(300_000, 241_000), '59s')
  assert.equal(cacheText(300_000, 299_999), '1s')
  assert.equal(cacheText(300_000, 300_000), 'expired')
  assert.equal(cacheText(300_000, 400_000), 'expired')
  assert.equal(cacheText(3_600_000, 14_000), '60m')
})

test('forced five-minute TTL overrides all longer settings', () => {
  assert.equal(cacheTtl({ force5m: '1', ttl: '1h', setting: '1h', enable1h: '1', limits: [] }), 300_000)
})

test('environment TTL overrides the setting and the global option', () => {
  assert.equal(cacheTtl({ ttl: '5m', setting: '1h', enable1h: '1', limits: [] }), 300_000)
  assert.equal(cacheTtl({ ttl: '1h', setting: '5m', limits: [] }), 3_600_000)
})

test('invalid TTL values fall through to the next valid option', () => {
  assert.equal(cacheTtl({ ttl: 'invalid', setting: '5m', enable1h: '1', limits: [] }), 300_000)
  assert.equal(cacheTtl({ ttl: 'invalid', setting: null, enable1h: '1', limits: [] }), 3_600_000)
})

test('default estimate distinguishes plan usage from credits and API usage', () => {
  assert.equal(cacheTtl({ limits: [] }), 300_000)
  assert.equal(cacheTtl({ limits: [{ kind: 'spend_limit', percentUsed: 20 }] }), 300_000)
  assert.equal(cacheTtl({ limits: [{ kind: 'five_hour', percentUsed: 20 }] }), 3_600_000)
  assert.equal(cacheTtl({ limits: [
    { kind: 'five_hour', percentUsed: 20 },
    { kind: 'seven_day', percentUsed: 100 },
  ] }), 300_000)
})
