import type {
  ApiErrorResponse,
  AuthSession,
  CurrentUserResponse,
  LoginResponse,
  RegisterResponse,
} from '@/types/auth'

// Synthetic JWTs for decoding tests only; these signatures are not verifiable.
export function createToken(claims: Record<string, unknown> = {}) {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.test-signature`
}

export function validToken(expiresInSeconds = 3600) {
  return createToken({ sub: validUser.userId, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
}

export function expiredToken() {
  return validToken(-60)
}

export const validUser: CurrentUserResponse = {
  userId: '1c5ebacf-5ea0-4d35-bab4-ac9167cfc5a7',
  email: 'student@example.com',
  fullName: 'Test Student',
  status: 'ACTIVE',
}

export const registeredUser: RegisterResponse = {
  ...validUser,
  createdAt: '2026-01-01T00:00:00.000Z',
}

export function loginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return { ...validUser, accessToken: validToken(), tokenType: 'Bearer', expiresIn: 3600, ...overrides }
}

export function authSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    sessionId: crypto.randomUUID(),
    ...validUser,
    accessToken: validToken(),
    tokenType: 'Bearer',
    expiresAt: Math.floor(Date.now() / 1000) * 1000 + 3600_000,
    rememberMe: false,
    version: 2,
    ...overrides,
  }
}

export function errorEnvelope(overrides: Partial<ApiErrorResponse> = {}): ApiErrorResponse {
  return {
    status: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    timestamp: '2026-01-01T00:00:00.000Z',
    path: '/api/v1/auth/register',
    ...overrides,
  }
}
