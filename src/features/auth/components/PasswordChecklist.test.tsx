import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordChecklist } from './PasswordChecklist'

describe('PasswordChecklist', () => {
  it('uses the reset requirements without displaying the password', () => {
    const { rerender } = render(<PasswordChecklist mode="reset" password="Ab1!abcd" />)
    const list = screen.getByRole('list', { name: 'Password requirements' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'met')).toBe(true)
    expect(list).not.toHaveTextContent('Ab1!abcd')
    rerender(<PasswordChecklist mode="reset" password="Ab1 abcd" />)
    expect(within(list).getAllByRole('listitem')[4]).toHaveAttribute('data-state', 'pending')
  })
  it('announces unmet rules, exact Unicode boundaries and clearing without disclosing the password', () => {
    const { rerender } = render(<PasswordChecklist />)
    const list = screen.getByRole('list', { name: 'Password requirements' })
    expect(list).toHaveAttribute('aria-live', 'polite')
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'pending')).toBe(true)
    const password = 'ệ'.repeat(24)
    rerender(<PasswordChecklist password={password} />)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'met')).toBe(true)
    expect(list).not.toHaveTextContent(password)
    rerender(<PasswordChecklist password={password + 'a'} />)
    expect(within(list).getAllByRole('listitem')[1]).toHaveAttribute('data-state', 'exceeded')
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Not met: At most 72 bytes')
    rerender(<PasswordChecklist password="        " />)
    expect(within(list).getAllByRole('listitem')[2]).toHaveTextContent('Not met: Contains a non-whitespace character')
    rerender(<PasswordChecklist password="" />)
    expect(within(list).getAllByRole('listitem').every(item => item.dataset.state === 'pending')).toBe(true)
  })
})
