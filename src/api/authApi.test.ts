import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { errorEnvelope, expiredToken, loginResponse, registeredUser, validToken, validUser } from '@/test/fixtures/auth'
import { wireCurrentUser, wireIdentity, wireLoginResponse, wireRegisteredUser } from '@/test/fixtures/authWire'
import { identityApiUrl, server } from '@/test/server'
import { ApiError } from './apiError'
import { getCurrentUser, login, register } from './authApi'

const credentials = { email: validUser.email, password: 'Test-password-123!' }
const registration = { ...credentials, fullName: validUser.fullName }

describe('register', () => {
  it('sends only the API fields, excluding confirmPassword', async () => {
    let body: unknown
    server.use(http.post(identityApiUrl('/auth/register'), async ({ request }) => {
      body = await request.json()
      expect(request.headers.get('content-type')).toContain('application/json')
      expect(request.headers.get('accept')).toContain('application/json')
      return HttpResponse.json(wireRegisteredUser, { status: 201 })
    }))
    expect(await register({ ...registration, confirmPassword: credentials.password } as typeof registration)).toEqual(registeredUser)
    expect(body).toEqual({ email: credentials.email, password: credentials.password, full_name: validUser.fullName })
  })

  it("validates the registration response schema", async () => {
    for (const data of [
      null, {}, registeredUser, { ...wireRegisteredUser, user_id: '' }, { ...wireRegisteredUser, email: 1 },
      { ...wireRegisteredUser, full_name: null }, { ...wireRegisteredUser, status: 'UNKNOWN' },
      { ...wireRegisteredUser, message: null }, { ...wireRegisteredUser, status: 'INACTIVE' },
    ] as const) {
      server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(data)))
      await expect(register(registration), `case: ${JSON.stringify(data)}`).rejects.toMatchObject({ status: 502, code: 'INVALID_AUTH_RESPONSE' })
    }
  })

  it("recognizes registration statuses without authenticating inactive accounts", async () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const) {
      server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({ ...wireRegisteredUser, status })))
      expect(await register(registration), `case: ${JSON.stringify(status)}`).toMatchObject({ status })
    }
  })
})

describe('login', () => {
  it('posts only email and password, excluding rememberMe', async () => {
    const response = wireLoginResponse()
    let body: unknown
    server.use(http.post(identityApiUrl('/auth/login'), async ({ request }) => {
      body = await request.json()
      return HttpResponse.json(response)
    }))
    expect(await login({ ...credentials, rememberMe: true } as typeof credentials)).toEqual(loginResponse({ accessToken: response.access_token }))
    expect(body).toEqual(credentials)
  })

  it("validates login envelope and endpoint-specific fields", async () => {
    for (const overrides of [
      { access_token: '' }, { access_token: 'not-a-jwt' }, { access_token: 'a.b.c' },
      { token_type: 'bearer' }, { token_type: 'Basic' }, { expires_in: 0 }, { expires_in: -1 },
      { expires_in: '3600' }, { expires_in: null }, { user: { ...wireIdentity, user_id: '' } },
      { user: { ...wireIdentity, email: null } }, { user: { ...wireIdentity, full_name: ' ' } },
      { user: { ...wireIdentity, status: 'INACTIVE' } }, { user: { ...wireIdentity, status: ['ACTIVE'] } },
      { user: null }, { user: [] }, { user: undefined },
    ] as const) {
      server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ ...wireLoginResponse(), ...overrides })))
      await expect(login(credentials), `case: ${JSON.stringify(overrides)}`).rejects.toMatchObject({ status: 502, code: 'INVALID_AUTH_RESPONSE' })
    }

    for (const sample of [null, [], 'OK', {}, loginResponse(), { ...wireLoginResponse(), ...wireIdentity, user: undefined }].map(data => ({ data }))) {
      const { data } = sample
      server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(data)))
      await expect(login(credentials), `case: ${JSON.stringify(sample)}`).rejects.toBeInstanceOf(ApiError)
    }
  })

  it('rejects an expired JWT even if expiresIn is positive', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(wireLoginResponse({ access_token: expiredToken() }))))
    await expect(login(credentials)).rejects.toMatchObject({ code: 'INVALID_AUTH_RESPONSE' })
  })
})

