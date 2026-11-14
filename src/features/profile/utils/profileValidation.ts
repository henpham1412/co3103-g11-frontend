import { validateFullName } from '@/features/auth/utils/authValidation'
import type { ProfileField } from '@/types/profile'
import { isValidUnicodeText } from '@/utils/unicodeText'

export const profileLengthLimits: Partial<Record<ProfileField, { max: number; label: string }>> = {
  phoneNumber: { max: 30, label: 'Phone number' },
  locale: { max: 20, label: 'Locale' },
  timezone: { max: 64, label: 'Timezone' },
}

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
  // WHATWG parsing can repair characters that Hibernate's URI parser rejects.
  // Require URI-safe characters and complete percent escapes in the original value.
  if (!isValidUnicodeText(value) || /[\\\s\p{Cc}<>"`{}|^]|%(?![\da-f]{2})/iu.test(value)) return false
  // Check the original authority before WHATWG URL can repair missing hosts,
  // empty ports or percent-encoded host names. IPv6 syntax is checked by URL.
  const authority = /^https?:\/\/(?:\[[\da-f:.]+\]|[^/?#:@%[\]]+)(?::\d+)?(?=[/?#]|$)/i.exec(value)
  if (!authority) return false
  // Check components in the original text: WHATWG parsing can escape a bad path.
  // Hibernate accepts brackets in query/fragment, but not in the path.
  const components = /^([^?#]*)(?:\?[^#]*)?(?:#[^#]*)?$/u.exec(value.slice(authority[0].length))
  if (!components || /[[\]]/u.test(components[1])) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch { return false }
}

export function normalizeAvatarUrl(value: string): string {
  // Hibernate's URL regexp requires a lowercase scheme. Preserve the rest,
  // including path/query case and Unicode, instead of using URL.toString().
  return value.replace(/^https?:/i, scheme => scheme.toLowerCase())
}

export function validateProfileValue(field: ProfileField, value: unknown, today = localToday()): string | undefined {
  if (value === null && field !== 'fullName') return
  if (typeof value !== 'string') return 'Please enter a valid text value.'
  if (!isValidUnicodeText(value)) return 'Please remove invalid characters from this value.'
  if (field === 'fullName') return validateFullName(value)
  if (!value.trim()) return
  const limit = profileLengthLimits[field]
  if (limit && value.length > limit.max) return `${limit.label} must not exceed ${limit.max} characters.`
  if (field === 'dateOfBirth') return validateDateOfBirth(value, today)
  if (field === 'avatarUrl' && !isSafeAvatarUrl(value)) return 'Enter an absolute HTTP or HTTPS image URL without credentials.'
}
