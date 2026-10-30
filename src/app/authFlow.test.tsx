import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import AuthTestMotion from '@/test/AuthTestMotion'
import { authSession, createToken, validUser } from '@/test/fixtures/auth'
import { fillAuthFields } from '@/test/renderAuthPage'
import App from './App'
import AppProviders from './providers'
import { router as appRouter } from './router'

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
      login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn(),
    }}>
      <RouterProvider router={router} />
    </AuthContext>,
  )
  try {
    expect(await screen.findByRole('heading', { name: 'Unable to load this page' })).toBeInTheDocument()
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
    expect(await screen.findByText('Loaded page')).toBeInTheDocument()
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
      login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn(),
    }}>
      <App />
    </AuthContext>,
  )
  expect(screen.getByRole('heading', { name: `Welcome, ${validUser.fullName}` })).toBeInTheDocument()
  expect(screen.getByText('Unavailable')).toBeInTheDocument()
})

it('returns home after login, shows the verified profile, and signs out to login', async () => {
  localStorage.clear()
  sessionStorage.clear()
  const user = userEvent.setup()
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ['/?view=mine#current'] })
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AppProviders><AuthTestMotion><RouterProvider router={router} /></AuthTestMotion></AppProviders>
    </ConfigProvider>,
  )

  expect(await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.state.from).toMatchObject({ pathname: '/', search: '?view=mine', hash: '#current' })

  await fillAuthFields(user, { Email: validUser.email, Password: 'password' })
  await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
  expect(await screen.findByRole('heading', { name: `Welcome, ${validUser.fullName}` })).toBeInTheDocument()
  expect(router.state.location).toMatchObject({ pathname: '/', search: '?view=mine', hash: '#current' })
  const header = within(screen.getByRole('banner'))
  expect(header.getByRole('link', { name: 'G11 LMS home' })).toBeInTheDocument()
  expect(header.getByText(validUser.fullName)).toBeInTheDocument()
  expect(header.getByText(validUser.email)).toBeInTheDocument()
  expect(header.getByText(validUser.status)).toBeInTheDocument()
  const main = screen.getByRole('main')
  expect(main).toHaveTextContent('Session information')
  expect(main).toHaveTextContent('Platform status')
  expect(tokenStorage.getSession()).not.toBeNull()
  expect(within(main).getByRole('time')).toHaveAttribute('datetime', new Date(tokenStorage.getSession()!.expiresAt).toISOString())

  await user.tab()
  expect(header.getByRole('link', { name: 'G11 LMS home' })).toHaveFocus()
  await user.tab()
  expect(header.getByRole('button', { name: 'Sign Out' })).toHaveFocus()
  await user.click(header.getByRole('button', { name: 'Sign Out' }))
  expect(await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })).toBeInTheDocument()
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(tokenStorage.getSession()).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
  view.unmount()
  router.dispose()
})
