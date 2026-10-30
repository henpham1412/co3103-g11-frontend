import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthSessionState } from './AuthSessionState'

export function ProtectedRoute() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'initializing' || state.status === 'restore-error') return <AuthSessionState />
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
