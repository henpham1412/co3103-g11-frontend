import { act, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/authApi'
import { registeredUser } from '@/test/fixtures/auth'
import { deferred, fillAuthFields, renderAuthPage } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import type { RegisterResponse } from '@/types/auth'

const fields = {
  'Full Name': '  Nguyễn Thị Ánh  ',
  Email: 'Student@Example.COM',
  Password: 'password',
  'Confirm Password': 'password',
}

describe('RegisterPage', () => {
  it('preserves an intended destination through login, registration and sign-in', async () => {
    const { user, router } = renderAuthPage('/login', { from: { pathname: '/courses', search: '?page=2', hash: '#week1' } })
    await user.click(screen.getByRole('link', { name: 'Create account' }))
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
    expect(router.state.location.state.from).toBe('/courses?page=2#week1')
    await fillAuthFields(user, { Password: fields.Password })
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location).toMatchObject({ pathname: '/courses', search: '?page=2', hash: '#week1' }))
  })

  it.each([400, 409, 403, 429])('does not expose sensitive response text at HTTP %s', async status => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({
      message: 'SQL query contains password', detail: 'password was rejected',
      validationErrors: { password: 'Rejected secret: password' },
      errors: [{ field: 'email', message: 'Token: private-token' }, { message: 'Stacktrace: java.sql' }],
    }, { status })))
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText(status === 409 ? 'An account with this email already exists.'
      : status === 429 ? 'Too many registration attempts. Please try again later.'
        : 'Unable to create your account. Please check your details and try again.')
    expect(screen.queryByText(/SQL query|password was rejected|Rejected secret|private-token|Stacktrace/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  })

  it('renders the SSO notice, four fields in order, password checklist and login link', () => {
    renderAuthPage('/register')
    expect(screen.getByRole('heading', { name: 'Create Central Account' })).toBeInTheDocument()
    expect(screen.getByText('Central Identity · SSO Provider - Your account works across all G11 LMS services')).toBeInTheDocument()
    const labels = Array.from(screen.getByRole('form').querySelectorAll('label')).map(label => label.textContent)
    expect(labels).toEqual(['Full Name', 'Email', 'Password', 'Confirm Password'])
    for (const label of Object.keys(fields)) expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Full Name')).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    for (const label of ['Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('type', 'password')
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('autocomplete', 'new-password')
    }
    expect(screen.getByRole('list', { name: 'Password requirements' })).toHaveTextContent('At least 8 characters')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('requires all four fields and never submits invalid values', async () => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    for (const message of [
      'Please enter your full name.', 'Please enter your email address.',
      'Please enter your password.', 'Please confirm your password.',
    ]) expect(await screen.findByText(message)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('validates a blank name, invalid email, short password and nonmatching confirmation', async () => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, { 'Full Name': '   ', Email: 'bad-email', Password: 'short', 'Confirm Password': 'different' })
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    for (const message of [
      'Please enter your full name.', 'Please enter a valid email address.',
      'Password must be at least 8 characters.', 'Passwords do not match.',
    ]) expect(await screen.findByText(message)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it.each(['a'.repeat(151), 'Name\u0001'])('rejects invalid full name %j', async fullName => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, { ...fields, 'Full Name': fullName })
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText(fullName.length > 150 ? /at most 150 characters/ : /must not contain control/)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('updates both checklist conditions and rejects 73 UTF-8 bytes', async () => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    const checklist = screen.getByRole('list', { name: 'Password requirements' })
    const [minimum, maximum] = within(checklist).getAllByRole('listitem')
    expect(minimum).toHaveAttribute('data-state', 'pending')
    expect(maximum).toHaveAttribute('data-state', 'pending')
    await fillAuthFields(user, { Password: '1234567' })
    expect(minimum).toHaveAttribute('data-state', 'pending')
    expect(maximum).toHaveAttribute('data-state', 'met')
    await user.type(screen.getByLabelText('Password', { exact: true }), '8')
    expect(minimum).toHaveAttribute('data-state', 'met')
    await fillAuthFields(user, { ...fields, Password: 'ệ'.repeat(24), 'Confirm Password': 'ệ'.repeat(24) })
    expect(maximum).toHaveAttribute('data-state', 'met')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'a')
    expect(maximum).toHaveAttribute('data-state', 'exceeded')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Password must be at most 72 UTF-8 bytes.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('revalidates confirmation when the original password changes', async () => {
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'x')
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Confirm Password'), 'x')
    await waitFor(() => expect(screen.queryByText('Passwords do not match.')).not.toBeInTheDocument())
  })

  it.each(['ệ'.repeat(24), ' pass   '])('registers with normalized identity and unchanged password %j, then prefills login', async password => {
    const register = vi.spyOn(authApi, 'register')
    const received = vi.fn()
    server.use(http.post(identityApiUrl('/auth/register'), async ({ request }) => {
      received(await request.json())
      return HttpResponse.json(registeredUser, { status: 201 })
    }))
    const { user, router } = renderAuthPage('/register')
    await fillAuthFields(user, { ...fields, Password: password, 'Confirm Password': password })
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    const payload = { fullName: 'Nguyễn Thị Ánh', email: 'student@example.com', password }
    expect(register).toHaveBeenCalledExactlyOnceWith(payload, expect.any(AbortSignal))
    expect(received).toHaveBeenCalledExactlyOnceWith(payload)
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.state).toEqual({
      email: 'student@example.com', from: '/', message: 'Your account has been created successfully. Please sign in.', messageType: 'success',
    })
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
    expect(screen.getByLabelText('Email')).toHaveValue('student@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('status')).toHaveClass('ant-alert-success')
    await act(async () => { await router.navigate(-1) })
    expect(router.state.location.pathname).toBe('/before')
  })

  it('disables all inputs and prevents duplicate submission while loading', async () => {
    const pending = deferred<RegisterResponse>()
    const register = vi.spyOn(authApi, 'register').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    const button = screen.getByRole('button', { name: 'Create Account' })
    await user.dblClick(button)
    expect(button).toBeDisabled()
    expect(button).toHaveClass('ant-btn-loading')
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true')
    for (const label of Object.keys(fields)) expect(screen.getByLabelText(label, { exact: true })).toBeDisabled()
    expect(register).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(registeredUser) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('maps RFC 7807 errors to every known field and preserves multiple messages for a field', async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({
      type: 'about:blank', title: 'Validation failed', detail: 'Please correct your input.',
      errors: [
        { field: 'fullName', message: 'Full name contains invalid characters' },
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password must not exceed 72 UTF-8 bytes' },
        { field: 'password', message: 'Password must be between 8 and 128 characters' },
        { field: 'confirmPassword', message: 'Passwords do not match' },
      ],
    }, { status: 400 })))
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    for (const [label, message] of [
      ['Full Name', 'Full name must not contain control characters.'], ['Email', 'Please enter a valid email address.'],
      ['Password', 'Password must be at most 72 UTF-8 bytes.'], ['Confirm Password', 'Passwords do not match.'],
    ]) {
      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText(label, { exact: true })).toHaveAccessibleDescription(new RegExp(message))
    }
    expect(screen.getByText('Password must be at least 8 characters and at most 72 UTF-8 bytes.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeEnabled()
    await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveFocus())
  })

  it('supports the existing DOC-05 validationErrors map and clears stale errors on correction/retry', async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({
      validationErrors: { email: 'Invalid email format', fullName: null },
    }, { status: 400 })))
    const { user, router } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    await fillAuthFields(user, { Email: 'another@example.com' })
    await waitFor(() => expect(screen.queryByText('Please enter a valid email address.')).not.toBeInTheDocument())
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('replaces unbound and unknown-field diagnostics with a safe banner alongside inline errors', async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({ errors: [
      { field: 'email', message: 'Email rejected' },
      { message: 'Registration is paused.' },
      { field: null, message: 'Contact your administrator.' },
      { field: 'invitation', message: 'An invitation is required.' },
    ] }, { status: 400 })))
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Unable to create your account. Please check your details and try again.')).toBeInTheDocument()
    expect(await screen.findByText('Please check your email address.')).toBeInTheDocument()
    expect(screen.queryByText(/Registration is paused|An invitation is required|Email rejected/)).not.toBeInTheDocument()
  })

  it.each([
    [400, { detail: 'Private SQL error: password' }, 'Unable to create your account. Please check your details and try again.'],
    [409, {}, 'An account with this email already exists.'],
  ])('shows a safe error for HTTP %s without field errors', async (status, body, message) => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(body, { status })))
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText('Private SQL error: password')).not.toBeInTheDocument()
  })

  it.each([0, 500])('handles network/server failure %s without exposing internals', async status => {
    server.use(http.post(identityApiUrl('/auth/register'), () => status === 0 ? HttpResponse.error()
      : HttpResponse.json({ detail: 'Private SQL failure', errors: [{ field: 'email', message: 'Internal database error' }] }, { status })))
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText(status === 0 ? /check your connection/ : /registration service is temporarily unavailable/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.queryByText('Private SQL failure')).not.toBeInTheDocument()
    expect(screen.queryByText('Internal database error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  })

  it('aborts the request on navigation and ignores its late result', async () => {
    const pending = deferred<RegisterResponse>()
    const register = vi.spyOn(authApi, 'register').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    const signal = register.mock.calls[0][1]
    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => { pending.resolve(registeredUser) })
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: '/' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([409, 500])('restores focus on repeated HTTP %s responses', async status => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({}, { status })))
    const { user } = renderAuthPage('/register')
    await fillAuthFields(user, fields)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Create Account' }))
      await waitFor(() => expect(status === 409 ? screen.getByLabelText('Email') : screen.getByRole('alert')).toHaveFocus())
      if (status === 500) {
        await user.tab()
        expect(screen.getByLabelText('Full Name')).toHaveFocus()
      }
    }
  })
})
