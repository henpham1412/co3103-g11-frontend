// In Unicode mode a valid surrogate pair is one code point, not a Surrogate.
// Reject malformed text rather than letting TextEncoder or URL replace it.
export function isValidUnicodeText(value: string): boolean {
  return !value.includes('\0') && !/\p{Surrogate}/u.test(value)
}
