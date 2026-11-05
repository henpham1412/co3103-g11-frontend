import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.resetModules())

const clients = [
  ['Central Identity', 'VITE_CENTRAL_IDENTITY_API_URL', 'VITE_IDENTITY_API_BASE_URL', 'http://localhost:8080/api/v1',
    async () => (await import('./centralIdentityClient')).centralIdentityClient],
  ['LMS', 'VITE_LMS_API_URL', 'VITE_LMS_API_BASE_URL', 'http://localhost:8081/api/v1',
    async () => (await import('./lmsClient')).lmsClient],
] as const

describe('API URL resolution', () => {
  it("prefers the new environment variable over the legacy alias", async () => {
    for (const [name, primary, legacy, , client] of clients) {
      vi.stubEnv(primary, `https://${name === 'LMS' ? 'lms' : 'identity'}.primary.example/api/v1`)
      vi.stubEnv(legacy, `https://${name === 'LMS' ? 'lms' : 'identity'}.legacy.example/api/v1`)
      vi.resetModules()
      expect((await client()).defaults.baseURL).toBe(`https://${name === 'LMS' ? 'lms' : 'identity'}.primary.example/api/v1`)
    }
  })
  it("falls back to the legacy alias when the primary is empty", async () => {
    for (const [name, primary, legacy, , client] of clients) {
      vi.stubEnv(primary, '')
      vi.stubEnv(legacy, `https://${name === 'LMS' ? 'lms' : 'identity'}.legacy.example/api/v1`)
      vi.resetModules()
      expect((await client()).defaults.baseURL).toBe(`https://${name === 'LMS' ? 'lms' : 'identity'}.legacy.example/api/v1`)
    }
  })
  it("uses localhost when neither variable is configured", async () => {
    for (const [, primary, legacy, fallback, client] of clients) {
      vi.stubEnv(primary, undefined)
      vi.stubEnv(legacy, undefined)
      vi.resetModules()
      expect((await client()).defaults.baseURL).toBe(fallback)
    }
  })
})
