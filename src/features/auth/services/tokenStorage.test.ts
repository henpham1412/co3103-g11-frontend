import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/types/auth'
import { authSession, createToken, expiredToken, validToken } from '@/test/fixtures/auth'
import { wireCurrentUser, wireLoginResponse } from '@/test/fixtures/authWire'
import { MAX_REMEMBER_ME_DURATION } from '@/utils/sessionExpiry'
import { AUTH_SESSION_KEY, clearSession, getSession, saveSession } from './tokenStorage'

const now = Date.parse('2026-10-30T12:00:00.000Z')

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

describe('tokenStorage', () => {
  it("round-trips version-2 sessions and switches both persistence modes", () => {
    for (const rememberMe of [false, true] as const) {
      const session = authSession({ rememberMe })
      expect(saveSession(session), `case: ${JSON.stringify(rememberMe)}`).toBe(true)
      expect(getSession(), `case: ${JSON.stringify(rememberMe)}`).toEqual(session)
      expect(JSON.parse((rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY)!), `case: ${JSON.stringify(rememberMe)}`).toEqual(session)
      expect((rememberMe ? sessionStorage : localStorage).getItem(AUTH_SESSION_KEY), `case: ${JSON.stringify(rememberMe)}`).toBeNull()
    }

    for (const rememberMe of [false, true] as const) {
      saveSession(authSession({ rememberMe: !rememberMe }))
      const session = authSession({ rememberMe, fullName: 'Another User' })
      expect(saveSession(session), `case: ${JSON.stringify(rememberMe)}`).toBe(true)
      expect(getSession(), `case: ${JSON.stringify(rememberMe)}`).toEqual(session)
      expect((rememberMe ? sessionStorage : localStorage).getItem(AUTH_SESSION_KEY), `case: ${JSON.stringify(rememberMe)}`).toBeNull()
    }
  })

  it("clears only the intended sessions and preserves unrelated keys and newer logins", () => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe: true })))
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession()))
    localStorage.setItem('theme', 'dark')
    sessionStorage.setItem('draft', 'notes')
    expect(clearSession()).toBe(true)
    expect(getSession()).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.getItem('draft')).toBe('notes')

    {
      const old = authSession()
      const next = authSession({ rememberMe: true })
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(old))
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
      expect(clearSession(old.sessionId)).toBe(true)
      expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
      expect(getSession()).toEqual(next)
    }
  })

  it('prefers a shared login over an old private session left in a reopened tab', () => {
    const session = authSession()
    const persistent = authSession({ rememberMe: true, userId: 'newer-user' })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(persistent))
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
    expect(getSession()).toEqual(persistent)
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it("cleans corrupt JSON without losing a valid persistent session", () => {
    for (const storage of ['localStorage', 'sessionStorage'] as const) {
      window[storage].setItem(AUTH_SESSION_KEY, '{not-json')
      expect(getSession(), `case: ${JSON.stringify(storage)}`).toBeNull()
      expect(window[storage].getItem(AUTH_SESSION_KEY), `case: ${JSON.stringify(storage)}`).toBeNull()
    }

    {
      const session = authSession({ rememberMe: true })
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
      sessionStorage.setItem(AUTH_SESSION_KEY, '{bad-json')
      expect(getSession()).toEqual(session)
      expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    }
  })

  it("removes expired sessions and tampered deadlines", () => {
    for (const rememberMe of [false, true] as const) {
      const storage = rememberMe ? localStorage : sessionStorage
      storage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe, expiresAt: now })))
      expect(getSession(), `case: ${JSON.stringify(rememberMe)}`).toBeNull()
      expect(storage.getItem(AUTH_SESSION_KEY), `case: ${JSON.stringify(rememberMe)}`).toBeNull()
    }

    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ accessToken: expiredToken() })))
    expect(getSession()).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()

    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({
      rememberMe: true, accessToken: validToken(3 * 86400), expiresAt: now + 3 * 86400_000,
    })))
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()

    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ accessToken: validToken(60) })))
    expect(getSession()).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('caps persistent sessions at 24h when saving and never slides the deadline', () => {
    saveSession(authSession({ rememberMe: true, accessToken: validToken(3 * 86400), expiresAt: now + 3 * 86400_000 }))
    const deadline = now + MAX_REMEMBER_ME_DURATION
    expect(getSession()?.expiresAt).toBe(deadline)
    expect(JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)!).expiresAt).toBe(deadline)
    vi.spyOn(Date, 'now').mockReturnValue(now + 3600_000)
    expect(getSession()?.expiresAt).toBe(deadline)
    vi.spyOn(Date, 'now').mockReturnValue(deadline)
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('honors an earlier stored or JWT deadline', () => {
    saveSession(authSession({ expiresAt: now + 30_000 }))
    expect(getSession()?.expiresAt).toBe(now + 30_000)
    saveSession(authSession({ accessToken: validToken(60), expiresAt: now + 3600_000 }))
    expect(getSession()?.expiresAt).toBe(now + 60_000)
  })

  it('restores a token without exp using its saved absolute expiresIn deadline', () => {
    const session = authSession({ accessToken: createToken({ sub: 'user' }) })
    expect(saveSession(session)).toBe(true)
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_000)
    expect(getSession()?.expiresAt).toBe(session.expiresAt)
  })

  it("validates session schema, user status and storage placement independently", () => {
    for (const sample of [
      null, [], {}, wireCurrentUser, wireLoginResponse(),
      { ...wireLoginResponse(), sessionId: 'wire-session', version: 2, rememberMe: false, expiresAt: now + 3600_000 },
      { ...authSession(), version: 1 }, { ...authSession(), version: '2' },
      { ...authSession(), sessionId: undefined }, { ...authSession(), sessionId: '' },
      { ...authSession(), accessToken: 'broken' }, { ...authSession(), tokenType: 'Basic' },
      { ...authSession(), expiresAt: 'tomorrow' }, { ...authSession(), expiresAt: null },
      { ...authSession(), rememberMe: 'true' }, { ...authSession(), userId: '' },
      { ...authSession(), fullName: ' ' }, { ...authSession(), email: null },
      { ...authSession(), status: 'INACTIVE' }, { ...authSession(), status: 'SUSPENDED' },
      { ...authSession(), status: 'DEACTIVATED' }, { ...authSession(), status: ['ACTIVE'] },
    ].map(data => ({ data }))) {
      const { data } = sample
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(data))
      expect(getSession(), `case: ${JSON.stringify(sample)}`).toBeNull()
      expect(sessionStorage.getItem(AUTH_SESSION_KEY), `case: ${JSON.stringify(sample)}`).toBeNull()
    }

    for (const rememberMe of [false, true] as const) {
      const wrongStorage = rememberMe ? sessionStorage : localStorage
      wrongStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe })))
      expect(getSession(), `case: ${JSON.stringify(rememberMe)}`).toBeNull()
      expect(wrongStorage.getItem(AUTH_SESSION_KEY), `case: ${JSON.stringify(rememberMe)}`).toBeNull()
    }
  })

  it("invalid saves clear old sessions and persistence excludes undeclared fields", () => {
    saveSession(authSession())
    expect(saveSession(authSession({ expiresAt: NaN }))).toBe(false)
    expect(getSession()).toBeNull()

    {
      const session = { ...authSession(), password: 'must-not-be-stored', role: 'ADMINISTRATOR', profile: { bio: 'Private profile' }, user: wireCurrentUser, clientId: 'central-identity' }
      expect(saveSession(session)).toBe(true)
      const stored = JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)!)
      for (const field of ['password', 'role', 'profile', 'user', 'clientId']) expect(stored).not.toHaveProperty(field)
    }

    expect(saveSession(null as unknown as AuthSession)).toBe(false)
  })

  it('catches quota errors and returns a failed save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(saveSession(authSession())).toBe(false)
    expect(getSession()).toBeNull()
  })

  it('catches storage read errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(getSession()).toBeNull()
  })

  it("handles blocked browser storage getters", () => {
    for (const storage of ['localStorage', 'sessionStorage'] as const) {
      const blocked = vi.spyOn(window, storage, 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
      expect(getSession(), `case: ${JSON.stringify(storage)}`).toBeNull()
      expect(saveSession(authSession()), `case: ${JSON.stringify(storage)}`).toBe(false)
      expect(clearSession(), `case: ${JSON.stringify(storage)}`).toBe(false)
      blocked.mockRestore()
    }
  })

  it("cleanup failures attempt both stores, prevent new writes and reject conflicts", () => {
    {
      const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
      const write = vi.spyOn(Storage.prototype, 'setItem')
      expect(saveSession(authSession())).toBe(false)
      expect(remove).toHaveBeenCalledTimes(2)
      expect(write).not.toHaveBeenCalled()
      expect(clearSession()).toBe(false)
      vi.restoreAllMocks()
      vi.spyOn(Date, 'now').mockReturnValue(now)
    }

    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe: true })))
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession()))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(getSession()).toBeNull()
  })
})
