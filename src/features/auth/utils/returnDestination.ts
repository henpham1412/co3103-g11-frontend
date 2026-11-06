import { isRecord } from '@/utils/typeGuards'

export function returnDestination(from: unknown): string {
  const pathname = typeof from === 'string' ? from : isRecord(from) ? from.pathname : undefined
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return '/'
  const search = isRecord(from) && typeof from.search === 'string' && from.search.startsWith('?') ? from.search : ''
  const hash = isRecord(from) && typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : ''
  const target = pathname + search + hash
  // Check the complete destination, including encoded separators and controls.
  // Normalize dot segments before returning a path to the router.
  try {
    const decoded = decodeURIComponent(target)
    if (/[\\\p{Cc}]/u.test(decoded) || decoded.startsWith('//')) return '/'
    const base = 'https://auth.invalid'
    const url = new URL(target, base)
    const decodedPath = decodeURIComponent(url.pathname)
    if (url.origin !== base || decodedPath.startsWith('//')
      || /^\/(?:login|register|forgot-password|reset-password)\/*$/i.test(new URL(decodedPath, base).pathname)) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}
