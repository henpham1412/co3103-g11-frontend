import { expect, it } from 'vitest'
import type { ProfileChanges } from '@/types/profile'
import { serializeProfileChanges } from './profileMapping'

it('constructs a flat allowlisted body and never includes identity or form metadata', () => {
  const changes = { fullName: ' New name ', avatarUrl: 'https://example.com/a.png', bio: 'line\nline', phoneNumber: '+0012', dateOfBirth: '2026-11-04', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', email: 'ignored', status: 'ACTIVE', profile: {}, role: 'ignored' }
  expect(serializeProfileChanges(changes, '2026-11-04')).toEqual({ full_name: 'New name', avatar_url: 'https://example.com/a.png', bio: 'line\nline', phone_number: '+0012', date_of_birth: '2026-11-04', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' })
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
    bio: ' Một dòng e\u0301😀\n\tDòng thứ hai\r\n ', phoneNumber: ' +00123 ',
    locale: 'Tiếng Việt', timezone: 'Múi giờ 😀',
  })).toEqual({
    full_name: 'Nguyễn An 😀', avatar_url: 'https://example.com/ảnh😀.png',
    bio: ' Một dòng e\u0301😀\n\tDòng thứ hai\r\n ', phone_number: ' +00123 ',
    locale: 'Tiếng Việt', timezone: 'Múi giờ 😀',
  })
})

it('ignores prototype and read-only keys without allowing an empty update', () => {
  const changes = JSON.parse('{"__proto__":{"fullName":"Injected"},"constructor":"ignored","prototype":"ignored","email":"ignored","status":"ignored","bio":"Valid bio"}')
  expect(serializeProfileChanges(changes)).toEqual({ bio: 'Valid bio' })
  expect(() => serializeProfileChanges(Object.create({ bio: 'Inherited' }))).toThrow('Please check your profile changes.')
})
it('rejects empty, null-name, wrong-type and invalid date requests even when the UI is bypassed', () => {
  for (const value of [null, [], {}, { fullName: undefined }, { fullName: null }, { fullName: ' ' }, { bio: '' }, { bio: 3 }, { email: 'ignored' }, { profile: { bio: 'nested' } }, { dateOfBirth: '2026-11-05' }, { dateOfBirth: '2026-04-31' }, { avatarUrl: 'data:text/html,x' }]) {
    expect(() => serializeProfileChanges(value as ProfileChanges, '2026-11-04')).toThrow('Please check your profile changes.')
  }
})
