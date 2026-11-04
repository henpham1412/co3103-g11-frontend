import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { User } from '@/types/auth'
import { profileApi } from '@/api/profileApi'
import type { ProfileFormValues } from '@/types/profile'
import { buildProfileChanges, toProfileFormValues } from '../utils/profileForm'
import { profileErrorPresentation, type ProfileFeedback } from '../utils/profileErrors'

type ProfileState = { sessionId: string | null } & (
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready' | 'editing' | 'saving' | 'saved-unverified' | 'reloading'; user: User; feedback?: ProfileFeedback; notice?: string }
)

export function useProfile() {
  const { state, refreshCurrentUser } = useAuth()
  const sessionId = state.status === 'authenticated' ? state.session.sessionId : null
  const session = state.status === 'authenticated' ? state.session : null
  const currentSession = useRef(session)
  useLayoutEffect(() => { currentSession.current = session }, [session])
  const [data, setData] = useState<ProfileState>({ sessionId: null, phase: 'loading' })
  const pending = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const active = useRef(false)

  const load = useCallback((previous?: ProfileState) => {
    if (!sessionId) return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    const request = ++sequence.current
    const current = () => active.current && !controller.signal.aborted && sequence.current === request && currentSession.current?.sessionId === sessionId
    return refreshCurrentUser(controller.signal).then(user => {
      if (current()) setData({ sessionId, phase: 'ready', user, notice: previous?.phase === 'saved-unverified' ? 'Your saved profile is now up to date.' : undefined })
    }).catch(() => {
      if (!current()) return
      if (previous && 'user' in previous) setData({ ...previous, feedback: { fields: [], message: 'Unable to reload your profile. Please try again.' } })
      else setData({ sessionId, phase: 'error', message: 'Unable to load your profile. Please try again.' })
    }).finally(() => {
      if (pending.current === controller) pending.current = null
    })
  }, [sessionId, refreshCurrentUser])

  const reload = useCallback(() => {
    if (pending.current) return
    setData('user' in data ? { ...data, phase: 'reloading' } : { sessionId, phase: 'loading' })
    return load(data)
  }, [data, load, sessionId])

  function edit() {
    if (data.phase === 'ready' && data.sessionId === sessionId) setData({ ...data, phase: 'editing', notice: undefined, feedback: undefined })
  }
  function cancel() {
    if (data.phase === 'editing' && !pending.current) setData({ ...data, phase: 'ready', feedback: undefined })
  }

  async function save(values: ProfileFormValues) {
    const captured = currentSession.current
    if (!captured || captured.sessionId !== data.sessionId || data.phase !== 'editing' || pending.current || captured.expiresAt <= Date.now()) return
    const result = buildProfileChanges(toProfileFormValues(data.user), values)
    if (result.kind !== 'changed') return
    const controller = new AbortController()
    pending.current = controller
    const request = ++sequence.current
    const current = () => active.current && !controller.signal.aborted && sequence.current === request
      && currentSession.current?.sessionId === captured.sessionId && captured.expiresAt > Date.now()
    setData({ ...data, phase: 'saving', feedback: undefined })
    let acknowledged = false
    try {
      await profileApi.updateCurrentUser(result.changes, captured.accessToken, controller.signal)
      if (!current()) return
      acknowledged = true
      const user = await refreshCurrentUser(controller.signal)
      if (current()) setData({ sessionId, phase: 'ready', user, notice: 'Profile saved.' })
    } catch (error) {
      if (!current()) return
      setData(acknowledged ? { ...data, phase: 'saved-unverified', feedback: undefined }
        : { ...data, phase: 'editing', feedback: profileErrorPresentation(error) })
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  useEffect(() => {
    active.current = true
    void load()
    return () => { active.current = false; sequence.current += 1; pending.current?.abort() }
  }, [load])

  return { data: data.sessionId === sessionId ? data : { sessionId, phase: 'loading' } as ProfileState, reload, edit, cancel, save }
}
