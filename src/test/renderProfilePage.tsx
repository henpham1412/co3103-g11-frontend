import { ConfigProvider } from 'antd'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import AppProviders from '@/app/providers'
import { router as appRouter } from '@/app/router'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import type { AuthSession } from '@/types/auth'
import { authSession } from './fixtures/auth'
import AuthTestMotion from './AuthTestMotion'

export function renderProfilePage(options: { session?: AuthSession | null; path?: string; preserveStorage?: boolean } = {}) {
  if (!options.preserveStorage) {
    localStorage.clear()
    sessionStorage.clear()
    const session = options.session === undefined ? authSession() : options.session
    if (session) tokenStorage.saveSession(session)
  }
  const router = createMemoryRouter(appRouter.routes, { initialEntries: [options.path ?? '/profile'] })
  const user = userEvent.setup()
  const view = render(<ConfigProvider theme={{ token: { motion: false } }}><AppProviders><AuthTestMotion><RouterProvider router={router} /></AuthTestMotion></AppProviders></ConfigProvider>)
  return { ...view, user, router }
}
