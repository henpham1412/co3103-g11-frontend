import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken, expiredToken, validToken } from '@/test/fixtures/auth'
import { calculateSessionExpiry, MAX_REMEMBER_ME_DURATION } from './sessionExpiry'

const now = Date.parse('2026-10-30T12:00:00.000Z')

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

describe('calculateSessionExpiry', () => {
  it("uses the earliest JWT or expiresIn deadline in milliseconds", () => {
    expect(calculateSessionExpiry(validToken(3600))).toBe(now + 3600_000)

    expect(calculateSessionExpiry(validToken(3600), 60)).toBe(now + 60_000)

    expect(calculateSessionExpiry(validToken(60), 3600)).toBe(now + 60_000)
  })

  it("caps remember-me at 24 hours without extending short tokens or capping tab sessions", () => {
    expect(calculateSessionExpiry(validToken(7 * 86400), 7 * 86400, true))
      .toBe(now + MAX_REMEMBER_ME_DURATION)

    expect(calculateSessionExpiry(validToken(60), 3600, true)).toBe(now + 60_000)

    expect(calculateSessionExpiry(validToken(2 * 86400), undefined, false)).toBe(now + 2 * 86400_000)
  })

  it("expires exactly at the deadline and never revives expired tokens", () => {
    expect(calculateSessionExpiry(expiredToken(), 3600, true)).toBe(now - 60_000)

    expect(calculateSessionExpiry(validToken(0), 3600)).toBe(now)
  })

  it("requires a valid lifetime for JWTs without exp", () => {
    expect(calculateSessionExpiry(createToken({ sub: 'user' }), 60)).toBe(now + 60_000)

    expect(calculateSessionExpiry(createToken({ sub: 'user' }), undefined, true)).toBe(now)
  })

  it("fails closed for malformed JWT headers and payloads, including unsigned tokens", () => {
    for (const token of ['', 'not-a-jwt', 'a.b.c', 'a.b', 'a.b.c.d', ' a.b.c', 'a.b.'] as const) {
      expect(calculateSessionExpiry(token, 3600, true), `case: ${JSON.stringify(token)}`).toBe(now)
    }

    expect(calculateSessionExpiry('eyJhbGciOiJIUzI1NiJ9.bnVsbA.signature', 60)).toBe(now)

    for (const header of ['bad-header', 'bnVsbA', 'eyJhbGciOiJub25lIn0'] as const) {
      const payload = validToken().split('.')[1]
      expect(calculateSessionExpiry(`${header}.${payload}.signature`, 60), `case: ${JSON.stringify(header)}`).toBe(now)
    }
  })

  it("fails closed for invalid claims, lifetimes and overflow", () => {
    for (const sample of ['tomorrow', null, {}, [], Number.MAX_VALUE].map(exp => ({ exp }))) {
      const { exp } = sample
      expect(calculateSessionExpiry(createToken({ exp }), 3600), `case: ${JSON.stringify(sample)}`).toBe(now)
    }

    for (const expiresIn of [0, -1, NaN, Infinity, Number.MAX_VALUE] as const) {
      expect(calculateSessionExpiry(validToken(), expiresIn), `case: ${JSON.stringify(expiresIn)}`).toBe(now)
    }
  })
})
