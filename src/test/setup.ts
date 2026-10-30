import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import { server, unhandledRequests } from './server'

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  unhandledRequests.length = 0
  // jsdom has no media query evaluation or pseudo-element layout. AntD uses
  // these browser APIs for responsive forms and modal scrollbar measurement.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => getComputedStyle(element))
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  expect(unhandledRequests, 'Every request must have an MSW handler').toEqual([])
})
afterAll(() => server.close())
