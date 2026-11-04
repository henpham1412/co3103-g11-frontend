import { App, ConfigProvider } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import AppProviders from '@/app/providers'
import LoginPage from '@/features/auth/pages/LoginPage'
import RegisterPage from '@/features/auth/pages/RegisterPage'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage'
import { AuthContext, type AuthState } from '@/features/auth/context/AuthContext'
import { authApi } from '@/api/authApi'
import { authTheme } from '@/app/theme'
import { authSession } from './fixtures/auth'
import AuthTestMotion from './AuthTestMotion'

export function renderAuthPage(path: '/login' | '/register' | '/forgot-password' | '/reset-password', state?: unknown, options: { integration?: boolean; authState?: AuthState; search?: string; strict?: boolean } = {}) {
  localStorage.clear()
  sessionStorage.clear()
  const router = createMemoryRouter([
    { path: '/login', element: <LoginPage /> },
    { path: '/register', element: <RegisterPage /> },
    { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/reset-password', element: <ResetPasswordPage /> },
    { path: '*', element: <p>Destination page</p> },
  ], { initialEntries: ['/before', { pathname: path, search: options.search, state }], initialIndex: 1 })
  const user = userEvent.setup()
  const content = <AuthTestMotion><RouterProvider router={router} /></AuthTestMotion>
  const view = render(
    <ConfigProvider theme={{ ...authTheme, token: { ...authTheme.token, motion: false } }}>
      {options.integration ? <AppProviders>{content}</AppProviders> : (
        <App><AuthContext value={{
          state: options.authState ?? { status: 'anonymous' },
          login: async credentials => authSession(await authApi.login(credentials)),
          logout: async () => { },
          retrySessionVerification: async () => { },
        }}>{content}</AuthContext></App>
      )}
    </ConfigProvider>, { reactStrictMode: options.strict },
  )
  return { ...view, user, router }
}

// Fixture assignment for field/banner wiring; interaction journeys still use userEvent.
export function setAuthFields(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  }
}

export async function fillAuthFields(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const input = screen.getByLabelText(label, { exact: true })
    await user.click(input)
    await user.clear(input)
    if (value) await user.paste(value)
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
