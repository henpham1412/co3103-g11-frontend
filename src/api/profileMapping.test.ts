import { expect, it } from 'vitest'
import type { ProfileChanges } from '@/types/profile'
import { avatarUrlCases } from '@/test/fixtures/profileWire'
import { serializeProfileChanges } from './profileMapping'

it('constructs a flat allowlisted body and never includes identity or form metadata', () => {
  const changes = { fullName: ' New name ', avatarUrl: 'https://example.com/a.png', bio: 'line\nline', phoneNumber: '+84912345678', dateOfBirth: '2026-11-04', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', email: 'ignored', status: 'ACTIVE', profile: {}, role: 'ignored' }
  expect(serializeProfileChanges(changes, '2026-11-04')).toEqual({ full_name: 'New name', avatar_url: 'https://example.com/a.png', bio: 'line\nline', phone_number: '+84912345678', date_of_birth: '2026-11-04', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' })
  expect(serializeProfileChanges({ bio: 'only bio' })).toEqual({ bio: 'only bio' })
  expect(changes.fullName).toBe(' New name ')
})

// profileValidation.test.ts owns the field/character matrix; cover serializer rejection before and after a valid field.
it.each([
  { name: 'NUL in full name', changes: { fullName: ' Nguyễn\0 An ', bio: 'A valid change' } },
  { name: 'lone surrogate in bio', changes: { fullName: 'Valid name', bio: 'Draft\uD800' } },
])('rejects $name without serializing a partial update', ({ changes }) => {
  expect(() => serializeProfileChanges(changes)).toThrow('Please check your profile changes.')
})

it('preserves valid Unicode and multiline bio without URL encoding or normalization', () => {
  expect(serializeProfileChanges({
    fullName: 'Nguyễn An 😀', avatarUrl: 'https://example.com/ảnh😀.png',
    bio: ' Một dòng e\u0301😀\n\tDòng thứ hai\r\n ', phoneNumber: '+84912345678',
    locale: 'Tiếng Việt', timezone: 'Múi giờ 😀',
  })).toEqual({
    full_name: 'Nguyễn An 😀', avatar_url: 'https://example.com/ảnh😀.png',
    bio: ' Một dòng e\u0301😀\n\tDòng thứ hai\r\n ', phone_number: '+84912345678',
    locale: 'Tiếng Việt', timezone: 'Múi giờ 😀',
  })
})

it('ignores prototype and read-only keys without allowing an empty update', () => {
  const changes = JSON.parse('{"__proto__":{"fullName":"Injected"},"constructor":"ignored","prototype":"ignored","email":"ignored","status":"ignored","bio":"Valid bio"}')
  expect(serializeProfileChanges(changes)).toEqual({ bio: 'Valid bio' })
  expect(() => serializeProfileChanges(Object.create({ bio: 'Inherited' }))).toThrow('Please check your profile changes.')
})
it('rejects empty, null-name, wrong-type and invalid date requests even when the UI is bypassed', () => {
  for (const value of [null, [], {}, { fullName: undefined }, { fullName: null }, { fullName: ' ' }, { bio: undefined }, { bio: 3 }, { email: 'ignored' }, { profile: { bio: 'nested' } }, { dateOfBirth: '2026-11-05' }, { dateOfBirth: '2026-04-31' }, { avatarUrl: 'data:text/html,x' }]) {
    expect(() => serializeProfileChanges(value as ProfileChanges, '2026-11-04')).toThrow('Please check your profile changes.')
  }
})

it.each([
  ['bio', 'bio'], ['avatarUrl', 'avatar_url'], ['phoneNumber', 'phone_number'],
  ['dateOfBirth', 'date_of_birth'], ['locale', 'locale'], ['timezone', 'timezone'],
] as const)('serializes explicit null and blank %s as exactly one nullable wire key', (field, key) => {
  for (const value of [null, '', ' \t\n ']) {
    expect(JSON.parse(JSON.stringify(serializeProfileChanges({ [field]: value })))).toEqual({ [key]: null })
  }
})

it.each(avatarUrlCases)('serializes only backend-compatible avatar URLs: $value', ({ value, serialized }) => {
  const changes = { fullName: 'Valid name', avatarUrl: value, bio: 'Valid bio' }
  if (serialized === null) expect(() => serializeProfileChanges(changes)).toThrow(expect.objectContaining({ code: 'INVALID_PROFILE_CHANGES' }))
  else expect(serializeProfileChanges(changes)).toEqual({ full_name: 'Valid name', avatar_url: serialized, bio: 'Valid bio' })
  expect(changes.avatarUrl).toBe(value)
})

it.each([
  { field: 'locale', limit: 20 }, { field: 'timezone', limit: 64 },
] as const)('enforces $field limits when bypassing the form', ({ field, limit }) => {
  for (const value of ['a'.repeat(limit), '😀'.repeat(limit / 2)]) {
    expect(serializeProfileChanges({ [field]: value })).toEqual({ [field]: value })
    expect(() => serializeProfileChanges({ bio: 'Valid', [field]: value + 'a' })).toThrow('Please check your profile changes.')
  }
})

it('preserves backend-supported phone text, enforces length and keeps null/omission semantics', () => {
  for (const phoneNumber of ['0912345678', '+84 912 345 678', '+84912345678', ' 0912345678 ', '+' + '1'.repeat(29)]) {
    expect(serializeProfileChanges({ phoneNumber })).toEqual({ phone_number: phoneNumber })
  }
  for (const phoneNumber of ['1'.repeat(31), '😀'.repeat(15) + '1', '0912345678\0']) {
    expect(() => serializeProfileChanges({ phoneNumber })).toThrow('Please check your profile changes.')
  }
  expect(serializeProfileChanges({ phoneNumber: null })).toEqual({ phone_number: null })
  expect(serializeProfileChanges({ bio: 'Unchanged phone' })).toEqual({ bio: 'Unchanged phone' })
})
