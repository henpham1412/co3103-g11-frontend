import { normalizeApiError } from '@/api/apiError'
import type { ProfileField } from '@/types/profile'

export interface ProfileFeedback {
  fields: { name: ProfileField; errors: string[] }[]
  field?: ProfileField
  message?: string
}

const aliases: Record<string, ProfileField> = {
  full_name: 'fullName', fullName: 'fullName', avatar_url: 'avatarUrl', avatarUrl: 'avatarUrl', bio: 'bio',
  phone_number: 'phoneNumber', phoneNumber: 'phoneNumber', date_of_birth: 'dateOfBirth', dateOfBirth: 'dateOfBirth', locale: 'locale', timezone: 'timezone',
}
const messages: Record<ProfileField, string> = {
  fullName: 'Please check your full name.', avatarUrl: 'Please check your avatar URL.', bio: 'Please check your bio.',
  phoneNumber: 'Please check your phone number.', dateOfBirth: 'Please check your date of birth.', locale: 'Please check your locale.', timezone: 'Please check your timezone.',
}

export function profileErrorPresentation(error: unknown): ProfileFeedback {
  const problem = normalizeApiError(error, '/users/me')
  const fields: ProfileFeedback['fields'] = []
  let unbound = false
  if (problem.status === 400 || problem.status === 422) {
    for (const source of [problem.details ?? [], Object.keys(problem.validationErrors ?? {}).map(field => ({ field })), problem.errors ?? []]) {
      for (const entry of source) {
        const name = entry.field && Object.hasOwn(aliases, entry.field) ? aliases[entry.field] : undefined
        if (!name) { unbound = true; continue }
        if (!fields.some(field => field.name === name)) fields.push({ name, errors: [messages[name]] })
      }
    }
  }
  const field = fields[0]?.name
  if (field && !unbound) return { fields, field }
  return { fields, field, message: problem.status === 403 ? 'You do not have permission to update this profile.'
    : problem.status === 401 ? 'Your session is no longer valid. Please sign in again.'
      : problem.status === 429 ? 'Too many requests. Please try again later.'
        : problem.status === 0 ? 'Unable to confirm the update. Reload your profile to check before trying again.'
          : 'Unable to update your profile. Please try again later.' }
}
