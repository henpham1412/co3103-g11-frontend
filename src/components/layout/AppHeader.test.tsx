import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { authSession, validUser } from '@/test/fixtures/auth'
import type { User } from '@/types/auth'
import { AppHeader } from './AppHeader'

function renderHeader(account: User) {
  const logout = vi.fn()
  render(<AuthContext value={{ state: { status: 'authenticated', session: authSession(), user: account }, logout, login: vi.fn(), retrySessionVerification: vi.fn(), refreshCurrentUser: vi.fn() }}><MemoryRouter><AppHeader /></MemoryRouter></AuthContext>)
  return { logout }
}

it.each([undefined, 'HTTPS://example.com/avatar.png', 'javascript:alert(1)'])('shows a compact identity header and keyboard profile navigation (avatar: %s)', async avatarUrl => {
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  const user = userEvent.setup()
  const account = { ...validUser, fullName: 'Alex Morgan', profile: { avatarUrl } }
  const { logout } = renderHeader(account)
  const header = within(screen.getByRole('banner'))
  expect(header.getByText('G11 LMS')).toBeInTheDocument()
  const breadcrumb = header.getByRole('navigation', { name: 'Breadcrumb' })
  expect(breadcrumb).toHaveTextContent('Central Identity>Overview')
  const rootLink = within(breadcrumb).getByRole('link', { name: 'Central Identity' })
  expect(rootLink).toHaveAttribute('href', '/')
  expect(within(breadcrumb).getByText('>')).toHaveAttribute('aria-hidden', 'true')
  const profileButton = header.getByRole('button', { name: 'My profile' })
  expect(profileButton).toHaveAttribute('type', 'button')
  expect(profileButton).toHaveAttribute('aria-haspopup', 'menu')
  expect(profileButton).toHaveAttribute('aria-expanded', 'false')
  expect(within(profileButton).getByText('Alex Morgan - Account')).toHaveAttribute('title', 'Alex Morgan - Account')
  expect(profileButton.querySelector('svg[data-icon="down"]')).toBeInTheDocument()
  expect(profileButton.querySelector('.app-profile-chevron')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
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
  expect(rootLink).toHaveFocus()
  await user.tab()
  expect(profileButton).toHaveFocus()
  await user.keyboard('{Enter}')
  const menu = await screen.findByRole('menu', { name: 'Account menu' })
  expect(profileButton).toHaveAttribute('aria-expanded', 'true')
  expect(profileButton).toHaveAttribute('aria-controls', menu.id)
  expect(breadcrumb).toHaveTextContent('Central Identity>Overview')
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Account Profile', 'Sign Out'])
  expect(within(menu).getByRole('separator')).toBeInTheDocument()
  const profileLink = within(menu).getByRole('link', { name: 'Account Profile' })
  expect(profileLink).toHaveAttribute('href', '/profile')
  const profileItem = within(menu).getByRole('menuitem', { name: 'Account Profile' })
  await waitFor(() => expect(profileItem).toHaveFocus())
  // Ant Design reads legacy key codes, which user-event does not populate.
  fireEvent.keyDown(profileItem, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 })
  expect(profileButton).toHaveAttribute('aria-expanded', 'false')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(breadcrumb).toHaveTextContent('Central Identity>Account Profile')
  expect(within(breadcrumb).getByText('Account Profile')).toHaveAttribute('aria-current', 'page')
  await user.click(rootLink)
  expect(breadcrumb).toHaveTextContent('Central Identity>Overview')
  expect(within(breadcrumb).getByText('Overview')).toHaveAttribute('aria-current', 'page')
  expect(logout).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

it('navigates through the profile link and calls logout only when Sign Out is selected', async () => {
  const user = userEvent.setup()
  const { logout } = renderHeader(validUser)
  const profileButton = screen.getByRole('button', { name: 'My profile' })
  await user.click(profileButton)
  await user.click(await screen.findByRole('link', { name: 'Account Profile' }))
  expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Central Identity>Account Profile')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(logout).not.toHaveBeenCalled()
  await user.click(profileButton)
  const menu = await screen.findByRole('menu', { name: 'Account menu' })
  await user.click(within(menu).getByRole('menuitem', { name: 'Sign Out' }))
  expect(logout).toHaveBeenCalledExactlyOnceWith()
  expect(profileButton).toHaveAttribute('aria-expanded', 'false')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
})

it('opens with Space and dismisses with Escape, restoring focus to the trigger', async () => {
  const user = userEvent.setup()
  const { logout } = renderHeader(validUser)
  const profileButton = screen.getByRole('button', { name: 'My profile' })
  await user.tab()
  await user.tab()
  await user.tab()
  expect(profileButton).toHaveFocus()
  await user.keyboard(' ')
  const profileItem = await screen.findByRole('menuitem', { name: 'Account Profile' })
  await waitFor(() => expect(profileItem).toHaveFocus())
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(profileButton).toHaveAttribute('aria-expanded', 'false')
  expect(profileButton).toHaveFocus()
  expect(logout).not.toHaveBeenCalled()
})

it.each(['STUDENT', 'ADMINISTRATOR', 'TUTOR', undefined, null, '', 123])('uses a neutral label instead of an undeclared global role (%s)', role => {
  const account = { ...validUser, fullName: 'Alex Morgan', role }
  renderHeader(account)
  expect(screen.getByRole('button', { name: 'My profile' })).toHaveTextContent('Alex Morgan - Account')
})
