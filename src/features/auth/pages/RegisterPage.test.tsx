import { AxiosError } from 'axios'
import { ApiError } from '@/api/apiError'
import { errorEnvelope } from '@/test/fixtures/auth'
import { tokenStorage } from '../services/tokenStorage'
import { registerErrorPresentation } from '../utils/authErrorPresentation'
import { act, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/authApi'
import { registeredUser } from '@/test/fixtures/auth'
import { wireRegisteredUser } from '@/test/fixtures/authWire'
import { deferred, fillAuthFields, renderAuthPage, setAuthFields } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import type { RegisterResponse } from '@/types/auth'

const fields = {
  'Full Name': '  Nguyễn Thị Ánh  ',
  Email: 'Student@Example.COM',
  Password: 'password',
  'Confirm Password': 'password',
}

describe('RegisterPage', () => {
  it('maps canonical details to controls and keeps malformed or unbound diagnostics safe', async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({
      details: [null, 'invalid', { field: 'email' },
        { field: 'full_name', message: 'Full name contains invalid characters', rejectedValue: 'private' },
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password must not exceed 72 bytes' },
        { field: '__proto__', message: 'SQL secret' }, { field: 'email.value', message: 'SQL secret' },
        { field: null, message: 'private' }, { message: 'private' }],
      validationErrors: { fullName: 'Full name is required' },
    }, { status: 400 })))
    const { user } = renderAuthPage('/register')
    setAuthFields(fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveFocus())
    expect(screen.getByLabelText('Full Name')).toHaveAccessibleDescription('Full name must not contain control characters.')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Please enter a valid email address.')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAccessibleDescription(/Password must be at most 72 UTF-8 bytes\./)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to create your account.')
    expect(screen.queryByText(/SQL secret|private|Full name is required/)).not.toBeInTheDocument()
  })

  it("registers normalized identity with unchanged password, then signs in to the intended destination", async () => {
    const received = vi.fn()
    server.use(http.post(identityApiUrl('/auth/register'), async ({ request }) => {
      received(await request.json())
      return HttpResponse.json(wireRegisteredUser, { status: 201 })
    }))
    const { user, router } = renderAuthPage('/login', { from: { pathname: '/courses', search: '?page=2', hash: '#week1' } }, { integration: true })
    await user.click(screen.getByRole('link', { name: 'Create account' }))

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
    await fillAuthFields(user, { ...fields, Password: ' pass   ', 'Confirm Password': ' pass   ' })
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
    expect(received).toHaveBeenCalledExactlyOnceWith({ full_name: 'Nguyễn Thị Ánh', email: 'student@example.com', password: ' pass   ' })
    expect(tokenStorage.getSession()).toBeNull()
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.getByLabelText('Email')).toHaveValue('student@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('status')).toHaveClass('ant-alert-success')
    expect(screen.getByRole('status')).toHaveTextContent('Your account has been created successfully. Please sign in.')
    expect(router.state.location.state.from).toBe('/courses?page=2#week1')
    await fillAuthFields(user, { Password: ' pass   ' })
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await waitFor(() => expect(router.state.location).toMatchObject({ pathname: '/courses', search: '?page=2', hash: '#week1' }))
    expect(router.state.historyAction).toBe('REPLACE')
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/login')
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/before')
  })

  it("requires all four fields and never submits invalid values", async () => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    for (const message of [
      'Please enter your full name.', 'Please enter your email address.',
      'Please enter your password.', 'Please confirm your password.',
    ]) expect(await screen.findByText(message)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it("validates a blank name, invalid email, short password and nonmatching confirmation", async () => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    setAuthFields({ 'Full Name': '   ', Email: 'bad-email', Password: 'short', 'Confirm Password': 'different' })
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    for (const message of [
      'Please enter your full name.', 'Please enter a valid email address.',
      'Password must be at least 8 characters.', 'Passwords do not match.',
    ]) expect(await screen.findByText(message)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it("updates both checklist conditions and rejects 73 UTF-8 bytes", async () => {
    const register = vi.spyOn(authApi, 'register')
    const { user } = renderAuthPage('/register')
    const checklist = screen.getByRole('list', { name: 'Password requirements' })
    const [minimum, maximum] = within(checklist).getAllByRole('listitem')
    expect(minimum).toHaveAttribute('data-state', 'pending')
    expect(maximum).toHaveAttribute('data-state', 'pending')
    await fillAuthFields(user, { Password: '1234567' })
    expect(minimum).toHaveAttribute('data-state', 'pending')
    await waitFor(() => expect(maximum).toHaveAttribute('data-state', 'met'))
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

  it("revalidates confirmation when the original password changes", async () => {
    const { user } = renderAuthPage('/register')
    setAuthFields(fields)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'x')
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Confirm Password'), 'x')
    await waitFor(() => expect(screen.queryByText('Passwords do not match.')).not.toBeInTheDocument())
  })

  it("disables all inputs and prevents duplicate submission while loading", async () => {
    const pending = deferred<RegisterResponse>()
    const register = vi.spyOn(authApi, 'register').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/register')
    setAuthFields(fields)
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

  it("binds RFC errors, accessible descriptions and safe unbound diagnostics with first-field focus", async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({
      type: 'about:blank', title: 'Validation failed', detail: 'Please correct your input.',
      errors: [
        { field: 'fullName', message: 'Full name contains invalid characters' },
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password must not exceed 72 UTF-8 bytes' },
        { field: 'password', message: 'Password must be between 8 and 128 characters' },
        { field: 'confirmPassword', message: 'Passwords do not match' },
        { field: 'invitation', message: 'private-token' },
        { message: 'Stacktrace: java.sql' },
      ],
    }, { status: 400 })))
    const { user } = renderAuthPage('/register')
    setAuthFields(fields)
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
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to create your account. Please check your details and try again.')
    expect(screen.queryByText(/private-token|Stacktrace/)).not.toBeInTheDocument()
  })

  it("supports the existing DOC-05 validationErrors map and clears stale errors on correction/retry", async () => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({
      validationErrors: { email: 'Invalid email format', fullName: null },
    }, { status: 400 })))
    const { user, router } = renderAuthPage('/register')
    setAuthFields(fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    setAuthFields({ Email: 'another@example.com' })
    await waitFor(() => expect(screen.queryByText('Please enter a valid email address.')).not.toBeInTheDocument())
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it.each([409, 500])('restores focus on repeated HTTP %s responses', async status => {
    server.use(http.post(identityApiUrl('/auth/register'), () => HttpResponse.json({ message: 'SQL query contains password', detail: 'Private SQL failure', details: [{ field: 'password', message: 'Password is required' }], errors: [{ field: 'email', message: 'private-token' }] }, { status })))
    const { user } = renderAuthPage('/register')
    setAuthFields(fields)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Create Account' }))
      if (status === 409) {
        await waitFor(() => {
          expect(screen.getByLabelText('Email')).toHaveFocus()
          expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('An account with this email already exists.')
        })
      } else {
        await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
        expect(screen.getByRole('alert')).toHaveTextContent('The registration service is temporarily unavailable. Please try again later.')
        await user.tab()
        expect(screen.getByLabelText('Full Name')).toHaveFocus()
        await user.keyboard('a')
      }
      expect(screen.queryByText(/SQL query|Private SQL|private-token/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
    }
  })

  it("presents safe fallback errors without rendering a page", () => {
    for (const [status, message] of [
      [400, 'Unable to create your account. Please check your details and try again.'],
      [403, 'Unable to create your account. Please check your details and try again.'],
      [429, 'Too many registration attempts. Please try again later.'],
      [500, 'The registration service is temporarily unavailable. Please try again later.'],
    ] as const) {
      const result = registerErrorPresentation(new ApiError(errorEnvelope({ status, message: 'SQL query contains password', code: 'DUPLICATE_EMAIL' })))
      expect(result.message, String(status)).toBe(message)
      expect(result.field).toBeUndefined()
    }
    expect(registerErrorPresentation(new AxiosError('private network details', 'ERR_NETWORK')).message).toMatch(/check your connection/)
    expect(registerErrorPresentation(new ApiError(errorEnvelope({ status: 409, message: 'private', errors: [{ field: 'password', message: 'secret' }] })))).toEqual({ fields: [{ name: 'email', errors: ['An account with this email already exists.'] }], field: 'email' })
  })

  it("aborts the request on navigation and ignores its late result", async () => {
    const pending = deferred<RegisterResponse>()
    const register = vi.spyOn(authApi, 'register').mockReturnValue(pending.promise)
    const { user, router } = renderAuthPage('/register')
    setAuthFields(fields)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    const signal = register.mock.calls[0][1]
    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => { pending.resolve(registeredUser) })
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: '/' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