describe('getCurrentUser', () => {
  it("scopes the explicit verification token and excludes global roles", async () => {
    {
      const token = validToken()
      let authorization: string | null = null
      server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json({ ...wireCurrentUser, role: 'TUTOR' })
      }))
      expect(await getCurrentUser(token)).toEqual({ ...validUser, profile: null })
      expect(authorization).toBe(`Bearer ${token}`)
    }
    {
      const authorizations: (string | null)[] = []
      server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
        authorizations.push(request.headers.get('authorization'))
        return HttpResponse.json(wireIdentity)
      }))
      const token = validToken()
      await getCurrentUser(token)
      expect(await getCurrentUser()).toEqual(validUser)
      expect(authorizations).toEqual([`Bearer ${token}`, null])
    }
  })

  it("validates the current-user response schema", async () => {
    for (const data of [null, [], {}, validUser, { id: validUser.userId, email: validUser.email, fullName: validUser.fullName, status: 'ACTIVE' }, { ...wireCurrentUser, status: 'UNKNOWN' }, { ...wireCurrentUser, user_id: null }, { ...wireCurrentUser, profile: [] }] as const) {
      server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(data)))
      await expect(getCurrentUser(), `case: ${JSON.stringify(data)}`).rejects.toMatchObject({ code: 'INVALID_AUTH_RESPONSE' })
    }
  })
})

describe('authentication failures', () => {
  it('never forwards login or registration credentials through redirects', async () => {
    for (const [endpoint, request] of [
      ['/auth/login', () => login(credentials)],
      ['/auth/register', () => register(registration)],
    ] as const) {
      let leaked = false
      server.use(
        http.post(identityApiUrl(endpoint), () => new HttpResponse(null, {
          status: 307, headers: { Location: 'https://outside.example/collect' },
        })),
        http.post('https://outside.example/collect', () => {
          leaked = true
          return HttpResponse.json(wireLoginResponse())
        }),
      )
      await expect(request(), endpoint).rejects.toThrow()
      expect(leaked, endpoint).toBe(false)
    }
  })

  it("rejects every non-ACTIVE status at login and current-user boundaries", async () => {
    for (const status of ['SUSPENDED', 'DEACTIVATED'] as const) {
      server.use(
        http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(wireLoginResponse({ user: { ...wireIdentity, status } }))),
        http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireCurrentUser, status })),
      )
      await expect(login(credentials), `case: ${JSON.stringify(status)}`).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' })
      await expect(getCurrentUser(), `case: ${JSON.stringify(status)}`).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' })
    }
  })

  it("normalizes HTTP failures with the registration endpoint context", async () => {
    {
      const envelope = errorEnvelope({ validationErrors: { password: 'Too short' } })
      server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(envelope, { status: 400 })))
      await expect(register(registration)).rejects.toMatchObject(envelope)
    }

    server.use(http.post(identityApiUrl('/auth/register'), () => new HttpResponse(null, { status: 409 })))
    await expect(register(registration)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_EMAIL' })
  })

  it("forwards AbortSignal through all three API methods", async () => {
    for (const sample of [
      ['login', (signal: AbortSignal) => login(credentials, signal)],
      ['register', (signal: AbortSignal) => register(registration, signal)],
      ['getCurrentUser', (signal: AbortSignal) => getCurrentUser(undefined, signal)],
    ] as const) {
      const [name, request] = sample
      const controller = new AbortController()
      controller.abort()
      await expect(request(controller.signal), name).rejects.toMatchObject({ status: 0, error: 'Request Aborted' })
    }
  })
})
