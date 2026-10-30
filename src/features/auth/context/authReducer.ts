import type { AuthState } from './AuthContext'

export type AuthAction =
  | { type: 'initializing' }
  | ({ type: 'anonymous' } & Omit<Extract<AuthState, { status: 'anonymous' }>, 'status'>)
  | ({ type: 'authenticated' } & Omit<Extract<AuthState, { status: 'authenticated' }>, 'status'>)
  | ({ type: 'restore-error' } & Omit<Extract<AuthState, { status: 'restore-error' }>, 'status'>)

export function authReducer(_state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'initializing':
      return { status: 'initializing' }
    case 'anonymous':
      return { status: 'anonymous', reason: action.reason }
    case 'authenticated':
      return { status: 'authenticated', user: action.user, session: action.session }
    case 'restore-error':
      return { status: 'restore-error', error: action.error, retrySessionVerification: action.retrySessionVerification }
  }
}
