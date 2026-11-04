import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { wireCurrentUser } from '@/test/fixtures/authWire'
import { wireFullProfile } from '@/test/fixtures/profileWire'
import { renderProfilePage } from '@/test/renderProfilePage'
import { deferred, setAuthFields } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'

it('redirects anonymous entry to sign in, then loads the complete profile with Bearer after login', async () => {
  const read = vi.fn()
  server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
    read()
    expect(request.headers.has('authorization')).toBe(true)
    return HttpResponse.json({ ...wireFullProfile, role: 'UNEXPECTED ROLE' })
  }))
  const { user, router } = renderProfilePage({ session: null })
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
  expect(router.state.location.state.from.pathname).toBe('/profile')
  expect(screen.queryByRole('heading', { name: 'My profile' })).not.toBeInTheDocument()
  setAuthFields({ Email: 'student@example.com', Password: 'password' })
  await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
  await screen.findByText('Learning together')
  expect(read).toHaveBeenCalledTimes(1)
  expect(screen.getByText('2001-03-15')).toBeInTheDocument()
  expect(screen.getByText('+0012345')).toBeInTheDocument()
  expect(screen.getByText('vi-VN')).toBeInTheDocument()
  expect(screen.queryByText('UNEXPECTED ROLE')).not.toBeInTheDocument()
  expect(screen.getByText('Workspace connection information is not available yet.')).toBeInTheDocument()
  expect(screen.queryByText('No connected workspaces')).not.toBeInTheDocument()
})

it.each([undefined, null, {}, { bio: 'Only bio', date_of_birth: 'invalid', avatar_url: 'javascript:alert(1)' }])('renders incomplete profile safely', async profile => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireCurrentUser, profile })))
  renderProfilePage()
  const summary = await screen.findByRole('region', { name: 'Test Student' })
  expect(within(summary).getAllByText('Not provided').length).toBeGreaterThan(0)
  expect(within(summary).getByRole('img', { name: /avatar placeholder/ })).toBeInTheDocument()
  expect(within(summary).queryByText('invalid')).not.toBeInTheDocument()
})

it('falls back once for a broken avatar and renders bio as plain text', async () => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireFullProfile, profile: { ...wireFullProfile.profile, bio: '<b>plain text</b>' } })))
  renderProfilePage()
  const image = await screen.findByRole('img', { name: "Test Student's avatar" })
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  fireEvent.error(image)
  expect(screen.getByRole('img', { name: /avatar placeholder/ })).toBeInTheDocument()
  expect(screen.getByText('<b>plain text</b>').querySelector('b')).toBeNull()
})

it('keeps the shell mounted during profile loading/error and retries only GET', async () => {
  const pending = deferred<Response>()
  let reads = 0
  server.use(http.get(identityApiUrl('/users/me'), () => ++reads === 1 ? HttpResponse.json(wireCurrentUser) : pending.promise))
  const { user } = renderProfilePage()
  await screen.findByRole('heading', { name: 'My profile' })
  expect(screen.getByRole('status')).toHaveTextContent('Loading your profile')
  await act(async () => pending.resolve(new HttpResponse(null, { status: 503 })))
  await screen.findByText('Unable to load your profile. Please try again.')
  expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument()
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireFullProfile)))
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Learning together')
})

it('routes a current profile 401 back to login', async () => {
  let reads = 0
  server.use(http.get(identityApiUrl('/users/me'), () => ++reads === 1 ? HttpResponse.json(wireCurrentUser) : new HttpResponse(null, { status: 401 })))
  const { router } = renderProfilePage()
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' })
})
