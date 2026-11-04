import { describe, expect, it } from 'vitest'
import { returnDestination } from './returnDestination'

describe('returnDestination', () => {
  it('blocks recovery destinations including encoded and normalized paths', () => {
    for (const path of ['/forgot-password', '/reset-password?token=synthetic', '/RESET-PASSWORD/', '/x/../reset-password', '/%72eset-password', '/x%2f..%2freset-password']) expect(returnDestination(path)).toBe('/')
    expect(returnDestination('/profile?tab=details')).toBe('/profile?tab=details')
  })
  it("falls back for missing or malformed input", () => {
    for (const from of [undefined,
      null,
      {},
      123,
      { pathname: 123 }] as const) {
      expect(returnDestination(from), `case: ${JSON.stringify(from)}`).toBe('/')
    }
  })

  it("preserves valid internal strings and router locations", () => {
    for (const sample of [
      ['/', '/'], ['/courses?view=mine#week1', '/courses?view=mine#week1'],
      ['/courses/../dashboard', '/dashboard'], ['/courses/%E1%BB%87', '/courses/%E1%BB%87'],
      [{ pathname: '/courses', search: '?page=2', hash: '#week1' }, '/courses?page=2#week1'],
      [{ pathname: '/courses', search: 123, hash: {} }, '/courses'],
      ['/courses?resource=https://example.org', '/courses?resource=https://example.org'],
    ] as const) {
      const [from, expected] = sample
      expect(returnDestination(from), `case: ${JSON.stringify(sample)}`).toBe(expected)
    }
  })

  it("rejects external URLs, schemes, backslashes and controls", () => {
    for (const from of ['https://evil.example',
      '//evil.example',
      'javascript:alert(1)',
      'courses',
      '/\\evil.example',
      '/\n/evil.example',
      '/\u007fpath',
      { pathname: '//evil.example' },
      { pathname: '/courses', search: '?page=1\n' }] as const) {
      expect(returnDestination(from), `case: ${JSON.stringify(from)}`).toBe('/')
    }
  })

  it("rejects encoded separators, controls and malformed encoding", () => {
    for (const from of ['/%2fexample.org',
      '/%5cexample.org',
      '/path%0a',
      '/bad%encoding',
      { pathname: '/courses', hash: '#%5cevil' }] as const) {
      expect(returnDestination(from), `case: ${JSON.stringify(from)}`).toBe('/')
    }
  })

  it("rejects dot-segment escapes and auth loops", () => {
    for (const from of ['/courses/..//evil.example',
      '/courses/%2e%2e//evil.example',
      '/login',
      '/register?next=/login',
      '/courses/../LOGIN/'] as const) {
      expect(returnDestination(from), `case: ${JSON.stringify(from)}`).toBe('/')
    }
  })

  it("never produces an external URL after separator, encoding and dot-segment mutations", () => {
    const fragments = ['/', '//', '\\', '%2f', '%2F', '%5c', '%252f', '.', '..', '%2e', '%2e%2e', '\t', '\n', '\u0085', '%00', '%0d', 'https:', '@evil.example', 'login', 'courses']
    const violations: unknown[] = []
    let checked = 0
    for (const left of fragments) {
      for (const right of fragments) {
        const input = '/' + left + right + '/evil.example'
        for (const from of [input, { pathname: input, search: '?next=https://evil.example', hash: '#section' }]) {
          const destination = returnDestination(from)
          const origin = new URL(destination, 'https://lms.example').origin
          const repeated = returnDestination(destination)
          if (origin !== 'https://lms.example' || destination.startsWith('//') || repeated !== destination) {
            violations.push({ from, destination, origin, repeated })
          }
          checked += 1
        }
      }
    }
    expect(checked).toBe(800)
    expect(violations, 'Every mutation must stay same-origin, non-protocol-relative and idempotent').toEqual([])
  })
})
