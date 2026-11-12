import { ApiError } from './apiError'
import { profileFields, type ProfileChanges, type ProfileField } from '@/types/profile'
import type { UpdateProfileRequestDto } from '@/types/profileWire'
import { localToday, normalizeAvatarUrl, validateProfileValue } from '@/features/profile/utils/profileValidation'
import { isRecord } from '@/utils/typeGuards'

const wireFields = {
  fullName: 'full_name', avatarUrl: 'avatar_url', bio: 'bio', phoneNumber: 'phone_number',
  dateOfBirth: 'date_of_birth', locale: 'locale', timezone: 'timezone',
} as const satisfies Record<ProfileField, keyof UpdateProfileRequestDto>

export function serializeProfileChanges(changes: ProfileChanges, today = localToday()): UpdateProfileRequestDto {
  const invalid = () => new ApiError({ status: 400, code: 'INVALID_PROFILE_CHANGES', error: 'Invalid Profile Changes', message: 'Please check your profile changes.', timestamp: new Date().toISOString(), path: '/users/me' })
  if (!isRecord(changes)) throw invalid()
  const payload: UpdateProfileRequestDto = {}
  for (const field of profileFields) {
    if (!Object.hasOwn(changes, field)) continue
    const value: unknown = changes[field]
    // Validate the original URI before normalizing its scheme for the wire payload.
    if (validateProfileValue(field, value, today)) throw invalid()
    if (field === 'fullName') payload.full_name = (value as string).trim()
    else {
      const optionalValue = value as string | null
      payload[wireFields[field]] = optionalValue === null || !optionalValue.trim() ? null
        : field === 'avatarUrl' ? normalizeAvatarUrl(optionalValue) : optionalValue
    }
  }
  if (!Object.keys(payload).length) throw invalid()
  return payload
}
