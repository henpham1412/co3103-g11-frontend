import type { CurrentUserResponse } from '@/types/auth'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isAuthUser(value: unknown): value is CurrentUserResponse {
  return isRecord(value)
    && isNonEmptyString(value.userId)
    && isNonEmptyString(value.email)
    && isNonEmptyString(value.fullName)
    && typeof value.status === 'string'
    && ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(value.status)
    && (value.role === undefined || typeof value.role === 'string')
}
