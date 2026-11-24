import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installAuthInterceptors, type SessionSnapshot } from '@/api/authInterceptors'
import { lmsClient } from '@/api/lmsClient'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { AuthContext, type AuthContextValue, type AuthState } from '@/features/auth/context/AuthContext'
import { authSession, validUser } from '@/test/fixtures/auth'
import { server } from '@/test/server'
import { deferred } from '@/test/renderAuthPage'
import AdminEntry from '../AdminEntry'
import AdminRoute from '../AdminRoute'
import AdminWorkspaceLayout from '../AdminWorkspaceLayout'
import { getAdminAuditLog } from '../api/adminApi'
import { adminUser, LOG_ID, OTHER_ID, USER_ID } from '@/test/fixtures/admin'

const base = lmsClient.defaults.baseURL!
let state: AuthState
let snapshot: SessionSnapshot
let uninstall: () => void
const notify = vi.fn()
const purge = vi.fn()
const logout = vi.fn()

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  state = { status: 'authenticated', user: validUser, session: authSession() }
  snapshot = { session: state.session, generation: 1 }
  uninstall = installAuthInterceptors({ getSessionSnapshot: () => snapshot, purgeSession: purge, onLmsForbidden: notify })
})
afterEach(() => uninstall())

function SensitivePage() {
  const [draft, setDraft] = useState('')
  return <><h1>Protected administrator content</h1><input aria-label="Sensitive draft" value={draft}
    onChange={event => setDraft(event.target.value)} />
    <button onClick={() => { void getAdminAuditLog(LOG_ID).catch(() => {}) }}>Read audit</button></>
}

function tree(initialPath = '/admin/users') {
  const value: AuthContextValue = { state, logout, login: vi.fn(), retrySessionVerification: vi.fn(), refreshCurrentUser: vi.fn() }
  return <AuthContext value={value}><MemoryRouter initialEntries={[initialPath]}><Routes>
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<><h1>Overview</h1><AdminEntry /></>} />
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminWorkspaceLayout />}>
          <Route path="users" element={<SensitivePage />} />
          <Route path="audit-logs" element={<><h1>Audit shell</h1><Link to="/admin/users">Users</Link></>} />
        </Route>
      </Route>
    </Route>
    <Route path="/login" element={<h1>Sign in</h1>} />
  </Routes></MemoryRouter></AuthContext>
}

function changeSession(next: AuthState) {
  state = next
  snapshot = { session: next.status === 'authenticated' ? next.session : null, generation: snapshot.generation + 1 }
}

function revalidate(kind: 'focus' | 'visibility') {
  if (kind === 'focus') fireEvent(window, new Event('focus'))
  else {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
  }
}

it.each(['focus', 'visibility'] as const)('preserves the mounted form and unsaved values during successful background revalidation on %s', async kind => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  render(tree())
  const form = await screen.findByRole('textbox', { name: 'Sensitive draft' })
  fireEvent.change(form, { target: { value: 'Unsaved local changes' } })

  const pending = deferred<Response>()
  const started = vi.fn()
  const completed = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, async () => {
    started()
    const response = await pending.promise
    completed()
    return response
  }))
  revalidate(kind)
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  expect(screen.getByRole('textbox', { name: 'Sensitive draft' })).toBe(form)
  expect(form).toHaveValue('Unsaved local changes')
  expect(screen.queryByRole('status', { name: 'Checking administrator access' })).not.toBeInTheDocument()

  await act(async () => pending.resolve(HttpResponse.json(adminUser())))
  await waitFor(() => expect(completed).toHaveBeenCalledOnce())
  expect(screen.getByRole('textbox', { name: 'Sensitive draft' })).toBe(form)
  expect(form).toHaveValue('Unsaved local changes')
})

it.each(['focus', 'visibility'] as const)('removes the edited form only after background revalidation on %s returns 403', async kind => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  render(tree())
  const form = await screen.findByRole('textbox', { name: 'Sensitive draft' })
  fireEvent.change(form, { target: { value: 'Must be removed on revocation' } })
  const pending = deferred<Response>()
  const started = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => { started(); return pending.promise }))
  revalidate(kind)
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  expect(screen.getByRole('textbox', { name: 'Sensitive draft' })).toBe(form)
  expect(form).toHaveValue('Must be removed on revocation')
  await act(async () => pending.resolve(new HttpResponse(null, { status: 403 })))
  await screen.findByText('Administrator access is not available')
  expect(form).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  expect(purge).not.toHaveBeenCalled()
})

