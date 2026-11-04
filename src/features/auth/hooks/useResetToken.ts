import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { parseResetToken, type ResetToken } from '../utils/resetToken'

export function useResetToken() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const hasQuery = params.has('token')
  params.delete('token')
  const cleanSearch = params.size ? '?' + params.toString() : ''
  const [captured, setCaptured] = useState(() => ({
    key: location.key, selection: parseResetToken(location.search), revision: 0,
    scrubbing: hasQuery, cleanSearch,
  }))
  // Derive a new flow before children commit. Our own replace preserves memory;
  // a subsequent navigation (including Back) starts a fresh, empty flow.
  if (captured.key !== location.key) {
    const ownReplace = captured.scrubbing && !hasQuery && location.search === captured.cleanSearch
    setCaptured({ key: location.key,
      selection: ownReplace ? captured.selection : parseResetToken(location.search),
      revision: captured.revision + (ownReplace ? 0 : 1), scrubbing: hasQuery, cleanSearch })
  }
  const scrubbedKey = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!hasQuery || scrubbedKey.current === location.key) return
    scrubbedKey.current = location.key
    void navigate({ pathname: location.pathname, search: cleanSearch, hash: location.hash }, { replace: true, state: null })
  }, [hasQuery, location.key, location.pathname, location.hash, cleanSearch, navigate])
  const clear = useCallback(() => setCaptured(previous => ({ ...previous, selection: { kind: 'missing' } as ResetToken })), [])
  return { selection: captured.selection, revision: captured.revision, clear }
}
