import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { validUser } from '@/test/fixtures/auth'
import { ProfileSummary } from './ProfileSummary'

it.each(['TUTOR', 'ADMINISTRATOR', 'STUDENT', undefined])('shows a neutral account badge without deriving a role from global identity (%s)', role => {
  const account = { ...validUser, role }
  render(<ProfileSummary user={account} onSignOut={vi.fn()} />)
  expect(screen.getByText('Account')).toBeInTheDocument()
  expect(screen.queryByText(/^(STUDENT|TUTOR|ADMINISTRATOR)$/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: validUser.fullName })).toBeInTheDocument()
})
