import { isValidUnicodeText } from '@/utils/unicodeText'
import { passwordRequirements } from './authValidation'

// Shared with registration; the server remains authoritative for its blocklist.
export const resetPasswordRequirements = passwordRequirements

export function validateResetPassword(value = ''): string | undefined {
  if (!isValidUnicodeText(value)) return 'Please remove invalid characters from your new password.'
  if (!value.trim()) return 'Please enter your new password.'
  if (resetPasswordRequirements(value).some(rule => !rule.met)) return 'Please meet all password requirements.'
}

export function validateResetToken(value = ''): string | undefined {
  if (!isValidUnicodeText(value)) return 'Please enter a valid reset token from your email.'
  if (!value.trim()) return 'Please enter the reset token from your email.'
}
