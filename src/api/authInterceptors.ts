import axios, { CanceledError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import type { LogoutReason } from '@/features/auth/context/AuthContext'
import type { AuthSession } from '@/types/auth'
import { centralIdentityClient } from './centralIdentityClient'
import { lmsClient } from './lmsClient'

export interface SessionSnapshot {
  session: AuthSession | null
  generation: number
}

interface AuthInterceptorOptions {
  getSessionSnapshot(): SessionSnapshot
  purgeSession(reason: LogoutReason, generation: number): void | Promise<void>
  onLmsForbidden(): void
}

export function installAuthInterceptors(options: AuthInterceptorOptions): () => void {
  let active = true
  let purgedGeneration: number | undefined

  async function purgeOnce(reason: LogoutReason, generation: number) {
    if (!active || generation !== options.getSessionSnapshot().generation || purgedGeneration === generation) return
    purgedGeneration = generation
    await options.purgeSession(reason, generation)
  }

  const cleanups = [centralIdentityClient, lmsClient].map(client => {
    // Capture the configured boundary, never trust a per-request baseURL override.
    const base = new URL(client.defaults.baseURL!, window.location.href)
    const basePath = base.pathname.replace(/\/$/, '')
    const isTrusted = (config: InternalAxiosRequestConfig) => {
      try {
        if (/^[a-z][a-z\d+.-]*:/i.test(config.url ?? '') && !/^https?:\/\//i.test(config.url!)) return false
        const url = new URL(client.getUri(config), window.location.href)
        return /^https?:$/.test(url.protocol) && !url.username && !url.password
          && url.origin === base.origin
          && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))
      } catch {
        return false
      }
    }

    const requestId = client.interceptors.request.use(async config => {
      // Also remove stale caller/default headers for public and external requests.
      config.headers.delete('Authorization')
      const explicitToken = config.authToken
      delete config.authToken
      delete config._sessionGeneration
      delete config._authHandled
      // Enforce the same boundary through redirects, including public login bodies.
      config.fetchOptions = { ...config.fetchOptions, redirect: 'error' }
      if (!active || config.skipAuth || !isTrusted(config)) return config

      const { session, generation } = options.getSessionSnapshot()
      const usesSession = session && (explicitToken === undefined || explicitToken === session.accessToken)
      if (usesSession) {
        config._sessionGeneration = generation
        if (session.expiresAt <= Date.now()) {
          await purgeOnce('expired', generation)
          throw new CanceledError('The authentication session has expired.', config)
        }
      }
      const token = explicitToken ?? session?.accessToken
      if (token) config.headers.set('Authorization', `Bearer ${token}`)
      return config
    })

    const responseId = client.interceptors.response.use(undefined, async (error: unknown) => {
      if (active && axios.isAxiosError(error)) {
        const config = error.config
        const generation = config?._sessionGeneration
        if (config && !config.skipAuth && !config._authHandled && generation !== undefined
          && generation === options.getSessionSnapshot().generation && isTrusted(config)) {
          if (error.response?.status === 401) {
            config._authHandled = true
            // Keep the original HTTP error even if a consumer's cleanup fails.
            try { await purgeOnce('unauthorized', generation) } catch { /* HTTP error takes precedence. */ }
          } else if (error.response?.status === 403 && client === lmsClient) {
            config._authHandled = true
            options.onLmsForbidden()
          }
        }
      }
      throw error
    })
    return () => eject(client, requestId, responseId)
  })

  return () => {
    active = false
    cleanups.forEach(cleanup => cleanup())
  }
}

function eject(client: AxiosInstance, requestId: number, responseId: number) {
  client.interceptors.request.eject(requestId)
  client.interceptors.response.eject(responseId)
}
