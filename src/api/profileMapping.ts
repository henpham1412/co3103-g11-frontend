import { ApiError } from './apiError'
import { profileFields, type ProfileChanges, type ProfileField } from '@/types/profile'
import type { UpdateProfileRequestDto } from '@/types/profileWire'
import { localToday, validateProfileValue } from '@/features/profile/utils/profileValidation'
import { isRecord } from '@/utils/typeGuards'

const wireFields: Record<ProfileField, keyof UpdateProfileRequestDto> = {
  fullName: 'full_name', avatarUrl: 'avatar_url', bio: 'bio', phoneNumber: 'phone_number',
  dateOfBirth: 'date_of_birth', locale: 'locale', timezone: 'timezone',
}

export function serializeProfileChanges(changes: ProfileChanges, today = localToday()): UpdateProfileRequestDto {
  const invalid = () => new ApiError({ status: 400, code: 'INVALID_PROFILE_CHANGES', error: 'Invalid Profile Changes', message: 'Please check your profile changes.', timestamp: new Date().toISOString(), path: '/users/me' })
  if (!isRecord(changes)) throw invalid()
  const payload: UpdateProfileRequestDto = {}
  for (const field of profileFields) {
    if (!Object.hasOwn(changes, field)) continue
    const value: unknown = changes[field]
    if (validateProfileValue(field, value, today)) throw invalid()
    payload[wireFields[field]] = field === 'fullName' ? (value as string).trim() : value as string
  }
  if (!Object.keys(payload).length) throw invalid()
  return payload
}
