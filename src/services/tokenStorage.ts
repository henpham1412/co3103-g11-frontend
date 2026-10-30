import type { AuthSession } from '@/types/auth'
import { isAuthUser, isNonEmptyString, isRecord } from '@/utils/authValidation'
import { calculateSessionExpiry } from '@/utils/sessionExpiry'

export const AUTH_SESSION_KEY = 'co3103.auth.session'
export const AUTH_SESSION_VERSION = 1

type StorageName = 'localStorage' | 'sessionStorage'

function validatedSession(value: unknown): AuthSession | null {
  if (!isRecord(value) || !isAuthUser(value) || value.status !== 'ACTIVE'
    || !isNonEmptyString(value.accessToken) || value.tokenType !== 'Bearer'
    || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)
    || typeof value.rememberMe !== 'boolean' || value.version !== AUTH_SESSION_VERSION) return null

  const now = Date.now()
  // expiresAt is already an absolute deadline. Never renew it on reads.
  const expiresAt = Math.min(value.expiresAt, calculateSessionExpiry(
    value.accessToken, (value.expiresAt - now) / 1000, value.rememberMe,
  ))
  if (expiresAt <= now) return null
  return {
    accessToken: value.accessToken, tokenType: value.tokenType,
    userId: value.userId, email: value.email, fullName: value.fullName, status: value.status,
    expiresAt, rememberMe: value.rememberMe, version: AUTH_SESSION_VERSION,
  }
}

function removeSession(storage: StorageName): boolean {
  try {
    window[storage].removeItem(AUTH_SESSION_KEY)
    return true
  } catch {
    return false
  }
}

export function clearSession(): boolean {
  // Attempt both removals even if one storage is unavailable.
  const localCleared = removeSession('localStorage')
  const sessionCleared = removeSession('sessionStorage')
  return localCleared && sessionCleared
}

export function saveSession(session: AuthSession): boolean {
  const validSession = validatedSession(session)
  const cleared = clearSession()
  if (!validSession || !cleared) return false
  try {
    const storage = validSession.rememberMe ? window.localStorage : window.sessionStorage
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(validSession))
    return true
  } catch {
    return false
  }
}

function readSession(storage: StorageName): AuthSession | null {
  try {
    const raw = window[storage].getItem(AUTH_SESSION_KEY)
    if (raw === null) return null
    const stored: unknown = JSON.parse(raw)
    const session = validatedSession(stored)
    // A stored deadline outside the token/cap bounds is invalid, not renewable.
    if (session && isRecord(stored) && session.expiresAt === stored.expiresAt
      && session.rememberMe === (storage === 'localStorage')) return session
  } catch {
    // Corrupt JSON and blocked storage both behave as an absent session.
  }
  removeSession(storage)
  return null
}

export function getSession(): AuthSession | null {
  const session = readSession('sessionStorage')
  const persistent = readSession('localStorage')
  // Prefer this tab's explicit session if stale data exists in both stores.
  if (session && persistent && !removeSession('localStorage')) return null
  return session ?? persistent
}

export const tokenStorage = { saveSession, getSession, clearSession }
