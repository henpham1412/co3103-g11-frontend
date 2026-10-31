import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/types/auth'
import { normalizeApiError } from './apiError'
import { decodeCurrentUserResponse, decodeLoginResponse, decodeRegisterResponse, serializeLoginRequest, serializeRegisterRequest } from './authMapping'
import { centralIdentityClient } from './centralIdentityClient'

export async function register(payload: RegisterRequest, signal?: AbortSignal): Promise<RegisterResponse> {
  const endpoint = '/auth/register'
  try {
    const { data } = await centralIdentityClient.post<unknown>(endpoint, serializeRegisterRequest(payload), { signal, skipAuth: true })
    return decodeRegisterResponse(data)
  } catch (error) {
    throw normalizeApiError(error, endpoint)
  }
}

export async function login(payload: LoginRequest, signal?: AbortSignal): Promise<LoginResponse> {
  const endpoint = '/auth/login'
  try {
    const request = serializeLoginRequest(payload)
    const { data } = await centralIdentityClient.post<unknown>(endpoint, request, { signal, skipAuth: true })
    return decodeLoginResponse(data, request.client_id)
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
    return decodeCurrentUserResponse(data)
  } catch (error) {
    throw normalizeApiError(error, endpoint)
  }
}

export const authApi = { register, login, getCurrentUser }
