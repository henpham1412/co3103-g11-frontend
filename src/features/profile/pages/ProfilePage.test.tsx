import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { wireCurrentUser } from '@/test/fixtures/authWire'
import { bracketAvatarUrls, wireFullProfile, wireProfileAcknowledgment } from '@/test/fixtures/profileWire'
import type { CurrentUserResponseDto } from '@/types/authWire'
import { renderProfilePage } from '@/test/renderProfilePage'
import { deferred, setAuthFields } from '@/test/renderAuthPage'
import { identityApiUrl, server } from '@/test/server'
import { profileApi } from '@/api/profileApi'

// Allow lazy routes and session/profile requests to settle on two-CPU runners.
const uiReady = { timeout: 5000 }

it('redirects anonymous entry to sign in, then loads the complete profile with Bearer after login', async () => {
  const read = vi.fn()
  server.use(http.get(identityApiUrl('/users/me'), ({ request }) => {
    read()
    expect(request.headers.has('authorization')).toBe(true)
    return HttpResponse.json({ ...wireFullProfile, role: 'UNEXPECTED ROLE' })
  }))
  const { user, router } = renderProfilePage({ session: null })
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)
  expect(router.state.location.state.from.pathname).toBe('/profile')
  expect(screen.queryByRole('heading', { name: 'My profile' })).not.toBeInTheDocument()
  setAuthFields({ Email: 'student@example.com', Password: 'password' })
  await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
  await screen.findByText('Learning together', {}, uiReady)
  expect(read).toHaveBeenCalledTimes(1)
  expect(screen.getByText('2001-03-15')).toBeInTheDocument()
  expect(screen.getByText('+84912345678')).toBeInTheDocument()
  expect(screen.getByText('vi-VN')).toBeInTheDocument()
  expect(screen.queryByText('UNEXPECTED ROLE')).not.toBeInTheDocument()
  expect(screen.getByText('Workspace connection information is not available yet.')).toBeInTheDocument()
  expect(screen.queryByText('No connected workspaces')).not.toBeInTheDocument()
})

it.each([undefined, null, {}, { bio: 'Only bio', date_of_birth: 'invalid', avatar_url: 'javascript:alert(1)' }, { avatar_url: 'https://example.com\\a.png' }, { avatar_url: 'https:///a.png' }, { avatar_url: 'https://example.com/a|b.png' }, { avatar_url: 'https://example.com/%zz' }])('renders incomplete profile safely', async profile => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireCurrentUser, profile })))
  renderProfilePage()
  const summary = await screen.findByRole('region', { name: 'Test Student' }, uiReady)
  expect(within(summary).getAllByText('Not provided').length).toBeGreaterThan(0)
  expect(within(summary).getByRole('img', { name: /avatar placeholder/ })).toBeInTheDocument()
  expect(within(summary).queryByText('invalid')).not.toBeInTheDocument()
})

it('normalizes avatar schemes, falls back for broken images and renders bio as plain text', async () => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireFullProfile, profile: { ...wireFullProfile.profile, avatar_url: 'HTTPS://example.com/ảnh.png', bio: '<b>plain text</b>' } })))
  renderProfilePage()
  const image = await screen.findByRole('img', { name: "Test Student's avatar" }, uiReady)
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  expect(image).toHaveAttribute('src', 'https://example.com/ảnh.png')
  fireEvent.error(image)
  expect(screen.getByRole('img', { name: /avatar placeholder/ })).toBeInTheDocument()
  expect(screen.getByText('<b>plain text</b>').querySelector('b')).toBeNull()
})

it('keeps the shell mounted during profile loading/error and retries only GET', async () => {
  const pending = deferred<Response>()
  let reads = 0
  server.use(http.get(identityApiUrl('/users/me'), () => ++reads === 1 ? HttpResponse.json(wireCurrentUser) : pending.promise))
  const { user } = renderProfilePage()
  await screen.findByRole('heading', { name: 'My profile' }, uiReady)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your profile')
  await act(async () => pending.resolve(new HttpResponse(null, { status: 503 })))
  await screen.findByText('Unable to load your profile. Please try again.', {}, uiReady)
  expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument()
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireFullProfile)))
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Learning together', {}, uiReady)
})

