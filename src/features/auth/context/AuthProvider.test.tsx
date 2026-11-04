import { StrictMode, type PropsWithChildren } from 'react'
import { App } from 'antd'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppProviders from '@/app/providers'
import { AuthSessionState } from '../components/AuthSessionState'
import { authApi } from '@/api/authApi'
import { ApiError } from '@/api/apiError'
import { centralIdentityClient } from '@/api/centralIdentityClient'
import { lmsClient } from '@/api/lmsClient'
import { useAuth } from '@/hooks/useAuth'
import { AUTH_SYNC_KEY } from '@/features/auth/services/authSync'
import { AUTH_SESSION_KEY, tokenStorage } from '@/features/auth/services/tokenStorage'
import { authSession, errorEnvelope, loginResponse, validToken, validUser } from '@/test/fixtures/auth'
import { wireCurrentUser, wireIdentity, wireLoginResponse, wireProfile } from '@/test/fixtures/authWire'
import { identityApiUrl, server } from '@/test/server'
import type { CurrentUserResponse, LoginResponse } from '@/types/auth'
import { AuthProvider } from './AuthProvider'

const credentials = { email: validUser.email, password: 'Test-password-123!' }
const lmsUrl = `${lmsClient.defaults.baseURL}/courses`

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function Wrapper({ children }: PropsWithChildren) {
  return <App><AuthProvider>{children}</AuthProvider></App>
}
function mountAuth(strict = false) {
  return renderHook(() => useAuth(), {
    wrapper: Wrapper,
    reactStrictMode: strict,
  })
}
function signal(key: string, newValue: string | null) {
  act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage })))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('bootstrap and restore recovery', () => {
  it('starts anonymous without contacting the server when no session exists', () => {
    const getUser = vi.spyOn(authApi, 'getCurrentUser')
    const { result } = mountAuth()
    expect(result.current.state).toEqual({ status: 'anonymous', reason: undefined })
    expect(getUser).not.toHaveBeenCalled()
  })

  it.each([
    { profile: undefined, expected: undefined },
    { profile: null, expected: null },
    { profile: {}, expected: {} },
    { profile: wireProfile, expected: {
      avatarUrl: 'https://storage.example.com/avatars/user1.png', bio: 'Computer Science student',
      phoneNumber: '+84912345678', dateOfBirth: null, locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
    } },
  ])('restores a saved token from canonical identity with profile $profile', async ({ profile, expected }) => {
    const session = authSession()
    tokenStorage.saveSession(session)
    server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
      expect(request.headers.get('authorization')).toBe(`Bearer ${session.accessToken}`)
      return HttpResponse.json({ ...wireIdentity, full_name: 'Verified name', profile, role: 'ADMINISTRATOR', privateMetadata: 'excluded' })
    }))
    const { result } = mountAuth()
    expect(result.current.state.status).toBe('initializing')
    await waitFor(() => expect(result.current.state).toMatchObject({
      status: 'authenticated', user: { fullName: 'Verified name' }, session: { expiresAt: session.expiresAt, version: 2 },
    }))
    if (result.current.state.status !== 'authenticated') throw new Error('Expected authenticated')
    expect(result.current.state.user).toEqual({ ...validUser, fullName: 'Verified name', ...(expected === undefined ? {} : { profile: expected }) })
    expect(result.current.state.session).toEqual({ ...session, fullName: 'Verified name' })
    expect(tokenStorage.getSession()).toEqual(session)
  })

  it.each([401, 403])('purges a rejected restore with HTTP %s', async status => {
    tokenStorage.saveSession(authSession())
    server.use(http.get(identityApiUrl('/users/me'), () => new HttpResponse(null, { status })))
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'unauthorized' }))
    expect(tokenStorage.getSession()).toBeNull()
  })

  it.each(['SUSPENDED', 'DEACTIVATED'])('rejects a 200 restore for a %s account', async status => {
    tokenStorage.saveSession(authSession())
    server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireCurrentUser, status })))
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'unauthorized' }))
    expect(tokenStorage.getSession()).toBeNull()
  })

  it.each([
    { ...wireCurrentUser, status: 'INACTIVE' },
    { ...wireCurrentUser, user_id: undefined },
    { ...wireCurrentUser, profile: { phone_number: 123 } },
    validUser,
  ])('keeps invalid-contract restore failures recoverable without authenticating: %j', async data => {
    const session = authSession()
    tokenStorage.saveSession(session)
    server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(data)))
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state).toMatchObject({
      status: 'restore-error', error: { status: 502, code: 'INVALID_AUTH_RESPONSE' },
    }))
    expect(tokenStorage.getSession()).toEqual(session)
  })

  it.each([0, 500])('retains the token after a failure (%s) and supports canonical retry', async status => {
    const session = authSession()
    tokenStorage.saveSession(session)
    server.use(http.get(identityApiUrl('/users/me'), () => status === 0 ? HttpResponse.error() : new HttpResponse(null, { status })))
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('restore-error'))
    expect(tokenStorage.getSession()).toEqual(session)
    const state = result.current.state
    if (state.status !== 'restore-error') throw new Error('Expected restore-error')
    expect(state.error).toBeInstanceOf(ApiError)
    expect(state.error.status).toBe(status)
    server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireCurrentUser)))
    await act(() => state.retrySessionVerification())
    expect(result.current.state.status).toBe('authenticated')
    expect(result.current.state).not.toHaveProperty('error')
    expect(tokenStorage.getSession()).toEqual(session)
  })

  it('renders the loading state, error, Retry and Sign in again through AppProviders', async () => {
    tokenStorage.saveSession(authSession())
    const pending = deferred<CurrentUserResponse>()
    const verify = vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(pending.promise)
    render(<StrictMode><AppProviders><AuthSessionState><div>Router content</div></AuthSessionState></AppProviders></StrictMode>)
    expect(screen.getByRole('status', { name: 'Verifying your session' })).toBeInTheDocument()
    expect(screen.queryByText('Router content')).not.toBeInTheDocument()
    await act(async () => pending.reject(new ApiError(errorEnvelope({ status: 503, message: 'Private SQL failure' }))))
    expect(screen.getByRole('alert')).toHaveTextContent('The authentication service is temporarily unavailable.')
    expect(screen.queryByText('Private SQL failure')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
    verify.mockResolvedValue(validUser)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Router content')
    expect(tokenStorage.getSession()).not.toBeNull()
  })

  it('Sign in again clears a failed restore and lets the router render', async () => {
    tokenStorage.saveSession(authSession())
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new ApiError(errorEnvelope({ status: 503 })))
    render(<AppProviders><AuthSessionState><div>Sign-in routing</div></AuthSessionState></AppProviders>)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }))
    expect(await screen.findByText('Sign-in routing')).toBeInTheDocument()
    expect(tokenStorage.getSession()).toBeNull()
  })
})

