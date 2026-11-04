import { ApiError } from '@/api/apiError'
import type { LoginContext } from '@/types/auth'
import { isRecord } from '@/utils/typeGuards'

export function loginConfigurationError(): ApiError {
  return new ApiError({
    status: 400,
    error: 'Invalid Configuration',
    code: 'INVALID_LOGIN_CONFIGURATION',
    message: 'Sign-in is not configured correctly. Please contact your G11 System Administrator.',
    timestamp: new Date().toISOString(),
    path: '/auth/login',
  })
}

export function isLmsLoginContext(value: unknown): value is { clientId: string; redirectUri: string } {
  if (!isRecord(value) || typeof value.clientId !== 'string' || !value.clientId.length
    || value.clientId.length > 100 || /[\s\p{Cc}]/u.test(value.clientId)
    || typeof value.redirectUri !== 'string' || !/^https?:\/\//i.test(value.redirectUri)
    || /[\s\p{Cc}\\]/u.test(value.redirectUri)) return false
  try {
    const url = new URL(value.redirectUri)
    // Parsing validates the URI; serialization must retain its registered spelling.
    const authority = value.redirectUri.split('/')[2]
    return !!authority && !!url.hostname && !url.username && !url.password && !authority.includes('@')
  } catch {
    return false
  }
}

export function resolveLoginContext(
  env: Pick<ImportMetaEnv, 'VITE_AUTH_MODE' | 'VITE_LMS_CLIENT_ID' | 'VITE_LMS_REDIRECT_URI'> = import.meta.env,
): { ok: true; context: LoginContext } | { ok: false; error: ApiError } {
  const mode = env.VITE_AUTH_MODE ?? 'lms'
  const clientId = env.VITE_LMS_CLIENT_ID
  const redirectUri = env.VITE_LMS_REDIRECT_URI
  if (mode === 'standalone' && (clientId === undefined || clientId === '')
    && (redirectUri === undefined || redirectUri === '')) return { ok: true, context: {} }
  const context = { clientId, redirectUri }
  if (mode === 'lms' && isLmsLoginContext(context)) return { ok: true, context }
  return { ok: false, error: loginConfigurationError() }
}
