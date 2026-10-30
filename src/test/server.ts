import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { centralIdentityClient } from '@/api/centralIdentityClient'
import { loginResponse, registeredUser, validUser } from './fixtures/auth'

export const identityApiUrl = (path: string) =>
  `${centralIdentityClient.defaults.baseURL?.replace(/\/$/, '')}${path}`

export const handlers = [
  http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(registeredUser, { status: 201 })),
  http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(loginResponse())),
  http.get(identityApiUrl('/users/me'), () => HttpResponse.json(validUser)),
]

export const server = setupServer(...handlers)

// A rejected request can be caught by application code. Record it separately
// so an accidental missing handler still fails the test in afterEach.
export const unhandledRequests: string[] = []
server.events.on('request:unhandled', ({ request }) => {
  unhandledRequests.push(`${request.method} ${new URL(request.url).pathname}`)
})
