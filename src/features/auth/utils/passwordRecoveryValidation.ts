import { passwordByteLength } from './authValidation'

export function resetPasswordRequirements(password = '') {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'An uppercase letter (A–Z)', met: /[A-Z]/.test(password) },
    { label: 'A lowercase letter (a–z)', met: /[a-z]/.test(password) },
    { label: 'A number (0–9)', met: /[0-9]/.test(password) },
    { label: 'A special character', met: /[\p{P}\p{S}]/u.test(password) },
    { label: 'At most 72 UTF-8 bytes', met: password.length > 0 && passwordByteLength(password) <= 72 },
  ]
}

export function validateResetPassword(value = ''): string | undefined {
  if (!value.trim()) return 'Please enter your new password.'
  if (resetPasswordRequirements(value).some(rule => !rule.met)) return 'Please meet all password requirements.'
}

export function validateResetToken(value = ''): string | undefined {
  if (!value.trim()) return 'Please enter the reset token from your email.'
}
