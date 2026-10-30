import { expect, it, vi } from 'vitest'
import { identityApiUrl, unhandledRequests } from './server'

it('blocks unhandled requests instead of contacting a real backend', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => { })
  await expect(fetch(identityApiUrl('/unhandled-test-request'))).rejects.toThrow()
  expect(error).toHaveBeenCalled()
  // Consume only this deliberate probe. Accidental unmatched requests in any
  // other test remain recorded and fail the global afterEach assertion.
  expect(unhandledRequests.splice(0)).toEqual([
    `GET ${new URL(identityApiUrl('/unhandled-test-request')).pathname}`,
  ])
})
