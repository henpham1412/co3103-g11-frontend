import { StrictMode, useLayoutEffect } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, it } from 'vitest'
import { useResetToken } from './useResetToken'

it('preserves memory through StrictMode scrub, replaces new queries and forgets on remount', async () => {
  let flow!: ReturnType<typeof useResetToken>
  function Probe() {
    const result = useResetToken()
    useLayoutEffect(() => { flow = result })
    return <p>Token flow</p>
  }
  const router = createMemoryRouter([{ path: '/reset-password', element: <Probe /> }, { path: '/other', element: <p>Other</p> }], {
    initialEntries: ['/reset-password?token=%2B%2525&view=reset'],
  })
  const view = render(<StrictMode><RouterProvider router={router} /></StrictMode>)
  await waitFor(() => expect(router.state.location.search).toBe('?view=reset'))
  expect(flow.selection.kind === 'token' && flow.selection.token === '+%25').toBe(true)
  expect(router.state.location.state).toBeNull()
  const first = flow.revision
  await act(() => router.navigate('/reset-password?token=second'))
  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(flow.selection.kind === 'token' && flow.selection.token === 'second').toBe(true)
  expect(flow.revision).toBeGreaterThan(first)
  await act(() => router.navigate('/other'))
  await act(() => router.navigate(-1))
  expect(flow.selection.kind).toBe('missing')
  await act(() => router.navigate('/reset-password?token=one&token=two'))
  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(flow.selection.kind).toBe('ambiguous')
  act(() => flow.clear())
  expect(flow.selection.kind).toBe('missing')
  view.unmount()
  router.dispose()
})
