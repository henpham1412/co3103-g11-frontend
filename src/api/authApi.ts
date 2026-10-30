import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/types/auth'
import { isAuthUser, isNonEmptyString, isRecord } from '@/utils/authValidation'
import { calculateSessionExpiry } from '@/utils/sessionExpiry'
import { ApiError, normalizeApiError } from './apiError'
import { centralIdentityClient } from './centralIdentityClient'

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

function requireActiveUser(user: CurrentUserResponse, endpoint: string) {
  if (user.status !== 'ACTIVE') {
    throw new ApiError({
      status: 403,
      error: 'Forbidden',
      code: 'ACCOUNT_INACTIVE',
      message: 'Your account is not active.',
      timestamp: new Date().toISOString(),
      path: endpoint,
    })
  }
}

export async function register(payload: RegisterRequest, signal?: AbortSignal): Promise<RegisterResponse> {
  const endpoint = '/auth/register'
  try {
    const { email, password, fullName } = payload
    const { data } = await centralIdentityClient.post<unknown>(endpoint, { email, password, fullName }, { signal, skipAuth: true })
    if (!isRecord(data) || !isAuthUser(data) || !isNonEmptyString(data.createdAt)
      || !Number.isFinite(Date.parse(data.createdAt))) throw invalidResponse(endpoint)
    return {
      userId: data.userId, email: data.email, fullName: data.fullName,
      status: data.status, createdAt: data.createdAt,
    }
  } catch (error) {
    throw normalizeApiError(error, endpoint)
  }
}

export async function login(payload: LoginRequest, signal?: AbortSignal): Promise<LoginResponse> {
  const endpoint = '/auth/login'
  try {
    const { email, password } = payload
    const { data } = await centralIdentityClient.post<unknown>(endpoint, { email, password }, { signal, skipAuth: true })
    if (!isRecord(data) || !isAuthUser(data) || !isNonEmptyString(data.accessToken)
      || data.tokenType !== 'Bearer' || typeof data.expiresIn !== 'number'
      || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0
      || calculateSessionExpiry(data.accessToken, data.expiresIn) <= Date.now()) {
      throw invalidResponse(endpoint)
    }
    requireActiveUser(data, endpoint)
    return {
      accessToken: data.accessToken, tokenType: data.tokenType, expiresIn: data.expiresIn,
      userId: data.userId, email: data.email, fullName: data.fullName, status: data.status,
    }
  } catch (error) {
    throw normalizeApiError(error, endpoint)
  }
}

export async function getCurrentUser(token?: string, signal?: AbortSignal): Promise<CurrentUserResponse> {
  const endpoint = '/users/me'
  try {
    const { data } = await centralIdentityClient.get<unknown>(endpoint, {
      signal,
      ...(token === undefined ? {} : { authToken: token, headers: { Authorization: `Bearer ${token}` } }),
    })
    if (!isAuthUser(data)) throw invalidResponse(endpoint)
    requireActiveUser(data, endpoint)
    return {
      userId: data.userId, email: data.email, fullName: data.fullName, status: data.status,
      ...(data.role === undefined ? {} : { role: data.role }),
    }
  } catch (error) {
    throw normalizeApiError(error, endpoint)
  }
}

export const authApi = { register, login, getCurrentUser }
