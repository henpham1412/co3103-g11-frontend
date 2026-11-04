import type { ForgotPasswordRequest, ResetPasswordRequest } from '@/types/auth'
import type { ForgotPasswordRequestDto, ResetPasswordRequestDto } from '@/types/authWire'

export function serializeForgotPassword({ email }: ForgotPasswordRequest): ForgotPasswordRequestDto {
  return { email }
}

export function serializeResetPassword({ token, newPassword }: ResetPasswordRequest): ResetPasswordRequestDto {
  return { token, new_password: newPassword }
}