it('routes a current profile 401 back to login', async () => {
  let reads = 0
  server.use(http.get(identityApiUrl('/users/me'), () => ++reads === 1 ? HttpResponse.json(wireCurrentUser) : new HttpResponse(null, { status: 401 })))
  const { router } = renderProfilePage()
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'), uiReady)
  await screen.findByRole('heading', { name: 'Sign In to G11 LMS' }, uiReady)
})

it.each([
  ['Bio', 'bio', 'New bio'], ['Full name', 'full_name', 'New name'], ['Phone number', 'phone_number', '+84987654321'],
  ['Date of birth', 'date_of_birth', '2000-02-29'], ['Avatar URL', 'avatar_url', 'https://example.com/new.png'],
  ['Locale', 'locale', 'en-GB'], ['Timezone', 'timezone', 'Europe/London'],
])('saves only changed %s and uses the subsequent canonical GET', async (label, key, value) => {
  let canonical = structuredClone(wireFullProfile)
  const mutations = vi.fn()
  const order: string[] = []
  server.use(
    http.get(identityApiUrl('/users/me'), () => { order.push('GET'); return HttpResponse.json(canonical) }),
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      order.push('PATCH')
      const body = await request.json() as Record<string, string>
      mutations(body)
      canonical = { ...canonical, full_name: key === 'full_name' ? 'Canonical new name' : canonical.full_name, profile: { ...canonical.profile, ...(key !== 'full_name' ? { [key]: value } : {}) } }
      return HttpResponse.json(wireProfileAcknowledgment)
    }),
  )
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ [key]: value })
  expect(order.slice(-2)).toEqual(['PATCH', 'GET'])
  if (key === 'full_name') expect(within(screen.getByRole('banner')).getByText('Canonical new name')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

it('blocks an invalid avatar and valid bio before PATCH, then saves the corrected URL unchanged', async () => {
  let canonical = structuredClone(wireFullProfile)
  const mutations = vi.fn()
  server.use(
    http.get(identityApiUrl('/users/me'), () => HttpResponse.json(canonical)),
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      const body = await request.json() as Record<string, string>
      mutations(body)
      canonical = { ...canonical, profile: { ...canonical.profile, ...body } }
      return HttpResponse.json(wireProfileAcknowledgment)
    }),
  )
  const update = vi.spyOn(profileApi, 'updateCurrentUser')
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Valid draft bio' } })
  const avatar = screen.getByLabelText('Avatar URL')
  const save = screen.getByRole('button', { name: 'Save changes' })
  for (const value of ['https://example.com/a|b.png', 'https://example.com/%zz', 'https://example.com/a#b#c']) {
    fireEvent.change(avatar, { target: { value } })
    expect(save).toBeDisabled()
    fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
    await waitFor(() => expect(avatar).toHaveAttribute('aria-invalid', 'true'))
    await waitFor(() => expect(avatar).toHaveFocus())
    expect(screen.getByLabelText('Bio')).toHaveValue('Valid draft bio')
    expect(update).not.toHaveBeenCalled()
    expect(mutations).not.toHaveBeenCalled()
  }
  const corrected = 'https://example.com/ảnh%7Cb.png?q=%25#%23part'
  fireEvent.change(avatar, { target: { value: corrected } })
  await waitFor(() => expect(avatar).not.toHaveAttribute('aria-invalid', 'true'))
  await user.click(save)
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ avatar_url: corrected, bio: 'Valid draft bio' })
  expect(screen.getByRole('img', { name: "Test Student's avatar" })).toHaveAttribute('src', corrected)
})

it.each(bracketAvatarUrls)('saves and displays an avatar with query or fragment brackets: %s', async value => {
  let canonical = structuredClone(wireFullProfile)
  const mutations = vi.fn()
  const order: string[] = []
  server.use(
    http.get(identityApiUrl('/users/me'), () => { order.push('GET'); return HttpResponse.json(canonical) }),
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      order.push('PATCH')
      mutations(await request.json())
      canonical = { ...canonical, profile: { ...canonical.profile, avatar_url: value } }
      return HttpResponse.json(wireProfileAcknowledgment)
    }),
  )
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  const avatar = screen.getByLabelText('Avatar URL')
  const save = screen.getByRole('button', { name: 'Save changes' })
  expect(save).toBeDisabled()
  fireEvent.change(avatar, { target: { value } })
  expect(save).toBeEnabled()
  await user.click(save)
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ avatar_url: value })
  expect(order.slice(-2)).toEqual(['PATCH', 'GET'])
  expect(screen.getByRole('img', { name: "Test Student's avatar" })).toHaveAttribute('src', value)
  expect(screen.queryByRole('img', { name: /avatar placeholder/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByLabelText('Avatar URL')).toHaveValue(value)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

it('cancels a pending optional-field clear without sending HTTP', async () => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireFullProfile)))
  const update = vi.spyOn(profileApi, 'updateCurrentUser')
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText('Learning together')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByLabelText('Bio')).toHaveValue('Learning together')
  expect(update).not.toHaveBeenCalled()
})

