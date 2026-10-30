export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DEACTIVATED'

export type LmsRole = 'ADMINISTRATOR' | 'TUTOR' | 'STUDENT'

export interface RegisterRequest {
  email: string
  password: string
  fullName: string
}

export interface RegisterResponse {
  userId: string
  email: string
  fullName: string
  status: UserStatus
  createdAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
  userId: string
  email: string
  fullName: string
  status: UserStatus
}

export interface CurrentUserResponse {
  userId: string
  email: string
  fullName: string
  status: UserStatus
  role?: string
}

export type LoginCredentials = LoginRequest
export type User = CurrentUserResponse

export interface ApiErrorResponse {
  status: number
  error: string
  message: string
  timestamp: string
  path: string
  code?: string
  lockedUntil?: string
  validationErrors?: Record<string, string>
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
