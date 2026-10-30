import { ConfigProvider } from 'antd'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import AppProviders from '@/app/providers'
import LoginPage from '@/features/auth/pages/LoginPage'
import RegisterPage from '@/features/auth/pages/RegisterPage'

export function renderAuthPage(path: '/login' | '/register', state?: unknown) {
  localStorage.clear()
  sessionStorage.clear()
  const router = createMemoryRouter([
    { path: '/login', element: <LoginPage /> },
    { path: '/register', element: <RegisterPage /> },
    { path: '*', element: <p>Destination page</p> },
  ], { initialEntries: ['/before', { pathname: path, state }], initialIndex: 1 })
  const user = userEvent.setup()
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AppProviders><RouterProvider router={router} /></AppProviders>
    </ConfigProvider>,
  )
  return { ...view, user, router }
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
