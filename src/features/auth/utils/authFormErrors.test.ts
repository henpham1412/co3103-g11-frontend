import { describe, expect, it } from 'vitest'
import { errorEnvelope } from '@/test/fixtures/auth'
import { authFormErrors } from './authFormErrors'

describe('auth form error presentation', () => {
  it('combines both formats and deduplicates translated messages', () => {
    const problem = errorEnvelope({
      validationErrors: { email: 'Invalid email format' },
      errors: [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password must not exceed 72 bytes' },
        { field: 'password', message: 'Password must not exceed 72 UTF-8 bytes' },
      ],
    })
    expect(authFormErrors(problem, ['email', 'password'])).toEqual({
      fields: [
        { name: 'email', errors: ['Please enter a valid email address.'] },
        { name: 'password', errors: ['Password must be at most 72 UTF-8 bytes.'] },
      ],
      hasUnbound: false,
    })
  })

  it("replaces secret, HTML and prototype diagnostics with safe local messages", () => {
    for (const message of ['Rejected value: my-secret', 'java.sql.SQLException', '<img src=x onerror=alert(1)>', '__proto__', 'constructor'] as const) {
      const result = authFormErrors(errorEnvelope({
        errors: [
          { field: 'password', message }, { field: 'invitation', message }, { message },
        ]
      }), ['email', 'password'])
      expect(result, `case: ${JSON.stringify(message)}`).toEqual({
        fields: [{ name: 'email', errors: [] }, { name: 'password', errors: ['Please check your password.'] }],
        hasUnbound: true,
      })
    }
  })
})

it('clears stale field errors while marking unknown and unbound errors for fallback', () => {
  expect(authFormErrors(errorEnvelope({ errors: [{ field: 'invitation', message: 'private' }, { message: 'secret' }] }), ['email', 'password'])).toEqual({
    fields: [{ name: 'email', errors: [] }, { name: 'password', errors: [] }], hasUnbound: true,
  })
  expect(authFormErrors(errorEnvelope(), ['email', 'password'])).toEqual({
    fields: [{ name: 'email', errors: [] }, { name: 'password', errors: [] }], hasUnbound: false,
  })
})
