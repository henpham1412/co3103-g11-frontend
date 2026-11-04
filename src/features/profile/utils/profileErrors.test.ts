import { expect, it } from 'vitest'
import { ApiError } from '@/api/apiError'
import { errorEnvelope } from '@/test/fixtures/auth'
import { profileErrorPresentation } from './profileErrors'

it('binds seven writable fields with safe local copy and deduplicates diagnostics', () => {
  const fields = ['full_name', 'avatar_url', 'bio', 'phone_number', 'date_of_birth', 'locale', 'timezone']
  const error = new ApiError(errorEnvelope({ status: 422, details: fields.map(field => ({ field, message: 'private' })), validationErrors: { dateOfBirth: 'private2' }, errors: [{ field: 'bio', message: 'private3' }] }))
  const result = profileErrorPresentation(error)
  expect(result.fields.map(field => field.name)).toEqual(['fullName', 'avatarUrl', 'bio', 'phoneNumber', 'dateOfBirth', 'locale', 'timezone'])
  expect(result.fields.every(field => field.errors.length === 1)).toBe(true)
  expect(result.message).toBeUndefined()
  expect(JSON.stringify(result).includes('private')).toBe(false)
})
it('never binds unknown, dotted, prototype or identity fields', () => {
  for (const field of ['__proto__', 'constructor', 'profile.bio', 'email', 'status', 'user_id', 'role']) {
    const result = profileErrorPresentation(new ApiError(errorEnvelope({ details: [{ field, message: '<script>private</script>' }] })))
    expect(result.fields).toHaveLength(0)
    expect(result.message).toBeDefined()
    expect(result.message?.includes('private')).toBe(false)
  }
})
it('provides local messages for permission, throttling, network and server failures', () => {
  for (const status of [0, 401, 403, 429, 503]) {
    const result = profileErrorPresentation(new ApiError(errorEnvelope({ status, message: 'private' })))
    expect(result.message).toBeDefined()
    expect(result.message?.includes('private')).toBe(false)
  }
})
