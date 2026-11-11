import { describe, expect, it } from 'vitest'
import { invalidTextCases } from '@/test/fixtures/invalidText'
import { validateConfirmPassword, validateRegisterPassword } from './authValidation'
import { resetPasswordRequirements, validateResetPassword, validateResetToken } from './passwordRecoveryValidation'

it('shares registration length, byte and non-whitespace policy without complexity rules', () => {
  for (const value of ['', '        ', 'Ab1!abc', 'é'.repeat(37), '😀'.repeat(18) + 'a']) {
    expect(validateResetPassword(value)).toBeDefined()
    expect(validateRegisterPassword(value)).toBeDefined()
    expect(resetPasswordRequirements(value).some(rule => !rule.met)).toBe(true)
  }
  // Common-password rejection remains server-side, including for these syntactically valid values.
  for (const value of ['orchid lantern meadow brook', 'abcdefgh', '12345678', 'ABCDABCD', 'Abc1abcd', ' pass   ', '😀😀😀😀', 'é'.repeat(36), '😀'.repeat(18)]) {
    expect(validateResetPassword(value)).toBeUndefined()
    expect(validateRegisterPassword(value)).toBeUndefined()
    expect(resetPasswordRequirements(value).every(rule => rule.met)).toBe(true)
  }
  expect(validateConfirmPassword('different', 'Ab1!abcd')).toBe('Passwords do not match.')
  expect(validateConfirmPassword('Ab1!abcd', 'Ab1!abcd')).toBeUndefined()
  expect(validateResetToken(' ')).toBeDefined()
  expect(validateResetToken(' opaque ')).toBeUndefined()
})

describe.each(invalidTextCases)('$name', ({ character }) => {
  it.each(['start', 'middle', 'end'])('rejects unsafe credentials at the %s without echoing secrets', position => {
    const value = position === 'start' ? character + 'Ab1!abcd'
      : position === 'middle' ? 'Ab1!' + character + 'abcd' : 'Ab1!abcd' + character
    expect(validateResetPassword(value)).toBe('Please remove invalid characters from your new password.')
    expect(validateRegisterPassword(value)).toBe('Please remove invalid characters from your password.')
    expect(validateResetToken(value)).toBe('Please enter a valid reset token from your email.')
    expect(resetPasswordRequirements(value).every(rule => rule.met)).toBe(false)
  })
})

it('keeps valid Unicode, whitespace and the exact 72/73 UTF-8 byte boundary consistent with the checklist', () => {
  const atLimit = 'Ab1!' + '😀'.repeat(17)
  for (const value of [' Ab1!ệ😀 ', 'Ab1!Tiếng Việt', atLimit]) {
    expect(validateResetPassword(value)).toBeUndefined()
    expect(validateResetToken(value)).toBeUndefined()
    expect(resetPasswordRequirements(value).every(rule => rule.met)).toBe(true)
  }
  expect(validateResetPassword(atLimit + 'a')).toBeDefined()
  expect(resetPasswordRequirements(atLimit + 'a').every(rule => rule.met)).toBe(false)
})
