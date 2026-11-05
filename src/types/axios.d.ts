import 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuth?: boolean
    authToken?: string
    _sessionGeneration?: number
    _authHandled?: boolean
  }
}
