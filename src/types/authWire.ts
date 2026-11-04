import type { UserStatus } from './auth'

export interface ForgotPasswordRequestDto { email: string }
export interface ResetPasswordRequestDto { token: string; new_password: string }

// Central Identity HTTP contracts. UI and persisted sessions use auth.ts models.
export interface AuthIdentityDto {
  user_id: string
  email: string
  full_name: string
  status: UserStatus
}

export interface RegisterRequestDto {
  email: string
  password: string
  full_name: string
}

export interface RegisterResponseDto extends AuthIdentityDto {
  message?: string
}

export type LoginRequestDto = {
  email: string
  password: string
} & (
  | { client_id?: never; redirect_uri?: never }
  | { client_id: string; redirect_uri: string }
)

export interface ValidationDetailDto {
  field?: string | null
  message: string
}

export interface ApiErrorDto {
  code: string
  message: string
  details?: ValidationDetailDto[]
  locked_until?: string
}

export interface LoginResponseDto {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  user: AuthIdentityDto
  client_id?: string
}

export interface UserProfileDto {
  avatar_url?: string | null
  bio?: string | null
  phone_number?: string | null
  date_of_birth?: string | null
  locale?: string | null
  timezone?: string | null
}

export interface CurrentUserResponseDto extends AuthIdentityDto {
  profile?: UserProfileDto | null
}
