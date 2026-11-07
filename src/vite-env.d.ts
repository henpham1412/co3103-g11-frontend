/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string
  readonly VITE_AUTH_MODE?: string
  readonly VITE_LMS_CLIENT_ID?: string
  readonly VITE_LMS_REDIRECT_URI?: string
  readonly VITE_CENTRAL_IDENTITY_API_URL?: string
  readonly VITE_IDENTITY_API_BASE_URL?: string
  readonly VITE_LMS_API_URL?: string
  readonly VITE_LMS_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
