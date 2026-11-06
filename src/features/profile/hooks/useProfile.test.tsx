import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/features/auth/context/AuthContext'
import { authSession, validUser } from '@/test/fixtures/auth'
import { deferred } from '@/test/renderAuthPage'
import type { User } from '@/types/auth'
import { useProfile } from './useProfile'
import { profileApi } from '@/api/profileApi'
import { toProfileFormValues } from '../utils/profileForm'

it('loads once, retries locally and does not reload when the auth user object changes', async () => {
  const session = authSession()
  let state: AuthState = { status: 'authenticated', user: validUser, session }
  const refreshCurrentUser = vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValue(validUser)
  function Wrapper({ children }: PropsWithChildren) { return <AuthContext value={{ state, refreshCurrentUser, login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn() }}>{children}</AuthContext> }
  const { result, rerender } = renderHook(() => useProfile(), { wrapper: Wrapper })
  await waitFor(() => expect(result.current.data.phase).toBe('error'))
  await act(() => result.current.reload())
  expect(result.current.data.phase).toBe('ready')
  state = { status: 'authenticated', user: { ...validUser, fullName: 'Updated' }, session }
  rerender()
  expect(refreshCurrentUser).toHaveBeenCalledTimes(2)
})

it('hides previous-session data immediately and discards late completions after switch or unmount', async () => {
  const first = deferred<User>(), second = deferred<User>()
  let state: AuthState = { status: 'authenticated', user: validUser, session: authSession() }
  const refreshCurrentUser = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  function Wrapper({ children }: PropsWithChildren) { return <AuthContext value={{ state, refreshCurrentUser, login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn() }}>{children}</AuthContext> }
  const { result, rerender, unmount } = renderHook(() => useProfile(), { wrapper: Wrapper })
  state = { status: 'authenticated', user: { ...validUser, userId: 'second' }, session: authSession({ userId: 'second' }) }
  rerender()
  expect(result.current.data.phase).toBe('loading')
  expect(refreshCurrentUser.mock.calls[0][0].aborted).toBe(true)
  await act(async () => first.resolve({ ...validUser, fullName: 'Stale' }))
  expect(result.current.data.phase).toBe('loading')
  unmount()
  expect(refreshCurrentUser.mock.calls[1][0].aborted).toBe(true)
  await act(async () => second.resolve(validUser))
})

it.each(['switch', 'unmount'])('does not refresh or report success when a pending PATCH finishes after %s', async action => {
  let state: AuthState = { status: 'authenticated', user: validUser, session: authSession() }
  const refreshCurrentUser = vi.fn().mockResolvedValue(validUser)
  function Wrapper({ children }: PropsWithChildren) { return <AuthContext value={{ state, refreshCurrentUser, login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn() }}>{children}</AuthContext> }
  const { result, rerender, unmount } = renderHook(() => useProfile(), { wrapper: Wrapper })
  await waitFor(() => expect(result.current.data.phase).toBe('ready'))
  act(() => result.current.edit())
  const patch = deferred<void>()
  const update = vi.spyOn(profileApi, 'updateCurrentUser').mockReturnValue(patch.promise)
  let operation!: Promise<void>
  act(() => { operation = result.current.save({ ...toProfileFormValues(validUser), bio: 'Draft' }) })
  if (action === 'switch') {
    state = { status: 'authenticated', user: { ...validUser, userId: 'second' }, session: authSession({ userId: 'second' }) }
    rerender()
    await waitFor(() => expect(refreshCurrentUser).toHaveBeenCalledTimes(2))
  } else unmount()
  expect(update.mock.calls[0][2]?.aborted).toBe(true)
  const reads = refreshCurrentUser.mock.calls.length
  await act(async () => { patch.resolve(); await operation })
  expect(refreshCurrentUser).toHaveBeenCalledTimes(reads)
  if (action === 'switch') expect(result.current.data).not.toHaveProperty('notice', 'Profile saved.')
})
