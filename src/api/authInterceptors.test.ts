import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSession, validToken, validUser } from '@/test/fixtures/auth'
import { wireCurrentUser, wireLoginResponse, wireRegisteredUser } from '@/test/fixtures/authWire'
import { identityApiUrl, server } from '@/test/server'
import { authApi } from './authApi'
import { installAuthInterceptors, type SessionSnapshot } from './authInterceptors'
import { centralIdentityClient } from './centralIdentityClient'
import { lmsClient } from './lmsClient'

const clients = [centralIdentityClient, lmsClient]
let snapshot: SessionSnapshot
let cleanup: () => void
const purgeSession = vi.fn()
const onLmsForbidden = vi.fn()
const success = (config: InternalAxiosRequestConfig) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
const failure = (status: number): AxiosAdapter => async config => {
  throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, { ...success(config), status })
}

beforeEach(() => {
  snapshot = { session: authSession(), generation: 1 }
  cleanup = installAuthInterceptors({ getSessionSnapshot: () => snapshot, purgeSession, onLmsForbidden })
})
afterEach(() => cleanup())

describe('request authentication', () => {
  it("isolates explicit verification tokens and strips them from public/external requests", async () => {
    {
      const token = validToken(7200)
      let authorization: string | null = null
      server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
        authorization = request.headers.get('authorization')
        return new HttpResponse(null, { status: 401 })
      }))
      await expect(authApi.getCurrentUser(token)).rejects.toMatchObject({ status: 401 })
      expect(authorization).toBe(`Bearer ${token}`)
      expect(purgeSession).not.toHaveBeenCalled()
    }

    for (const request of [{ url: 'https://outside.example/users/me' }, { url: '/users/me', skipAuth: true }]) {
      const { config } = await centralIdentityClient.request({
        ...request, authToken: validToken(), adapter: async config => success(config),
      })
      expect(config.headers.has('Authorization')).toBe(false)
      expect(config.authToken).toBeUndefined()
    }
  })

  it('rejects redirects outside the API path before they can receive a Bearer token', async () => {
    let leaked = false
    server.use(
      http.get(identityApiUrl('/users/me'), () => new HttpResponse(null, {
        status: 302, headers: { Location: 'http://localhost:8080/collect' },
      })),
      http.get('http://localhost:8080/collect', () => { leaked = true; return HttpResponse.json(wireCurrentUser) }),
    )
    await expect(centralIdentityClient.get('/users/me', { fetchOptions: { redirect: 'follow' } })).rejects.toThrow()
    expect(leaked).toBe(false)
    expect(purgeSession).not.toHaveBeenCalled()
  })

  it("attaches current tokens to relative and absolute trusted URLs on both clients", async () => {
    {
      const adapter = vi.fn<AxiosAdapter>(async config => success(config))
      await Promise.all(clients.map(client => client.get('/courses', { adapter })))
      expect(adapter).toHaveBeenCalledTimes(2)
      for (const [config] of adapter.mock.calls) {
        expect(config.headers.get('Authorization')).toBe(`Bearer ${snapshot.session!.accessToken}`)
        expect(config._sessionGeneration).toBe(1)
      }
      clients.forEach(client => expect(client.defaults.headers.common.Authorization).toBeUndefined())
    }
    {
      const { config } = await centralIdentityClient.get(identityApiUrl('/users/me'), { adapter: async config => success(config) })
      expect(config.headers.get('Authorization')).toBe(`Bearer ${snapshot.session!.accessToken}`)
    }
  })

  it("public and skipAuth requests omit auth metadata and cannot cause global logout", async () => {
    for (const client of clients) {
      const { config } = await client.get('/public', {
        skipAuth: true, headers: { Authorization: 'Bearer stale-token' },
        _sessionGeneration: 999, _authHandled: true, adapter: async config => success(config),
      })
      expect(config.headers.has('Authorization'), `case: ${JSON.stringify(client)}`).toBe(false)
      expect(config._sessionGeneration, `case: ${JSON.stringify(client)}`).toBeUndefined()
      expect(config._authHandled, `case: ${JSON.stringify(client)}`).toBeUndefined()
    }

    {
      const headers: (string | null)[] = []
      server.use(
        http.post(identityApiUrl('/auth/login'), ({ request }) => {
          headers.push(request.headers.get('authorization'))
          return HttpResponse.json(wireLoginResponse())
        }),
        http.post(identityApiUrl('/auth/register'), ({ request }) => {
          headers.push(request.headers.get('authorization'))
          return HttpResponse.json(wireRegisteredUser, { status: 201 })
        }),
      )
      await authApi.login({ email: validUser.email, password: 'password' })
      await authApi.register({ email: validUser.email, password: 'password', fullName: validUser.fullName })
      expect(headers).toEqual([null, null])
    }

    server.use(http.post(identityApiUrl('/auth/login'), () => new HttpResponse(null, { status: 401 })))
    await expect(authApi.login({ email: validUser.email, password: 'wrong' })).rejects.toMatchObject({ status: 401 })
    expect(purgeSession).not.toHaveBeenCalled()
  })

  it("rejects the complete untrusted URL corpus before attaching credentials", async () => {
    for (const request of [
      { url: 'https://outside.example/api/v1/users' },
      { url: '//outside.example/api/v1/users' },
      { url: '/users', baseURL: 'https://outside.example/api/v1' },
      { url: 'http://localhost:8080.evil.example/api/v1/users' },
      { url: 'http://localhost:8080/api/v10/users' },
      { url: 'http://localhost:8080/api/v1/../../private' },
      { url: 'http://user:pass@localhost:8080/api/v1/users' },
      { url: 'data:text/plain,hello' },
    ] as const) {
      const { config } = await centralIdentityClient.request({
        ...request, headers: { Authorization: 'Bearer stale' }, adapter: async config => success(config),
      })
      expect(config.headers.has('Authorization'), `case: ${JSON.stringify(request)}`).toBe(false)
      expect(config._sessionGeneration, `case: ${JSON.stringify(request)}`).toBeUndefined()
    }
  })

  it('blocks expired requests before transport and expires the session only once', async () => {
    snapshot.session = authSession({ expiresAt: Date.now() })
    const adapter = vi.fn<AxiosAdapter>()
    const results = await Promise.allSettled(clients.map(client => client.get('/courses', { adapter })))
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(adapter).not.toHaveBeenCalled()
    expect(purgeSession).toHaveBeenCalledExactlyOnceWith('expired', 1)
  })

  it("removes stale headers without purging anonymous sessions on repeated 401s", async () => {
    {
      snapshot.session = null
      const { config } = await lmsClient.get('/courses', {
        headers: { Authorization: 'Bearer stale' }, adapter: async config => success(config),
      })
      expect(config.headers.has('Authorization')).toBe(false)
    }

    snapshot.session = null
    await Promise.allSettled(clients.map(client => client.get('/private', { adapter: failure(401) })))
    expect(purgeSession).not.toHaveBeenCalled()
  })
})

