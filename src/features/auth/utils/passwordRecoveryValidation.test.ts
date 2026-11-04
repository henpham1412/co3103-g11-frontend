import { expect, it } from 'vitest'
import { validateConfirmPassword, validateRegisterPassword } from './authValidation'
import { resetPasswordRequirements, validateResetPassword, validateResetToken } from './passwordRecoveryValidation'

it('requires every reset rule without changing registration', () => {
  for (const value of ['', '        ', 'Ab1!abc', 'ab1!abcd', 'AB1!ABCD', 'Abc!abcd', 'Abc1abcd', 'Abc1abcd ', 'Abc1abcd\n']) {
    expect(validateResetPassword(value) !== undefined).toBe(true)
    expect(resetPasswordRequirements(value).some(rule => !rule.met)).toBe(true)
  }
  for (const value of ['Ab1!abcd', ' Ab1!abcd ', 'Ab1€abcd', 'Ab1!é'.padEnd(71, 'a')]) expect(validateResetPassword(value)).toBeUndefined()
  expect(validateResetPassword('Ab1!é'.padEnd(72, 'a')) !== undefined).toBe(true)
  expect(validateRegisterPassword('abcdefgh')).toBeUndefined()
  expect(validateConfirmPassword('different', 'Ab1!abcd')).toBe('Passwords do not match.')
  expect(validateConfirmPassword('Ab1!abcd', 'Ab1!abcd')).toBeUndefined()
  expect(validateResetToken(' ')).toBeDefined()
  expect(validateResetToken(' opaque ')).toBeUndefined()
})
