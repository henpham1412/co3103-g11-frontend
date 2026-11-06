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

// The shared field validator is exhaustive in profileValidation.test.ts; verify its UI wiring once.
it('allows validation on Save and focuses local feedback without saving invalid text', async () => {
  const { save, user } = setup()
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Draft\uD800' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Please remove invalid characters from this value.', {}, { timeout: 5000 })
  await waitFor(() => expect(screen.getByLabelText('Bio')).toHaveFocus(), { timeout: 5000 })
  expect(screen.getByLabelText('Bio')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  expect(save).not.toHaveBeenCalled()
})

it('disables pristine/reverted saves and never submits an unchanged form', async () => {
  const { save } = setup()
  const submit = screen.getByRole('button', { name: 'Save Changes' })
  expect(submit).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Draft' } })
  expect(submit).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '' } })
  expect(submit).toBeDisabled()
  await waitFor(() => expect(save).not.toHaveBeenCalled())
})

it.each([
  ['Full Name', ''], ['Avatar URL', 'javascript:alert(1)'], ['Date of birth', '9999-12-31'],
  ['Phone number', 'not-a-phone'],
])('blocks invalid %s even when the form is submitted directly', async (label, value) => {
  const { save } = setup()
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  await waitFor(() => expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true'))
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  expect(save).not.toHaveBeenCalled()
})

it.each([
  { label: 'Phone number', max: 30 }, { label: 'Locale', max: 20 }, { label: 'Timezone', max: 64 },
])('exposes the $label maxLength and blocks over-limit values even if injected', async ({ label, max }) => {
  const { save } = setup()
  expect(screen.getByLabelText(label)).toHaveAttribute('maxlength', String(max))
  fireEvent.change(screen.getByLabelText(label), { target: { value: 'a'.repeat(max + 1) } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit profile' }))
  await screen.findByText(`${label} must not exceed ${max} characters.`)
  expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  expect(save).not.toHaveBeenCalled()
})

it('labels the read-only email without claiming verification when no verification data exists', () => {
  setup()
  const email = screen.getByRole('textbox', { name: 'Email Address' })
  expect(email).toHaveValue(validUser.email)
  expect(email).toHaveAttribute('readonly')
  expect(email).toHaveAccessibleDescription('Central email address cannot be changed directly.')
  expect(screen.queryByText(/verified/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/verified/i)).not.toBeInTheDocument()
})

it('accepts local today and keeps identity fields out of the form', async () => {
  const { save, user } = setup()
  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: localToday() } })
  expect(screen.getByLabelText('Date of birth')).toHaveAttribute('max', localToday())
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
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
