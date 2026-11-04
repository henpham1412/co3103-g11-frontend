import { jwtDecode, type JwtPayload } from 'jwt-decode'

export const MAX_REMEMBER_ME_DURATION = 24 * 60 * 60 * 1000

// Decoding provides a client-side deadline, never proof of a valid signature.
// Invalid tokens/lifetimes expire immediately; the server validates authenticity.
export function calculateSessionExpiry(
  token: string,
  expiresIn?: number,
  rememberMe = false,
): number {
  const now = Date.now()
  try {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return now
    const header = jwtDecode<{ alg?: unknown }>(token, { header: true })
    if (typeof header !== 'object' || header === null || Array.isArray(header)
      || typeof header.alg !== 'string' || !header.alg.trim() || header.alg === 'none') return now
    const payload = jwtDecode<JwtPayload>(token)
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return now

    const deadlines: number[] = []
    if (payload.exp !== undefined) {
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp * 1000)) return now
      deadlines.push(payload.exp * 1000)
    }
    if (expiresIn !== undefined) {
      if (!Number.isFinite(expiresIn) || expiresIn <= 0 || !Number.isFinite(now + expiresIn * 1000)) return now
      deadlines.push(now + expiresIn * 1000)
    }
    // A remember-me cap cannot invent a lifetime for a token with no expiry.
    if (deadlines.length === 0) return now
    if (rememberMe) deadlines.push(now + MAX_REMEMBER_ME_DURATION)
    return Math.min(...deadlines)
  } catch {
    return now
  }
}
