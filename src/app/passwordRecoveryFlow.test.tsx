import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { forgotSuccessMessage, resetSuccessMessage } from '@/features/auth/utils/passwordRecoveryErrors'
import { authSession } from '@/test/fixtures/auth'
import { wireCurrentUser } from '@/test/fixtures/authWire'
import { wireForgotPassword, wireResetPassword } from '@/test/fixtures/passwordRecoveryWire'
import { deferred, fillAuthFields, setAuthFields } from '@/test/renderAuthPage'
import { renderProfilePage } from '@/test/renderProfilePage'
import { identityApiUrl, server } from '@/test/server'

// Wait for lazy routes and session bootstrap, including on two-CPU runners.
const uiReady = { timeout: 5000 }

it('completes login → forgot → query reset → sign-in through real routes, provider and HTTP without disclosing secrets', async () => {
  const spies = ['log', 'warn', 'error', 'info', 'debug'].map(method => vi.spyOn(console, method as 'log').mockImplementation(() => {}))
  const received = vi.fn()
  server.use(http.post(identityApiUrl('/auth/forgot-password'), async ({ request }) => {
    expect(request.headers.has('authorization')).toBe(false)
    expect(await request.json()).toEqual(wireForgotPassword)
    return HttpResponse.json({ message: 'untrusted account detail' })
  }), http.post(identityApiUrl('/auth/reset-password'), async ({ request }) => {
    expect(request.headers.has('authorization')).toBe(false)
    received(await request.json())
    return new HttpResponse(null, { status: 204 })
  }))
  const { user, router } = renderProfilePage({ session: null, path: '/login' })
  await user.click(await screen.findByRole('link', { name: 'Forgot password?' }, uiReady))
  await screen.findByRole('heading', { name: 'Forgot your password?' }, uiReady)
  await fillAuthFields(user, { Email: ' Student@Example.COM ' })
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('status', {}, uiReady)).toHaveTextContent(forgotSuccessMessage)
  expect(screen.queryByText('untrusted account detail')).not.toBeInTheDocument()
  await act(() => router.navigate('/reset-password?token=' + encodeURIComponent(wireResetPassword.token)))
  await screen.findByRole('heading', { name: 'Reset your password' }, uiReady)
  await waitFor(() => expect(router.state.location.search).toBe(''), uiReady)
  await fillAuthFields(user, { 'New password': wireResetPassword.new_password, 'Confirm password': wireResetPassword.new_password })
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)
  expect(screen.getByRole('status')).toHaveTextContent(resetSuccessMessage)
  expect(received).toHaveBeenCalledExactlyOnceWith(wireResetPassword)
  expect(router.state.location.state).toEqual({ message: resetSuccessMessage })
  expect(tokenStorage.getSession()).toBeNull()
  const publicOutput = JSON.stringify([localStorage, sessionStorage, router.state.location.state, document.body.textContent, spies.map(spy => spy.mock.calls)])
  expect([wireResetPassword.token, wireResetPassword.new_password].every(secret => !publicOutput.includes(secret))).toBe(true)
})

it('supports required manual token, invalid-token feedback, requesting again and a successful retry', async () => {
  let attempts = 0
  server.use(http.post(identityApiUrl('/auth/reset-password'), () => ++attempts === 1
    ? HttpResponse.json({ code: 'INVALID_OR_EXPIRED_RESET_TOKEN', message: 'untrusted diagnostic' }, { status: 400 }) : new HttpResponse(null, { status: 204 })))
  const { user } = renderProfilePage({ session: null, path: '/reset-password' })
  await screen.findByLabelText('Reset token', {}, uiReady)
  setAuthFields({ 'New password': 'Safe-test-123!', 'Confirm password': 'Safe-test-123!' })
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByText('Please enter the reset token from your email.')
  expect(attempts).toBe(0)
  await fillAuthFields(user, { 'Reset token': 'invalid-synthetic' })
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findAllByText(/This reset link is invalid or has expired/, {}, uiReady)
  expect(screen.queryByText('untrusted diagnostic')).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Request a new reset link' }))
  await screen.findByRole('heading', { name: 'Forgot your password?' }, uiReady)
  await user.click(screen.getByRole('link', { name: 'Enter a reset token' }))
  await screen.findByLabelText('Reset token', {}, uiReady)
  await fillAuthFields(user, { 'Reset token': 'replacement-synthetic', 'New password': 'Safe-test-123!', 'Confirm password': 'Safe-test-123!' })
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)
  expect(attempts).toBe(2)
})

it.each(['initializing', 'restore-error', 'authenticated'])('keeps recovery public during %s and isolates both public 401s from the saved session', async phase => {
  const session = authSession()
  const pending = deferred<Response>(), started = deferred<void>()
  server.use(http.get(identityApiUrl('/users/me'), () => {
    started.resolve()
    return phase === 'initializing' ? pending.promise : phase === 'restore-error' ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(wireCurrentUser)
  }))
  for (const endpoint of ['/auth/forgot-password', '/auth/reset-password']) server.use(http.post(identityApiUrl(endpoint), ({ request }) => {
    expect(request.headers.has('authorization')).toBe(false)
    return HttpResponse.json({ message: 'private diagnostic' }, { status: 401 })
  }))
  const { user, router } = renderProfilePage({ session, path: '/forgot-password' })
  await started.promise
  await screen.findByRole('heading', { name: 'Forgot your password?' }, uiReady)
  setAuthFields({ Email: 'student@example.com' })
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByText('Unable to complete this request. Please try again later.', {}, uiReady)
  expect(tokenStorage.getSession()?.sessionId).toBe(session.sessionId)
  await act(() => router.navigate('/reset-password?token=synthetic'))
  await screen.findByRole('heading', { name: 'Reset your password' }, uiReady)
  setAuthFields({ 'New password': 'Safe-test-123!', 'Confirm password': 'Safe-test-123!' })
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByText('Unable to complete this request. Please try again later.', {}, uiReady)
  expect(tokenStorage.getSession()?.sessionId).toBe(session.sessionId)
  await act(() => router.navigate('/profile'))
  if (phase === 'initializing') {
    expect(screen.getByRole('status', { name: 'Verifying your session' })).toBeInTheDocument()
    await act(async () => pending.resolve(new HttpResponse(null, { status: 503 })))
  }
  if (phase !== 'authenticated') {
    await screen.findByRole('button', { name: 'Retry' }, uiReady)
    expect(screen.queryByRole('heading', { name: 'My profile' })).not.toBeInTheDocument()
  } else await screen.findByRole('heading', { name: 'My profile' }, uiReady)
})
