import type { ForgotPasswordRequest, ResetPasswordRequest } from '@/types/auth'
import { normalizeApiError } from './apiError'
import { centralIdentityClient } from './centralIdentityClient'
import { serializeForgotPassword, serializeResetPassword } from './passwordRecoveryMapping'

async function forgotPassword(payload: ForgotPasswordRequest, signal?: AbortSignal): Promise<void> {
  const endpoint = '/auth/forgot-password'
  try {
    await centralIdentityClient.post(endpoint, serializeForgotPassword(payload), { skipAuth: true, signal })
  } catch (error) { throw normalizeApiError(error, endpoint) }
}

async function resetPassword(payload: ResetPasswordRequest, signal?: AbortSignal): Promise<void> {
  const endpoint = '/auth/reset-password'
  try {
    await centralIdentityClient.post(endpoint, serializeResetPassword(payload), { skipAuth: true, signal })
  } catch (error) { throw normalizeApiError(error, endpoint) }
}

export const passwordRecoveryApi = { forgotPassword, resetPassword }
