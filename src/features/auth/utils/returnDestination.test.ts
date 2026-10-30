import { describe, expect, it } from 'vitest'
import { returnDestination } from './returnDestination'

describe('returnDestination', () => {
  it.each([
    undefined, null, {}, 123, { pathname: 123 }, 'https://evil.example', '//evil.example',
    'javascript:alert(1)', 'courses', '/\\evil.example', '/\n/evil.example', '/\u007fpath',
    '/%2fexample.org', '/%5cexample.org', '/path%0a', '/bad%encoding',
    '/courses/..//evil.example', '/courses/%2e%2e//evil.example',
    '/login', '/register?next=/login', '/courses/../LOGIN/',
    { pathname: '//evil.example' }, { pathname: '/courses', search: '?page=1\n' },
    { pathname: '/courses', hash: '#%5cevil' },
  ])('falls back for malformed, unsafe or auth-loop destinations: %j', from => {
    expect(returnDestination(from)).toBe('/')
  })

  it.each([
    ['/', '/'], ['/courses?view=mine#week1', '/courses?view=mine#week1'],
    ['/courses/../dashboard', '/dashboard'], ['/courses/%E1%BB%87', '/courses/%E1%BB%87'],
    [{ pathname: '/courses', search: '?page=2', hash: '#week1' }, '/courses?page=2#week1'],
    [{ pathname: '/courses', search: 123, hash: {} }, '/courses'],
    ['/courses?resource=https://example.org', '/courses?resource=https://example.org'],
  ])('preserves valid internal destinations: %j', (from, expected) => {
    expect(returnDestination(from)).toBe(expected)
  })

  it('never produces an external URL after separator, encoding and dot-segment mutations', () => {
    const fragments = ['/', '//', '\\', '%2f', '%2F', '%5c', '%252f', '.', '..', '%2e', '%2e%2e', '\t', '\n', '\u0085', '%00', '%0d', 'https:', '@evil.example', 'login', 'courses']
    for (const left of fragments) {
      for (const right of fragments) {
        const input = '/' + left + right + '/evil.example'
        for (const from of [input, { pathname: input, search: '?next=https://evil.example', hash: '#section' }]) {
          const destination = returnDestination(from)
          expect(new URL(destination, 'https://lms.example').origin).toBe('https://lms.example')
          expect(destination).not.toMatch(/^\/\//)
          expect(returnDestination(destination)).toBe(destination)
        }
      }
    }
  })
})
