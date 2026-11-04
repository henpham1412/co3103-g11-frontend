import { validateResetToken } from './passwordRecoveryValidation'

export type ResetToken = { kind: 'token'; token: string } | { kind: 'missing' | 'ambiguous' | 'invalid' }

export function parseResetToken(search: string): ResetToken {
  // Only use URLSearchParams to identify keys. Its value decoder replaces
  // malformed Unicode, so decode the original token strictly before validation.
  const tokens = search.replace(/^\?/, '').split('&')
    .filter(part => new URLSearchParams('?' + part).has('token'))
  if (tokens.length > 1) return { kind: 'ambiguous' }
  if (!tokens.length) return { kind: 'missing' }
  const separator = tokens[0].indexOf('=')
  let token: string
  try {
    token = decodeURIComponent((separator < 0 ? '' : tokens[0].slice(separator + 1)).replace(/\+/g, ' '))
  } catch { return { kind: 'invalid' } }
  if (!token.trim()) return { kind: 'missing' }
  return validateResetToken(token) ? { kind: 'invalid' } : { kind: 'token', token }
}
