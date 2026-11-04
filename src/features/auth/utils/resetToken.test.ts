import { expect, it } from 'vitest'
import { parseResetToken } from './resetToken'

it('handles missing, blank and duplicate queries without choosing a token', () => {
  for (const search of ['', '?other=x', '?token=', '?token=%20']) expect(parseResetToken(search)).toEqual({ kind: 'missing' })
  expect(parseResetToken('?token=a&token=b')).toEqual({ kind: 'ambiguous' })
})
it('decodes exactly once and preserves opaque bytes', () => {
  expect(parseResetToken('?token=%20a%2B%2525%20')).toEqual({ kind: 'token', token: ' a+%25 ' })
})
