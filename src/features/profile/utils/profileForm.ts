import type { User } from '@/types/auth'
import { profileFields, type ProfileChangeResult, type ProfileChanges, type ProfileField, type ProfileFormValues } from '@/types/profile'
import { localToday, validateProfileValue } from './profileValidation'

export function toProfileFormValues(user: User): ProfileFormValues {
  return {
    fullName: user.fullName, avatarUrl: user.profile?.avatarUrl ?? '', bio: user.profile?.bio ?? '',
    phoneNumber: user.profile?.phoneNumber ?? '', dateOfBirth: user.profile?.dateOfBirth ?? '',
    locale: user.profile?.locale ?? '', timezone: user.profile?.timezone ?? '',
  }
}

export function buildProfileChanges(baseline: ProfileFormValues, values: ProfileFormValues, today = localToday()): ProfileChangeResult {
  const changes: ProfileChanges = {}
  const errors: Partial<Record<ProfileField, string>> = {}
  for (const field of profileFields) {
    if (!Object.hasOwn(values, field)) continue
    const raw: unknown = values[field]
    const value = typeof raw === 'string' ? (field === 'fullName' ? raw.trim() : raw.trim() ? raw : null) : raw
    const previous = field === 'fullName' ? baseline[field].trim() : baseline[field].trim() ? baseline[field] : null
    if (value === previous) continue
    const error = validateProfileValue(field, value, today)
    if (error) errors[field] = error
    else if (field === 'fullName') changes.fullName = value as string
    else changes[field] = value as string | null
  }
  if (Object.keys(errors).length) return { kind: 'invalid', errors }
  return Object.keys(changes).length ? { kind: 'changed', changes } : { kind: 'unchanged' }
}
