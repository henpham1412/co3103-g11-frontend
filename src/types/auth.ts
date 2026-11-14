export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'

export type LmsRole = 'ADMINISTRATOR' | 'TUTOR' | 'STUDENT'

export interface ForgotPasswordRequest { email: string }
export interface ResetPasswordRequest { token: string; newPassword: string }

export interface RegisterRequest {
  email: string
  password: string
  fullName: string
}

export interface AuthUser {
  userId: string
  email: string
  fullName: string
  status: UserStatus
}

export type RegisterResponse = AuthUser

export type LoginContext =
  | { clientId?: never; redirectUri?: never }
  | { clientId: string; redirectUri: string }

export type LoginRequest = {
  email: string
  password: string
} & LoginContext

export interface LoginResponse extends AuthUser {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  clientId?: string
}

export interface UserProfile {
  avatarUrl?: string | null
  bio?: string | null
  phoneNumber?: string | null
  dateOfBirth?: string | null
  locale?: string | null
  timezone?: string | null
}

export interface CurrentUserResponse extends AuthUser {
  profile?: UserProfile | null
}

export type LoginCredentials = LoginRequest
export type User = CurrentUserResponse

export interface ApiFieldError {
  field?: string | null
  message: string
}

export interface ApiErrorResponse {
  status: number
  error: string
  message: string
  timestamp: string
  path: string
  code?: string
  lockedUntil?: string
  details?: ApiFieldError[]
  validationErrors?: Record<string, string>
  errors?: ApiFieldError[]
}

export interface AuthSession {
  // Random public identifier for lifecycle messages; never derived from the token.
  sessionId: string
  accessToken: string
  tokenType: string
  userId: string
  email: string
  fullName: string
  status: UserStatus
  expiresAt: number
  rememberMe: boolean
  version: number
}
