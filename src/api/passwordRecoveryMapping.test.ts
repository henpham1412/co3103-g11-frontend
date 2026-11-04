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