describe('login and logout', () => {
  it.each(['INACTIVE', 'SUSPENDED', 'DEACTIVATED', 'missing-user', 'flat-response'])('does not persist a rejected login response: %s', async sample => {
    const data = sample === 'flat-response' ? loginResponse()
      : sample === 'missing-user' ? { ...wireLoginResponse(), user: undefined }
        : { ...wireLoginResponse(), user: { ...wireIdentity, status: sample } }
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(data)))
    const { result } = mountAuth()
    await act(async () => {
      await expect(result.current.login(credentials)).rejects.toBeInstanceOf(ApiError)
    })
    expect(result.current.state.status).toBe('anonymous')
    expect(tokenStorage.getSession()).toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('saves a remember-me login and clears it on logout', async () => {
    const rememberMe = true
    const response = loginResponse({ accessToken: validToken(3 * 86400), expiresIn: 3 * 86400 })
    vi.spyOn(authApi, 'login').mockResolvedValue(response)
    const { result } = mountAuth()
    const started = Date.now()
    await act(async () => {
      const session = await result.current.login(credentials, rememberMe)
      expect(session).toMatchObject({ accessToken: response.accessToken, rememberMe })
    })
    expect(result.current.state.status).toBe('authenticated')
    const session = tokenStorage.getSession()!
    expect(session.expiresAt - started).toBeLessThanOrEqual(86400_000 + 1000)
    expect(localStorage.getItem(AUTH_SESSION_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    await act(() => result.current.logout())
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('fails closed when the session cannot be persisted', async () => {
    vi.spyOn(tokenStorage, 'saveSession').mockReturnValue(false)
    const { result } = mountAuth()
    await act(async () => {
      await expect(result.current.login(credentials)).rejects.toMatchObject({ code: 'SESSION_STORAGE_UNAVAILABLE' })
    })
    expect(result.current.state.status).toBe('anonymous')
  })

  it('does not authenticate if the deadline passes immediately after storage is written', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(loginResponse())
    const save = tokenStorage.saveSession
    vi.spyOn(tokenStorage, 'saveSession').mockImplementation(session => {
      const saved = save(session)
      vi.spyOn(Date, 'now').mockReturnValue(session.expiresAt)
      return saved
    })
    const { result } = mountAuth()
    await act(async () => {
      await expect(result.current.login(credentials)).rejects.toMatchObject({ error: 'Request Aborted' })
    })
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it("preserves the shared session on LMS 403 then purges once for concurrent 401s", async () => {
    const session = authSession()
    tokenStorage.saveSession(session)
    const headers: (string | null)[] = []
    server.use(
      http.get(identityApiUrl('/users/me'), ({ request }) => {
        headers.push(request.headers.get('authorization'))
        return HttpResponse.json(wireCurrentUser)
      }),
      http.get(lmsUrl, ({ request }) => {
        headers.push(request.headers.get('authorization'))
        return new HttpResponse(null, { status: 403 })
      }),
    )
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    const original = result.current.state
    await act(async () => { await expect(lmsClient.get('/courses')).rejects.toMatchObject({ response: { status: 403 } }) })
    expect(result.current.state).toBe(original)
    expect(tokenStorage.getSession()).toEqual(session)
    expect(headers).toEqual([`Bearer ${session.accessToken}`, `Bearer ${session.accessToken}`])
    expect(await screen.findByText('You do not have permission to access this LMS resource.')).toBeInTheDocument()
    const clear = vi.spyOn(tokenStorage, 'clearSession')
    server.use(
      http.get(identityApiUrl('/users/me'), () => new HttpResponse(null, { status: 401 })),
      http.get(lmsUrl, () => new HttpResponse(null, { status: 401 })),
    )
    await act(async () => {
      await Promise.allSettled([centralIdentityClient.get('/users/me'), lmsClient.get('/courses'), lmsClient.get('/courses')])
    })
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'unauthorized' })
    expect(clear).toHaveBeenCalledOnce()
  })
})

describe('cancellation and generation races', () => {
  it('does not start a login whose caller has already canceled', async () => {
    const login = vi.spyOn(authApi, 'login')
    const cancellation = new AbortController()
    cancellation.abort()
    const { result } = mountAuth()
    await act(async () => {
      await expect(result.current.login(credentials, false, cancellation.signal))
        .rejects.toMatchObject({ error: 'Request Aborted' })
    })
    expect(login).not.toHaveBeenCalled()
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('ignores an older caller cancellation after a newer login starts', async () => {
    const first = deferred<LoginResponse>()
    const second = deferred<LoginResponse>()
    const login = vi.spyOn(authApi, 'login').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const cancellation = new AbortController()
    const { result } = mountAuth()
    let older!: Promise<unknown>
    let newer!: Promise<unknown>
    act(() => { older = result.current.login(credentials, false, cancellation.signal) })
    const assertion = expect(older).rejects.toMatchObject({ error: 'Request Aborted' })
    act(() => { newer = result.current.login(credentials) })
    act(() => cancellation.abort())
    expect(login.mock.calls[1][1]?.aborted).toBe(false)
    await act(async () => { second.resolve(loginResponse({ userId: 'new-account' })); await newer })
    await act(async () => { first.resolve(loginResponse()); await assertion })
    expect(result.current.state).toMatchObject({ status: 'authenticated', user: { userId: 'new-account' } })
    expect(tokenStorage.getSession()?.userId).toBe('new-account')
  })

  it('keeps session expiry active when a completed login caller is canceled', async () => {
    vi.useFakeTimers()
    vi.spyOn(authApi, 'login').mockResolvedValue(loginResponse({ accessToken: validToken(5), expiresIn: 5 }))
    const cancellation = new AbortController()
    const { result } = mountAuth()
    await act(async () => { await result.current.login(credentials, false, cancellation.signal) })
    act(() => cancellation.abort())
    expect(result.current.state.status).toBe('authenticated')
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('does not restore a late hydration result after logout, even if transport ignores abort', async () => {
    tokenStorage.saveSession(authSession())
    const pending = deferred<CurrentUserResponse>()
    const verify = vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(pending.promise)
    const { result } = mountAuth()
    await act(() => result.current.logout())
    expect(verify.mock.calls[0][1]?.aborted).toBe(true)
    await act(async () => pending.resolve(validUser))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('ignores an old hydration 401 after another account logs in', async () => {
    tokenStorage.saveSession(authSession())
    const pending = deferred<CurrentUserResponse>()
    vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(pending.promise)
    vi.spyOn(authApi, 'login').mockResolvedValue(loginResponse({ userId: 'second-account', accessToken: validToken(7200) }))
    const { result } = mountAuth()
    await act(async () => { await result.current.login(credentials) })
    await act(async () => pending.reject(new ApiError(errorEnvelope({ status: 401 }))))
    expect(result.current.state).toMatchObject({ status: 'authenticated', user: { userId: 'second-account' } })
    expect(tokenStorage.getSession()?.userId).toBe('second-account')
  })

  it('ignores a login result after logout', async () => {
    const pending = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { result } = mountAuth()
    let login!: ReturnType<typeof result.current.login>
    act(() => { login = result.current.login(credentials) })
    const assertion = expect(login).rejects.toMatchObject({ error: 'Request Aborted' })
    await act(() => result.current.logout())
    await act(async () => { pending.resolve(loginResponse()); await assertion })
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('lets the latest login win when two accounts return out of order', async () => {
    const first = deferred<LoginResponse>()
    const second = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = mountAuth()
    let older!: ReturnType<typeof result.current.login>
    let newer!: ReturnType<typeof result.current.login>
    act(() => { older = result.current.login(credentials) })
    const assertion = expect(older).rejects.toMatchObject({ error: 'Request Aborted' })
    act(() => { newer = result.current.login({ ...credentials, email: 'other@example.com' }) })
    await act(async () => { second.resolve(loginResponse({ userId: 'newer-account' })); await newer })
    await act(async () => { first.resolve(loginResponse()); await assertion })
    expect(result.current.state).toMatchObject({ status: 'authenticated', user: { userId: 'newer-account' } })
    expect(tokenStorage.getSession()?.userId).toBe('newer-account')
  })

  it('cancels a retry when logging out', async () => {
    tokenStorage.saveSession(authSession())
    const verify = vi.spyOn(authApi, 'getCurrentUser').mockRejectedValueOnce(new Error('Network Error'))
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('restore-error'))
    const pending = deferred<CurrentUserResponse>()
    verify.mockReturnValue(pending.promise)
    let retry!: Promise<void>
    act(() => { retry = result.current.retrySessionVerification() })
    await act(() => result.current.logout())
    await act(async () => { pending.resolve(validUser); await retry })
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
  })

  it('does not persist a late login after unmount', async () => {
    const pending = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const save = vi.spyOn(tokenStorage, 'saveSession')
    const { result, unmount } = mountAuth()
    let login!: ReturnType<typeof result.current.login>
    act(() => { login = result.current.login(credentials) })
    const assertion = expect(login).rejects.toMatchObject({ error: 'Request Aborted' })
    unmount()
    pending.resolve(loginResponse())
    await assertion
    expect(save).not.toHaveBeenCalled()
  })
})

describe('expiry and browser lifecycle', () => {
  it('expires at the absolute deadline using a fake timer', async () => {
    vi.useFakeTimers()
    const session = authSession({ expiresAt: Date.now() + 5000 })
    tokenStorage.saveSession(session)
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await act(async () => { })
    expect(result.current.state.status).toBe('authenticated')
    act(() => vi.advanceTimersByTime(4999))
    expect(result.current.state.status).toBe('authenticated')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('also expires while restore verification is unavailable', async () => {
    vi.useFakeTimers()
    tokenStorage.saveSession(authSession({ expiresAt: Date.now() + 1000 }))
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('Network Error'))
    const { result } = mountAuth()
    await act(async () => { })
    expect(result.current.state.status).toBe('restore-error')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' })
  })

  it('does not authenticate a verification that finishes after the deadline', async () => {
    vi.useFakeTimers()
    tokenStorage.saveSession(authSession({ expiresAt: Date.now() + 1000 }))
    const pending = deferred<CurrentUserResponse>()
    vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(pending.promise)
    const { result } = mountAuth()
    act(() => vi.advanceTimersByTime(1000))
    await act(async () => pending.resolve(validUser))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' })
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('cancels the previous account timer when a new account logs in', async () => {
    vi.useFakeTimers()
    tokenStorage.saveSession(authSession({ expiresAt: Date.now() + 1000 }))
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    vi.spyOn(authApi, 'login').mockResolvedValue(loginResponse({ userId: 'new-account' }))
    const { result } = mountAuth()
    await act(async () => { })
    await act(async () => { await result.current.login(credentials) })
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.state).toMatchObject({ status: 'authenticated', user: { userId: 'new-account' } })
  })

  it('rearms deadlines beyond the browser timer limit and clears the timer on unmount', async () => {
    vi.useFakeTimers()
    const lifetime = 40 * 86400_000
    tokenStorage.saveSession(authSession({ accessToken: validToken(40 * 86400), expiresAt: Math.floor(Date.now() / 1000) * 1000 + lifetime }))
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result, unmount } = mountAuth()
    await act(async () => { })
    act(() => vi.advanceTimersByTime(2_147_483_647))
    expect(result.current.state.status).toBe('authenticated')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['focus', 'visibilitychange'])('checks expiry on %s even when timers were suspended', async event => {
    const session = authSession()
    tokenStorage.saveSession(session)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    vi.spyOn(Date, 'now').mockReturnValue(session.expiresAt + 1)
    if (event === 'visibilitychange') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      act(() => document.dispatchEvent(new Event(event)))
      expect(result.current.state.status).toBe('authenticated')
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    }
    act(() => (event === 'focus' ? window : document).dispatchEvent(new Event(event)))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' })
  })

  it('cleans every interceptor and browser listener during StrictMode replay and unmount', async () => {
    tokenStorage.saveSession(authSession())
    const verify = vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const clients = [centralIdentityClient, lmsClient]
    const spies = clients.map(client => ({
      requestUse: vi.spyOn(client.interceptors.request, 'use'),
      responseUse: vi.spyOn(client.interceptors.response, 'use'),
      requestEject: vi.spyOn(client.interceptors.request, 'eject'),
      responseEject: vi.spyOn(client.interceptors.response, 'eject'),
    }))
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const { result, unmount } = mountAuth(true)
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    expect(verify).toHaveBeenCalledTimes(2)
    expect(verify.mock.calls[0][1]?.aborted).toBe(true)
    for (const spy of spies) {
      expect(spy.requestUse).toHaveBeenCalledTimes(2)
      expect(spy.responseUse).toHaveBeenCalledTimes(2)
      expect(spy.requestEject).toHaveBeenCalledOnce()
      expect(spy.responseEject).toHaveBeenCalledOnce()
    }
    unmount()
    for (const spy of spies) {
      expect(spy.requestEject.mock.calls.map(([id]) => id)).toEqual(spy.requestUse.mock.results.map(({ value }) => value))
      expect(spy.responseEject.mock.calls.map(([id]) => id)).toEqual(spy.responseUse.mock.results.map(({ value }) => value))
    }
    for (const event of ['focus', 'storage']) expect(removeWindow.mock.calls.filter(([type]) => type === event)).toHaveLength(2)
    expect(removeDocument.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(2)
    expect(tokenStorage.getSession()).not.toBeNull()
  })
})

describe('multi-tab session reconciliation', () => {
  it.each([false, true])('honors explicit sign-out before a shared login event (rememberMe=%s)', async rememberMe => {
    tokenStorage.saveSession(authSession({ rememberMe }))
    const verify = vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    const next = authSession({ rememberMe: true, accessToken: validToken(7200) })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))

    await act(() => result.current.logout())
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
    expect(tokenStorage.getSession()).toBeNull()
    expect(JSON.parse(localStorage.getItem(AUTH_SYNC_KEY)!)).toMatchObject({
      type: 'logout', reason: 'signed-out', sessionId: next.sessionId,
    })
    expect(verify).toHaveBeenCalledOnce()
    signal(AUTH_SESSION_KEY, JSON.stringify(next))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current.state.status).toBe('anonymous')
  })

  it('ignores a delayed logout from an older session after a new login', async () => {
    const old = authSession({ rememberMe: true })
    tokenStorage.saveSession(old)
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    await act(async () => { await result.current.login(credentials, true) })
    const current = tokenStorage.getSession()!
    signal(AUTH_SYNC_KEY, JSON.stringify({
      id: 'delayed-logout', type: 'logout', reason: 'unauthorized', sessionId: old.sessionId,
    }))
    expect(result.current.state).toMatchObject({ status: 'authenticated', session: { sessionId: current.sessionId } })
    expect(tokenStorage.getSession()).toEqual(current)
  })

  it('ignores an old scoped logout while a fresh login is pending', async () => {
    const pending = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { result } = mountAuth()
    let login!: ReturnType<typeof result.current.login>
    act(() => { login = result.current.login(credentials) })
    signal(AUTH_SYNC_KEY, JSON.stringify({
      id: 'old-logout', type: 'logout', reason: 'unauthorized', sessionId: 'previous-session',
    }))
    await act(async () => { pending.resolve(loginResponse()); await login })
    expect(result.current.state.status).toBe('authenticated')
  })

  it('verifies a newer shared session when an old request returns 401 before the storage event', async () => {
    tokenStorage.saveSession(authSession({ rememberMe: true }))
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    const pending = deferred<Response>()
    const started = deferred<void>()
    server.use(http.get(lmsUrl, () => { started.resolve(); return pending.promise }))
    const request = lmsClient.get('/courses')
    const assertion = expect(request).rejects.toMatchObject({ response: { status: 401 } })
    await started.promise
    const next = authSession({ rememberMe: true, accessToken: validToken(7200) })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
    await act(async () => { pending.resolve(new HttpResponse(null, { status: 401 })); await assertion })
    expect(tokenStorage.getSession()).toEqual(next)
    expect(result.current.state).toMatchObject({ status: 'authenticated', session: { sessionId: next.sessionId } })
  })

  it('does not let an old tab expiry delete a newer persistent login before its storage event', async () => {
    vi.useFakeTimers()
    const old = authSession({ rememberMe: true, expiresAt: Date.now() + 1000 })
    tokenStorage.saveSession(old)
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await act(async () => { })
    const next = authSession({ rememberMe: true, accessToken: validToken(7200) })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
    await act(async () => vi.advanceTimersByTime(1000))
    expect(tokenStorage.getSession()).toEqual(next)
    expect(result.current.state).toMatchObject({ status: 'authenticated', session: { accessToken: next.accessToken } })
  })

  it('reconciles missed storage changes on focus before checking an old session deadline', async () => {
    tokenStorage.saveSession(authSession({ rememberMe: true }))
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    localStorage.removeItem(AUTH_SESSION_KEY)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current.state.status).toBe('anonymous')
  })

  it('restores a persistent login from another tab and replaces a private session', async () => {
    tokenStorage.saveSession(authSession())
    const verify = vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    const next = authSession({ rememberMe: true, userId: 'other-account', accessToken: validToken(7200) })
    verify.mockResolvedValue({ ...validUser, userId: next.userId })
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
    signal(AUTH_SESSION_KEY, JSON.stringify(next))
    signal(AUTH_SYNC_KEY, JSON.stringify({ id: 'other-login', type: 'session-changed' }))
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'authenticated', user: { userId: next.userId } }))
    expect(verify).toHaveBeenCalledTimes(2)
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(tokenStorage.getSession()).toEqual(next)
  })

  it('propagates logout to a tab with a private session without rebroadcasting', async () => {
    tokenStorage.saveSession(authSession())
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    const write = vi.spyOn(Storage.prototype, 'setItem')
    signal(AUTH_SYNC_KEY, JSON.stringify({ id: 'remote-logout', type: 'logout', reason: 'signed-out', sessionId: tokenStorage.getSession()!.sessionId }))
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
    expect(tokenStorage.getSession()).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it.each([false, true])('does not resurrect a failed logout deletion (blocked reads=%s)', async blockReads => {
    tokenStorage.saveSession(authSession())
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(validUser)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked') })
    const read = blockReads
      ? vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked') })
      : undefined
    await act(() => result.current.logout())
    read?.mockRestore()
    await act(() => result.current.retrySessionVerification())
    expect(result.current.state.status).toBe('anonymous')
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('handles native removal of a shared persistent session', async () => {
    tokenStorage.saveSession(authSession({ rememberMe: true }))
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    localStorage.removeItem(AUTH_SESSION_KEY)
    signal(AUTH_SESSION_KEY, null)
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
  })

  it('does not import tokens from another tab signal', () => {
    const { result } = mountAuth()
    signal(AUTH_SYNC_KEY, JSON.stringify({ id: 'remote-login', type: 'session-changed', accessToken: validToken() }))
    expect(result.current.state.status).toBe('anonymous')
    expect(tokenStorage.getSession()).toBeNull()
  })

  it('cancels an in-flight login when another tab logs out', async () => {
    const pending = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { result } = mountAuth()
    let login!: ReturnType<typeof result.current.login>
    act(() => { login = result.current.login(credentials) })
    const assertion = expect(login).rejects.toMatchObject({ error: 'Request Aborted' })
    signal(AUTH_SYNC_KEY, JSON.stringify({ id: 'remote-sign-out', type: 'logout', reason: 'signed-out', sessionId: null }))
    await act(async () => { pending.resolve(loginResponse()); await assertion })
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'signed-out' })
    expect(tokenStorage.getSession()).toBeNull()
  })
})
