import { act, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/authApi'
import { AUTH_SESSION_KEY, tokenStorage } from '@/services/tokenStorage'
import { loginResponse } from '@/test/fixtures/auth'
import { deferred, fillAuthFields, renderAuthPage } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import type { LoginResponse } from '@/types/auth'

const credentials = { Email: 'Student@Example.COM', Password: 'password' }

describe('LoginPage', () => {
  it('renders the shared header, form, default remember-me and registration link', () => {
    renderAuthPage('/login')
    expect(screen.getByRole('heading', { name: 'Sign In to G11 LMS' })).toBeInTheDocument()
    expect(screen.getByText('Enter your credentials to access your courses and dashboard')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('G11 LMS')
    expect(screen.getByText('Instance: Private Tutoring Workspace')).toBeInTheDocument()
    expect(screen.getByText('Central Identity Service')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('checkbox', { name: 'Remember me' })).not.toBeChecked()
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
  })

  it('validates required fields before sending a request', async () => {
    const login = vi.spyOn(authApi, 'login')
    const { user } = renderAuthPage('/login')
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByText('Please enter your email address.')).toBeInTheDocument()
    expect(await screen.findByText('Please enter your password.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('validates email and multibyte password limits without sending a request', async () => {
    const login = vi.spyOn(authApi, 'login')
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, { Email: 'invalid', Password: 'ệ'.repeat(24) + 'a' })
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(await screen.findByText('Password must be at most 72 UTF-8 bytes.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it.each([false, true])('logs in through the real provider/API with rememberMe=%s', async rememberMe => {
    const login = vi.spyOn(authApi, 'login')
    const { user, router } = renderAuthPage('/login', { from: '/courses?view=mine#current' })
    await fillAuthFields(user, { ...credentials, Password: 'short' })
    if (rememberMe) await user.click(screen.getByRole('checkbox', { name: 'Remember me' }))
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses'))
    expect(router.state.location.search).toBe('?view=mine')
    expect(router.state.location.hash).toBe('#current')
    expect(login).toHaveBeenCalledExactlyOnceWith({ email: 'student@example.com', password: 'short' }, expect.any(AbortSignal))
    expect(tokenStorage.getSession()).toMatchObject({ email: 'student@example.com', rememberMe })
    expect((rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY)).not.toBeNull()
    expect((rememberMe ? sessionStorage : localStorage).getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('supports a router location object as the return destination', async () => {
    const { user, router } = renderAuthPage('/login', { from: { pathname: '/courses', search: '?page=2', hash: '#week1' } })
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location).toMatchObject({ pathname: '/courses', search: '?page=2', hash: '#week1' }))
  })

  it.each([undefined, 'https://example.org', '//example.org', '/\\example.org', '/\n/example.org', { pathname: '//example.org' }, { pathname: 123 }])(
    'uses the home fallback for missing or unsafe from=%j', async from => {
      const { user, router } = renderAuthPage('/login', { from })
      await fillAuthFields(user, credentials)
      await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    },
  )

  it('disables the form, shows loading, and prevents duplicate requests', async () => {
    const pending = deferred<LoginResponse>()
    const login = vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/login')
    await fillAuthFields(user, { ...credentials, Password: 'ệ'.repeat(24) })
    const button = screen.getByRole('button', { name: 'Sign In to LMS' })
    await user.dblClick(button)
    expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveClass('ant-btn-loading')
    expect(button).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(login).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(loginResponse()) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('shows one generic 401 banner even when the backend discloses which field is wrong, then retries', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ message: 'This email does not exist' }, { status: 401 })))
    const { user, router } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password. Please try again.')
    expect(screen.queryByText('This email does not exist')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeEnabled()
    expect(tokenStorage.getSession()).toBeNull()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('formats lockedUntil in local time only for HTTP 423', async () => {
    const lockedUntil = '2026-11-01T12:30:00Z'
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ lockedUntil, code: 'ACCOUNT_LOCKED' }, { status: 423 })))
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(new Date(lockedUntil).toLocaleString())
    expect(screen.getByRole('alert')).toHaveTextContent('(local time)')
  })

  it.each([401, 500])('ignores lock metadata that conflicts with HTTP %s', async status => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({
      code: 'ACCOUNT_LOCKED', lockedUntil: '2026-11-01T12:30:00Z', message: 'Private account state',
      validationErrors: { email: 'This account is locked' },
    }, { status })))
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 401 ? /Invalid email or password/ : /temporarily unavailable/)
    expect(screen.queryByText(/temporarily locked|Private account state|This account is locked/)).not.toBeInTheDocument()
  })

  it.each(['validationErrors', 'errors'])('maps HTTP 400 %s safely and focuses the invalid field', async format => {
    const body = format === 'validationErrors' ? { validationErrors: { email: 'Invalid email format' } }
      : { errors: [{ field: 'email', message: 'Invalid email format' }, { field: 'password', message: 'Rejected secret: password' }] }
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(body, { status: 400 })))
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
    expect(screen.queryByText('Rejected secret: password')).not.toBeInTheDocument()
    expect(tokenStorage.getSession()).toBeNull()
  })

  it.each([undefined, 'not-a-date'])('handles an absent/invalid lock deadline: %s', async lockedUntil => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ lockedUntil }, { status: 423 })))
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account is temporarily locked.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Invalid Date')
  })

  it.each([0, 500, 403])('handles network/server/access failure %s safely', async status => {
    server.use(http.post(identityApiUrl('/auth/login'), () => status === 0 ? HttpResponse.error()
      : HttpResponse.json({ message: 'Private database error', validationErrors: { email: 'Email unknown' } }, { status })))
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 0 ? /connection/ : status === 500 ? /temporarily unavailable/ : /Administrator/)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.queryByText('Private database error')).not.toBeInTheDocument()
    expect(screen.queryByText('Email unknown')).not.toBeInTheDocument()
  })

  it('returns focus to the error on repeated failures, then allows keyboard correction', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({}, { status: 401 })))
    const { user } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
      await user.tab()
      expect(screen.getByLabelText('Email')).toHaveFocus()
    }
  })

  it.each(['success', 'info'])('displays %s flash messages and prefills only email from navigation state', messageType => {
    renderAuthPage('/login', { email: 'Student@Example.COM', message: 'Please sign in to continue.', messageType, password: 'never-prefill' })
    expect(screen.getByRole('status')).toHaveTextContent('Please sign in to continue.')
    expect(screen.getByRole('status')).toHaveClass('ant-alert-' + messageType)
    expect(screen.getByLabelText('Email')).toHaveValue('student@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('ignores malformed navigation state', () => {
    renderAuthPage('/login', { email: {}, message: { text: 'unsafe' }, messageType: 'error' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })

  it('toggles password visibility by mouse and keyboard', async () => {
    const { user } = renderAuthPage('/login')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    screen.getByRole('button', { name: /hide/i }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('opens usable administrator guidance and closes it without changing route', async () => {
    const { user, router } = renderAuthPage('/login')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Password assistance' })
    expect(dialog).toHaveTextContent('Self-service password reset is not enabled')
    expect(dialog).toHaveTextContent('G11 System Administrator')
    await user.click(within(dialog).getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/login')
  })

  it('does not redirect after the user leaves a pending login', async () => {
    const pending = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/login')
    await fillAuthFields(user, credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await user.click(screen.getByRole('link', { name: 'Create account' }))
    await act(async () => { pending.resolve(loginResponse()) })
    expect(router.state.location.pathname).toBe('/register')
  })
})
