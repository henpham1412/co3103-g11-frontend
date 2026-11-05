import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { authApi } from '@/api/authApi'
import { AUTH_SESSION_KEY, tokenStorage } from '@/features/auth/services/tokenStorage'
import AuthTestMotion from '@/test/AuthTestMotion'
import { authSession, createToken, loginResponse, validUser } from '@/test/fixtures/auth'
import { wireCurrentUser, wireLoginResponse } from '@/test/fixtures/authWire'
import { identityApiUrl, server } from '@/test/server'
import { deferred, fillAuthFields } from '@/test/renderAuthPage'
import type { LoginResponse } from '@/types/auth'
import App from './App'
import AppProviders from './providers'
import { router as appRouter } from './router'

// Cold lazy routes and session bootstrap can exceed 1s on two-CPU runners.
const uiReady = { timeout: 5000 }

it('cancels a pending login when leaving its page with the real provider and guards', async () => {
  localStorage.clear()
  sessionStorage.clear()
  const pending = deferred<LoginResponse>()
  const login = vi.spyOn(authApi, 'login').mockReturnValue(pending.promise)
  const user = userEvent.setup()
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ['/login'] })
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AppProviders><AuthTestMotion><RouterProvider router={router} /></AuthTestMotion></AppProviders>
    </ConfigProvider>,
  )
  try {
    await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)
    await fillAuthFields(user, { Email: validUser.email, Password: 'password' })
    await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
    await user.click(screen.getByRole('link', { name: 'Create account' }))
    await screen.findByRole('heading', { name: 'Create Central Account' }, uiReady)
    await act(async () => { pending.resolve(loginResponse()) })
    expect(router.state.location.pathname).toBe('/register')
    expect(tokenStorage.getSession()).toBeNull()
    expect(login.mock.calls[0][1]?.aborted).toBe(true)
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
  } finally {
    view.unmount()
    router.dispose()
  }
})

