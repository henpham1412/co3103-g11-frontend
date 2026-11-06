import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, it } from 'vitest'
import { SecurityCard } from './SecurityCard'

it('shows security and password recovery without session details and navigates to recovery', async () => {
  const user = userEvent.setup()
  const router = createMemoryRouter([
    { path: '/profile', element: <SecurityCard /> },
    { path: '/forgot-password', element: <h1>Forgot your password?</h1> },
  ], { initialEntries: ['/profile'] })
  render(<RouterProvider router={router} />)

  const card = within(screen.getByRole('region', { name: 'Security' }))
  expect(card.getByRole('heading', { level: 2, name: 'Security' })).toBeInTheDocument()
  expect(card.getByText('Manage security settings and password recovery for this account.')).toBeInTheDocument()
  expect(card.queryByText(/Current Session|Active now/i)).not.toBeInTheDocument()
  expect(card.queryByText(/\b(?:Chrome|Edge|Opera|Firefox|Safari|Current browser|Windows|iOS|macOS|Android|Linux)\b/i)).not.toBeInTheDocument()
  const recovery = card.getByRole('link', { name: 'Password Recovery' })
  expect(recovery).toHaveAttribute('href', '/forgot-password')

  await user.click(recovery)
  expect(router.state.location.pathname).toBe('/forgot-password')
  expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument()
})
