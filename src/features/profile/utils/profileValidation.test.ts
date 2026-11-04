import { expect, it } from 'vitest'
import { isCalendarDate, isSafeAvatarUrl, localToday, validateDateOfBirth, validateProfileValue } from './profileValidation'

it('validates real calendar dates with explicit local today and no invented age limit', () => {
  const today = '2026-11-04'
  for (const date of ['2026-11-03', today, '0001-01-01', '2000-02-29', '2024-02-29']) expect(validateDateOfBirth(date, today)).toBeUndefined()
  for (const date of ['2026-11-05', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '0000-01-01', '2026-1-1', '2026-11-04T00:00:00Z']) expect(validateDateOfBirth(date, today)).toBeDefined()
  expect(isCalendarDate('2000-02-29')).toBe(true)
  expect(localToday(new Date(2026, 10, 4, 0, 1))).toBe(today)
  expect(localToday(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03')
})
it('limits avatars to absolute HTTP(S) without credentials or controls', () => {
  for (const url of ['https://images.example/a.png', 'http://images.example/a?q=1']) expect(isSafeAvatarUrl(url)).toBe(true)
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,x', '//example/a', 'https:example/a', 'https://user:pass@example/a', 'https://example/a\n', ' https://example/a', 'not a URL']) expect(isSafeAvatarUrl(url)).toBe(false)
})
it('preserves unconstrained profile strings but rejects invalid runtime types and blank writes', () => {
  expect(validateProfileValue('phoneNumber', '+0012345')).toBeUndefined()
  expect(validateProfileValue('timezone', 'Existing custom timezone')).toBeUndefined()
  expect(validateProfileValue('bio', 'line one\nline two')).toBeUndefined()
  for (const value of ['', ' ', null, undefined, 12]) expect(validateProfileValue('fullName', value)).toBeDefined()
  expect(validateProfileValue('bio', '')).toContain('Clearing')
})