it.each([
  ['Bio', 'bio'], ['Avatar URL', 'avatar_url'], ['Phone number', 'phone_number'],
  ['Date of birth', 'date_of_birth'], ['Locale', 'locale'], ['Timezone', 'timezone'],
] as const)('clears %s through PATCH null and displays the canonical empty value', async (label, key) => {
  let canonical: CurrentUserResponseDto = structuredClone(wireFullProfile)
  const mutations = vi.fn()
  const order: string[] = []
  server.use(
    http.get(identityApiUrl('/users/me'), () => { order.push('GET'); return HttpResponse.json(canonical) }),
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      order.push('PATCH')
      mutations(await request.json())
      canonical = { ...canonical, profile: { ...canonical.profile, [key]: null } }
      return HttpResponse.json(wireProfileAcknowledgment)
    }),
  )
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value: '' } })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ [key]: null })
  expect(order.slice(-2)).toEqual(['PATCH', 'GET'])
  const summary = within(screen.getByRole('region', { name: 'Test Student' }))
  if (key === 'avatar_url') expect(summary.getByRole('img', { name: /avatar placeholder/ })).toBeInTheDocument()
  else expect(summary.getByText(label, { selector: 'dt' }).nextElementSibling).toHaveTextContent('Not provided')
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByLabelText(label, { exact: true })).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

it('omits all initially absent optional fields when another field is saved', async () => {
  const mutation = vi.fn()
  server.use(http.patch(identityApiUrl('/users/me'), async ({ request }) => {
    mutation(await request.json())
    return HttpResponse.json(wireProfileAcknowledgment)
  }))
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Changed name' } })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutation).toHaveBeenCalledExactlyOnceWith({ full_name: 'Changed name' })
})

it.each([400, 422, 403, 0])('retains drafts with safe feedback after PATCH %s, then permits correction', async status => {
  let reads = 0
  server.use(http.get(identityApiUrl('/users/me'), () => { reads++; return HttpResponse.json(wireFullProfile) }),
    http.patch(identityApiUrl('/users/me'), () => status === 0 ? HttpResponse.error() : HttpResponse.json({ message: 'private diagnostic', details: [{ field: 'bio', message: 'private diagnostic' }] }, { status })))
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  const initialReads = reads
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Draft retained' } })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  if (status === 400 || status === 422) {
    await screen.findByText('Please check your bio.', {}, uiReady)
    await waitFor(() => expect(screen.getByLabelText('Bio')).toHaveFocus())
  } else await screen.findByRole('alert', {}, uiReady)
  expect(screen.getByLabelText('Bio')).toHaveValue('Draft retained')
  expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument()
  expect(reads).toBe(initialReads)
  server.use(http.patch(identityApiUrl('/users/me'), () => new HttpResponse(null, { status: 204 })))
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Corrected draft' } })
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
})

it('shows saved-unverified after acknowledged PATCH and reloads only GET, without resubmitting', async () => {
  let patched = false, reloadFails = true
  const mutation = vi.fn()
  server.use(http.get(identityApiUrl('/users/me'), () => patched && reloadFails ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ ...wireFullProfile, full_name: patched ? 'Canonical saved name' : wireFullProfile.full_name })),
    http.patch(identityApiUrl('/users/me'), () => { patched = true; mutation(); return new HttpResponse(null, { status: 204 }) }))
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Changed name' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  await screen.findByText(/Your update was accepted/, {}, uiReady)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByLabelText('Full name')).toHaveValue('Changed name')
  reloadFails = false
  await user.click(screen.getByRole('button', { name: 'Reload profile' }))
  await screen.findByText('Your saved profile is now up to date.', {}, uiReady)
  expect(within(screen.getByRole('banner')).getByText('Canonical saved name')).toBeInTheDocument()
  expect(mutation).toHaveBeenCalledTimes(1)
})
