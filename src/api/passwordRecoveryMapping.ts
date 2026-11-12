import type { ForgotPasswordRequest, ResetPasswordRequest } from '@/types/auth'
import type { ForgotPasswordRequestDto, ResetPasswordRequestDto } from '@/types/authWire'
import { validateResetPassword, validateResetToken } from '@/features/auth/utils/passwordRecoveryValidation'
import { ApiError } from './apiError'

export function serializeForgotPassword({ email }: ForgotPasswordRequest): ForgotPasswordRequestDto {
  return { email }
}

export function serializeResetPassword({ token, newPassword }: ResetPasswordRequest): ResetPasswordRequestDto {
  if (typeof token !== 'string' || typeof newPassword !== 'string' || validateResetToken(token) || validateResetPassword(newPassword)) {
    throw new ApiError({
      status: 400, code: 'INVALID_RESET_PASSWORD_REQUEST', error: 'Invalid Reset Password Request',
      message: 'Please check your reset token and new password.',
      timestamp: new Date().toISOString(), path: '/auth/reset-password',
    })
  }
  return { token, new_password: newPassword }
}
