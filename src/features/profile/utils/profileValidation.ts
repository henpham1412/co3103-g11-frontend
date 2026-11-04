import { validateFullName } from '@/features/auth/utils/authValidation'
import type { ProfileField } from '@/types/profile'
import { isValidUnicodeText } from '@/utils/unicodeText'

export function localToday(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

export function validateDateOfBirth(value: string, today = localToday()): string | undefined {
  if (!isCalendarDate(value)) return 'Enter a valid date in YYYY-MM-DD format.'
  if (value > today) return 'Date of birth must not be in the future.'
}

export function isSafeAvatarUrl(value: string): boolean {
  if (!isValidUnicodeText(value) || !/^https?:\/\//i.test(value) || /[\s\p{Cc}]/u.test(value)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch { return false }
}

export function validateProfileValue(field: ProfileField, value: unknown, today = localToday()): string | undefined {
  if (typeof value !== 'string') return 'Please enter a valid text value.'
  if (!isValidUnicodeText(value)) return 'Please remove invalid characters from this value.'
  if (field === 'fullName') return validateFullName(value)
  if (!value.trim()) return 'Enter a value or cancel this change. Clearing this field is not supported yet.'
  if (field === 'dateOfBirth') return validateDateOfBirth(value, today)
  if (field === 'avatarUrl' && !isSafeAvatarUrl(value)) return 'Enter an absolute HTTP or HTTPS image URL without credentials.'
}
