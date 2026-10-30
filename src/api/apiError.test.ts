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
  it('preserves every DOC-05 field and the Error interface', () => {
    const envelope = errorEnvelope({ code: 'VALIDATION_ERROR', validationErrors: { email: 'Invalid email' } })
    const result = normalizeApiError(responseError(400, envelope), '/auth/register')
    expect(result).toBeInstanceOf(Error)
    expect(result).toBeInstanceOf(ApiError)
    expect(result).toMatchObject({ ...envelope, name: 'ApiError' })
  })

  it('is idempotent for already normalized errors', () => {
    const error = new ApiError(errorEnvelope())
    expect(normalizeApiError(error)).toBe(error)
  })

  it.each([
    [400, '/auth/register', 'Bad Request', 'The request is invalid. Please check your input.'],
    [401, '/auth/login', 'Unauthorized', 'Invalid email or password'],
    [401, '/users/me', 'Unauthorized', 'Authentication is required.'],
    [403, '/users/me', 'Forbidden', 'Your account is inactive or access is denied.'],
    [409, '/users/me', 'Conflict', 'The request conflicts with existing data.'],
    [423, '/auth/login', 'Locked', 'Your account is temporarily locked. Please try again later.'],
    [500, '/auth/login', 'Request Failed', 'The request failed. Please try again later.'],
  ])('provides a fallback for HTTP %s at %s', (status, endpoint, error, message) => {
    expect(normalizeApiError(responseError(status), endpoint)).toMatchObject({ status, error, message, path: endpoint })
  })

  it.each(['/auth/register', '/api/v1/auth/register', 'https://identity.example/api/v1/auth/register/?lang=en'])(
    'infers DUPLICATE_EMAIL only for registration: %s', endpoint => {
      expect(normalizeApiError(responseError(409, {}, endpoint)))
        .toMatchObject({ status: 409, code: 'DUPLICATE_EMAIL' })
    })

  it('does not infer DUPLICATE_EMAIL for an unrelated conflict or a spoofed envelope path', () => {
    expect(normalizeApiError(responseError(409, { path: '/auth/register' }, '/users/me')).code).toBeUndefined()
  })

  it('preserves a backend business code and message', () => {
    expect(normalizeApiError(responseError(409, { code: 'EMAIL_TAKEN', message: 'Email already registered' }), '/auth/register'))
      .toMatchObject({ code: 'EMAIL_TAKEN', message: 'Email already registered' })
  })

  it('preserves lockedUntil on a 423 response', () => {
    const lockedUntil = '2026-10-30T13:00:00.000Z'
    expect(normalizeApiError(responseError(423, { lockedUntil })))
      .toMatchObject({ status: 423, lockedUntil })
  })

  it('uses the actual HTTP status instead of a conflicting envelope status', () => {
    expect(normalizeApiError(responseError(403, { status: 200 })).status).toBe(403)
  })

  it.each([null, 'upstream error', [], { error: 3, message: {}, code: [], path: 4, timestamp: false }].map(data => ({ data })))(
    'handles a malformed envelope: $data', ({ data }) => {
      const result = normalizeApiError(responseError(401, data))
      expect(result).toMatchObject({ status: 401, message: 'Invalid email or password', path: '/auth/login' })
      expect(Number.isFinite(Date.parse(result.timestamp))).toBe(true)
    })

  it.each([[], 'email invalid', { email: ['invalid'] }, { email: null }].map(validationErrors => ({ validationErrors })))(
    'does not accept an invalid validationErrors map: $validationErrors', ({ validationErrors }) => {
      expect(normalizeApiError(responseError(400, { validationErrors })).validationErrors).toBeUndefined()
    })

  it('normalizes a network failure without inferring invalid credentials', () => {
    expect(normalizeApiError(new AxiosError('Network Error', 'ERR_NETWORK'), '/auth/login'))
      .toMatchObject({ status: 0, error: 'Network Error', code: 'ERR_NETWORK', path: '/auth/login' })
  })

  it.each(['ETIMEDOUT', 'ECONNABORTED'])('normalizes timeout %s', code => {
    expect(normalizeApiError(new AxiosError('timeout of 15000ms exceeded', code)))
      .toMatchObject({ status: 0, error: 'Request Timeout', message: 'The request timed out. Please try again.' })
  })

  it.each([
    new CanceledError('canceled'),
    new AxiosError('canceled', 'ERR_CANCELED'),
    new DOMException('Aborted', 'AbortError'),
    new AxiosError('Request aborted', 'ECONNABORTED'),
  ])('distinguishes cancellation from a timeout or credential error', error => {
    expect(normalizeApiError(error)).toMatchObject({ status: 0, error: 'Request Aborted', message: 'The request was canceled.' })
  })

  it.each([undefined, null, 'failure', new Error('private implementation detail'), new AxiosError('bad config', 'ERR_BAD_OPTION_VALUE')])(
    'handles unknown failures without leaking arbitrary exception messages: %s', error => {
      expect(normalizeApiError(error)).toMatchObject({ status: 0, error: 'Unknown Error', message: 'An unexpected error occurred. Please try again.' })
    })
})
