import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { authSession, validUser } from '@/test/fixtures/auth'
import { AppHeader } from './AppHeader'

it.each([undefined, 'HTTPS://example.com/avatar.png', 'javascript:alert(1)'])('shows a compact identity header and keyboard profile navigation (avatar: %s)', async avatarUrl => {
  const logout = vi.fn()
  const user = userEvent.setup()
  const account = { ...validUser, fullName: 'Alex Morgan', profile: { avatarUrl } }
  render(<AuthContext value={{ state: { status: 'authenticated', session: authSession(), user: account }, logout, login: vi.fn(), retrySessionVerification: vi.fn(), refreshCurrentUser: vi.fn() }}><MemoryRouter><AppHeader /></MemoryRouter></AuthContext>)
  const header = within(screen.getByRole('banner'))
  expect(header.getByText('G11 LMS')).toBeInTheDocument()
  expect(header.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Central Identity/Overview')
  expect(header.getByText('Alex Morgan')).toBeInTheDocument()
  expect(header.queryByText(account.email)).not.toBeInTheDocument()
  expect(header.queryByText(account.status)).not.toBeInTheDocument()
  expect(header.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
  expect(header.queryByText('My profile')).not.toBeInTheDocument()
  if (avatarUrl?.startsWith('HTTPS://')) {
    const avatar = header.getByRole('presentation')
    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png')
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer')
    fireEvent.error(avatar)
  }
  expect(header.getByText('AM')).toBeInTheDocument()
  await user.tab()
  expect(screen.getByRole('link', { name: 'G11 LMS home' })).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('link', { name: 'My profile' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('aria-current', 'page')
  expect(header.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Central Identity/Account Profile')
  expect(logout).not.toHaveBeenCalled()
})
