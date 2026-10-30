import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

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