describe('response authentication', () => {
  it('purges once across a concurrent 401 storm on both clients, and unlocks for a new generation', async () => {
    await Promise.allSettled(Array.from({ length: 10 }, (_, i) => clients[i % 2].get('/private', { adapter: failure(401) })))
    expect(purgeSession).toHaveBeenCalledExactlyOnceWith('unauthorized', 1)
    snapshot = { session: authSession(), generation: 2 }
    await expect(lmsClient.get('/private', { adapter: failure(401) })).rejects.toMatchObject({ response: { status: 401 } })
    expect(purgeSession).toHaveBeenCalledTimes(2)
    expect(purgeSession).toHaveBeenLastCalledWith('unauthorized', 2)
  })

  it('does not handle external 401s or public 403s', async () => {
    await expect(lmsClient.get('https://outside.example/private', { adapter: failure(401) })).rejects.toBeInstanceOf(AxiosError)
    await expect(lmsClient.get('/public', { skipAuth: true, adapter: failure(403) })).rejects.toBeInstanceOf(AxiosError)
    expect(purgeSession).not.toHaveBeenCalled()
    expect(onLmsForbidden).not.toHaveBeenCalled()
  })

  it('notifies for LMS 403 without changing the session or logging out', async () => {
    const original = snapshot
    await expect(lmsClient.get('/private', { adapter: failure(403) })).rejects.toMatchObject({ response: { status: 403 } })
    expect(snapshot).toBe(original)
    expect(purgeSession).not.toHaveBeenCalled()
    expect(onLmsForbidden).toHaveBeenCalledOnce()
    await expect(centralIdentityClient.get('/private', { adapter: failure(403) })).rejects.toBeInstanceOf(AxiosError)
    expect(onLmsForbidden).toHaveBeenCalledOnce()
  })

  it.each(['generation', 'cleanup'] as const)('ignores a late 401 after %s changes', async change => {
    let rejectRequest!: () => void
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const request = centralIdentityClient.get('/private', {
      adapter: config => new Promise((_resolve, reject) => {
        rejectRequest = () => reject(new AxiosError('Unauthorized', undefined, config, undefined, { ...success(config), status: 401 }))
        markStarted()
      }),
    })
    const assertion = expect(request).rejects.toBeInstanceOf(AxiosError)
    await started
    if (change === 'generation') snapshot.generation += 1
    else cleanup()
    rejectRequest()
    await assertion
    expect(purgeSession).not.toHaveBeenCalled()
  })

  it('ejects both request/response interceptors on cleanup and can install again', async () => {
    const ejectors = clients.flatMap(client => [
      vi.spyOn(client.interceptors.request, 'eject'), vi.spyOn(client.interceptors.response, 'eject'),
    ])
    cleanup()
    ejectors.forEach(eject => expect(eject).toHaveBeenCalledOnce())
    const { config } = await lmsClient.get('/private', { adapter: async config => success(config) })
    expect(config.headers.has('Authorization')).toBe(false)
    cleanup = installAuthInterceptors({ getSessionSnapshot: () => snapshot, purgeSession, onLmsForbidden })
    await expect(lmsClient.get('/private', { adapter: failure(401) })).rejects.toBeInstanceOf(AxiosError)
    expect(purgeSession).toHaveBeenCalledOnce()
  })
})
