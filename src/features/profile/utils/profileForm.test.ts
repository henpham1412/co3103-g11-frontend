import { expect, it } from 'vitest'
import { validUser } from '@/test/fixtures/auth'
import { profileFields, type ProfileFormValues } from '@/types/profile'
import { buildProfileChanges, toProfileFormValues } from './profileForm'

it('maps absent, null, empty and partial profiles to stable blank form values', () => {
  for (const profile of [undefined, null, {}, { bio: null }]) {
    const baseline = toProfileFormValues({ ...validUser, profile })
    expect(baseline.fullName).toBe(validUser.fullName)
    expect(profileFields.filter(field => field !== 'fullName').every(field => baseline[field] === '')).toBe(true)
    expect(buildProfileChanges(baseline, baseline)).toEqual({ kind: 'unchanged' })
  }
  expect(toProfileFormValues({ ...validUser, profile: { phoneNumber: '+0123', bio: 'line\nline' } })).toMatchObject({ phoneNumber: '+0123', bio: 'line\nline' })
})
it('diffs normalized values, preserves untouched fields and handles revert without mutation', () => {
  const baseline = Object.freeze(toProfileFormValues(validUser))
  expect(buildProfileChanges(baseline, { ...baseline, fullName: '  Test Student  ' })).toEqual({ kind: 'unchanged' })
  expect(buildProfileChanges(baseline, { ...baseline, bio: 'a\nb', phoneNumber: '+001' })).toEqual({ kind: 'changed', changes: { bio: 'a\nb', phoneNumber: '+001' } })
  expect(buildProfileChanges(baseline, { ...baseline, fullName: ' New name ' })).toEqual({ kind: 'changed', changes: { fullName: 'New name' } })
  expect(buildProfileChanges(baseline, { bio: 'new' } as ProfileFormValues)).toEqual({ kind: 'changed', changes: { bio: 'new' } })
  expect(buildProfileChanges(baseline, { ...baseline })).toEqual({ kind: 'unchanged' })
})
it('blocks clearing existing optional values and invalid full names', () => {
  const baseline = toProfileFormValues({ ...validUser, profile: { bio: 'Existing' } })
  for (const values of [{ ...baseline, bio: '' }, { ...baseline, fullName: null }, { ...baseline, fullName: undefined }]) expect(buildProfileChanges(baseline, values as ProfileFormValues).kind).toBe('invalid')
})
