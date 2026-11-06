import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { passwordRecoveryApi } from '@/api/passwordRecoveryApi'
import { ApiError } from '@/api/apiError'
import { authSession, errorEnvelope, validUser } from '@/test/fixtures/auth'
import { deferred, renderAuthPage, setAuthFields } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import { forgotSuccessMessage } from '../utils/passwordRecoveryErrors'

describe('ForgotPasswordPage', () => {
  it('validates before HTTP and normalizes the email-only payload', async () => {
    const received = vi.fn()
    server.use(http.post(identityApiUrl('/auth/forgot-password'), async ({ request }) => {
      received(await request.json())
      return HttpResponse.json({ message: 'private account detail' })
    }))
    const { user } = renderAuthPage('/forgot-password')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByText('Please enter your email address.')
    setAuthFields({ Email: 'bad-email' })
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByText('Please enter a valid email address.')
    expect(received).not.toHaveBeenCalled()
    setAuthFields({ Email: ' Student@Example.COM ' })
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(forgotSuccessMessage)
    expect(received).toHaveBeenCalledExactlyOnceWith({ email: 'student@example.com' })
    expect(screen.queryByText('private account detail')).not.toBeInTheDocument()
  })

  it.each(['known account', 'unknown account'])('shows identical confirmation for %s acknowledgment', async message => {
    server.use(http.post(identityApiUrl('/auth/forgot-password'), () => HttpResponse.json({ message })))
    const { user } = renderAuthPage('/forgot-password', { email: validUser.email })
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(forgotSuccessMessage)
    await user.click(screen.getByRole('button', { name: 'Use another email' }))
    expect(screen.getByLabelText('Email')).toHaveValue(validUser.email)
  })

  it.each([0, 429, 503])('retains email, focuses safe feedback and allows retry after status %s', async status => {
    const send = vi.spyOn(passwordRecoveryApi, 'forgotPassword').mockRejectedValue(new ApiError(errorEnvelope({ status, message: 'private diagnostic' })))
    const { user } = renderAuthPage('/forgot-password', { email: validUser.email })
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    const banner = await screen.findByRole('alert')
    await waitFor(() => expect(banner).toHaveFocus())
    expect(banner).not.toHaveTextContent('private diagnostic')
    expect(screen.getByLabelText('Email')).toHaveValue(validUser.email)
    send.mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByRole('status')
  })

  it('guards repeated submission and ignores completion after navigation', async () => {
    const pending = deferred<void>()
    const send = vi.spyOn(passwordRecoveryApi, 'forgotPassword').mockReturnValue(pending.promise)
    const { router } = renderAuthPage('/forgot-password', { email: validUser.email })
    const form = screen.getByRole('form', { name: 'Request password reset' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Email')).toBeDisabled()
    await act(() => router.navigate('/login'))
    expect(send.mock.calls[0][1]?.aborted).toBe(true)
    await act(async () => pending.resolve())
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByText(forgotSuccessMessage)).not.toBeInTheDocument()
  })

  it.each(['authenticated', 'restore-error'] as const)('renders for %s state', async status => {
    const authState = status === 'authenticated' ? { status, user: validUser, session: authSession() }
      : { status, error: new ApiError(errorEnvelope({ status: 503 })), retrySessionVerification: vi.fn() }
    const { user } = renderAuthPage('/forgot-password', { email: validUser.email }, { authState })
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByRole('status')
  })
})
