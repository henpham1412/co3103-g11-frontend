import { AxiosError } from 'axios'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { authSession } from '@/test/fixtures/auth'
import { wireForgotAcknowledgment, wireForgotPassword, wireResetAcknowledgment, wireResetPassword } from '@/test/fixtures/passwordRecoveryWire'
import { identityApiUrl, server } from '@/test/server'
import { installAuthInterceptors } from './authInterceptors'
import { centralIdentityClient } from './centralIdentityClient'
import { passwordRecoveryApi } from './passwordRecoveryApi'

const cases = [
  { path: '/auth/forgot-password', body: wireForgotPassword, acknowledgment: wireForgotAcknowledgment, call: (signal?: AbortSignal) => passwordRecoveryApi.forgotPassword(wireForgotPassword, signal) },
  { path: '/auth/reset-password', body: wireResetPassword, acknowledgment: wireResetAcknowledgment, call: (signal?: AbortSignal) => passwordRecoveryApi.resetPassword({ token: wireResetPassword.token, newPassword: wireResetPassword.new_password }, signal) },
]

it('rejects an unsafe password before HTTP without disclosing credentials', async () => {
  const post = vi.spyOn(centralIdentityClient, 'post')
  await expect(passwordRecoveryApi.resetPassword({ token: 'opaque-test-token', newPassword: 'Ab1!secret\0' })).rejects.toMatchObject({
    status: 400, code: 'INVALID_RESET_PASSWORD_REQUEST', message: 'Please check your reset token and new password.',
  })
  expect(post).not.toHaveBeenCalled()
})

describe.each(cases)('$path', ({ path, body, acknowledgment, call }) => {
  it('sends exact public wire payload with active interceptors and accepts the CI-3 200 acknowledgment', async () => {
    const purge = vi.fn()
    const cleanup = installAuthInterceptors({ getSessionSnapshot: () => ({ session: authSession(), generation: 1 }), purgeSession: purge, onLmsForbidden: vi.fn() })
    const received = vi.fn()
    try {
      server.use(http.post(identityApiUrl(path), async ({ request }) => {
        received(await request.json())
        expect(request.headers.has('authorization')).toBe(false)
        return HttpResponse.json(acknowledgment)
      }))
      await expect(call()).resolves.toBeUndefined()
      expect(received).toHaveBeenCalledExactlyOnceWith(body)
      server.use(http.post(identityApiUrl(path), () => HttpResponse.json({ status: 200, code: 'INVALID_OR_EXPIRED_RESET_TOKEN', message: 'untrusted' }, { status: 401 })))
      await expect(call()).rejects.toMatchObject({ status: 401, code: 'INVALID_OR_EXPIRED_RESET_TOKEN' })
      expect(purge).not.toHaveBeenCalled()
    } finally { cleanup() }
  })

  it('normalizes network, timeout and cancellation without a successful request', async () => {
    server.use(http.post(identityApiUrl(path), () => HttpResponse.error()))
    await expect(call()).rejects.toMatchObject({ status: 0, error: 'Network Error' })
    const controller = new AbortController()
    controller.abort()
    await expect(call(controller.signal)).rejects.toMatchObject({ status: 0, error: 'Request Aborted' })
    const stub = vi.spyOn(centralIdentityClient, 'post').mockRejectedValue(new AxiosError('timeout', 'ETIMEDOUT'))
    await expect(call()).rejects.toMatchObject({ status: 0, error: 'Request Timeout' })
    stub.mockRestore()
  })

  it.each([307, 308])('never forwards secrets through redirect %s', async status => {
    const destination = vi.fn(() => new HttpResponse(null, { status: 200 }))
    server.use(
      http.post(identityApiUrl(path), () => new HttpResponse(null, { status, headers: { Location: 'https://outside.example/collect' } })),
      http.post('https://outside.example/collect', destination),
    )
    await expect(call()).rejects.toThrow()
    expect(destination).not.toHaveBeenCalled()
  })
})