it.each([500, 'network', 'malformed'] as const)('fails closed after background revalidation fails (%s) and requires fresh verification to retry', async mode => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => mode === 500
    ? new HttpResponse(null, { status: 500 }) : mode === 'network' ? HttpResponse.error() : HttpResponse.json({ role: 'ADMINISTRATOR' })))
  revalidate('focus')
  await screen.findByText('Could not verify administrator access')
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()

  const retry = deferred<Response>()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => retry.promise))
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(screen.getByRole('status', { name: 'Checking administrator access' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  await act(async () => retry.resolve(HttpResponse.json(adminUser())))
  expect(await screen.findByRole('textbox', { name: 'Sensitive draft' })).toHaveValue('')
})

it('does not reuse a previous allowed result when a revoked session starts another probe', async () => {
  server.use(
    http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
    http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => new HttpResponse(null, { status: 403 })),
  )
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  fireEvent.click(screen.getByRole('button', { name: 'Read audit' }))
  await screen.findByText('Administrator access is not available')

  const pending = deferred<Response>()
  const started = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => { started(); return pending.promise }))
  revalidate('focus')
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  expect(screen.getByText('Administrator access is not available')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(HttpResponse.json(adminUser())))
  expect(await screen.findByRole('textbox', { name: 'Sensitive draft' })).toHaveValue('')
})

it('preserves the existing 401 session invalidation during background revalidation', async () => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => new HttpResponse(null, { status: 401 })))
  revalidate('focus')
  await screen.findByText('Administrator access is not available')
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  expect(purge).toHaveBeenCalledExactlyOnceWith('unauthorized', snapshot.generation)
})

it('requires fresh verification when a replaced token is restored while another probe is pending', async () => {
  const originalSession = snapshot.session!
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  const view = render(tree())
  await screen.findByRole('textbox', { name: 'Sensitive draft' })
  const otherProbe = deferred<Response>()
  const otherStarted = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => { otherStarted(); return otherProbe.promise }))
  changeSession({ status: 'authenticated', user: validUser, session: { ...originalSession, accessToken: 'replacement-token' } })
  view.rerender(tree())
  await waitFor(() => expect(otherStarted).toHaveBeenCalledOnce())
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()

  const restoredProbe = deferred<Response>()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => restoredProbe.promise))
  changeSession({ status: 'authenticated', user: validUser, session: originalSession })
  view.rerender(tree())
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  await act(async () => restoredProbe.resolve(HttpResponse.json(adminUser())))
  expect(await screen.findByRole('textbox', { name: 'Sensitive draft' })).toHaveValue('')
  await act(async () => otherProbe.resolve(HttpResponse.json(adminUser())))
})

it('does not render Admin chrome or children while capability verification is pending', async () => {
  const pending = deferred<Response>()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => pending.promise))
  render(tree())
  expect(screen.getByRole('status', { name: 'Checking administrator access' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(HttpResponse.json(adminUser())))
  expect(await screen.findByRole('heading', { name: 'Protected administrator content' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Administrator navigation' })).toBeInTheDocument()
})

it.each([
  { lms_role: 'STUDENT' as const, access_status: 'ACTIVE' as const },
  { lms_role: 'TUTOR' as const, access_status: 'ACTIVE' as const },
  { lms_role: 'ADMINISTRATOR' as const, access_status: 'SUSPENDED' as const },
])('requires ACTIVE local ADMINISTRATOR even if a 200 response has $lms_role/$access_status', async patch => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser(patch))))
  render(tree())
  expect(await screen.findByText('Administrator access is not available')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
})

it('handles an expected backend 403 without a global toast or Central Identity logout', async () => {
  render(tree()) // Default MSW identity is a Student; the real API client receives 403.
  expect(await screen.findByText('Administrator access is not available')).toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  expect(purge).not.toHaveBeenCalled()
  expect(snapshot.session).not.toBeNull()
})

it('keeps the Admin entry hidden despite a forged stored role', async () => {
  localStorage.setItem('lms_role', 'ADMINISTRATOR')
  const reads = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => { reads(); return new HttpResponse(null, { status: 403 }) }))
  render(tree('/'))
  await waitFor(() => expect(reads).toHaveBeenCalledOnce())
  expect(screen.queryByRole('link', { name: 'Administrator workspace' })).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('reveals the Admin entry only after verifying the current identity', async () => {
  const pending = deferred<Response>()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => pending.promise))
  render(tree('/'))
  expect(screen.queryByRole('link', { name: 'Administrator workspace' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(HttpResponse.json(adminUser())))
  expect(await screen.findByRole('link', { name: 'Administrator workspace' })).toHaveAttribute('href', '/admin')
})

it.each([500, 'malformed', 'foreign'] as const)('fails closed and supports a canonical retry after %s', async mode => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => mode === 500 ? new HttpResponse(null, { status: 500 })
    : HttpResponse.json(mode === 'foreign' ? adminUser({ user_id: OTHER_ID }) : { role: 'ADMINISTRATOR' })))
  render(tree())
  expect(await screen.findByText('Could not verify administrator access')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Protected administrator content' })).not.toBeInTheDocument()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: 'Protected administrator content' })).toBeInTheDocument()
})

