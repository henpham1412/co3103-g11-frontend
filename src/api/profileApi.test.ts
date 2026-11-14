import { AxiosError } from 'axios'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { authSession } from '@/test/fixtures/auth'
import { wireProfileAcknowledgment } from '@/test/fixtures/profileWire'
import { identityApiUrl, server } from '@/test/server'
import { centralIdentityClient } from './centralIdentityClient'
import { installAuthInterceptors, type SessionSnapshot } from './authInterceptors'
import { profileApi } from './profileApi'

it('blocks an invalid-text update before HTTP even alongside a valid change', async () => {
  const patch = vi.spyOn(centralIdentityClient, 'patch')
  await expect(profileApi.updateCurrentUser({ fullName: 'Valid name', bio: 'Draft\0' }, authSession().accessToken))
    .rejects.toMatchObject({ status: 400, code: 'INVALID_PROFILE_CHANGES', message: 'Please check your profile changes.' })
  expect(patch).not.toHaveBeenCalled()
})

it.each([200, 204])('sends captured Bearer and flat diff to Central Identity with acknowledgment %s, without GET', async status => {
  const session = authSession()
  const received = vi.fn(), read = vi.fn()
  server.use(
    http.patch(identityApiUrl('/users/me'), async ({ request }) => {
      expect(request.headers.get('authorization') === `Bearer ${session.accessToken}`).toBe(true)
      received(await request.json())
      return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(wireProfileAcknowledgment)
    }),
    http.get(identityApiUrl('/users/me'), () => { read(); return HttpResponse.json({}) }),
  )
  await expect(profileApi.updateCurrentUser({ bio: 'New bio' }, session.accessToken)).resolves.toBeUndefined()
  expect(received).toHaveBeenCalledExactlyOnceWith({ bio: 'New bio' })
  expect(read).not.toHaveBeenCalled()
})

it('purges only a current 401, preserves 403, and never attaches a replacement session credential', async () => {
  const old = authSession(), newer = authSession({ accessToken: 'synthetic-different-credential' })
  let snapshot: SessionSnapshot = { session: old, generation: 1 }
  let status = 403
  const purge = vi.fn()
  const cleanup = installAuthInterceptors({ getSessionSnapshot: () => snapshot, purgeSession: purge, onLmsForbidden: vi.fn() })
  server.use(http.patch(identityApiUrl('/users/me'), ({ request }) => {
    expect(request.headers.get('authorization') === `Bearer ${old.accessToken}`).toBe(true)
    return new HttpResponse(null, { status })
  }))
  try {
    await expect(profileApi.updateCurrentUser({ bio: 'draft' }, old.accessToken)).rejects.toMatchObject({ status: 403 })
    expect(purge).not.toHaveBeenCalled()
    snapshot = { session: newer, generation: 2 }
    status = 401
    await expect(profileApi.updateCurrentUser({ bio: 'draft' }, old.accessToken)).rejects.toMatchObject({ status: 401 })
    expect(purge).not.toHaveBeenCalled()
    snapshot = { session: old, generation: 3 }
    await expect(profileApi.updateCurrentUser({ bio: 'draft' }, old.accessToken)).rejects.toMatchObject({ status: 401 })
    expect(purge).toHaveBeenCalledExactlyOnceWith('unauthorized', 3)
  } finally { cleanup() }
})

it('normalizes validation, network, cancellation and timeout without replaying a mutation', async () => {
  const token = authSession().accessToken
  server.use(http.patch(identityApiUrl('/users/me'), () => HttpResponse.json({ validation_errors: { date_of_birth: 'invalid', phone_number: 'invalid' } }, { status: 422 })))
  await expect(profileApi.updateCurrentUser({ bio: 'draft' }, token)).rejects.toMatchObject({ status: 422, validationErrors: { dateOfBirth: 'invalid', phoneNumber: 'invalid' } })
  const network = vi.fn(() => HttpResponse.error())
  server.use(http.patch(identityApiUrl('/users/me'), network))
  await expect(profileApi.updateCurrentUser({ bio: 'draft' }, token)).rejects.toMatchObject({ status: 0, error: 'Network Error' })
  expect(network).toHaveBeenCalledTimes(1)
  const controller = new AbortController()
  controller.abort()
  await expect(profileApi.updateCurrentUser({ bio: 'draft' }, token, controller.signal)).rejects.toMatchObject({ error: 'Request Aborted' })
  vi.spyOn(centralIdentityClient, 'patch').mockRejectedValueOnce(new AxiosError('timeout', 'ETIMEDOUT'))
  await expect(profileApi.updateCurrentUser({ bio: 'draft' }, token)).rejects.toMatchObject({ error: 'Request Timeout' })
})

it.each([307, 308])('does not follow redirect %s or leak a Bearer header', async status => {
  const destination = vi.fn(() => new HttpResponse(null, { status: 204 }))
  server.use(http.patch(identityApiUrl('/users/me'), () => new HttpResponse(null, { status, headers: { Location: 'https://outside.example/collect' } })), http.patch('https://outside.example/collect', destination))
  await expect(profileApi.updateCurrentUser({ bio: 'draft' }, authSession().accessToken)).rejects.toThrow()
  expect(destination).not.toHaveBeenCalled()
})
