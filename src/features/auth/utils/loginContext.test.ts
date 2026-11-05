import { describe, expect, it, vi } from 'vitest'
import { resolveLoginContext } from './loginContext'

const lms = { VITE_AUTH_MODE: 'lms', VITE_LMS_CLIENT_ID: 'g11-lms', VITE_LMS_REDIRECT_URI: 'https://LMS.example:443/course/%61?view=mine#week1' }

describe('deployment login context', () => {
  it('defaults to LMS and preserves the exact registered values', () => {
    expect(resolveLoginContext({ ...lms, VITE_AUTH_MODE: undefined })).toEqual({
      ok: true, context: { clientId: lms.VITE_LMS_CLIENT_ID, redirectUri: lms.VITE_LMS_REDIRECT_URI },
    })
    expect(resolveLoginContext({ ...lms, VITE_LMS_CLIENT_ID: 'a'.repeat(100), VITE_LMS_REDIRECT_URI: 'http://localhost:5173/' }).ok).toBe(true)
  })

  it('omits both context keys only in explicit standalone mode', () => {
    expect(resolveLoginContext({ VITE_AUTH_MODE: 'standalone' })).toEqual({ ok: true, context: {} })
    expect(resolveLoginContext({ VITE_AUTH_MODE: 'standalone', VITE_LMS_CLIENT_ID: '', VITE_LMS_REDIRECT_URI: '' })).toEqual({ ok: true, context: {} })
  })

  it.each([
    {}, { ...lms, VITE_AUTH_MODE: '' }, { ...lms, VITE_AUTH_MODE: 'unknown' },
    ...[undefined, '', ' ', 'two words', 'a'.repeat(101), 'client\n'].map(VITE_LMS_CLIENT_ID => ({ ...lms, VITE_LMS_CLIENT_ID })),
    ...[undefined, '', ' ', '/relative', 'not-a-url', 'javascript:alert(1)', 'ftp://example.com/',
      'https://user:secret@example.com/', 'https://@example.com/', 'https:example.com', 'https:///example.com',
      ' https://example.com/', 'https://example.com/a b', 'https://example.com/\n',
      'https://example.com\\other'].map(VITE_LMS_REDIRECT_URI => ({ ...lms, VITE_LMS_REDIRECT_URI })),
    { ...lms, VITE_AUTH_MODE: 'standalone' },
    { VITE_AUTH_MODE: 'standalone', VITE_LMS_CLIENT_ID: 'g11-lms' },
    { VITE_AUTH_MODE: 'standalone', VITE_LMS_REDIRECT_URI: ' ' },
  ])('fails closed for invalid deployment settings: %j', env => {
    const result = resolveLoginContext(env)
    expect(result).toMatchObject({ ok: false, error: { status: 400, code: 'INVALID_LOGIN_CONFIGURATION' } })
    expect(result).not.toHaveProperty('context')
    if (!result.ok) expect(result.error.message).not.toMatch(/secret|example\.com/)
  })

  it('reads environment at initialization instead of caching machine configuration', () => {
    vi.stubEnv('VITE_AUTH_MODE', 'standalone')
    vi.stubEnv('VITE_LMS_CLIENT_ID', '')
    vi.stubEnv('VITE_LMS_REDIRECT_URI', '')
    expect(resolveLoginContext()).toEqual({ ok: true, context: {} })
    vi.stubEnv('VITE_AUTH_MODE', 'lms')
    expect(resolveLoginContext().ok).toBe(false)
  })
})
