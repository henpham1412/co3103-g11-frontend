import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { centralIdentityClient } from '@/api/centralIdentityClient'
import { wireCurrentUser, wireLoginResponse, wireRegisteredUser } from './fixtures/authWire'
import { wireForgotAcknowledgment, wireResetAcknowledgment } from './fixtures/passwordRecoveryWire'
import { wireProfileAcknowledgment } from './fixtures/profileWire'

export const identityApiUrl = (path: string) =>
  `${centralIdentityClient.defaults.baseURL?.replace(/\/$/, '')}${path}`

export const handlers = [
  http.get('http://localhost:8081/api/v1/classes/:classId/progress', ({ params }) => HttpResponse.json({
    class_id: params.classId,
    completed_lessons: 0,
    eligible_lessons: 0,
    progress_percentage: 0,
    status: 'IN_PROGRESS',
    chapters: [],
  })),
  http.put('http://localhost:8081/api/v1/classes/:classId/last-visit', () => new HttpResponse(null, { status: 204 })),
  http.patch(identityApiUrl('/users/me'), () => HttpResponse.json(wireProfileAcknowledgment)),
  http.post(identityApiUrl('/auth/forgot-password'), () => HttpResponse.json(wireForgotAcknowledgment)),
  http.post(identityApiUrl('/auth/reset-password'), () => HttpResponse.json(wireResetAcknowledgment)),
  http.post(identityApiUrl('/auth/register'), () => HttpResponse.json(wireRegisteredUser, { status: 201 })),
  http.post(identityApiUrl('/auth/login'), () => HttpResponse.json(wireLoginResponse())),
  http.get(identityApiUrl('/users/me'), () => HttpResponse.json(wireCurrentUser)),
]

export const server = setupServer(...handlers)

// A rejected request can be caught by application code. Record it separately
// so an accidental missing handler still fails the test in afterEach.
export const unhandledRequests: string[] = []
server.events.on('request:unhandled', ({ request }) => {
  unhandledRequests.push(`${request.method} ${new URL(request.url).pathname}`)
})
