import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { User } from '@/types/auth'

type ProfileState = { sessionId: string | null } & (
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; user: User }
)

export function useProfile() {
  const { state, refreshCurrentUser } = useAuth()
  const sessionId = state.status === 'authenticated' ? state.session.sessionId : null
  const currentSession = useRef(sessionId)
  useLayoutEffect(() => { currentSession.current = sessionId }, [sessionId])
  const [data, setData] = useState<ProfileState>({ sessionId: null, phase: 'loading' })
  const pending = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const active = useRef(false)

  const load = useCallback(() => {
    if (!sessionId) return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    const request = ++sequence.current
    const current = () => active.current && !controller.signal.aborted && sequence.current === request && currentSession.current === sessionId
    return refreshCurrentUser(controller.signal).then(user => {
      if (current()) setData({ sessionId, phase: 'ready', user })
    }).catch(() => {
      if (current()) setData({ sessionId, phase: 'error', message: 'Unable to load your profile. Please try again.' })
    }).finally(() => {
      if (pending.current === controller) pending.current = null
    })
  }, [sessionId, refreshCurrentUser])

  const reload = useCallback(() => {
    setData({ sessionId, phase: 'loading' })
    return load()
  }, [load, sessionId])

  useEffect(() => {
    active.current = true
    void load()
    return () => { active.current = false; sequence.current += 1; pending.current?.abort() }
  }, [load])

  return { data: data.sessionId === sessionId ? data : { sessionId, phase: 'loading' } as ProfileState, reload }
}
