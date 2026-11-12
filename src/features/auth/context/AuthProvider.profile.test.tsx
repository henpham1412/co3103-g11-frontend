import type { PropsWithChildren } from 'react'
import { App } from 'antd'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from '@/api/authApi'
import { useAuth } from '@/hooks/useAuth'
import { authSession, loginResponse, validUser } from '@/test/fixtures/auth'
import { wireCurrentUser } from '@/test/fixtures/authWire'
import { deferred } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import type { User } from '@/types/auth'
import { AUTH_SESSION_KEY, tokenStorage } from '../services/tokenStorage'
import { AuthProvider } from './AuthProvider'

const credentials = { email: validUser.email, password: 'synthetic-login' }
function Wrapper({ children }: PropsWithChildren) { return <App><AuthProvider>{children}</AuthProvider></App> }
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubGlobal('BroadcastChannel', undefined) })
afterEach(() => vi.useRealTimers())
async function authenticated(rememberMe = false) {
  tokenStorage.saveSession(authSession({ rememberMe }))
  const view = renderHook(() => useAuth(), { wrapper: Wrapper, reactStrictMode: true })
  await waitFor(() => expect(view.result.current.state.status).toBe('authenticated'))
  return view
}

it.each([false, true])('refreshes canonical metadata only in memory, retaining session invariants (rememberMe %s)', async rememberMe => {
  const { result } = await authenticated(rememberMe)
  const before = result.current.state
  if (before.status !== 'authenticated') throw Error('Expected authentication')
  const raw = (rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY)
  const save = vi.spyOn(tokenStorage, 'saveSession'), login = vi.spyOn(authApi, 'login')
  const pending = deferred<User>()
  vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(pending.promise)
  const refresh = result.current.refreshCurrentUser
  let operation!: Promise<User>
  act(() => { operation = refresh() })
  expect(result.current.state.status).toBe('authenticated')
  await act(async () => { pending.resolve({ ...validUser, fullName: 'Canonical name', profile: { bio: 'Memory only' } }); await operation })
  expect(result.current.state).toMatchObject({ status: 'authenticated', user: { fullName: 'Canonical name', profile: { bio: 'Memory only' } } })
  if (result.current.state.status !== 'authenticated') throw Error('Expected authentication')
  expect(JSON.stringify(result.current.state.session) === JSON.stringify({ ...before.session, fullName: 'Canonical name' })).toBe(true)
  expect((rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY) === raw).toBe(true)
  expect(result.current.refreshCurrentUser).toBe(refresh)
  expect(save).not.toHaveBeenCalled()
  expect(login).not.toHaveBeenCalled()
  expect((JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).includes('Memory only')).toBe(false)
})

it('only applies the newest refresh, even if the old transport ignores abort', async () => {
  const { result } = await authenticated()
  const first = deferred<User>(), second = deferred<User>()
  const get = vi.spyOn(authApi, 'getCurrentUser').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  let old!: Promise<unknown>, current!: Promise<User>
  act(() => { old = result.current.refreshCurrentUser().catch(error => error); current = result.current.refreshCurrentUser() })
  expect(get.mock.calls[0][1]?.aborted).toBe(true)
  await act(async () => { second.resolve({ ...validUser, fullName: 'Newest' }); await current })
  await act(async () => { first.resolve({ ...validUser, fullName: 'Obsolete' }); expect(await old).toMatchObject({ error: 'Request Aborted' }) })
  expect(result.current.state).toMatchObject({ user: { fullName: 'Newest' } })
})

it.each(['caller', 'logout', 'unmount', 'same account login', 'different account login'])('invalidates refresh after %s', async kind => {
  const { result, unmount } = await authenticated()
  const pending = deferred<User>()
  const get = vi.spyOn(authApi, 'getCurrentUser').mockReturnValueOnce(pending.promise)
  const caller = new AbortController()
  let operation!: Promise<unknown>
  act(() => { operation = result.current.refreshCurrentUser(caller.signal).catch(error => error) })
  if (kind === 'caller') caller.abort()
  if (kind === 'logout') await act(() => result.current.logout())
  if (kind === 'unmount') unmount()
  if (kind.includes('login')) {
    vi.spyOn(authApi, 'login').mockResolvedValue(loginResponse({ fullName: 'Fresh login', ...(kind === 'different account login' ? { userId: 'new-user-id' } : {}) }))
    await act(() => result.current.login(credentials))
  }
  expect(get.mock.calls[0][1]?.aborted).toBe(true)
  await act(async () => { pending.resolve({ ...validUser, fullName: 'Stale name' }); expect(await operation).toMatchObject({ error: 'Request Aborted' }) })
  if (kind !== 'unmount') expect(JSON.stringify(result.current.state).includes('Stale name')).toBe(false)
})

it.each([0, 403, 500])('keeps refresh failure %s local and permits a later refresh', async status => {
  const { result } = await authenticated()
  server.use(http.get(identityApiUrl('/users/me'), () => status === 0 ? HttpResponse.error() : new HttpResponse(null, { status })))
  await act(async () => { await expect(result.current.refreshCurrentUser()).rejects.toMatchObject({ status }) })
  expect(result.current.state.status).toBe('authenticated')
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireCurrentUser)))
  await act(() => result.current.refreshCurrentUser())
  expect(result.current.state.status).toBe('authenticated')
})

it.each(['mismatch', 'malformed', 'inactive', 'unauthorized'])('rejects a %s canonical response', async kind => {
  const { result } = await authenticated()
  server.use(http.get(identityApiUrl('/users/me'), () => kind === 'unauthorized' ? new HttpResponse(null, { status: 401 })
    : HttpResponse.json(kind === 'malformed' ? { invalid: true } : { ...wireCurrentUser, ...(kind === 'mismatch' ? { user_id: 'other-user' } : { status: 'SUSPENDED' }) })))
  await act(async () => { await expect(result.current.refreshCurrentUser()).rejects.toBeDefined() })
  expect(result.current.state.status).toBe(kind === 'inactive' || kind === 'unauthorized' ? 'anonymous' : 'authenticated')
})

it('keeps the expiry timer active while refreshing and never resurrects an expired session', async () => {
  const { result } = await authenticated()
  vi.useFakeTimers()
  vi.spyOn(authApi, 'login').mockResolvedValue(loginResponse({ expiresIn: 1 }))
  await act(() => result.current.login(credentials))
  const pending = deferred<User>()
  vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(pending.promise)
  let operation!: Promise<unknown>
  act(() => { operation = result.current.refreshCurrentUser().catch(error => error) })
  await act(() => vi.advanceTimersByTimeAsync(1001))
  expect(result.current.state.status).toBe('anonymous')
  await act(async () => { pending.resolve(validUser); await operation })
  expect(result.current.state).toMatchObject({ status: 'anonymous', reason: 'expired' })
})

it('does not allow refresh from anonymous or pending restore', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })
  await expect(result.current.refreshCurrentUser()).rejects.toMatchObject({ error: 'Request Aborted' })
})
