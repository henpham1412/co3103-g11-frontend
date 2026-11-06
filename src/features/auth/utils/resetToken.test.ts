import { expect, it } from 'vitest'
import { parseResetToken } from './resetToken'

it('handles missing, blank and duplicate queries without choosing a token', () => {
  for (const search of ['', '?other=x', '?token=', '?token=%20']) expect(parseResetToken(search)).toEqual({ kind: 'missing' })
  expect(parseResetToken('?token=a&token=b')).toEqual({ kind: 'ambiguous' })
})
it('decodes exactly once and preserves opaque bytes', () => {
  expect(parseResetToken('?token=%20a%2B%2525%20')).toEqual({ kind: 'token', token: ' a+%25 ' })
})

it.each([
  '?token=%00', '?token=opaque%00value', '?token=\uD800', '?token=\uDC00',
  '?token=%ED%A0%80', '?token=%ED%B0%80', '?token=%F0%9F', '?token=%ZZ',
])('rejects an unsafe query token and offers manual entry (case %#)', search => {
  expect(parseResetToken(search)).toEqual({ kind: 'invalid' })
})

it('preserves valid query Unicode, opaque punctuation and encoded parameter names', () => {
  expect(parseResetToken('?%74oken=%20Vi%E1%BB%87t%F0%9F%98%80%20')).toEqual({ kind: 'token', token: ' Việt😀 ' })
  expect(parseResetToken('?token=%EF%BF%BD')).toEqual({ kind: 'token', token: '\uFFFD' })
  expect(parseResetToken('?token=a=b%26c%25')).toEqual({ kind: 'token', token: 'a=b&c%' })
  expect(parseResetToken('?token=a&%74oken=b')).toEqual({ kind: 'ambiguous' })
  expect(parseResetToken('?token')).toEqual({ kind: 'missing' })
  expect(parseResetToken('?other=x&?token=a')).toEqual({ kind: 'missing' })
  expect(parseResetToken('?other=%ZZ&token=valid')).toEqual({ kind: 'token', token: 'valid' })
})