it('redirects an anonymous visitor before issuing any capability request', async () => {
  changeSession({ status: 'anonymous' })
  const read = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => { read(); return HttpResponse.json(adminUser()) }))
  render(tree())
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(read).not.toHaveBeenCalled()
})

it('clears privileged content on logout', async () => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  const view = render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  changeSession({ status: 'anonymous' })
  view.rerender(tree())
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
})

it('cannot grant the next account access from a late response for the previous account', async () => {
  const pending = deferred<Response>()
  const started = vi.fn()
  server.use(
    http.get(`${base}/admin/users/${USER_ID}`, () => { started(); return pending.promise }),
    http.get(`${base}/admin/users/${OTHER_ID}`, () => new HttpResponse(null, { status: 403 })),
  )
  const view = render(tree())
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  changeSession({ status: 'authenticated', user: { ...validUser, userId: OTHER_ID }, session: authSession({ userId: OTHER_ID }) })
  view.rerender(tree())
  await screen.findByText('Administrator access is not available')
  await act(async () => pending.resolve(HttpResponse.json(adminUser())))
  expect(screen.queryByRole('heading', { name: 'Protected administrator content' })).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it.each(['session', 'token'] as const)('immediately hides old Admin state on same-user %s replacement', async mode => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  const view = render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Sensitive draft' }), { target: { value: 'old sensitive draft' } })
  const pending = deferred<Response>()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => pending.promise))
  const previous = snapshot.session!
  changeSession({ status: 'authenticated', user: validUser,
    session: mode === 'session' ? authSession() : { ...previous, accessToken: 'replacement-token' } })
  view.rerender(tree())
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(HttpResponse.json(adminUser())))
  expect(await screen.findByRole('textbox', { name: 'Sensitive draft' })).toHaveValue('')
})

it.each(['focus', 'visibility'] as const)('rechecks permission on %s and drops sensitive children if access is lost', async kind => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())))
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => new HttpResponse(null, { status: 403 })))
  if (kind === 'focus') fireEvent(window, new Event('focus'))
  else {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
  }
  expect(await screen.findByText('Administrator access is not available')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('removes the Admin subtree on a current-session Admin API 403, then restores a clean subtree after revalidation', async () => {
  server.use(
    http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
    http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => new HttpResponse(null, { status: 403 })),
  )
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Sensitive draft' }), { target: { value: 'private' } })
  fireEvent.click(screen.getByRole('button', { name: 'Read audit' }))
  await screen.findByText('Administrator access is not available')
  expect(screen.queryByRole('textbox', { name: 'Sensitive draft' })).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledOnce()
  expect(purge).not.toHaveBeenCalled()
  fireEvent(window, new Event('focus'))
  expect(await screen.findByRole('textbox', { name: 'Sensitive draft' })).toHaveValue('')
})

it('does not revoke Admin access for an unrelated LMS resource 403', async () => {
  server.use(
    http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
    http.get(`${base}/tutor/classes`, () => new HttpResponse(null, { status: 403 })),
  )
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  await act(async () => { await lmsClient.get('/tutor/classes').catch(() => {}) })
  expect(screen.getByRole('heading', { name: 'Protected administrator content' })).toBeInTheDocument()
})

it('keeps access denied after a current-session 403 during capability revalidation, even if the probe later returns 200', async () => {
  const audit = deferred<Response>()
  const started = vi.fn()
  server.use(
    http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
    http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => { started(); return audit.promise }),
  )
  render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  fireEvent.click(screen.getByRole('button', { name: 'Read audit' }))
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  const probe = deferred<Response>()
  const checking = vi.fn()
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => { checking(); return probe.promise }))
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(checking).toHaveBeenCalledOnce())
  await act(async () => audit.resolve(new HttpResponse(null, { status: 403 })))
  await screen.findByText('Administrator access is not available')
  await act(async () => probe.resolve(HttpResponse.json(adminUser())))
  expect(screen.queryByRole('heading', { name: 'Protected administrator content' })).not.toBeInTheDocument()
})

it.each(['same token', 'new token'] as const)('ignores a late Admin 403 belonging to a previous login session (%s)', async mode => {
  const pending = deferred<Response>()
  const started = vi.fn()
  server.use(
    http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
    http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => { started(); return pending.promise }),
  )
  const view = render(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  fireEvent.click(screen.getByRole('button', { name: 'Read audit' }))
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  changeSession({ status: 'authenticated', user: validUser,
    session: authSession({ accessToken: mode === 'same token' ? snapshot.session!.accessToken : 'new-login-token' }) })
  view.rerender(tree())
  await screen.findByRole('heading', { name: 'Protected administrator content' })
  await act(async () => pending.resolve(new HttpResponse(null, { status: 403 })))
  expect(screen.getByRole('heading', { name: 'Protected administrator content' })).toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
