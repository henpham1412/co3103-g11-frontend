import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import axios from 'axios'
import { normalizeApiError } from '@/api/apiError'
import { lmsClient } from '@/api/lmsClient'
import { useAuth } from '@/hooks/useAuth'
import type { AuthSession } from '@/types/auth'
import { getAdminUser, isAdminRequest } from '../api/adminApi'
import { AdminAccessContext, type AdminAccess } from './AdminAccessContext'

export function AdminAccessProvider({ children }: PropsWithChildren) {
  const { state } = useAuth()
  if (state.status !== 'authenticated') {
    return <AdminAccessContext value={{ access: 'denied', recheck: () => {}, revokeAccess: () => {} }}>{children}</AdminAccessContext>
  }
  // A different account/session unmounts all capability state. Role claims in storage are never read.
  return <SessionAdminAccess key={`${state.session.sessionId}:${state.user.userId}`}
    session={state.session} userId={state.user.userId}>{children}</SessionAdminAccess>
}

function SessionAdminAccess({ children, session, userId }: PropsWithChildren<{ session: AuthSession; userId: string }>) {
  const [attempt, setAttempt] = useState(0)
  const [revokedOwner, setRevokedOwner] = useState<object | null>(null)
  const probe = useRef<AbortController | null>(null)
  const recheck = useCallback(() => setAttempt(value => value + 1), [])
  // A probe has its own scope, but background checks can retain an already verified
  // decision for this identity/token. Session replacement must still hide old children.
  const requestOwner = useMemo(() => ({ token: session.accessToken }), [session.accessToken])
  const revokeAccess = useCallback(() => {
    setRevokedOwner(requestOwner)
    probe.current?.abort()
  }, [requestOwner])
  const scope = useMemo(() => ({ owner: requestOwner, attempt }), [requestOwner, attempt])
  const [result, setResult] = useState<{ scope: typeof scope; access: AdminAccess } | null>(null)

  useEffect(() => {
    let active = true
    // Keep revocation monitoring alive across retries/focus revalidation: requests already
    // in flight in this session can still return an authoritative 403 during a new probe.
    const requestInterceptor = lmsClient.interceptors.request.use(config => {
      if (active && isAdminRequest(config)) config._adminAccessOwner = requestOwner
      return config
    })
    const interceptor = lmsClient.interceptors.response.use(undefined, (error: unknown) => {
      if (active && axios.isAxiosError(error) && error.response?.status === 403 && error.config
        && !error.config.signal?.aborted && isAdminRequest(error.config)
        && error.config._adminAccessOwner === requestOwner
        && error.config.headers.get('Authorization') === `Bearer ${requestOwner.token}`) {
        setRevokedOwner(requestOwner)
        probe.current?.abort()
      }
      return Promise.reject(error)
    })
    return () => {
      active = false
      lmsClient.interceptors.response.eject(interceptor)
      lmsClient.interceptors.request.eject(requestInterceptor)
    }
  }, [requestOwner])

  useEffect(() => {
    const controller = new AbortController()
    probe.current = controller
    let active = true
    getAdminUser(userId, controller.signal, true).then(user => {
      if (active && !controller.signal.aborted) {
        const access = user.lms_role === 'ADMINISTRATOR' && user.access_status === 'ACTIVE' ? 'allowed' : 'denied'
        setResult({ scope, access })
        // A retry alone cannot undo revocation; only a fresh, non-aborted successful probe can.
        if (access === 'allowed') setRevokedOwner(null)
      }
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return
      const status = normalizeApiError(error).status
      setResult({ scope, access: status === 401 || status === 403 ? 'denied' : 'error' })
    })
    return () => {
      active = false
      controller.abort()
      if (probe.current === controller) probe.current = null
    }
  }, [scope, userId])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') recheck() }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [recheck])

  const previouslyAuthorized = result?.access === 'allowed' && result.scope.owner === requestOwner
  const access = revokedOwner === requestOwner ? 'denied' : result?.scope === scope ? result.access
    : previouslyAuthorized ? 'allowed' : 'checking'
  return <AdminAccessContext value={{ access, recheck, revokeAccess }}>
    {children}
  </AdminAccessContext>
}
