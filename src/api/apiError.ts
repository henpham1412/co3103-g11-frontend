import axios from 'axios'
import type { ApiErrorResponse, ApiFieldError } from '@/types/auth'
import { isNonEmptyString, isRecord } from '@/utils/authValidation'

export class ApiError extends Error implements ApiErrorResponse {
  readonly status: number
  readonly error: string
  readonly code?: string
  readonly timestamp: string
  readonly path: string
  readonly lockedUntil?: string
  readonly validationErrors?: Record<string, string>
  readonly errors?: ApiFieldError[]

  constructor(details: ApiErrorResponse) {
    super(details.message)
    this.name = 'ApiError'
    this.status = details.status
    this.error = details.error
    this.code = details.code
    this.timestamp = details.timestamp
    this.path = details.path
    this.lockedUntil = details.lockedUntil
    this.validationErrors = details.validationErrors
    this.errors = details.errors
  }
}

const fallbackErrors: Record<number, [string, string]> = {
  400: ['Bad Request', 'The request is invalid. Please check your input.'],
  401: ['Unauthorized', 'Authentication is required.'],
  403: ['Forbidden', 'Your account is inactive or access is denied.'],
  409: ['Conflict', 'The request conflicts with existing data.'],
  423: ['Locked', 'Your account is temporarily locked. Please try again later.'],
}

export function normalizeApiError(error: unknown, endpoint?: string): ApiError {
  if (error instanceof ApiError) return error

  const isAxios = axios.isAxiosError(error)
  const path = endpoint ?? (isAxios ? error.config?.url : undefined) ?? ''
  const timestamp = new Date().toISOString()

  if (isAxios && error.response) {
    const { status } = error.response
    const data: Record<string, unknown> = isRecord(error.response.data) ? error.response.data : {}
    // Match the requested endpoint, not an untrusted path in the error body.
    const pathname = path.split(/[?#]/)[0].replace(/\/$/, '')
    const duplicateEmail = status === 409 && pathname.endsWith('/auth/register')
    const invalidCredentials = status === 401 && pathname.endsWith('/auth/login')
    const [fallbackError, fallbackMessage] = fallbackErrors[status]
      ?? ['Request Failed', 'The request failed. Please try again later.']
    const validationEntries = isRecord(data.validationErrors)
      ? Object.entries(data.validationErrors).filter((entry): entry is [string, string] => isNonEmptyString(entry[1]))
      : []
    const validationErrors = validationEntries.length ? Object.fromEntries(validationEntries) : undefined

    return new ApiError({
      status,
      error: isNonEmptyString(data.error) ? data.error : isNonEmptyString(data.title) ? data.title : fallbackError,
      message: isNonEmptyString(data.message) ? data.message
        : isNonEmptyString(data.detail) ? data.detail : invalidCredentials ? 'Invalid email or password'
          : duplicateEmail ? 'An account with this email already exists.' : fallbackMessage,
      code: isNonEmptyString(data.code) ? data.code : duplicateEmail ? 'DUPLICATE_EMAIL' : undefined,
      timestamp: isNonEmptyString(data.timestamp) ? data.timestamp : timestamp,
      path: isNonEmptyString(data.path) ? data.path : isNonEmptyString(data.instance) ? data.instance : path,
      lockedUntil: isNonEmptyString(data.lockedUntil) ? data.lockedUntil : undefined,
      validationErrors,
      errors: Array.isArray(data.errors) ? data.errors.filter((entry): entry is ApiFieldError =>
        isRecord(entry) && isNonEmptyString(entry.message)
        && (entry.field === undefined || entry.field === null || typeof entry.field === 'string'),
      ).map(({ field, message }) => ({ field, message })) : undefined,
    })
  }

  const code = isAxios ? error.code : undefined
  const errorName = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name)
    : ''
  const aborted = code === 'ERR_CANCELED' || axios.isCancel(error)
    || errorName === 'AbortError' || errorName === 'CanceledError'
  const timedOut = code === 'ETIMEDOUT'
    || (code === 'ECONNABORTED' && /timeout/i.test(isAxios ? error.message : ''))
  const networkError = code === 'ERR_NETWORK'
    || (error instanceof Error && error.message === 'Network Error')
    || (isAxios && !!error.request && code === undefined)

  return new ApiError({
    status: 0,
    error: aborted ? 'Request Aborted' : timedOut ? 'Request Timeout'
      : code === 'ECONNABORTED' ? 'Request Aborted' : networkError ? 'Network Error' : 'Unknown Error',
    message: aborted || code === 'ECONNABORTED' && !timedOut ? 'The request was canceled.'
      : timedOut ? 'The request timed out. Please try again.'
        : networkError ? 'Unable to reach the server. Please check your connection and try again.'
          : 'An unexpected error occurred. Please try again.',
    code,
    timestamp,
    path,
  })
}
