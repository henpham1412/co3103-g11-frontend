import { isValidElement } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, matchRoutes, Navigate, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeEach, expect, it } from 'vitest'
import { lmsClient } from '@/api/lmsClient'
import AdminRoute from '@/features/admin/AdminRoute'
import AdminWorkspaceLayout from '@/features/admin/AdminWorkspaceLayout'
import AdminUsersPage from '@/features/admin/pages/AdminUsersPage'
import AdminContentReportsPage from '@/features/admin/pages/AdminContentReportsPage'
import AdminReportsPage from '@/features/admin/pages/AdminReportsPage'
import AdminAuditLogsPage from '@/features/admin/pages/AdminAuditLogsPage'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { adminUser, auditLog, contentReport, operationalData, page, USER_ID } from '@/test/fixtures/admin'
import { authSession, createToken, validUser } from '@/test/fixtures/auth'
import { identityApiUrl, server } from '@/test/server'
import AppProviders from './providers'
import { router } from './router'

afterAll(() => router.dispose())
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

it.each([
  ['/admin', Navigate],
  ['/admin/users', AdminUsersPage],
  ['/admin/content-reports', AdminContentReportsPage],
  ['/admin/reports', AdminReportsPage],
  ['/admin/audit-logs', AdminAuditLogsPage],
] as const)(
  'registers %s under authentication, the Admin guard, and the workspace layout', (path, component) => {
    const matches = matchRoutes(router.routes, path)!
    const types = matches.map(({ route }) => isValidElement(route.element) ? route.element.type : null)
    expect(types.filter(type => type === ProtectedRoute)).toHaveLength(1)
    expect(types.filter(type => type === AdminRoute)).toHaveLength(1)
    expect(types).toContain(AdminWorkspaceLayout)
    expect(types.at(-1)).toBe(component)
    if (path === '/admin') expect(matches.at(-1)?.route.element).toMatchObject({ props: { to: '/admin/users', replace: true } })
  },
)

function mount(path: string) {
  const memoryRouter = createMemoryRouter(router.routes, { initialEntries: [path] })
  const view = render(<AppProviders><RouterProvider router={memoryRouter} /></AppProviders>)
  return { memoryRouter, close: () => { view.unmount(); memoryRouter.dispose() } }
}

it('redirects an anonymous deep link to login and retains the destination', async () => {
  const view = mount('/admin/audit-logs')
  try {
    await waitFor(() => expect(view.memoryRouter.state.location.pathname).toBe('/login'))
    expect(view.memoryRouter.state.location.state.from.pathname).toBe('/admin/audit-logs')
    expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
  } finally { view.close() }
})

it('uses real session restoration, canonical Admin verification, redirect, and navigation across all four screens', async () => {
  const session = authSession()
  tokenStorage.saveSession(session)
  let probes = 0
  server.use(
    http.get(`${lmsClient.defaults.baseURL}/admin/users/${USER_ID}`, ({ request }) => {
      expect(request.headers.get('Authorization')).toBe(`Bearer ${session.accessToken}`)
      probes += 1
      return HttpResponse.json(adminUser())
    }),
    http.get(`${lmsClient.defaults.baseURL}/admin/users`, () =>
      HttpResponse.json({ ...page([adminUser()]), last: true })),
    http.get(`${lmsClient.defaults.baseURL}/admin/content-reports`, () =>
      HttpResponse.json(page([contentReport()]))),
    http.get(`${lmsClient.defaults.baseURL}/admin/reports/:type`, ({ params }) => {
      const type = String(params.type) as keyof typeof operationalData
      return HttpResponse.json({ report_type: type, filters: {}, data: operationalData[type] })
    }),
    http.get(`${lmsClient.defaults.baseURL}/admin/audit-logs`, () =>
      HttpResponse.json(page([auditLog()]))),
  )
  const view = mount('/admin')
  try {
    await screen.findByRole('heading', { name: 'User Access Management' })
    await screen.findByText('Local administrator')
    expect(view.memoryRouter.state.location.pathname).toBe('/admin/users')
    expect(probes).toBe(1)
    for (const [label, heading] of [['Content Reports', 'Content Report Moderation'], ['Operational Reports', 'Operational Reports'], ['Audit Logs', 'Audit Logs']]) {
      fireEvent.click(screen.getByRole('link', { name: label }))
      await screen.findByRole('heading', { name: heading })
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    }
    await screen.findByText('LMS_USER_ACCESS_UPDATED')
    expect(probes).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(view.memoryRouter.state.location.pathname).toBe('/login'))
    expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
    expect(tokenStorage.getSession()).toBeNull()
  } finally { view.close() }
})

it('does not grant access from a forged JWT Administrator role after canonical Central Identity restoration', async () => {
  const session = authSession({ accessToken: createToken({ sub: validUser.userId, role: 'ADMINISTRATOR',
    exp: Math.floor(Date.now() / 1000) + 3600 }) })
  tokenStorage.saveSession(session)
  const view = mount('/admin/users') // Default local access probe returns 403.
  try {
    await screen.findByText('Administrator access is not available')
    expect(tokenStorage.getSession()).not.toBeNull()
    expect(view.memoryRouter.state.location.pathname).toBe('/admin/users')
    expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
  } finally { view.close() }
})

it('preserves the existing 401 session invalidation when the capability probe is unauthorized', async () => {
  tokenStorage.saveSession(authSession())
  server.use(http.get(`${lmsClient.defaults.baseURL}/admin/users/${USER_ID}`, () => new HttpResponse(null, { status: 401 })))
  const view = mount('/admin/users')
  try {
    await waitFor(() => expect(view.memoryRouter.state.location.pathname).toBe('/login'))
    expect(tokenStorage.getSession()).toBeNull()
  } finally { view.close() }
})

it('does not start a capability probe or expose navigation when canonical identity restoration fails', async () => {
  tokenStorage.saveSession(authSession())
  let probes = 0
  server.use(
    http.get(identityApiUrl('/users/me'), () => new HttpResponse(null, { status: 503 })),
    http.get(`${lmsClient.defaults.baseURL}/admin/users/${USER_ID}`, () => { probes++; return HttpResponse.json(adminUser()) }),
  )
  const view = mount('/admin/users')
  try {
    await screen.findByRole('button', { name: 'Retry' })
    expect(probes).toBe(0)
    expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
    await act(async () => {})
  } finally { view.close() }
})
