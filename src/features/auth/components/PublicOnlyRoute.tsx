import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { returnDestination } from '@/features/auth/utils/returnDestination'
import { isRecord } from '@/utils/typeGuards'
import { AuthSessionState } from './AuthSessionState'

export function PublicOnlyRoute() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'initializing' || state.status === 'restore-error') return <AuthSessionState />
  if (state.status === 'authenticated') {
    const target = returnDestination(isRecord(location.state) ? location.state.from : undefined)
    return <Navigate to={target} replace />
  }
  return <Outlet />
}
