import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { PublicOnlyRoute } from '@/features/auth/components/PublicOnlyRoute'
import { authSession } from '@/test/fixtures/auth'
import { wireCurrentUser } from '@/test/fixtures/authWire'
import { deferred } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import AppProviders from './providers'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

it('keeps a public outlet available during restore and failure, while route guards retain retry protection', async () => {
  tokenStorage.saveSession(authSession())
  const pending = deferred<Response>()
  server.use(http.get(identityApiUrl('/users/me'), () => pending.promise))
  const router = createMemoryRouter([
    { path: '/public', element: <p>Public recovery content</p> },
    { element: <ProtectedRoute />, children: [{ path: '/private', element: <p>Private content</p> }] },
    { element: <PublicOnlyRoute />, children: [{ path: '/login', element: <p>Sign-in form</p> }] },
  ], { initialEntries: ['/public'] })
  const view = render(<StrictMode><AppProviders><RouterProvider router={router} /></AppProviders></StrictMode>)
  expect(screen.getByText('Public recovery content')).toBeInTheDocument()
  await act(() => router.navigate('/private'))
  expect(screen.getByRole('status', { name: 'Verifying your session' })).toBeInTheDocument()
  expect(screen.queryByText('Private content')).not.toBeInTheDocument()
  await act(async () => pending.resolve(new HttpResponse(null, { status: 503 })))
  await screen.findByRole('button', { name: 'Retry' })
  await act(() => router.navigate('/public'))
  expect(screen.getByText('Public recovery content')).toBeInTheDocument()
  await act(() => router.navigate('/login'))
  expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument()
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireCurrentUser)))
  await act(() => router.navigate('/private'))
  await act(async () => screen.getByRole('button', { name: 'Retry' }).click())
  await screen.findByText('Private content')
  view.unmount()
  router.dispose()
})
