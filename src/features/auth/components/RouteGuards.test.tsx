import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/apiError'
import { AuthContext, type AuthState } from '@/features/auth/context/AuthContext'
import { authSession, errorEnvelope, validUser } from '@/test/fixtures/auth'
import { ProtectedRoute } from './ProtectedRoute'
import { PublicOnlyRoute } from './PublicOnlyRoute'

const authenticated: AuthState = { status: 'authenticated', user: validUser, session: authSession() }

function renderGuard(Guard: typeof ProtectedRoute, state: AuthState, from?: unknown) {
  const router = createMemoryRouter([
    { element: <Guard />, children: [{ path: '/guarded', element: <p>Route content</p> }] },
    { path: '*', element: <p>Redirect destination</p> },
  ], { initialEntries: [{ pathname: '/guarded', search: '?view=mine', hash: '#current', state: { from } }] })
  const originalLocation = router.state.location
  render(
    <AuthContext value={{ state, login: vi.fn(), logout: vi.fn(), retrySessionVerification: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext>,
  )
  return { router, originalLocation }
}

describe('route guards', () => {
  it('redirects anonymous protected access to login with the complete return location', async () => {
    const { router, originalLocation } = renderGuard(ProtectedRoute, { status: 'anonymous' })
    await screen.findByText('Redirect destination')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: originalLocation })
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.queryByText('Route content')).not.toBeInTheDocument()
  })

  it('renders the protected outlet for an authenticated user', () => {
    renderGuard(ProtectedRoute, authenticated)
    expect(screen.getByText('Route content')).toBeInTheDocument()
  })

  it('redirects an authenticated public visitor to the safe return target', async () => {
    const { router } = renderGuard(PublicOnlyRoute, authenticated, { pathname: '/courses', search: '?view=mine', hash: '#current' })
    await screen.findByText('Redirect destination')
    expect(router.state.location).toMatchObject({ pathname: '/courses', search: '?view=mine', hash: '#current' })
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.queryByText('Route content')).not.toBeInTheDocument()
  })

  it('renders the public outlet for an anonymous user', () => {
    renderGuard(PublicOnlyRoute, { status: 'anonymous' })
    expect(screen.getByText('Route content')).toBeInTheDocument()
  })

  it('redirects an authenticated public visitor home when the return target is external', async () => {
    const { router } = renderGuard(PublicOnlyRoute, authenticated, { pathname: '//evil.example' })
    await screen.findByText('Redirect destination')
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.queryByText('Route content')).not.toBeInTheDocument()
  })

  it.each([ProtectedRoute, PublicOnlyRoute])('%s waits accessibly for authentication', Guard => {
    const { router } = renderGuard(Guard, { status: 'initializing' })
    expect(screen.getByRole('status', { name: 'Verifying your session' })).toBeInTheDocument()
    expect(screen.queryByText('Route content')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/guarded')
  })

  it.each([ProtectedRoute, PublicOnlyRoute])('%s offers retry without exposing the outlet after restoration fails', Guard => {
    const retrySessionVerification = vi.fn().mockResolvedValue(undefined)
    const { router } = renderGuard(Guard, {
      status: 'restore-error', error: new ApiError(errorEnvelope({ status: 503 })), retrySessionVerification,
    })
    expect(screen.getByText('Unable to verify your session')).toBeInTheDocument()
    expect(screen.queryByText('Route content')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/guarded')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retrySessionVerification).toHaveBeenCalledOnce()
  })
})
