import type { LogoutReason } from '@/features/auth/context/AuthContext'
import { AUTH_SESSION_KEY } from './tokenStorage'

export const AUTH_SYNC_KEY = 'co3103.auth.sync'
export const AUTH_CHANNEL_NAME = 'co3103.auth'

export type AuthSyncSignal =
  | { type: 'session-changed' }
  | { type: 'logout', reason: LogoutReason, sessionId: string | null }

type AuthSyncMessage = AuthSyncSignal & { id: string }
let signalSequence = 0

function parseMessage(value: unknown): AuthSyncMessage | null {
  if (typeof value !== 'object' || value === null || !('id' in value)
    || typeof value.id !== 'string' || !('type' in value)) return null
  if (value.type === 'session-changed') return { id: value.id, type: value.type }
  if (value.type === 'logout' && 'reason' in value
    && 'sessionId' in value && (value.sessionId === null || typeof value.sessionId === 'string' && value.sessionId.length > 0)
    && (value.reason === 'expired' || value.reason === 'unauthorized' || value.reason === 'signed-out')) {
    return { id: value.id, type: value.type, reason: value.reason, sessionId: value.sessionId }
  }
  return null
}

export function createAuthSync(onSignal: (signal: AuthSyncSignal) => void) {
  let active = true
  let channel: BroadcastChannel | undefined
  const seen = new Set<string>()
  const remember = (id: string) => {
    seen.add(id)
    if (seen.size > 100) seen.delete(seen.values().next().value!)
  }
  const receive = (data: unknown) => {
    const message = parseMessage(data)
    if (!active || !message || seen.has(message.id)) return
    remember(message.id)
    onSignal(message.type === 'logout'
      ? { type: 'logout', reason: message.reason, sessionId: message.sessionId } : { type: 'session-changed' })
  }
  const onStorage = (event: StorageEvent) => {
    if (!active) return
    try {
      if (event.storageArea !== null && event.storageArea !== window.localStorage) return
      if (event.key === AUTH_SYNC_KEY && event.newValue) receive(JSON.parse(event.newValue))
      else if (event.key === AUTH_SESSION_KEY || event.key === null) onSignal({ type: 'session-changed' })
    } catch {
      // Storage can be blocked or a signal can contain malformed JSON.
    }
  }

  try {
    channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
    channel.onmessage = event => receive(event.data)
  } catch {
    // The storage-event transport also supports browsers without BroadcastChannel.
  }
  window.addEventListener('storage', onStorage)

  return {
    publish(signal: AuthSyncSignal) {
      if (!active) return
      // Construct a fresh payload so callers cannot accidentally broadcast tokens.
      // This is a deduplication ID, not a credential; support non-secure dev origins too.
      const id = globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${++signalSequence}-${Math.random().toString(36).slice(2)}`
      const message: AuthSyncMessage = signal.type === 'logout'
        ? { id, type: signal.type, reason: signal.reason, sessionId: signal.sessionId }
        : { id, type: 'session-changed' }
      remember(message.id)
      try { channel?.postMessage(message) } catch { /* Try storage as well. */ }
      try { window.localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify(message)) } catch { /* Storage is optional. */ }
    },
    cleanup() {
      if (!active) return
      active = false
      window.removeEventListener('storage', onStorage)
      if (channel) {
        channel.onmessage = null
        channel.close()
      }
      seen.clear()
    },
  }
}
