export type ResetToken = { kind: 'token'; token: string } | { kind: 'missing' | 'ambiguous' }

export function parseResetToken(search: string): ResetToken {
  const tokens = new URLSearchParams(search).getAll('token')
  if (tokens.length > 1) return { kind: 'ambiguous' }
  return tokens[0]?.trim() ? { kind: 'token', token: tokens[0] } : { kind: 'missing' }
}
