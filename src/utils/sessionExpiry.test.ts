import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken, expiredToken, validToken } from '@/test/fixtures/auth'
import { calculateSessionExpiry, MAX_REMEMBER_ME_DURATION } from './sessionExpiry'

const now = Date.parse('2026-10-30T12:00:00.000Z')

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

describe('calculateSessionExpiry', () => {
  it('converts the JWT exp from seconds to an absolute millisecond deadline', () => {
    expect(calculateSessionExpiry(validToken(3600))).toBe(now + 3600_000)
  })

  it('uses expiresIn when it is earlier than the JWT deadline', () => {
    expect(calculateSessionExpiry(validToken(3600), 60)).toBe(now + 60_000)
  })

  it('uses the JWT deadline when it is earlier than expiresIn', () => {
    expect(calculateSessionExpiry(validToken(60), 3600)).toBe(now + 60_000)
  })

  it('caps persistent sessions at 24 hours', () => {
    expect(calculateSessionExpiry(validToken(7 * 86400), 7 * 86400, true))
      .toBe(now + MAX_REMEMBER_ME_DURATION)
  })

  it('does not extend a short token to the remember-me cap', () => {
    expect(calculateSessionExpiry(validToken(60), 3600, true)).toBe(now + 60_000)
  })

  it('does not apply a 24-hour cap to tab sessions', () => {
    expect(calculateSessionExpiry(validToken(2 * 86400), undefined, false)).toBe(now + 2 * 86400_000)
  })

  it('does not revive expired tokens even with expiresIn and rememberMe', () => {
    expect(calculateSessionExpiry(expiredToken(), 3600, true)).toBe(now - 60_000)
  })

  it('expires exactly at the deadline', () => {
    expect(calculateSessionExpiry(validToken(0), 3600)).toBe(now)
  })

  it('supports a valid JWT without exp only when expiresIn supplies a lifetime', () => {
    expect(calculateSessionExpiry(createToken({ sub: 'user' }), 60)).toBe(now + 60_000)
  })

  it('does not invent an expiry from the remember-me cap alone', () => {
    expect(calculateSessionExpiry(createToken({ sub: 'user' }), undefined, true)).toBe(now)
  })

  it.each(['', 'not-a-jwt', 'a.b.c', 'a.b', 'a.b.c.d', ' a.b.c', 'a.b.'])(
    'fails closed for malformed JWT %j', token => {
      expect(calculateSessionExpiry(token, 3600, true)).toBe(now)
    })

  it.each(['tomorrow', null, {}, [], Number.MAX_VALUE].map(exp => ({ exp })))('rejects invalid exp $exp', ({ exp }) => {
    expect(calculateSessionExpiry(createToken({ exp }), 3600)).toBe(now)
  })

  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])('rejects invalid expiresIn %s', expiresIn => {
    expect(calculateSessionExpiry(validToken(), expiresIn)).toBe(now)
  })

  it('rejects non-object payloads', () => {
    expect(calculateSessionExpiry('eyJhbGciOiJIUzI1NiJ9.bnVsbA.signature', 60)).toBe(now)
  })

  it.each(['bad-header', 'bnVsbA', 'eyJhbGciOiJub25lIn0'])('rejects malformed or unsigned headers: %s', header => {
    const payload = validToken().split('.')[1]
    expect(calculateSessionExpiry(`${header}.${payload}.signature`, 60)).toBe(now)
  })
})
