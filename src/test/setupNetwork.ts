import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest'
import { server, unhandledRequests } from './server'

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => { unhandledRequests.length = 0 })
afterEach(() => {
  server.resetHandlers()
  expect(unhandledRequests, 'Every request must have an MSW handler').toEqual([])
})
afterAll(() => server.close())
