import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { identityApiUrl, unhandledRequests } from './server'

function TestButton() {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>{clicked ? 'Clicked' : 'Click me'}</button>
}

it('supports React 19 rendering, user events, and jest-dom matchers', async () => {
  const user = userEvent.setup()
  render(<TestButton />)
  await user.click(screen.getByRole('button', { name: 'Click me' }))
  expect(screen.getByRole('button', { name: 'Clicked' })).toBeInTheDocument()
})

it('blocks unhandled requests instead of contacting a real backend', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(fetch(identityApiUrl('/unhandled-test-request'))).rejects.toThrow()
  expect(error).toHaveBeenCalled()
  // Consume only this deliberate probe. Accidental unmatched requests in any
  // other test remain recorded and fail the global afterEach assertion.
  expect(unhandledRequests.splice(0)).toEqual([
    `GET ${new URL(identityApiUrl('/unhandled-test-request')).pathname}`,
  ])
})
