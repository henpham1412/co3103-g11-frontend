import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { errorEnvelope, expiredToken, loginResponse, registeredUser, validToken, validUser } from '@/test/fixtures/auth'
import { identityApiUrl, server } from '@/test/server'
import { ApiError } from './apiError'
import { getCurrentUser, login, register } from './authApi'

const credentials = { email: validUser.email, password: 'Test-password-123!' }
const registration = { ...credentials, fullName: validUser.fullName }

describe('register', () => {
  it('posts to /auth/register and returns the registration contract', async () => {
    expect(await register(registration)).toEqual(registeredUser)
  })

  it('sends only the API fields, excluding confirmPassword', async () => {
    let body: unknown
    server.use(http.post(identityApiUrl('/auth/register'), async ({ request }) => {
      body = await request.json()
      expect(request.headers.get('content-type')).toContain('application/json')
      expect(request.headers.get('accept')).toContain('application/json')
      return HttpResponse.json(registeredUser, { status: 201 })
    }))
    await register({ ...registration, confirmPassword: credentials.password } as typeof registration)
    expect(body).toEqual(registration)
  })

  it.each([
    null, {}, { ...registeredUser, userId: '' }, { ...registeredUser, email: 1 },
    { ...registeredUser, fullName: null }, { ...registeredUser, status: 'UNKNOWN' },
    { ...registeredUser, createdAt: 'yesterday' }, { ...registeredUser, createdAt: null },
  ])('rejects a malformed registration response: %j', async data => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(data)))
    await expect(register(registration)).rejects.toMatchObject({ status: 502, code: 'INVALID_AUTH_RESPONSE' })
  })

  it.each(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DEACTIVATED'])(
    'recognizes the registration status %s without creating a session', async status => {
      server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({ ...registeredUser, status })))
      expect(await register(registration)).toMatchObject({ status })
    })
})

describe('login', () => {
  it('posts only email and password, excluding rememberMe', async () => {
    const response = loginResponse()
    let body: unknown
    server.use(http.post(identityApiUrl('/auth/login'), async ({ request }) => {
      body = await request.json()
      return HttpResponse.json(response)
    }))
    expect(await login({ ...credentials, rememberMe: true } as typeof credentials)).toEqual(response)
    expect(body).toEqual(credentials)
  })

  it('supports the default MSW login handler', async () => {
    expect(await login(credentials)).toMatchObject({ ...validUser, tokenType: 'Bearer', expiresIn: 3600 })
  })

  it.each([
    { accessToken: '' }, { accessToken: 'not-a-jwt' }, { accessToken: 'a.b.c' },
    { tokenType: 'bearer' }, { tokenType: 'Basic' }, { expiresIn: 0 }, { expiresIn: -1 },
    { expiresIn: '3600' }, { expiresIn: null }, { userId: '' }, { email: null },
    { fullName: ' ' }, { status: 'UNKNOWN' }, { status: ['ACTIVE'] },
  ])('rejects invalid login fields: %j', async overrides => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ ...loginResponse(), ...overrides })))
    await expect(login(credentials)).rejects.toMatchObject({ status: 502, code: 'INVALID_AUTH_RESPONSE' })
  })

  it('rejects an expired JWT even if expiresIn is positive', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(loginResponse({ accessToken: expiredToken() }))))
    await expect(login(credentials)).rejects.toMatchObject({ code: 'INVALID_AUTH_RESPONSE' })
  })

  it.each([null, [], 'OK', {}].map(data => ({ data })))('rejects a malformed login body: $data', async ({ data }) => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(data)))
    await expect(login(credentials)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('getCurrentUser', () => {
  it('sends an explicit Bearer token to /users/me and preserves the optional role', async () => {
    const token = validToken()
    let authorization: string | null = null
    server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
      authorization = request.headers.get('authorization')
      return HttpResponse.json({ ...validUser, role: 'TUTOR' })
    }))
    expect(await getCurrentUser(token)).toEqual({ ...validUser, role: 'TUTOR' })
    expect(authorization).toBe(`Bearer ${token}`)
  })

  it('does not retain the explicit token on subsequent calls', async () => {
    const authorizations: (string | null)[] = []
    server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
      authorizations.push(request.headers.get('authorization'))
      return HttpResponse.json(validUser)
    }))
    const token = validToken()
    await getCurrentUser(token)
    expect(await getCurrentUser()).toEqual(validUser)
    expect(authorizations).toEqual([`Bearer ${token}`, null])
  })

  it.each([null, {}, { ...validUser, role: 42 }, { ...validUser, status: 'UNKNOWN' }, { ...validUser, userId: null }])(
    'rejects a malformed current-user response: %j', async data => {
      server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(data)))
      await expect(getCurrentUser()).rejects.toMatchObject({ code: 'INVALID_AUTH_RESPONSE' })
    })
})

describe('authentication failures', () => {
  it.each(['INACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const)(
    'rejects %s accounts from login and /users/me', async status => {
      server.use(
        http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(loginResponse({ status }))),
        http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...validUser, status })),
      )
      await expect(login(credentials)).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_INACTIVE' })
      await expect(getCurrentUser()).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_INACTIVE' })
    })

  it('normalizes registration validation errors', async () => {
    const envelope = errorEnvelope({ validationErrors: { password: 'Too short' } })
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(envelope, { status: 400 })))
    await expect(register(registration)).rejects.toMatchObject(envelope)
  })

  it('normalizes a legacy duplicate-email conflict', async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => new HttpResponse(null, { status: 409 })))
    await expect(register(registration)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_EMAIL' })
  })

  it('normalizes invalid credentials without a backend envelope', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => new HttpResponse(null, { status: 401 })))
    await expect(login(credentials)).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' })
  })

  it('preserves lockedUntil and the business code', async () => {
    const envelope = errorEnvelope({ status: 423, error: 'Locked', code: 'ACCOUNT_LOCKED', message: 'Try again later', lockedUntil: '2026-10-30T17:00:00Z' })
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(envelope, { status: 423 })))
    await expect(login(credentials)).rejects.toMatchObject(envelope)
  })

  it('normalizes an unauthorized current-user request', async () => {
    server.use(http.get(identityApiUrl('/users/me'), () => new HttpResponse(null, { status: 401 })))
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401, path: '/users/me' })
  })

  it('reports transport failures as network errors, not invalid credentials', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.error()))
    await expect(login(credentials)).rejects.toMatchObject({ status: 0, error: 'Network Error' })
  })

  it.each([
    ['login', (signal: AbortSignal) => login(credentials, signal)],
    ['register', (signal: AbortSignal) => register(registration, signal)],
    ['getCurrentUser', (signal: AbortSignal) => getCurrentUser(undefined, signal)],
  ] as const)('forwards AbortSignal for %s', async (_name, request) => {
    const controller = new AbortController()
    controller.abort()
    await expect(request(controller.signal)).rejects.toMatchObject({ status: 0, error: 'Request Aborted' })
  })
})
