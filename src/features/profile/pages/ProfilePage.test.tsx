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

it('shows the identity header, inline personal form and account cards without entering edit mode', async () => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({
    ...wireFullProfile, full_name: 'Alex Morgan', email: 'alex.morgan@example.com',
  })))
  const { user, router } = renderProfilePage()
  await screen.findByRole('heading', { name: 'Personal Information' }, uiReady)
  const identity = within(screen.getByRole('region', { name: 'Alex Morgan' }))
  expect(identity.getByRole('heading', { level: 1, name: 'Alex Morgan' })).toBeInTheDocument()
  expect(identity.getByText('ACTIVE')).toBeInTheDocument()
  expect(identity.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Sign Out' })).toHaveLength(1)
  expect(screen.getByLabelText('Full Name')).toHaveValue('Alex Morgan')
  expect(screen.getByLabelText(/^Email Address/)).toHaveValue('alex.morgan@example.com')
  expect(screen.getByLabelText(/^Email Address/)).toHaveAttribute('readonly')
  expect(screen.getByPlaceholderText('Tell us about yourself')).toHaveValue('Learning together')
  const header = within(screen.getByRole('banner'))
  expect(header.getByText('Alex Morgan - Student')).toBeInTheDocument()
  expect(header.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Central Identity>Account Profile')
  expect(header.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
  expect(header.queryByText('alex.morgan@example.com')).not.toBeInTheDocument()
  expect(header.queryByText('ACTIVE')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Connected LMS Workspaces' })).not.toBeInTheDocument()
  expect(screen.queryByText('Private Tutoring Workspace')).not.toBeInTheDocument()
  expect(screen.queryByText('Math & Science Hub')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Security & Sessions' })).toHaveTextContent('Current Session')
  expect(screen.queryByText(/192\.168\./)).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Password Recovery' }))
  expect(router.state.location.pathname).toBe('/forgot-password')
})

it('saves directly from the inline form and resets to canonical values even when the server keeps the old value', async () => {
  const mutation = vi.fn()
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireFullProfile)),
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      mutation(await request.json())
      return HttpResponse.json(wireProfileAcknowledgment)
    }))
  const { user } = renderProfilePage()
  await screen.findByRole('form', { name: 'Edit profile' }, uiReady)
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Inline draft' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutation).toHaveBeenCalledExactlyOnceWith({ bio: 'Inline draft' })
  expect(screen.getByLabelText('Bio')).toHaveValue('Learning together')
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Second draft' } })
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByLabelText('Bio')).toHaveValue('Learning together')
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  expect(mutation).toHaveBeenCalledTimes(1)
})

it('opens the avatar editor from the camera button and reveals collapsed fields with server validation errors', async () => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireFullProfile)),
    http.patch(identityApiUrl('/users/me'), () => HttpResponse.json({ details: [{ field: 'phone_number', message: 'Invalid phone' }] }, { status: 422 })))
  const { user } = renderProfilePage()
  await screen.findByRole('form', { name: 'Edit profile' }, uiReady)
  const avatar = screen.getByLabelText('Avatar URL')
  const details = avatar.closest('details')!
  expect(details.open).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(details.open).toBe(true)
  expect(avatar).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+84987654321' } })
  await user.click(screen.getByText('Additional details', { exact: false, selector: 'summary' }))
  expect(details.open).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true'))
  expect(details.open).toBe(true)
  expect(screen.getByLabelText('Phone number')).toHaveFocus()
  expect(screen.getByLabelText('Phone number')).toHaveValue('+84987654321')
})

it('reveals and focuses a collapsed invalid field on Save without PATCH until it is corrected', async () => {
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
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  const avatar = screen.getByLabelText('Avatar URL')
  const details = avatar.closest('details')!
  await user.clear(avatar)
  await user.paste('javascript:alert(1)')
  const errorText = 'Enter an absolute HTTP or HTTPS image URL without credentials.'
  await screen.findByText(errorText)
  await user.click(screen.getByText('Additional details', { exact: false, selector: 'summary' }))
  expect(details.open).toBe(false)
  await user.clear(screen.getByLabelText('Bio'))
  await user.paste('Valid visible draft')
  expect(screen.getByText(errorText)).not.toBeVisible()

  const save = screen.getByRole('button', { name: 'Save Changes' })
  expect(save).toBeEnabled()
  await user.click(save)
  await waitFor(() => expect(details.open).toBe(true))
  await waitFor(() => expect(avatar).toHaveFocus())
  expect(avatar).toHaveAttribute('aria-invalid', 'true')
  expect(avatar).toHaveAccessibleDescription(errorText)
  expect(screen.getByText(errorText)).toBeVisible()
  expect(screen.getByLabelText('Bio')).toHaveValue('Valid visible draft')
  expect(mutations).not.toHaveBeenCalled()

  const corrected = 'https://example.com/corrected.png'
  await user.clear(avatar)
  await user.paste(corrected)
  await user.click(save)
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ avatar_url: corrected, bio: 'Valid visible draft' })
  expect(screen.getByLabelText('Avatar URL')).toHaveValue(corrected)
})

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
  expect(screen.queryByRole('heading', { name: 'Personal Information' })).not.toBeInTheDocument()
  setAuthFields({ Email: 'student@example.com', Password: 'password' })
  await user.click(screen.getByRole('button', { name: 'Sign In to LMS' }))
  await screen.findByText('Learning together', {}, uiReady)
  expect(read).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Date of birth')).toHaveValue('2001-03-15')
  expect(screen.getByLabelText('Phone number')).toHaveValue('+84912345678')
  expect(screen.getByLabelText('Locale')).toHaveValue('vi-VN')
  expect(screen.queryByText('UNEXPECTED ROLE')).not.toBeInTheDocument()
  expect(screen.queryByText('Workspace connection information is not available yet.')).not.toBeInTheDocument()
  expect(screen.queryByText('No connected workspaces')).not.toBeInTheDocument()
})

