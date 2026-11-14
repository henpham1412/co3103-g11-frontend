import { expect, it } from 'vitest'
import { wireForgotPassword, wireResetPassword } from '@/test/fixtures/passwordRecoveryWire'
import { serializeForgotPassword, serializeResetPassword } from './passwordRecoveryMapping'

it('constructs exact recovery bodies, excluding form and LMS metadata', () => {
  const forgot = { email: 'student@example.com', password: 'unused', clientId: 'unused' }
  const reset = { token: 'opaque-test-value+%', newPassword: ' Safe-test-123!é ', confirmPassword: 'unused', rememberMe: true }
  expect(serializeForgotPassword(forgot)).toEqual(wireForgotPassword)
  expect(serializeResetPassword(reset)).toEqual(wireResetPassword)
  expect(reset.newPassword.startsWith(' ')).toBe(true)
})

// Exercise both validator calls once; character permutations belong to passwordRecoveryValidation.test.ts.
it.each([
  { field: 'token', character: '\0' },
  { field: 'newPassword', character: '\uD800' },
])('rejects invalid $field at the serialization boundary', ({ field, character }) => {
  const payload = { token: ' opaque 😀 ', newPassword: ' Ab1!Tiếng Việt 😀 ', [field]: 'Ab1!abcd' + character }
  expect(() => serializeResetPassword(payload)).toThrow('Please check your reset token and new password.')
})

it('preserves Unicode and whitespace exactly without normalization', () => {
  const token = ' opaque e\u0301😀 ', newPassword = ' Ab1!Việt e\u0301😀 '
  expect(serializeResetPassword({ token, newPassword })).toEqual({ token, new_password: newPassword })
})
