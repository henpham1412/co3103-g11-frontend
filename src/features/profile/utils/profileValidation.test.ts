import { describe, expect, it } from 'vitest'
import { invalidTextCases, profileTextCases } from '@/test/fixtures/invalidText'
import { avatarUrlCases } from '@/test/fixtures/profileWire'
import { profileFields } from '@/types/profile'
import { isCalendarDate, isSafeAvatarUrl, localToday, validateDateOfBirth, validateProfileValue } from './profileValidation'

it('validates real calendar dates with explicit local today and no invented age limit', () => {
  const today = '2026-11-04'
  for (const date of ['2026-11-03', today, '0001-01-01', '2000-02-29', '2024-02-29']) expect(validateDateOfBirth(date, today)).toBeUndefined()
  for (const date of ['2026-11-05', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '0000-01-01', '2026-1-1', '2026-11-04T00:00:00Z']) expect(validateDateOfBirth(date, today)).toBeDefined()
  expect(isCalendarDate('2000-02-29')).toBe(true)
  expect(localToday(new Date(2026, 10, 4, 0, 1))).toBe(today)
  expect(localToday(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03')
})

describe.each(profileTextCases)('$field', ({ field, value }) => {
  it.each(invalidTextCases)('rejects $name before field-specific validation', ({ character }) => {
    expect(validateProfileValue(field, value + character)).toBe('Please remove invalid characters from this value.')
  })
})

it('preserves Vietnamese, supplementary Unicode and multiline text', () => {
  for (const field of ['fullName', 'bio', 'locale', 'timezone'] as const) {
    expect(validateProfileValue(field, 'Tiếng Việt e\u0301😀')).toBeUndefined()
  }
  expect(validateProfileValue('bio', ' Một dòng 😀\n\tDòng thứ hai\r\n ')).toBeUndefined()
  expect(validateProfileValue('avatarUrl', 'https://example.com/ảnh😀.png')).toBeUndefined()
})

it.each(invalidTextCases)('rejects avatar $name before URL parsing can replace it', ({ character }) => {
  expect(isSafeAvatarUrl('https://example.com/' + character + '.png')).toBe(false)
})
it.each(avatarUrlCases)('checks avatar authority and safety: $value', ({ value, serialized }) => {
  expect(isSafeAvatarUrl(value)).toBe(serialized !== null)
  expect(validateProfileValue('avatarUrl', value) === undefined).toBe(serialized !== null)
})
it('preserves free text but rejects invalid runtime types and full name clearing', () => {
  expect(validateProfileValue('timezone', 'Existing custom timezone')).toBeUndefined()
  expect(validateProfileValue('bio', 'line one\nline two')).toBeUndefined()
  for (const value of ['', ' ', null, undefined, 12]) expect(validateProfileValue('fullName', value)).toBeDefined()
  for (const field of profileFields.filter(field => field !== 'fullName')) {
    for (const value of [null, '', ' \t\n ']) expect(validateProfileValue(field, value)).toBeUndefined()
    for (const value of [undefined, 12, {}, []]) expect(validateProfileValue(field, value)).toBeDefined()
  }
})

it.each(['0912345678', '+84 912 345 678', '+84912345678', '84912345678', ' +84912345678 ', '+' + '1'.repeat(29)])('accepts backend-supported phone text %s', value => {
  expect(validateProfileValue('phoneNumber', value)).toBeUndefined()
})

it('enforces the backend phone cap at 30/31 UTF-16 units without a format restriction', () => {
  for (const value of ['1'.repeat(30), '😀'.repeat(15)]) {
    expect(validateProfileValue('phoneNumber', value)).toBeUndefined()
    expect(validateProfileValue('phoneNumber', value + '1')).toBe('Phone number must not exceed 30 characters.')
  }
})

it.each([
  { field: 'locale', limit: 20, label: 'Locale' },
  { field: 'timezone', limit: 64, label: 'Timezone' },
] as const)('enforces $field length using UTF-16 units', ({ field, limit, label }) => {
  for (const value of ['a'.repeat(limit), '😀'.repeat(limit / 2)]) {
    expect(validateProfileValue(field, value)).toBeUndefined()
    expect(validateProfileValue(field, value + 'a')).toBe(`${label} must not exceed ${limit} characters.`)
  }
})
