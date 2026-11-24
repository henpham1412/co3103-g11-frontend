import 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuth?: boolean
    authToken?: string
    _sessionGeneration?: number
    _authHandled?: boolean
    // Capability probes handle an expected LMS 403 locally; authentication remains enforced.
    suppressLmsForbiddenMessage?: boolean
    // In-memory ownership only; never serialized into HTTP headers or browser storage.
    _adminAccessOwner?: object
  }
}
