import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/types/auth'
import { authSession, createToken, expiredToken, validToken } from '@/test/fixtures/auth'
import { MAX_REMEMBER_ME_DURATION } from '@/utils/sessionExpiry'
import { AUTH_SESSION_KEY, clearSession, getSession, saveSession } from './tokenStorage'

const now = Date.parse('2026-10-30T12:00:00.000Z')

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

describe('tokenStorage', () => {
  it.each([false, true])('saves and reads a version-2 session with rememberMe=%s', rememberMe => {
    const session = authSession({ rememberMe })
    expect(saveSession(session)).toBe(true)
    expect(getSession()).toEqual(session)
    expect(JSON.parse((rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY)!)).toEqual(session)
    expect((rememberMe ? sessionStorage : localStorage).getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it.each([false, true])('clears the old storage when switching rememberMe to %s', rememberMe => {
    saveSession(authSession({ rememberMe: !rememberMe }))
    const session = authSession({ rememberMe, fullName: 'Another User' })
    expect(saveSession(session)).toBe(true)
    expect(getSession()).toEqual(session)
    expect((rememberMe ? sessionStorage : localStorage).getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('clears both stores without touching unrelated keys', () => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe: true })))
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession()))
    localStorage.setItem('theme', 'dark')
    sessionStorage.setItem('draft', 'notes')
    expect(clearSession()).toBe(true)
    expect(getSession()).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.getItem('draft')).toBe('notes')
  })

  it('prefers a shared login over an old private session left in a reopened tab', () => {
    const session = authSession()
    const persistent = authSession({ rememberMe: true, userId: 'newer-user' })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(persistent))
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
    expect(getSession()).toEqual(persistent)
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('scopes removal to the rejected session without deleting a newer shared login', () => {
    const old = authSession()
    const next = authSession({ rememberMe: true })
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(old))
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
    expect(clearSession(old.sessionId)).toBe(true)
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(getSession()).toEqual(next)
  })

  it.each(['localStorage', 'sessionStorage'] as const)('cleans up corrupted JSON in %s', storage => {
    window[storage].setItem(AUTH_SESSION_KEY, '{not-json')
    expect(getSession()).toBeNull()
    expect(window[storage].getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('can read a valid persistent session after cleaning corrupted tab storage', () => {
    const session = authSession({ rememberMe: true })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
    sessionStorage.setItem(AUTH_SESSION_KEY, '{bad-json')
    expect(getSession()).toEqual(session)
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it.each([false, true])('removes expired sessions with rememberMe=%s', rememberMe => {
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe, expiresAt: now })))
    expect(getSession()).toBeNull()
    expect(storage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('rejects an expired JWT despite a future stored deadline', () => {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ accessToken: expiredToken() })))
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

  it('removes an over-cap stored deadline instead of applying a sliding 24h window', () => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({
      rememberMe: true, accessToken: validToken(3 * 86400), expiresAt: now + 3 * 86400_000,
    })))
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('removes a stored deadline that exceeds the JWT expiration', () => {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ accessToken: validToken(60) })))
    expect(getSession()).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('fails closed if conflicting sessions cannot be cleaned up', () => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe: true })))
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession()))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(getSession()).toBeNull()
  })

  it('restores a token without exp using its saved absolute expiresIn deadline', () => {
    const session = authSession({ accessToken: createToken({ sub: 'user' }) })
    expect(saveSession(session)).toBe(true)
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_000)
    expect(getSession()?.expiresAt).toBe(session.expiresAt)
  })

  it.each([
    null, [], {}, { ...authSession(), version: 1 }, { ...authSession(), version: '2' },
    { ...authSession(), sessionId: undefined }, { ...authSession(), sessionId: '' },
    { ...authSession(), accessToken: 'broken' }, { ...authSession(), tokenType: 'Basic' },
    { ...authSession(), expiresAt: 'tomorrow' }, { ...authSession(), expiresAt: null },
    { ...authSession(), rememberMe: 'true' }, { ...authSession(), userId: '' },
    { ...authSession(), fullName: ' ' }, { ...authSession(), email: null },
    { ...authSession(), status: 'INACTIVE' }, { ...authSession(), status: 'SUSPENDED' },
    { ...authSession(), status: 'DEACTIVATED' }, { ...authSession(), status: ['ACTIVE'] },
  ].map(data => ({ data })))('removes invalid stored data: $data', ({ data }) => {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(data))
    expect(getSession()).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it.each([false, true])('rejects a session in the wrong storage with rememberMe=%s', rememberMe => {
    const wrongStorage = rememberMe ? sessionStorage : localStorage
    wrongStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession({ rememberMe })))
    expect(getSession()).toBeNull()
    expect(wrongStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('does not retain an older session when asked to save invalid data', () => {
    saveSession(authSession())
    expect(saveSession(authSession({ expiresAt: NaN }))).toBe(false)
    expect(getSession()).toBeNull()
  })

  it('strips extra runtime fields rather than persisting passwords or UI data', () => {
    const session = { ...authSession(), password: 'must-not-be-stored' }
    expect(saveSession(session)).toBe(true)
    expect(JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)!)).not.toHaveProperty('password')
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

  it.each(['localStorage', 'sessionStorage'] as const)('catches blocked access to the %s getter', storage => {
    vi.spyOn(window, storage, 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(getSession()).toBeNull()
    expect(saveSession(authSession())).toBe(false)
    expect(clearSession()).toBe(false)
  })

  it('does not write a new session when cleanup fails, and still attempts both stores', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    expect(saveSession(authSession())).toBe(false)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(write).not.toHaveBeenCalled()
    expect(clearSession()).toBe(false)
  })

  it('rejects unknown runtime input safely', () => {
    expect(saveSession(null as unknown as AuthSession)).toBe(false)
  })
})
