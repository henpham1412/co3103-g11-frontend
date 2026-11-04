import { expect, it } from 'vitest'
import { isValidUnicodeText } from './unicodeText'

it.each([
  '\0', '\uD800', '\uDBFF', '\uDC00', '\uDFFF', '\uDC00\uD800',
  '\uD800x\uDC00', '\uD800\uD800\uDC00', '\uD800\uDC00\uDC00',
  '😀\0😀', '😀\uD800😀', '😀\uDC00😀',
])('rejects NUL and unpaired surrogates (case %#)', value => {
  expect(isValidUnicodeText(value)).toBe(false)
})

it.each(['', 'Tiếng Việt', 'e\u0301', '😀', '\uD800\uDC00', '\uDBFF\uDFFF', '\uFFFD', ' line\n\tline\r\n '])(
  'accepts well-formed text without normalization (case %#)', value => {
    expect(isValidUnicodeText(value)).toBe(true)
  },
)
