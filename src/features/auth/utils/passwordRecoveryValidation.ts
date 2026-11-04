import { isValidUnicodeText } from '@/utils/unicodeText'
import { passwordByteLength } from './authValidation'

export function resetPasswordRequirements(password = '') {
  const validText = isValidUnicodeText(password)
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'An uppercase letter (A–Z)', met: /[A-Z]/.test(password) },
    { label: 'A lowercase letter (a–z)', met: /[a-z]/.test(password) },
    { label: 'A number (0–9)', met: /[0-9]/.test(password) },
    { label: 'A special character', met: /[\p{P}\p{S}]/u.test(password) },
    { label: 'At most 72 UTF-8 bytes', met: validText && password.length > 0 && passwordByteLength(password) <= 72 },
    { label: 'No invalid characters', met: validText && password.length > 0 },
  ]
}

export function validateResetPassword(value = ''): string | undefined {
  if (!isValidUnicodeText(value)) return 'Please remove invalid characters from your new password.'
  if (!value.trim()) return 'Please enter your new password.'
  if (resetPasswordRequirements(value).some(rule => !rule.met)) return 'Please meet all password requirements.'
}

export function validateResetToken(value = ''): string | undefined {
  if (!isValidUnicodeText(value)) return 'Please enter a valid reset token from your email.'
  if (!value.trim()) return 'Please enter the reset token from your email.'
}
