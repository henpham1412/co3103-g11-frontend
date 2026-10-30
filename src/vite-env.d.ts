/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CENTRAL_IDENTITY_API_URL?: string
  readonly VITE_IDENTITY_API_BASE_URL?: string
  readonly VITE_LMS_API_URL?: string
  readonly VITE_LMS_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
