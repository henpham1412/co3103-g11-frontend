import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.resetModules())

describe.each([
  ['Central Identity', 'VITE_CENTRAL_IDENTITY_API_URL', 'VITE_IDENTITY_API_BASE_URL', 'http://localhost:8080/api/v1',
    async () => (await import('./centralIdentityClient')).centralIdentityClient],
  ['LMS', 'VITE_LMS_API_URL', 'VITE_LMS_API_BASE_URL', 'http://localhost:8081/api/v1',
    async () => (await import('./lmsClient')).lmsClient],
] as const)('%s URL resolution', (_name, primary, legacy, fallback, client) => {
  it('prefers the new environment variable over the legacy alias', async () => {
    vi.stubEnv(primary, 'https://primary.example/api/v1')
    vi.stubEnv(legacy, 'https://legacy.example/api/v1')
    vi.resetModules()
    expect((await client()).defaults.baseURL).toBe('https://primary.example/api/v1')
  })

  it('falls back to the legacy alias when the primary is empty', async () => {
    vi.stubEnv(primary, '')
    vi.stubEnv(legacy, 'https://legacy.example/api/v1')
    vi.resetModules()
    expect((await client()).defaults.baseURL).toBe('https://legacy.example/api/v1')
  })

  it('uses localhost when neither variable is configured', async () => {
    vi.stubEnv(primary, undefined)
    vi.stubEnv(legacy, undefined)
    vi.resetModules()
    expect((await client()).defaults.baseURL).toBe(fallback)
  })
})
