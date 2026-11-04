import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { authSession, validUser } from '@/test/fixtures/auth'
import { AppHeader } from './AppHeader'

it('exposes an active profile link and keyboard sign out', async () => {
  const logout = vi.fn()
  const user = userEvent.setup()
  render(<AuthContext value={{ state: { status: 'authenticated', session: authSession(), user: validUser }, logout, login: vi.fn(), retrySessionVerification: vi.fn(), refreshCurrentUser: vi.fn() }}><MemoryRouter initialEntries={['/profile']}><AppHeader /></MemoryRouter></AuthContext>)
  await user.tab()
  expect(screen.getByRole('link', { name: 'G11 LMS home' })).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('link', { name: 'My profile' })).toHaveFocus()
  expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('aria-current', 'page')
  await user.tab()
  await user.keyboard('{Enter}')
  expect(logout).toHaveBeenCalledExactlyOnceWith('signed-out')
})
