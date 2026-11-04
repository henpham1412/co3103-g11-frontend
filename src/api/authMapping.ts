import type { AuthUser, CurrentUserResponse, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, UserProfile } from '@/types/auth'
import type { AuthIdentityDto, LoginRequestDto, RegisterRequestDto, UserProfileDto } from '@/types/authWire'
import { calculateSessionExpiry } from '@/utils/sessionExpiry'
import { isNonEmptyString, isRecord, isUserStatus } from '@/utils/typeGuards'
import { isLmsLoginContext, loginConfigurationError } from '@/features/auth/utils/loginContext'
import { ApiError } from './apiError'

function invalidResponse(endpoint: string): ApiError {
  return new ApiError({
    status: 502,
    error: 'Invalid Response',
    code: 'INVALID_AUTH_RESPONSE',
    message: 'The authentication server returned an invalid response.',
    timestamp: new Date().toISOString(),
    path: endpoint,
  })
}

function isIdentityDto(value: unknown): value is AuthIdentityDto {
  return isRecord(value)
    && isNonEmptyString(value.user_id)
    && isNonEmptyString(value.email)
    && isNonEmptyString(value.full_name)
    && isUserStatus(value.status)
}

function decodeIdentity(value: AuthIdentityDto): AuthUser {
  return { userId: value.user_id, email: value.email, fullName: value.full_name, status: value.status }
}

function requireActiveUser(user: AuthUser, endpoint: string) {
  if (user.status !== 'ACTIVE') {
    throw new ApiError({
      status: 403,
      error: 'Forbidden',
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Your account is not active.',
      timestamp: new Date().toISOString(),
      path: endpoint,
    })
  }
}

function isProfileDto(value: unknown): value is UserProfileDto {
  return isRecord(value) && ['avatar_url', 'bio', 'phone_number', 'date_of_birth', 'locale', 'timezone']
    .every(key => value[key] === undefined || value[key] === null || typeof value[key] === 'string')
}

function decodeProfile(value: UserProfileDto): UserProfile {
  return {
    ...(value.avatar_url === undefined ? {} : { avatarUrl: value.avatar_url }),
    ...(value.bio === undefined ? {} : { bio: value.bio }),
    ...(value.phone_number === undefined ? {} : { phoneNumber: value.phone_number }),
    ...(value.date_of_birth === undefined ? {} : { dateOfBirth: value.date_of_birth }),
    ...(value.locale === undefined ? {} : { locale: value.locale }),
    ...(value.timezone === undefined ? {} : { timezone: value.timezone }),
  }
}

export function serializeRegisterRequest({ email, password, fullName }: RegisterRequest): RegisterRequestDto {
  return { email, password, full_name: fullName }
}

export function serializeLoginRequest(payload: LoginRequest): LoginRequestDto {
  if (!isRecord(payload) || !isNonEmptyString(payload.email) || !isNonEmptyString(payload.password)) {
    throw loginConfigurationError()
  }
  const { email, password } = payload
  if (!('clientId' in payload) && !('redirectUri' in payload)) return { email, password }
  if (!isLmsLoginContext(payload)) throw loginConfigurationError()
  return { email, password, client_id: payload.clientId, redirect_uri: payload.redirectUri }
}

export function decodeRegisterResponse(data: unknown): RegisterResponse {
  if (!isRecord(data) || !isIdentityDto(data)
    || (data.message !== undefined && typeof data.message !== 'string')) {
    throw invalidResponse('/auth/register')
  }
  return decodeIdentity(data)
}

export function decodeLoginResponse(data: unknown, expectedClientId?: string): LoginResponse {
  const endpoint = '/auth/login'
  if (!isRecord(data) || !isIdentityDto(data.user) || !isNonEmptyString(data.access_token)
    || data.token_type !== 'Bearer' || typeof data.expires_in !== 'number'
    || !Number.isFinite(data.expires_in) || data.expires_in <= 0
    || calculateSessionExpiry(data.access_token, data.expires_in) <= Date.now()
    || (data.client_id !== undefined && !isNonEmptyString(data.client_id))
    || (expectedClientId !== undefined && data.client_id !== expectedClientId)) {
    throw invalidResponse(endpoint)
  }
  const user = decodeIdentity(data.user)
  requireActiveUser(user, endpoint)
  return {
    ...user, accessToken: data.access_token, tokenType: data.token_type, expiresIn: data.expires_in,
    ...(data.client_id === undefined ? {} : { clientId: data.client_id }),
  }
}

export function decodeCurrentUserResponse(data: unknown): CurrentUserResponse {
  const endpoint = '/users/me'
  if (!isRecord(data) || !isIdentityDto(data)
    || (data.profile !== undefined && data.profile !== null && !isProfileDto(data.profile))) {
    throw invalidResponse(endpoint)
  }
  const user = decodeIdentity(data)
  requireActiveUser(user, endpoint)
  return {
    ...user,
    ...(data.profile === undefined ? {} : { profile: data.profile === null ? null : decodeProfile(data.profile) }),
  }
}
