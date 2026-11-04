import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { validUser } from '@/test/fixtures/auth'
import { localToday } from '../utils/profileValidation'
import { ProfileForm } from './ProfileForm'

function setup() {
  const save = vi.fn().mockResolvedValue(undefined), cancel = vi.fn()
  const view = render(<ConfigProvider theme={{ token: { motion: false } }}><ProfileForm user={validUser} busy={false} locked={false} onSave={save} onCancel={cancel} /></ConfigProvider>)
  return { ...view, save, cancel, user: userEvent.setup() }
}

it('disables pristine/reverted saves and never submits an unchanged form', async () => {
  const { save } = setup()
  const submit = screen.getByRole('button', { name: 'Save changes' })
  expect(submit).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Draft' } })
  expect(submit).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '' } })
  expect(submit).toBeDisabled()
  await waitFor(() => expect(save).not.toHaveBeenCalled())
})

it.each([
  ['Full name', ''], ['Avatar URL', 'javascript:alert(1)'], ['Date of birth', '9999-12-31'],
])('blocks invalid %s even when the form is submitted directly', async (label, value) => {
  const { save } = setup()
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  await waitFor(() => expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true'))
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(save).not.toHaveBeenCalled()
})

it('accepts local today and keeps identity fields out of the form', async () => {
  const { save, user } = setup()
  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: localToday() } })
  expect(screen.getByLabelText('Date of birth')).toHaveAttribute('max', localToday())
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(save.mock.calls[0][0]).not.toHaveProperty('email')
  expect(save.mock.calls[0][0]).not.toHaveProperty('status')
  expect(save.mock.calls[0][0]).not.toHaveProperty('userId')
})

it('retains a dirty draft when the context user changes and locks all editing during a pending save', () => {
  const { rerender, save, cancel } = setup()
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'My draft' } })
  rerender(<ConfigProvider theme={{ token: { motion: false } }}><ProfileForm user={{ ...validUser, profile: { bio: 'Background update' } }} busy locked={false} onSave={save} onCancel={cancel} /></ConfigProvider>)
  expect(screen.getByLabelText('Bio')).toHaveValue('My draft')
  expect(screen.getByLabelText('Bio')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
})
