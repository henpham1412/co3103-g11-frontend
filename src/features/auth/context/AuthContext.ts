import { createContext } from 'react'
import type { ApiError } from '@/api/apiError'
import type { AuthSession, LoginCredentials, User } from '@/types/auth'

export type LogoutReason = 'expired' | 'unauthorized' | 'signed-out'

export type AuthState =
  | { status: 'initializing' }
  | { status: 'anonymous', reason?: LogoutReason }
  | { status: 'authenticated', user: User, session: AuthSession }
  | { status: 'restore-error', error: ApiError, retrySessionVerification: () => Promise<void> }

export interface AuthContextValue {
  state: AuthState
  login(credentials: LoginCredentials, rememberMe?: boolean): Promise<AuthSession>
  logout(reason?: LogoutReason): Promise<void>
  retrySessionVerification(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
