import type { AuthUser, UserStatus } from '@/types/auth'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isUserStatus(value: unknown): value is UserStatus {
  return value === 'ACTIVE' || value === 'SUSPENDED' || value === 'DEACTIVATED'
}

// Internal identity/storage only. HTTP responses are decoded in authMapping.ts.
export function isAuthUser(value: unknown): value is AuthUser {
  return isRecord(value)
    && isNonEmptyString(value.userId)
    && isNonEmptyString(value.email)
    && isNonEmptyString(value.fullName)
    && isUserStatus(value.status)
}
