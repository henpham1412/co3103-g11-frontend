import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { passwordRecoveryApi } from '@/api/passwordRecoveryApi'
import { ApiError } from '@/api/apiError'
import { authSession, errorEnvelope, validUser } from '@/test/fixtures/auth'
import { deferred, renderAuthPage, setAuthFields } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import { resetSuccessMessage } from '../utils/passwordRecoveryErrors'

const password = 'Safe-test-123!'
const validFields = { 'New password': password, 'Confirm password': password }

describe('ResetPasswordPage', () => {
  it('submits the captured opaque token in StrictMode, scrubs URL and replaces navigation with safe success', async () => {
    const received = vi.fn()
    server.use(http.post(identityApiUrl('/auth/reset-password'), async ({ request }) => {
      expect(request.headers.has('authorization')).toBe(false)
      received(await request.json())
      return new HttpResponse(null, { status: 204 })
    }))
    const spies = ['log', 'warn', 'error', 'info', 'debug'].map(name => vi.spyOn(console, name as 'log').mockImplementation(() => {}))
    const { user, router } = renderAuthPage('/reset-password', undefined, { search: '?token=%2B%2525', strict: true, integration: true })
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.queryByLabelText('Reset token')).not.toBeInTheDocument()
    setAuthFields(validFields)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
    expect(screen.getByRole('status')).toHaveTextContent(resetSuccessMessage)
    expect(received).toHaveBeenCalledExactlyOnceWith({ token: '+%25', new_password: password })
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.state).toEqual({ message: resetSuccessMessage })
    expect((JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).includes(password)).toBe(false)
    expect(spies.every(spy => spy.mock.calls.every(args => !JSON.stringify(args).includes(password) && !JSON.stringify(args).includes('+%25')))).toBe(true)
  })

  it.each(['', '?token=', '?token=%20', '?token=a&token=b'])('supports manual entry for missing or unusable query %s', async search => {
    const send = vi.spyOn(passwordRecoveryApi, 'resetPassword').mockResolvedValue(undefined)
    const { user } = renderAuthPage('/reset-password', undefined, { search })
    setAuthFields(validFields)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    await screen.findByText('Please enter the reset token from your email.')
    expect(send).not.toHaveBeenCalled()
    setAuthFields({ 'Reset token': ' opaque ' })
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
    expect(send.mock.calls[0][0].token === ' opaque ').toBe(true)
  })

  it('rejects each policy violation and revalidates confirmation when the new password changes', async () => {
    const send = vi.spyOn(passwordRecoveryApi, 'resetPassword')
    const { user } = renderAuthPage('/reset-password', undefined, { search: '?token=synthetic' })
    for (const value of ['Ab1!abc', 'ab1!abcd', 'AB1!ABCD', 'Abc!abcd', 'Abc1abcd']) {
      setAuthFields({ 'New password': value, 'Confirm password': value })
      await user.click(screen.getByRole('button', { name: 'Reset password' }))
      await screen.findByText('Please meet all password requirements.')
    }
    setAuthFields({ ...validFields, 'Confirm password': 'different' })
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    await screen.findByText('Passwords do not match.')
    setAuthFields({ 'Confirm password': password })
    await waitFor(() => expect(screen.queryByText('Passwords do not match.')).not.toBeInTheDocument())
    setAuthFields({ 'New password': password + 'x' })
    await screen.findByText('Passwords do not match.')
    expect(send).not.toHaveBeenCalled()
  })

  it('focuses safe query-token failure and offers a new link without echoing diagnostics', async () => {
    vi.spyOn(passwordRecoveryApi, 'resetPassword').mockRejectedValue(new ApiError(errorEnvelope({ code: 'INVALID_OR_EXPIRED_RESET_TOKEN', message: 'private diagnostic' })))
    const { user } = renderAuthPage('/reset-password', undefined, { search: '?token=synthetic' })
    setAuthFields(validFields)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(alert).toHaveTextContent('invalid or has expired')
    expect(alert).not.toHaveTextContent('private diagnostic')
    await user.click(screen.getByRole('link', { name: 'Request a new reset link' }))
    await screen.findByRole('heading', { name: 'Forgot your password?' })
  })

  it('aborts old work, clears passwords for a new query and prevents old completion unlocking a new submission', async () => {
    const first = deferred<void>(), second = deferred<void>()
    const send = vi.spyOn(passwordRecoveryApi, 'resetPassword').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { router } = renderAuthPage('/reset-password', undefined, { search: '?token=first' })
    setAuthFields(validFields)
    fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    await act(() => router.navigate('/reset-password?token=second'))
    expect(send.mock.calls[0][1]?.aborted).toBe(true)
    expect(screen.getByLabelText('New password', { exact: true })).toHaveValue('')
    setAuthFields(validFields)
    fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    await act(async () => first.resolve())
    expect(screen.getByLabelText('New password', { exact: true })).toBeDisabled()
    expect(router.state.location.pathname).toBe('/reset-password')
    await act(async () => second.resolve())
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
  })

  it('preserves another authenticated session and clears the secret form on success', async () => {
    const session = authSession()
    const { user, router } = renderAuthPage('/reset-password', undefined, { search: '?token=synthetic', authState: { status: 'authenticated', session, user: validUser } })
    setAuthFields(validFields)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('status')).toHaveTextContent(resetSuccessMessage)
    expect(screen.getByRole('link', { name: 'Back to profile' })).toHaveAttribute('href', '/profile')
    expect(router.state.location.pathname).toBe('/reset-password')
    expect(screen.queryByLabelText('New password', { exact: true })).not.toBeInTheDocument()
  })
})
