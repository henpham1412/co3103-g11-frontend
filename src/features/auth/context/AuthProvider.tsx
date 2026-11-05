import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, type PropsWithChildren } from 'react'
import { App } from 'antd'
import { CanceledError } from 'axios'
import { ApiError, normalizeApiError } from '@/api/apiError'
import { authApi } from '@/api/authApi'
import { installAuthInterceptors, type SessionSnapshot } from '@/api/authInterceptors'
import { createAuthSync } from '@/features/auth/services/authSync'
import { AUTH_SESSION_VERSION, tokenStorage } from '@/features/auth/services/tokenStorage'
import type { AuthSession, LoginCredentials } from '@/types/auth'
import { calculateSessionExpiry } from '@/utils/sessionExpiry'
import { AuthContext, type LogoutReason } from './AuthContext'
import { authReducer } from './authReducer'

export function AuthProvider({ children }: PropsWithChildren) {
  const { message } = App.useApp()
  const [state, dispatch] = useReducer(authReducer, { status: 'initializing' })
  const snapshot = useRef<SessionSnapshot>({ session: null, generation: 0 })
  const mounted = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sync = useRef<ReturnType<typeof createAuthSync> | null>(null)
  const verify = useRef<(() => Promise<void>) | null>(null)

  const beginOperation = useCallback(() => {
    snapshot.current.generation += 1
    controller.current?.abort()
    controller.current = null
    clearTimeout(timer.current)
    timer.current = undefined
    return snapshot.current.generation
  }, [])

  const isCurrent = useCallback((generation: number) =>
    mounted.current && snapshot.current.generation === generation, [])

  const purgeSession = useCallback((reason: LogoutReason, broadcast = true, explicit = false) => {
    if (!mounted.current) return
    const previous = snapshot.current.session
    const stored = tokenStorage.getSession()
    // Storage events may still be queued when an old timer/401 fires.
    if (!explicit && stored && stored.sessionId !== previous?.sessionId) {
      void verify.current?.()
      return
    }
    beginOperation()
    snapshot.current.session = null
    // A user sign-out also clears a shared login whose storage event is queued.
    tokenStorage.clearSession(previous?.sessionId)
    if (explicit && stored && stored.sessionId !== previous?.sessionId) {
      tokenStorage.clearSession(stored.sessionId)
    }
    dispatch({ type: 'anonymous', reason })
    if (broadcast) {
      sync.current?.publish({ type: 'logout', reason, sessionId: previous?.sessionId ?? null })
      if (explicit && stored && stored.sessionId !== previous?.sessionId) {
        sync.current?.publish({ type: 'logout', reason, sessionId: stored.sessionId })
      }
    }
  }, [beginOperation])

  const scheduleExpiry = useCallback((session: AuthSession, generation: number) => {
    clearTimeout(timer.current)
    const check = () => {
      if (!isCurrent(generation)) return
      const remaining = session.expiresAt - Date.now()
      if (remaining <= 0) purgeSession('expired')
      // Browsers clamp larger delays to 1 ms; rearm long-lived sessions instead.
      else timer.current = setTimeout(check, Math.min(remaining, 2_147_483_647))
    }
    check()
  }, [isCurrent, purgeSession])

  const retrySessionVerification = useCallback(async function verifySession() {
    if (!mounted.current) return
    const previous = snapshot.current.session
    const generation = beginOperation()
    const session = tokenStorage.getSession()
    snapshot.current.session = session
    if (!session) {
      dispatch({ type: 'anonymous', reason: previous && previous.expiresAt <= Date.now() ? 'expired' : undefined })
      return
    }

    dispatch({ type: 'initializing' })
    scheduleExpiry(session, generation)
    if (!isCurrent(generation)) return
    const pending = new AbortController()
    controller.current = pending
    try {
      const user = await authApi.getCurrentUser(session.accessToken, pending.signal)
      if (!isCurrent(generation)) return
      if (session.expiresAt <= Date.now()) {
        purgeSession('expired')
        return
      }
      // Keep the decoded profile in memory; session v2 persists identity only.
      const verifiedSession: AuthSession = {
        ...session, userId: user.userId, email: user.email, fullName: user.fullName, status: user.status,
      }
      snapshot.current.session = verifiedSession
      dispatch({ type: 'authenticated', user, session: verifiedSession })
    } catch (error) {
      if (!isCurrent(generation)) return
      const apiError = normalizeApiError(error, '/users/me')
      if (apiError.status === 401 || apiError.status === 403) {
        purgeSession(session.expiresAt <= Date.now() ? 'expired' : 'unauthorized')
      } else {
        dispatch({ type: 'restore-error', error: apiError, retrySessionVerification: verifySession })
      }
    }
  }, [beginOperation, isCurrent, purgeSession, scheduleExpiry])

  const login = useCallback(async (credentials: LoginCredentials, rememberMe = false, signal?: AbortSignal): Promise<AuthSession> => {
    if (!mounted.current || signal?.aborted) throw normalizeApiError(new CanceledError())
    const generation = beginOperation()
    snapshot.current.session = null
    tokenStorage.clearSession()
    dispatch({ type: 'anonymous' })
    const pending = new AbortController()
    controller.current = pending
    const cancel = () => {
      // Leaving the submitting page invalidates even transports that ignore abort.
      // An older caller must never cancel a newer authentication operation.
      if (isCurrent(generation)) beginOperation()
    }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      const result = await authApi.login(credentials, pending.signal)
      if (!isCurrent(generation)) throw new CanceledError('A newer authentication operation replaced this login.')
      const { accessToken, tokenType, userId, email, fullName, status } = result
      const session: AuthSession = {
        sessionId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        accessToken, tokenType, userId, email, fullName, status, rememberMe,
        expiresAt: calculateSessionExpiry(accessToken, result.expiresIn, rememberMe),
        version: AUTH_SESSION_VERSION,
      }
      if (session.expiresAt <= Date.now()) throw new CanceledError('The authentication session has expired.')
      if (!tokenStorage.saveSession(session)) {
        throw new ApiError({
          status: 0, error: 'Session Storage Error', code: 'SESSION_STORAGE_UNAVAILABLE',
          message: 'Unable to save your session. Please enable browser storage and sign in again.',
          timestamp: new Date().toISOString(), path: '/auth/login',
        })
      }
      snapshot.current.session = session
      scheduleExpiry(session, generation)
      if (!isCurrent(generation)) throw new CanceledError('The authentication session has expired.')
      dispatch({ type: 'authenticated', user: { userId, email, fullName, status }, session })
      sync.current?.publish({ type: 'session-changed' })
      return session
    } catch (error) {
      throw normalizeApiError(error, '/auth/login')
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
  }, [beginOperation, isCurrent, scheduleExpiry])

  const logout = useCallback(async (reason: LogoutReason = 'signed-out') => {
    purgeSession(reason, true, true)
  }, [purgeSession])

  useLayoutEffect(() => {
    mounted.current = true
    verify.current = retrySessionVerification
    const removeInterceptors = installAuthInterceptors({
      getSessionSnapshot: () => snapshot.current,
      purgeSession: (reason, generation) => {
        if (isCurrent(generation)) purgeSession(reason)
      },
      onLmsForbidden: () => {
        void message.warning('You do not have permission to access this LMS resource.')
      },
    })
    const reconcileSession = () => {
      const stored = tokenStorage.getSession()
      const current = snapshot.current.session
      if (stored && current && stored.sessionId === current.sessionId && stored.accessToken === current.accessToken
        && stored.expiresAt === current.expiresAt && stored.rememberMe === current.rememberMe) return
      if (stored) void retrySessionVerification()
      else if (current) purgeSession(current.expiresAt <= Date.now() ? 'expired' : 'signed-out', false)
    }
    sync.current = createAuthSync(signal => {
      if (signal.type === 'logout') {
        const current = snapshot.current.session
        // Delayed or duplicated logout messages must not invalidate a newer login.
        if (signal.sessionId === (current?.sessionId ?? null)) purgeSession(signal.reason, false)
        return
      }
      reconcileSession()
    })

    const checkExpiry = () => {
      reconcileSession()
      const session = snapshot.current.session
      if (session && session.expiresAt <= Date.now()) purgeSession('expired')
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkExpiry()
    }
    window.addEventListener('focus', checkExpiry)
    document.addEventListener('visibilitychange', onVisibility)
    void retrySessionVerification()

    return () => {
      mounted.current = false
      beginOperation()
      removeInterceptors()
      sync.current?.cleanup()
      sync.current = null
      verify.current = null
      window.removeEventListener('focus', checkExpiry)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [beginOperation, isCurrent, message, purgeSession, retrySessionVerification])

  const value = useMemo(() => ({ state, login, logout, retrySessionVerification }),
    [state, login, logout, retrySessionVerification])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
