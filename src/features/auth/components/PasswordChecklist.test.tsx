import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordChecklist } from './PasswordChecklist'

describe('PasswordChecklist', () => {
  it('uses the reset requirements without displaying the password', () => {
    const { rerender } = render(<PasswordChecklist password="Ab1!abcd" />)
    const list = screen.getByRole('list', { name: 'Password requirements' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'met')).toBe(true)
    expect(list).not.toHaveTextContent('Ab1!abcd')
    rerender(<PasswordChecklist password="orchid lantern meadow brook" />)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'met')).toBe(true)
    expect(screen.getByText('Common passwords are not allowed.')).toBeInTheDocument()
  })
  it('announces invalid text as unmet without displaying the secret', () => {
    render(<PasswordChecklist password={'Ab1!secret\0'} />)
    const list = screen.getByRole('list', { name: 'Password requirements' })
    expect(within(list).getByText('No invalid characters').closest('li')).toHaveAttribute('data-state', 'pending')
    expect(list).not.toHaveTextContent('Ab1!secret')
  })
  it('announces pending, met and exceeded rules and clearing without disclosing the password', () => {
    const { rerender } = render(<PasswordChecklist />)
    const list = screen.getByRole('list', { name: 'Password requirements' })
    expect(list).toHaveAttribute('aria-live', 'polite')
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'pending')).toBe(true)
    const password = 'Tiếng Việt 😀'
    rerender(<PasswordChecklist password={password} />)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'met')).toBe(true)
    expect(list).not.toHaveTextContent(password)
    rerender(<PasswordChecklist password={'A long password '.repeat(6)} />)
    expect(within(list).getAllByRole('listitem')[1]).toHaveAttribute('data-state', 'exceeded')
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Not met: At most 72 bytes')
    rerender(<PasswordChecklist password="        " />)
    expect(within(list).getAllByRole('listitem')[2]).toHaveTextContent('Not met: Contains a non-whitespace character')
    rerender(<PasswordChecklist password="" />)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'pending')).toBe(true)
  })
})
