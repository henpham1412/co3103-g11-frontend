import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_CHANNEL_NAME, AUTH_SYNC_KEY, createAuthSync, type AuthSyncSignal } from './authSync'
import { AUTH_SESSION_KEY } from './tokenStorage'

class TestChannel {
  static instances: TestChannel[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage = vi.fn((data: unknown) => {
    TestChannel.instances.filter(peer => peer !== this).forEach(peer => peer.onmessage?.(new MessageEvent('message', { data })))
  })
  close = vi.fn()
  name: string
  constructor(name: string) {
    this.name = name
    TestChannel.instances.push(this)
  }
}

const cleanups: (() => void)[] = []
function connect(callback = vi.fn()) {
  const sync = createAuthSync(callback)
  cleanups.push(sync.cleanup)
  return { ...sync, callback }
}
function storage(key: string | null, newValue: string | null, storageArea: Storage = localStorage) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  TestChannel.instances = []
  vi.stubGlobal('BroadcastChannel', TestChannel)
})
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()) })

describe('authSync', () => {
  it("sanitizes signals, deduplicates echoes and ignores malformed channel/storage messages", () => {
    {
      const first = connect()
      const second = connect()
      first.publish({ type: 'session-changed', accessToken: 'secret' } as AuthSyncSignal)
      expect(TestChannel.instances[0].name).toBe(AUTH_CHANNEL_NAME)
      expect(first.callback).not.toHaveBeenCalled()
      expect(second.callback).toHaveBeenCalledExactlyOnceWith({ type: 'session-changed' })
      const payload = JSON.parse(localStorage.getItem(AUTH_SYNC_KEY)!)
      expect(payload).toEqual({ id: expect.any(String), type: 'session-changed' })
      expect(TestChannel.instances[0].postMessage).toHaveBeenCalledWith(payload)
      storage(AUTH_SYNC_KEY, JSON.stringify(payload))
      expect(first.callback).not.toHaveBeenCalled()
      expect(second.callback).toHaveBeenCalledOnce()
    }

    for (const data of [null, {}, { id: 1, type: 'session-changed' }, { id: 'a', type: 'login' },
      { id: 'b', type: 'logout' }, { id: 'c', type: 'logout', reason: 'other' }] as const) {
      const sync = connect()
      TestChannel.instances.at(-1)!.onmessage?.(new MessageEvent('message', { data }))
      storage(AUTH_SYNC_KEY, JSON.stringify(data))
      storage(AUTH_SYNC_KEY, '{broken')
      expect(sync.callback, `case: ${JSON.stringify(data)}`).not.toHaveBeenCalled()
      sync.cleanup()
    }
  })

  it("propagates every logout reason with its session scope", () => {
    for (const reason of ['expired', 'unauthorized', 'signed-out'] as const) {
      const first = connect()
      const second = connect()
      first.publish({ type: 'logout', reason, sessionId: 'public-session-id' })
      expect(second.callback, `case: ${JSON.stringify(reason)}`).toHaveBeenCalledExactlyOnceWith({ type: 'logout', reason, sessionId: 'public-session-id' })
    }
  })

  it("uses storage when the channel is absent or unavailable", () => {
    {
      vi.stubGlobal('BroadcastChannel', undefined)
      const sync = connect()
      storage(AUTH_SYNC_KEY, JSON.stringify({ id: 'remote', type: 'logout', reason: 'signed-out', sessionId: null }))
      expect(sync.callback).toHaveBeenCalledExactlyOnceWith({ type: 'logout', reason: 'signed-out', sessionId: null })
      expect(() => sync.publish({ type: 'session-changed' })).not.toThrow()
      expect(localStorage.getItem(AUTH_SYNC_KEY)).toContain('session-changed')
    }
    {
      vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('Unavailable') } })
      const sync = connect()
      expect(() => sync.publish({ type: 'logout', reason: 'signed-out', sessionId: null })).not.toThrow()
      expect(JSON.parse(localStorage.getItem(AUTH_SYNC_KEY)!)).toMatchObject({ type: 'logout', reason: 'signed-out', sessionId: null })
      vi.stubGlobal('BroadcastChannel', TestChannel)
      const posting = connect()
      TestChannel.instances.at(-1)!.postMessage.mockImplementation(() => { throw new Error('Cannot post') })
      expect(() => posting.publish({ type: 'logout', reason: 'expired', sessionId: 'posting-session' })).not.toThrow()
      expect(JSON.parse(localStorage.getItem(AUTH_SYNC_KEY)!)).toMatchObject({ type: 'logout', reason: 'expired', sessionId: 'posting-session' })
    }
  })

  it('handles persistent session writes, removals and storage.clear without reading token data', () => {
    const sync = connect()
    storage(AUTH_SESSION_KEY, 'not-parsed-as-a-signal')
    storage(AUTH_SESSION_KEY, null)
    storage(null, null)
    expect(sync.callback.mock.calls).toEqual(Array.from({ length: 3 }, () => [{ type: 'session-changed' }]))
    storage('theme', 'dark')
    storage(AUTH_SESSION_KEY, null, sessionStorage)
    expect(sync.callback).toHaveBeenCalledTimes(3)
  })

  it('continues over BroadcastChannel when storage is blocked', () => {
    const first = connect()
    const second = connect()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked') })
    expect(() => first.publish({ type: 'logout', reason: 'unauthorized', sessionId: 'public-id' })).not.toThrow()
    expect(second.callback).toHaveBeenCalledExactlyOnceWith({ type: 'logout', reason: 'unauthorized', sessionId: 'public-id' })
  })

  it('still publishes distinct signals when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {})
    const first = connect()
    const second = connect()
    expect(() => first.publish({ type: 'session-changed' })).not.toThrow()
    expect(() => first.publish({ type: 'session-changed' })).not.toThrow()
    expect(second.callback).toHaveBeenCalledTimes(2)
    const payloads = TestChannel.instances[0].postMessage.mock.calls.map(([payload]) => payload)
    expect(payloads[0]).not.toEqual(payloads[1])
  })

  it('removes listeners, closes channels and prevents publishing after cleanup', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const sync = connect()
    const channel = TestChannel.instances[0]
    const lateMessage = channel.onmessage!
    sync.cleanup()
    storage(AUTH_SESSION_KEY, null)
    lateMessage(new MessageEvent('message', { data: { id: 'late', type: 'session-changed' } }))
    sync.publish({ type: 'session-changed' })
    expect(sync.callback).not.toHaveBeenCalled()
    expect(channel.postMessage).not.toHaveBeenCalled()
    expect(channel.onmessage).toBeNull()
    expect(channel.close).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function))
  })
})
