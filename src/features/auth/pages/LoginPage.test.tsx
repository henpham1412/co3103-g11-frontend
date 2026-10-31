import { AxiosError } from 'axios'
import { ApiError } from '@/api/apiError'
import { errorEnvelope } from '@/test/fixtures/auth'
import { loginErrorMessage } from '../utils/authErrorPresentation'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/authApi'
import { AUTH_SESSION_KEY, tokenStorage } from '@/features/auth/services/tokenStorage'
import { loginResponse } from '@/test/fixtures/auth'
import { wireLoginResponse } from '@/test/fixtures/authWire'
import { deferred, fillAuthFields, renderAuthPage, setAuthFields } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import type { LoginResponse } from '@/types/auth'

const credentials = { Email: 'Student@Example.COM', Password: 'password' }

function configureLms() {
  vi.stubEnv('VITE_AUTH_MODE', 'lms')
  vi.stubEnv('VITE_LMS_CLIENT_ID', 'g11-lms')
  vi.stubEnv('VITE_LMS_REDIRECT_URI', 'https://LMS.example:443/%61?view=mine#week1')
}

describe('LoginPage', () => {
  it('keeps deployment context across auth navigation and ignores query/state overrides', async () => {
    configureLms()
    const received = vi.fn()
    server.use(http.post(identityApiUrl('/auth/login'), async ({ request }) => {
      received(await request.json())
      return HttpResponse.json(wireLoginResponse({ client_id: 'g11-lms' }))
    }))
    const { user, router } = renderAuthPage('/login', { from: '/courses?view=mine#current' }, { integration: true })
    await user.click(screen.getByRole('link', { name: 'Create account' }))
    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    await act(() => router.navigate('/login?client_id=attacker&redirect_uri=https://outside.example', {
      state: { ...router.state.location.state, clientId: 'attacker', redirectUri: 'https://outside.example' },
    }))
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location).toMatchObject({ pathname: '/courses', search: '?view=mine', hash: '#current' }))
    expect(received).toHaveBeenCalledExactlyOnceWith({
      email: 'student@example.com', password: 'password', client_id: 'g11-lms',
      redirect_uri: 'https://LMS.example:443/%61?view=mine#week1',
    })
    const session = tokenStorage.getSession()
    expect(session).not.toBeNull()
    expect(JSON.stringify(router.state.location)).not.toContain(session!.accessToken)
    expect(session).not.toHaveProperty('clientId')
    expect(session).not.toHaveProperty('redirectUri')
  })

  it.each([undefined, 'central-identity', 'other-client'])('does not store a session or navigate for invalid LMS echo: %s', async client_id => {
    configureLms()
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(wireLoginResponse({ client_id }))))
    const { user, router } = renderAuthPage('/login', undefined, { integration: true })
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The sign-in service is temporarily unavailable.')
    expect(router.state.location.pathname).toBe('/login')
    expect(tokenStorage.getSession()).toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it.each([
    ['lms', '', ''], ['lms', 'g11-lms', ''], ['lms', '', 'https://lms.example/'],
    ['lms', ' ', 'https://lms.example/'], ['unknown', '', ''],
    ['lms', 'g11-lms', 'https://user:secret@lms.example/'], ['lms', 'g11-lms', 'javascript:alert(1)'],
    ['standalone', 'g11-lms', 'https://lms.example/'],
  ])('blocks credentials for invalid config %s / %s / %s', async (mode, clientId, redirectUri) => {
    vi.stubEnv('VITE_AUTH_MODE', mode)
    vi.stubEnv('VITE_LMS_CLIENT_ID', clientId)
    vi.stubEnv('VITE_LMS_REDIRECT_URI', redirectUri)
    const login = vi.spyOn(authApi, 'login')
    renderAuthPage('/login', undefined, { integration: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in is not configured correctly.')
    expect(screen.getByRole('alert')).not.toHaveTextContent(/secret|javascript|lms\.example/)
    expect(screen.getByRole('button', { name: 'Sign In to LMS' })).toBeDisabled()
    setAuthFields(credentials)
    await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'Sign in' })) })
    expect(login).not.toHaveBeenCalled()
    expect(tokenStorage.getSession()).toBeNull()
  })

  it.each(['INVALID_CLIENT', 'INVALID_REDIRECT_URI'])('shows safe configuration feedback for backend %s', async code => {
    configureLms()
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({
      code, message: 'private client configuration', details: [{ field: 'client_id', message: 'private client configuration' }],
    }, { status: 400 })))
    const { user, router } = renderAuthPage('/login', undefined, { integration: true })
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is not configured correctly.')
    expect(screen.queryByText('private client configuration')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(tokenStorage.getSession()).toBeNull()
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it.each([undefined, 'central-identity'])('allows standalone response client %s without sending context', async client_id => {
    const received = vi.fn()
    server.use(http.post(identityApiUrl('/auth/login'), async ({ request }) => {
      received(await request.json())
      return HttpResponse.json(wireLoginResponse({ client_id }))
    }))
    const { user, router } = renderAuthPage('/login', { from: 'https://outside.example/' }, { integration: true })
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(received).toHaveBeenCalledExactlyOnceWith({ email: 'student@example.com', password: 'password' })
    expect(tokenStorage.getSession()).not.toBeNull()
    expect(router.state.location.search).toBe('')
  })

  it('maps details safely, focuses the first field and clears stale diagnostics on retry', async () => {
    let attempts = 0
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(++attempts === 1 ? {
      status: 401, details: [null, { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: '<img src=x onerror=alert(1)> secret' }, { field: 'redirect_uri', message: 'SQL secret' }],
      validationErrors: { email: 'Email is required' },
    } : { details: [] }, { status: 400 })))
    const { user } = renderAuthPage('/login')
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Please check your password.')
    expect(screen.getByRole('alert')).toHaveTextContent('Please check your sign-in details')
    expect(screen.queryByText(/SQL secret|onerror|Email is required/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('ignores field diagnostics on HTTP 500 and focuses the service banner', async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({
      status: 401, details: [{ field: 'email', message: 'Email is required' }], message: 'SQL secret',
    }, { status: 500 })))
    const { user } = renderAuthPage('/login', undefined, { integration: true })
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.getByRole('alert')).toHaveTextContent('The sign-in service is temporarily unavailable.')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/SQL secret|Email is required/)).not.toBeInTheDocument()
  })

  it.each([false, true])('logs in through the real provider/API with rememberMe=%s', async rememberMe => {
    const login = vi.spyOn(authApi, 'login')
    const { user, router } = renderAuthPage('/login', { from: '/courses?view=mine#current' }, { integration: true })
    if (!rememberMe) {
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
      await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
      expect(await screen.findByText('Please enter your email address.')).toBeInTheDocument()
      expect(await screen.findByText('Please enter your password.')).toBeInTheDocument()
      expect(login).not.toHaveBeenCalled()
    }
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

  it("validates email and multibyte password limits without sending a request", async () => {
    const login = vi.spyOn(authApi, 'login')
    const { user } = renderAuthPage('/login')
    setAuthFields({ Email: 'invalid', Password: 'ệ'.repeat(24) + 'a' })
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(await screen.findByText('Password must be at most 72 UTF-8 bytes.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it("rejects unsafe return URLs while preventing duplicate pending submissions at 72 bytes", async () => {
    const pending = deferred<LoginResponse>()
    const login = vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/login', { from: 'https://outside.example/collect' })
    setAuthFields({ ...credentials, Password: 'ệ'.repeat(24) })
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

  it("uses generic 401 feedback, repeated focus and correction before retry", async () => {
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ message: 'This email does not exist', code: 'ACCOUNT_LOCKED', locked_until: '2026-11-01T12:30:00Z', details: [{ field: 'email', message: 'This account is locked' }], validationErrors: { email: 'This account is locked' } }, { status: 401 })))
    const { user, router } = renderAuthPage('/login')
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password. Please try again.')
    expect(screen.queryByText('This email does not exist')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeEnabled()
    expect(tokenStorage.getSession()).toBeNull()
    expect(screen.queryByText(/temporarily locked|This account is locked/)).not.toBeInTheDocument()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
      await user.tab()
      expect(screen.getByLabelText('Email')).toHaveFocus()
    }
    await user.clear(screen.getByLabelText('Email'))
    await user.keyboard('corrected@example.com')
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it("formats lockedUntil in local time only for HTTP 423", async () => {
    const lockedUntil = '2026-11-01T12:30:00Z'
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json({ locked_until: lockedUntil, code: 'ACCOUNT_LOCKED' }, { status: 423 })))
    const { user } = renderAuthPage('/login')
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(new Date(lockedUntil).toLocaleString())
    expect(screen.getByRole('alert')).toHaveTextContent('(local time)')
  })

  it("presents safe errors by HTTP status without rendering a page", () => {
    for (const [status, expected] of [
      [401, 'Invalid email or password. Please try again.'],
      [400, 'Please check your sign-in details and try again.'],
      [403, 'Unable to sign in. Please contact your G11 System Administrator.'],
      [429, 'Too many sign-in attempts. Please try again later.'],
      [500, 'The sign-in service is temporarily unavailable. Please try again later.'],
      [418, 'Unable to sign in. Please try again later.'],
    ] as const) {
      const problem = new ApiError(errorEnvelope({ status, message: 'Private account state', code: 'ACCOUNT_LOCKED', lockedUntil: '2026-11-01T12:30:00Z', validationErrors: { email: 'This account is locked' } }))
      expect(loginErrorMessage(problem), String(status)).toBe(expected)
    }
    for (const lockedUntil of [undefined, 'not-a-date']) {
      expect(loginErrorMessage(new ApiError(errorEnvelope({ status: 423, lockedUntil })))).toBe('Your account is temporarily locked. Please try again later or contact your G11 System Administrator.')
    }
    expect(loginErrorMessage(new AxiosError('private transport details', 'ERR_NETWORK'))).toMatch(/check your connection/)
    expect(loginErrorMessage(new AxiosError('timeout of 15000ms exceeded', 'ETIMEDOUT'))).toBe('The request timed out. Please try again.')
  })

  it("binds safe HTTP 400 field errors with accessible descriptions and focus", async () => {
    const body = { validationErrors: { email: 'Invalid email format' }, errors: [{ field: 'email', message: 'Invalid email format' }, { field: 'password', message: 'Rejected secret: password' }] }
    server.use(http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(body, { status: 400 })))
    const { user } = renderAuthPage('/login')
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
    expect(screen.queryByText('Rejected secret: password')).not.toBeInTheDocument()
    expect(tokenStorage.getSession()).toBeNull()

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Please enter a valid email address.')
    expect(await screen.findByText('Please check your password.')).toBeInTheDocument()
  })

  it("handles a transport failure with safe feedback and restores form focus", async () => {
    const status = 0

    server.use(http.post(identityApiUrl('/auth/login'), () => status === 0 ? HttpResponse.error()
      : HttpResponse.json({ message: 'Private database error', validationErrors: { email: 'Email unknown' } }, { status })))
    const { user } = renderAuthPage('/login')
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 0 ? /connection/ : status === 500 ? /temporarily unavailable/ : /Administrator/)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.queryByText('Private database error')).not.toBeInTheDocument()
    expect(screen.queryByText('Email unknown')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Sign In to LMS' })).toBeEnabled()
  })

  it.each(['expired', 'unauthorized'] as const)('shows safe navigation state and %s session feedback', async reason => {
    const navigation = reason === 'expired'
      ? { email: 'Student@Example.COM', message: 'Please sign in to continue.', messageType: 'info', password: 'never-prefill' }
      : { email: {}, message: { text: 'unsafe' }, messageType: 'error', password: 'never-prefill' }
    const { router } = renderAuthPage('/login', navigation, { authState: { status: 'anonymous', reason } })
    expect(screen.getByRole('status')).toHaveTextContent(reason === 'expired'
      ? 'Please sign in to continue.' : 'Your session has expired. Please sign in again.')
    expect(screen.getByRole('status')).toHaveClass('ant-alert-info')
    expect(screen.getByLabelText('Email')).toHaveValue(reason === 'expired' ? 'student@example.com' : '')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    await act(() => router.navigate('/login', { state: { email: {}, message: { text: 'unsafe' }, messageType: 'error' } }))
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired. Please sign in again.')
    expect(screen.queryByText('unsafe')).not.toBeInTheDocument()
  })

  it("toggles password visibility by mouse and keyboard", async () => {
    const { user } = renderAuthPage('/login')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    screen.getByRole('button', { name: /hide/i }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it("opens usable administrator guidance and closes it without changing route", async () => {
    const { user, router } = renderAuthPage('/login')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Password assistance' })
    expect(dialog).toHaveTextContent('Self-service password reset is not enabled')
    expect(dialog).toHaveTextContent('G11 System Administrator')
    await user.click(within(dialog).getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/login')
  })

  it("does not redirect after the user leaves a pending login", async () => {
    const pending = deferred<LoginResponse>()
    vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/login')
    setAuthFields(credentials)
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await user.click(screen.getByRole('link', { name: 'Create account' }))
    await act(async () => { pending.resolve(loginResponse()) })
    expect(router.state.location.pathname).toBe('/register')
  })
})