it.each(['lazy import', 'render'])('recovers from a route %s failure without showing internal details', async failure => {
  const problem = new Error('Private diagnostic details')
  function BrokenPage(): never { throw problem }
  const router = createMemoryRouter([{
    ...appRouter.routes[0],
    index: false,
    children: [{
      path: '/failure',
      ...(failure === 'lazy import'
        ? { lazy: async () => { throw problem } }
        : { Component: BrokenPage }),
    }],
  }], { initialEntries: ['/failure'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const view = render(
    <AuthContext value={{
      state: { status: 'authenticated', user: validUser, session: authSession() },
      login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn(), refreshCurrentUser: vi.fn(),
    }}>
      <RouterProvider router={router} />
    </AuthContext>,
  )
  try {
    expect(await screen.findByRole('heading', { name: 'Unable to load this page' }, uiReady)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Please reload the page to try again.')
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled()
    expect(screen.queryByText(/Private diagnostic details/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
  } finally {
    view.unmount()
    router.dispose()
  }
})

it('shows an accessible fallback while a lazy route loads', async () => {
  let resolvePage!: (value: { Component: () => React.JSX.Element }) => void
  const page = new Promise<{ Component: () => React.JSX.Element }>(resolve => { resolvePage = resolve })
  const router = createMemoryRouter([{
    ...appRouter.routes[0],
    index: false,
    children: [{ path: '/loading', lazy: () => page }],
  }], { initialEntries: ['/loading'] })
  const view = render(<RouterProvider router={router} />)
  try {
    expect(screen.getByRole('status')).toHaveTextContent('Loading authentication')
    expect(screen.queryByText('Loaded page')).not.toBeInTheDocument()
    await act(async () => { resolvePage({ Component: () => <p>Loaded page</p> }) })
    expect(await screen.findByText('Loaded page', {}, uiReady)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  } finally {
    view.unmount()
    router.dispose()
  }
})

it('keeps the workspace usable when the session expiry exceeds the date display range', () => {
  const session = authSession({ expiresAt: 9e15, accessToken: createToken({ exp: 9e12 }) })
  render(
    <AuthContext value={{
      state: { status: 'authenticated', user: validUser, session },
      login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn(), refreshCurrentUser: vi.fn(),
    }}>
      <App />
    </AuthContext>,
  )
  expect(screen.getByRole('heading', { name: `Welcome, ${validUser.fullName}` })).toBeInTheDocument()
  expect(screen.getByText('Unavailable')).toBeInTheDocument()
})

it.each([
  { mode: 'standalone', rememberMe: false }, { mode: 'standalone', rememberMe: true },
  { mode: 'lms', rememberMe: false }, { mode: 'lms', rememberMe: true },
])('registers, logs in, restores from wire identity and signs out ($mode, rememberMe=$rememberMe)', { timeout: 30000 }, async ({ mode, rememberMe }) => {
  vi.stubEnv('VITE_AUTH_MODE', mode)
  if (mode === 'lms') {
    vi.stubEnv('VITE_LMS_CLIENT_ID', 'g11-lms')
    vi.stubEnv('VITE_LMS_REDIRECT_URI', 'http://localhost:5173/')
  }
  const received = vi.fn()
  server.use(http.post(identityApiUrl('/auth/login'), async ({ request }) => {
    received(await request.json())
    return HttpResponse.json(wireLoginResponse(mode === 'lms' ? { client_id: 'g11-lms' } : {}))
  }))
  localStorage.clear()
  sessionStorage.clear()
  const user = userEvent.setup()
  let router = createMemoryRouter(appRouter.routes, { initialEntries: ['/?view=mine#current'] })
  let view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AppProviders><AuthTestMotion><RouterProvider router={router} /></AuthTestMotion></AppProviders>
    </ConfigProvider>,
  )

  expect(await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.state.from).toMatchObject({ pathname: '/', search: '?view=mine', hash: '#current' })

  await user.click(screen.getByRole('link', { name: 'Create account' }))
  await screen.findByRole('heading', { name: 'Create Central Account' }, uiReady)
  await fillAuthFields(user, { 'Full Name': validUser.fullName, Email: validUser.email, Password: 'password', 'Confirm Password': 'password' })
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)
  expect(tokenStorage.getSession()).toBeNull()
  expect(screen.getByLabelText('Email')).toHaveValue(validUser.email)
  await fillAuthFields(user, { Password: 'password' })
  if (rememberMe) await user.click(screen.getByRole('checkbox', { name: 'Remember me' }))
  await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
  expect(await screen.findByRole('heading', { name: `Welcome, ${validUser.fullName}` }, uiReady)).toBeInTheDocument()
  expect(router.state.location).toMatchObject({ pathname: '/', search: '?view=mine', hash: '#current' })
  expect(received).toHaveBeenCalledExactlyOnceWith({ email: validUser.email, password: 'password',
    ...(mode === 'lms' ? { client_id: 'g11-lms', redirect_uri: 'http://localhost:5173/' } : {}),
  })
  let header = within(screen.getByRole('banner'))
  expect(header.getByRole('link', { name: 'G11 LMS home' })).toBeInTheDocument()
  expect(header.getByText(validUser.fullName)).toBeInTheDocument()
  expect(header.queryByText(validUser.email)).not.toBeInTheDocument()
  expect(header.queryByText(validUser.status)).not.toBeInTheDocument()
  expect(header.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
  const main = screen.getByRole('main')
  expect(main).toHaveTextContent('Session information')
  expect(main).toHaveTextContent('Platform status')
  expect(tokenStorage.getSession()).not.toBeNull()
  expect(within(main).getByRole('time')).toHaveAttribute('datetime', new Date(tokenStorage.getSession()!.expiresAt).toISOString())

  const saved = tokenStorage.getSession()!
  expect(saved).toMatchObject({ ...validUser, version: 2, rememberMe, tokenType: 'Bearer' })
  expect(Object.keys(saved).sort()).toEqual([
    'sessionId', 'accessToken', 'tokenType', 'userId', 'email', 'fullName', 'status', 'expiresAt', 'rememberMe', 'version',
  ].sort())
  expect((rememberMe ? localStorage : sessionStorage).getItem(AUTH_SESSION_KEY)).not.toBeNull()
  expect((rememberMe ? sessionStorage : localStorage).getItem(AUTH_SESSION_KEY)).toBeNull()
  server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
    expect(request.headers.get('authorization')).toBe(`Bearer ${saved.accessToken}`)
    return HttpResponse.json({ ...wireCurrentUser, full_name: 'Verified Student', role: 'ADMINISTRATOR' })
  }))
  view.unmount()
  router.dispose()
  router = createMemoryRouter(appRouter.routes, { initialEntries: ['/?view=mine#current'] })
  view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AppProviders><AuthTestMotion><RouterProvider router={router} /></AuthTestMotion></AppProviders>
    </ConfigProvider>,
  )
  await screen.findByRole('heading', { name: 'Welcome, Verified Student' }, uiReady)
  header = within(screen.getByRole('banner'))
  expect(header.getByText('Verified Student')).toBeInTheDocument()
  expect(screen.queryByText('ADMINISTRATOR')).not.toBeInTheDocument()
  expect(tokenStorage.getSession()).toEqual(saved)
  expect(router.state.location).toMatchObject({ pathname: '/', search: '?view=mine', hash: '#current' })

  await user.tab()
  expect(header.getByRole('link', { name: 'G11 LMS home' })).toHaveFocus()
  await user.tab()
  expect(header.getByRole('link', { name: 'My profile' })).toHaveFocus()
  await user.keyboard('{Enter}')
  await screen.findByRole('heading', { name: 'Personal Information' }, uiReady)
  expect(router.state.location.pathname).toBe('/profile')
  expect(screen.queryByRole('region', { name: 'Connected LMS Workspaces' })).not.toBeInTheDocument()
  const profile = within(screen.getByRole('region', { name: 'Verified Student' }))
  await user.click(profile.getByRole('button', { name: 'Sign Out' }))
  expect(await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)).toBeInTheDocument()
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'), uiReady)
  expect(tokenStorage.getSession()).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
  view.unmount()
  router.dispose()
})
