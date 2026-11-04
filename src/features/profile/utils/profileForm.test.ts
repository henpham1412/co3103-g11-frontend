import { expect, it } from 'vitest'
import { validUser } from '@/test/fixtures/auth'
import { profileFields, type ProfileFormValues } from '@/types/profile'
import { profileTextCases } from '@/test/fixtures/invalidText'
import { buildProfileChanges, toProfileFormValues } from './profileForm'

it('collects invalid-text field errors without returning a partial change', () => {
  const baseline = toProfileFormValues(validUser)
  expect(buildProfileChanges(baseline, {
    ...baseline, fullName: ' Nguyễn\0 An ', bio: 'Draft\uD800', locale: 'vi-VN',
  })).toEqual({
    kind: 'invalid',
    errors: {
      fullName: 'Please remove invalid characters from this value.',
      bio: 'Please remove invalid characters from this value.',
    },
  })
})

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
  expect(buildProfileChanges(baseline, { ...baseline, bio: 'a\nb', phoneNumber: '+84912345678' })).toEqual({ kind: 'changed', changes: { bio: 'a\nb', phoneNumber: '+84912345678' } })
  expect(buildProfileChanges(baseline, { ...baseline, fullName: ' New name ' })).toEqual({ kind: 'changed', changes: { fullName: 'New name' } })
  expect(buildProfileChanges(baseline, { bio: 'new' } as ProfileFormValues)).toEqual({ kind: 'changed', changes: { bio: 'new' } })
  expect(buildProfileChanges(baseline, { ...baseline })).toEqual({ kind: 'unchanged' })
})
it.each(profileTextCases.filter(({ field }) => field !== 'fullName'))('clears existing $field with null and omits initially absent blanks', ({ field, value }) => {
  const existing = toProfileFormValues({ ...validUser, profile: { [field]: value } })
  for (const blank of ['', ' \t\n ']) {
    expect(buildProfileChanges(existing, { ...existing, [field]: blank })).toEqual({ kind: 'changed', changes: { [field]: null } })
    for (const profile of [undefined, null, {}, { [field]: null }, { [field]: '' }]) {
      const absent = toProfileFormValues({ ...validUser, profile })
      expect(buildProfileChanges(absent, { ...absent, [field]: blank })).toEqual({ kind: 'unchanged' })
      expect(buildProfileChanges(absent, { ...absent, [field]: blank, fullName: 'New name' })).toEqual({ kind: 'changed', changes: { fullName: 'New name' } })
    }
  }
})

it('blocks empty, null and undefined full names', () => {
  const baseline = toProfileFormValues(validUser)
  for (const fullName of ['', ' ', null, undefined]) expect(buildProfileChanges(baseline, { ...baseline, fullName } as ProfileFormValues).kind).toBe('invalid')
})

it('does not revalidate or resend untouched legacy phone data', () => {
  const baseline = toProfileFormValues({ ...validUser, profile: { phoneNumber: '+0012345' } })
  expect(buildProfileChanges(baseline, { ...baseline, bio: 'New bio' })).toEqual({ kind: 'changed', changes: { bio: 'New bio' } })
  expect(buildProfileChanges(baseline, { ...baseline, phoneNumber: '' })).toEqual({ kind: 'changed', changes: { phoneNumber: null } })
})
