import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { AUTH_SESSION_KEY, tokenStorage } from '@/features/auth/services/tokenStorage'
import { authSession, createToken } from '@/test/fixtures/auth'
import { wireFullProfile } from '@/test/fixtures/profileWire'
import { deferred, fillAuthFields } from '@/test/renderAuthPage'
import { renderProfilePage } from '@/test/renderProfilePage'
import { identityApiUrl, server } from '@/test/server'

it.each([false, true])('logs in, updates three fields, synchronizes home/header, restores canonical data and logs out (rememberMe %s)', async rememberMe => {
  let canonical = structuredClone(wireFullProfile)
  const received = vi.fn()
  const spies = ['log', 'warn', 'error', 'info', 'debug'].map(method => vi.spyOn(console, method as 'log').mockImplementation(() => {}))
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(canonical)),
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      received(await request.json())
      canonical = { ...canonical, full_name: 'Canonical Student', profile: { ...canonical.profile, bio: 'A revised biography', date_of_birth: '2000-02-29' } }
      return HttpResponse.json({ acknowledgment: true })
    }))
  let view = renderProfilePage({ session: null })
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
  await fillAuthFields(view.user, { Email: 'student@example.com', Password: 'password' })
  if (rememberMe) await view.user.click(screen.getByRole('checkbox', { name: 'Remember me' }))
  await view.user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
  await view.user.click(await screen.findByRole('button', { name: 'Edit profile' }))
  const stored = tokenStorage.getSession()!
  const raw = (rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY)
  await fillAuthFields(view.user, { 'Full name': 'Updated Student', Bio: 'A revised biography' })
  // Date inputs are assigned as a date-only value, independent of browser locale.
  const input = screen.getByLabelText('Date of birth') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { setter.call(input, '2000-02-29'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
  await view.user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Profile saved.')
  expect(received).toHaveBeenCalledExactlyOnceWith({ full_name: 'Updated Student', bio: 'A revised biography', date_of_birth: '2000-02-29' })
  expect(within(screen.getByRole('banner')).getByText('Canonical Student')).toBeInTheDocument()
  expect((rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY) === raw).toBe(true)
  await view.user.click(screen.getByRole('link', { name: 'G11 LMS home' }))
  await screen.findByRole('heading', { name: 'Welcome, Canonical Student' })
  expect(screen.getByRole('time')).toHaveAttribute('datetime', new Date(stored.expiresAt).toISOString())
  view.unmount()
  view.router.dispose()
  view = renderProfilePage({ preserveStorage: true })
  await screen.findByText('A revised biography')
  expect(screen.getByText('2000-02-29')).toBeInTheDocument()
  expect(tokenStorage.getSession()?.sessionId).toBe(stored.sessionId)
  expect((JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).includes('A revised biography')).toBe(false)
  await view.user.click(screen.getByRole('button', { name: 'Sign Out' }))
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
  expect(tokenStorage.getSession()).toBeNull()
  expect(spies.every(spy => spy.mock.calls.every(args => !JSON.stringify(args).includes(stored.accessToken)))).toBe(true)
})

it('reconciles a partially successful save through GET alone with real provider/interceptors', async () => {
  let patches = 0, reads = 0, offline = false
  server.use(http.get(identityApiUrl('/users/me'), () => {
    reads++
    return offline ? HttpResponse.error() : HttpResponse.json({ ...wireFullProfile, full_name: patches ? 'Saved canonical' : wireFullProfile.full_name })
  }), http.patch(identityApiUrl('/users/me'), () => { patches++; offline = true; return new HttpResponse(null, { status: 204 }) }))
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
  await fillAuthFields(user, { 'Full name': 'Submitted name' })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText(/Your update was accepted/)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  const before = reads
  offline = false
  await user.click(screen.getByRole('button', { name: 'Reload profile' }))
  await screen.findByText('Your saved profile is now up to date.')
  expect(reads).toBe(before + 1)
  expect(patches).toBe(1)
  expect(within(screen.getByRole('banner')).getByText('Saved canonical')).toBeInTheDocument()
})

it.each([200, 401])('protects a replacement account from a delayed PATCH response (%s)', async status => {
  const old = authSession({ rememberMe: true })
  const replacement = authSession({ rememberMe: true, userId: 'replacement-user', fullName: 'Replacement Student', email: 'replacement@example.com', accessToken: createToken({ sub: 'replacement-user', exp: Math.floor(Date.now() / 1000) + 3600 }) })
  const started = deferred<void>(), pending = deferred<Response>()
  let newReads = 0
  server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
    const newer = request.headers.get('authorization') === `Bearer ${replacement.accessToken}`
    if (newer) newReads++
    return HttpResponse.json(newer ? { ...wireFullProfile, user_id: replacement.userId, full_name: replacement.fullName, email: replacement.email, profile: { bio: 'Replacement profile' } } : wireFullProfile)
  }), http.patch(identityApiUrl('/users/me'), ({ request }) => {
    expect(request.headers.get('authorization') === `Bearer ${old.accessToken}`).toBe(true)
    started.resolve()
    return pending.promise
  }))
  const { user } = renderProfilePage({ session: old })
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
  await fillAuthFields(user, { Bio: 'Old account draft' })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await started.promise
  act(() => {
    tokenStorage.saveSession(replacement)
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SESSION_KEY, newValue: localStorage.getItem(AUTH_SESSION_KEY), storageArea: localStorage }))
  })
  await screen.findByText('Replacement profile')
  const before = newReads
  await act(async () => pending.resolve(new HttpResponse(null, { status })))
  await waitFor(() => expect(within(screen.getByRole('banner')).getByText('Replacement Student')).toBeInTheDocument())
  expect(tokenStorage.getSession()?.sessionId).toBe(replacement.sessionId)
  expect(newReads).toBe(before)
  expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('Old account draft')).not.toBeInTheDocument()
})