it.each([undefined, null, {}, { bio: 'Only bio', date_of_birth: 'invalid', avatar_url: 'javascript:alert(1)' }, { avatar_url: 'https://example.com\\a.png' }, { avatar_url: 'https:///a.png' }, { avatar_url: 'https://example.com/a|b.png' }, { avatar_url: 'https://example.com/%zz' }])('renders incomplete profile safely', async profile => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json({ ...wireCurrentUser, profile })))
  renderProfilePage()
  await screen.findByRole('form', { name: 'Edit profile' }, uiReady)
  const summary = await screen.findByRole('region', { name: 'Test Student' }, uiReady)
  expect(screen.getByLabelText('Phone number')).toHaveValue('')
  expect(screen.getByLabelText('Date of birth')).toHaveValue('')
  expect(screen.getByLabelText('Bio')).toHaveValue(profile?.bio ?? '')
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
  expect(await screen.findByDisplayValue('<b>plain text</b>', {}, uiReady)).toBeInTheDocument()
})

it('keeps the shell mounted during profile loading/error and retries only GET', async () => {
  const pending = deferred<Response>()
  let reads = 0
  server.use(http.get(identityApiUrl('/users/me'), () => ++reads === 1 ? HttpResponse.json(wireCurrentUser) : pending.promise))
  const { user } = renderProfilePage()
  await screen.findByRole('heading', { name: 'Test Student' }, uiReady)
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
  ['Bio', 'bio', 'New bio'], ['Full Name', 'full_name', 'New name'], ['Phone number', 'phone_number', '+84987654321'],
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
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ [key]: value })
  expect(order.slice(-2)).toEqual(['PATCH', 'GET'])
  if (key === 'full_name') expect(within(screen.getByRole('banner')).getByText('Canonical new name - Student')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
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
  const save = screen.getByRole('button', { name: 'Save Changes' })
  for (const value of ['https://example.com/a|b.png', 'https://example.com/%zz', 'https://example.com/a#b#c']) {
    fireEvent.change(avatar, { target: { value } })
    expect(save).toBeEnabled()
    await user.click(save)
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
  const save = screen.getByRole('button', { name: 'Save Changes' })
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
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
})

it('cancels a pending optional-field clear without sending HTTP', async () => {
  server.use(http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireFullProfile)))
  const update = vi.spyOn(profileApi, 'updateCurrentUser')
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
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
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
  expect(mutations).toHaveBeenCalledExactlyOnceWith({ [key]: null })
  expect(order.slice(-2)).toEqual(['PATCH', 'GET'])
  const summary = within(screen.getByRole('region', { name: 'Test Student' }))
  if (key === 'avatar_url') expect(summary.getByRole('img', { name: /avatar placeholder/ })).toBeInTheDocument()
  else expect(screen.getByLabelText(label, { exact: true })).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByLabelText(label, { exact: true })).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
})

it('omits all initially absent optional fields when another field is saved', async () => {
  const mutation = vi.fn()
  server.use(http.patch(identityApiUrl('/users/me'), async ({ request }) => {
    mutation(await request.json())
    return HttpResponse.json(wireProfileAcknowledgment)
  }))
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Changed name' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
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
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
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
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Profile saved.', {}, uiReady)
})

it('shows saved-unverified after acknowledged PATCH and reloads only GET, without resubmitting', async () => {
  let patched = false, reloadFails = true
  const mutation = vi.fn()
  server.use(http.get(identityApiUrl('/users/me'), () => patched && reloadFails ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ ...wireFullProfile, full_name: patched ? 'Canonical saved name' : wireFullProfile.full_name })),
    http.patch(identityApiUrl('/users/me'), () => { patched = true; mutation(); return new HttpResponse(null, { status: 204 }) }))
  const { user } = renderProfilePage()
  await user.click(await screen.findByRole('button', { name: 'Edit profile' }, uiReady))
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Changed name' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  await screen.findByText(/Your update was accepted/, {}, uiReady)
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByLabelText('Full Name')).toHaveValue('Changed name')
  reloadFails = false
  await user.click(screen.getByRole('button', { name: 'Reload profile' }))
  await screen.findByText('Your saved profile is now up to date.', {}, uiReady)
  expect(within(screen.getByRole('banner')).getByText('Canonical saved name - Student')).toBeInTheDocument()
  expect(mutation).toHaveBeenCalledTimes(1)
})
