import { AxiosError, AxiosHeaders, CanceledError } from 'axios'
import { describe, expect, it } from 'vitest'
import { errorEnvelope } from '@/test/fixtures/auth'
import { ApiError, normalizeApiError } from './apiError'

function responseError(status: number, data: unknown = {}, url = '/auth/login') {
  const config = { headers: new AxiosHeaders(), url }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
    status, data, config, statusText: '', headers: {},
  })
}

describe('normalizeApiError', () => {
  it("keeps valid validation siblings and rejects malformed maps and arrays", () => {
    expect(normalizeApiError(responseError(400, {
      validationErrors: {
        email: 'Invalid email format', fullName: null, password: ['bad'], confirmPassword: ' ',
      }
    })).validationErrors).toEqual({ email: 'Invalid email format' })

    {
      const errors = [
        { field: 'email', message: 'Email is taken' },
        { field: 'password', message: 'Password rejected' },
        { field: 'password', message: 'Another password error' },
        { field: null, message: 'Registration is closed' },
        { message: 'Contact your administrator' },
      ]
      expect(normalizeApiError(responseError(400, { errors }))).toMatchObject({ errors })
    }
    {
      const errors = [null, 'bad', {}, { field: {}, message: 'bad' }, { message: 42 }, { message: ' ' },
        { field: 'email', message: 'Valid error', ignored: 'private' }]
      expect(normalizeApiError(responseError(400, { errors })).errors).toEqual([{ field: 'email', message: 'Valid error' }])
    }

    for (const errors of [null, {}, 'invalid'] as const) {
      expect(normalizeApiError(responseError(400, { errors })).errors, `case: ${JSON.stringify(errors)}`).toBeUndefined()
    }

    for (const sample of [[], 'email invalid', { email: ['invalid'] }, { email: null }].map(validationErrors => ({ validationErrors }))) {
      const { validationErrors } = sample
      expect(normalizeApiError(responseError(400, { validationErrors })).validationErrors, `case: ${JSON.stringify(sample)}`).toBeUndefined()
    }
  })

  it("maps RFC fields with DOC-05 precedence and trusts only HTTP status", () => {
    {
      const result = normalizeApiError(responseError(423, {
        status: 200, title: 'Account locked', detail: 'Try again in 15 minutes.',
        instance: '/api/v1/auth/login', code: 'ACCOUNT_LOCKED',
        lockedUntil: '2026-10-30T13:00:00Z',
      }))
      expect(result).toMatchObject({
        status: 423, error: 'Account locked', message: 'Try again in 15 minutes.',
        path: '/api/v1/auth/login', code: 'ACCOUNT_LOCKED', lockedUntil: '2026-10-30T13:00:00Z',
      })
    }

    expect(normalizeApiError(responseError(400, {
      error: 'Bad Request', message: 'Invalid email', path: '/auth/register',
      title: 'Other title', detail: 'Other detail', instance: '/other',
    }))).toMatchObject({ error: 'Bad Request', message: 'Invalid email', path: '/auth/register' })

    expect(normalizeApiError(responseError(403, { status: 200 })).status).toBe(403)
  })

  it("preserves DOC-05 fields, Error semantics and normalization idempotence", () => {
    {
      const envelope = errorEnvelope({ code: 'VALIDATION_ERROR', validationErrors: { email: 'Invalid email' } })
      const result = normalizeApiError(responseError(400, envelope), '/auth/register')
      expect(result).toBeInstanceOf(Error)
      expect(result).toBeInstanceOf(ApiError)
      expect(result).toMatchObject({ ...envelope, name: 'ApiError' })
    }
    {
      const error = new ApiError(errorEnvelope())
      expect(normalizeApiError(error)).toBe(error)
    }
  })

  it("provides safe fallbacks by HTTP status and endpoint", () => {
    for (const sample of [
      [400, '/auth/register', 'Bad Request', 'The request is invalid. Please check your input.'],
      [401, '/auth/login', 'Unauthorized', 'Invalid email or password'],
      [401, '/users/me', 'Unauthorized', 'Authentication is required.'],
      [403, '/users/me', 'Forbidden', 'Your account is inactive or access is denied.'],
      [409, '/users/me', 'Conflict', 'The request conflicts with existing data.'],
      [423, '/auth/login', 'Locked', 'Your account is temporarily locked. Please try again later.'],
      [500, '/auth/login', 'Request Failed', 'The request failed. Please try again later.'],
    ] as const) {
      const [status, endpoint, error, message] = sample
      expect(normalizeApiError(responseError(status), endpoint), `case: ${JSON.stringify(sample)}`).toMatchObject({ status, error, message, path: endpoint })
    }
  })

  it("infers duplicate email only from the registration endpoint, never envelope paths", () => {
    for (const endpoint of ['/auth/register', '/api/v1/auth/register', 'https://identity.example/api/v1/auth/register/?lang=en'] as const) {
      expect(normalizeApiError(responseError(409, {}, endpoint)), `case: ${JSON.stringify(endpoint)}`)
        .toMatchObject({ status: 409, code: 'DUPLICATE_EMAIL' })
    }

    expect(normalizeApiError(responseError(409, { path: '/auth/register' }, '/users/me')).code).toBeUndefined()
  })

  it("preserves business codes and lock metadata", () => {
    expect(normalizeApiError(responseError(409, { code: 'EMAIL_TAKEN', message: 'Email already registered' }), '/auth/register'))
      .toMatchObject({ code: 'EMAIL_TAKEN', message: 'Email already registered' })

    {
      const lockedUntil = '2026-10-30T13:00:00.000Z'
      expect(normalizeApiError(responseError(423, { lockedUntil })))
        .toMatchObject({ status: 423, lockedUntil })
    }
  })

  it("handles malformed and unknown failures without leaking exception messages", () => {
    for (const sample of [null, 'upstream error', [], { error: 3, message: {}, code: [], path: 4, timestamp: false }].map(data => ({ data }))) {
      const { data } = sample
      const result = normalizeApiError(responseError(401, data))
      expect(result, `case: ${JSON.stringify(sample)}`).toMatchObject({ status: 401, message: 'Invalid email or password', path: '/auth/login' })
      expect(Number.isFinite(Date.parse(result.timestamp)), `case: ${JSON.stringify(sample)}`).toBe(true)
    }

    for (const error of [undefined, null, 'failure', new Error('private implementation detail'), new AxiosError('bad config', 'ERR_BAD_OPTION_VALUE')] as const) {
      expect(normalizeApiError(error), `case: ${JSON.stringify(error)}`).toMatchObject({ status: 0, error: 'Unknown Error', message: 'An unexpected error occurred. Please try again.' })
    }
  })

  it("distinguishes network failures, timeouts and cancellation", () => {
    expect(normalizeApiError(new AxiosError('Network Error', 'ERR_NETWORK'), '/auth/login'))
      .toMatchObject({ status: 0, error: 'Network Error', code: 'ERR_NETWORK', path: '/auth/login' })

    for (const code of ['ETIMEDOUT', 'ECONNABORTED'] as const) {
      expect(normalizeApiError(new AxiosError('timeout of 15000ms exceeded', code)), `case: ${JSON.stringify(code)}`)
        .toMatchObject({ status: 0, error: 'Request Timeout', message: 'The request timed out. Please try again.' })
    }

    for (const error of [
      new CanceledError('canceled'),
      new AxiosError('canceled', 'ERR_CANCELED'),
      new DOMException('Aborted', 'AbortError'),
      new AxiosError('Request aborted', 'ECONNABORTED'),
    ] as const) {
      expect(normalizeApiError(error), `case: ${JSON.stringify(error)}`).toMatchObject({ status: 0, error: 'Request Aborted', message: 'The request was canceled.' })
    }
  })
})
