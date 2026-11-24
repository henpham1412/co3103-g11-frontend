import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lmsClient } from '@/api/lmsClient'
import AppProviders from '@/app/providers'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { adminUser, OTHER_ID, page, timestamp, USER_ID } from '@/test/fixtures/admin'
import { authSession } from '@/test/fixtures/auth'
import { server } from '@/test/server'
import AdminRoute from '../AdminRoute'
import AdminWorkspaceLayout from '../AdminWorkspaceLayout'
import AdminUsersPage from './AdminUsersPage'

const BASE = lmsClient.defaults.baseURL

function mountUsersPage() {
  tokenStorage.saveSession(authSession())
  const memoryRouter = createMemoryRouter([
    { path: '/', element: <div>Authenticated Overview</div> },
    {
      element: <AdminRoute />,
      children: [{
        path: '/admin',
        element: <AdminWorkspaceLayout />,
        children: [{ path: 'users', element: <AdminUsersPage /> }],
      }],
    },
  ], { initialEntries: ['/admin/users'] })
  const view = render(<AppProviders><RouterProvider router={memoryRouter} /></AppProviders>)
  return { memoryRouter, close: () => { view.unmount(); memoryRouter.dispose() } }
}

function selectAntOption(label: RegExp | string, optionLabel: string) {
  const combobox = screen.getByRole('combobox', { name: label })
  fireEvent.mouseDown(combobox)
  const options = screen.getAllByText(optionLabel)
  fireEvent.click(options[options.length - 1]!)
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads users with server-side query params, supports search, filters, sorting, and pagination', async () => {
    const seenUrls: string[] = []
    const secondUser = adminUser({
      user_id: OTHER_ID,
      full_name: 'Jordan Lee',
      email: 'jordan@example.test',
      lms_role: 'STUDENT',
      access_status: 'ACTIVE',
      last_login_at: timestamp,
    })

    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/users`, ({ request }) => {
        seenUrls.push(request.url)
        const url = new URL(request.url)
        const p = Number(url.searchParams.get('page') ?? '1')
        if (p === 2) {
          return HttpResponse.json({
            items: [secondUser],
            page: 2,
            size: 20,
            total_items: 25,
            total_pages: 2,
            last: true,
          })
        }
        return HttpResponse.json({
          items: [adminUser()],
          page: 1,
          size: 20,
          total_items: 25,
          total_pages: 2,
          last: false,
        })
      }),
    )

    const view = mountUsersPage()
    try {
      expect(await screen.findByText('Local administrator')).toBeInTheDocument()
      const firstUrl = new URL(seenUrls[0]!)
      expect(firstUrl.searchParams.get('page')).toBe('1')
      expect(firstUrl.searchParams.get('size')).toBe('20')
      expect(firstUrl.searchParams.get('sort')).toBe('created_at,desc')

      // Navigate to page 2
      fireEvent.click(screen.getByTitle('2'))
      expect(await screen.findByText('Jordan Lee')).toBeInTheDocument()
      expect(seenUrls.at(-1)).toContain('page=2')

      // Apply search query (resets to page 1)
      fireEvent.change(screen.getByLabelText('Search user'), { target: { value: '  jordan@example.test  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))

      await waitFor(() => {
        expect(seenUrls.at(-1)).toContain('q=jordan%40example.test')
        expect(seenUrls.at(-1)).toContain('page=1')
      })

      // Apply role filter
      selectAntOption('Filter by LMS role', 'Tutor')
      await waitFor(() => {
        expect(seenUrls.at(-1)).toContain('lms_role=TUTOR')
      })

      // Reset filters
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await waitFor(() => {
        const last = new URL(seenUrls.at(-1)!)
        expect(last.searchParams.get('q')).toBeNull()
        expect(last.searchParams.get('lms_role')).toBeNull()
        expect(last.searchParams.get('sort')).toBe('created_at,desc')
      })
    } finally { view.close() }
  })

  it('sends partial PATCH with confirmation, blocks duplicate submissions, and preserves draft on focus revalidation', async () => {
    const student = adminUser({
      user_id: OTHER_ID,
      full_name: 'Student One',
      email: 'student1@example.test',
      lms_role: 'STUDENT',
      access_status: 'ACTIVE',
    })
    const promoted = { ...student, lms_role: 'TUTOR' as const }
    const patchBodies: unknown[] = []
    let resolvePatch!: (value: Response) => void
    let probes = 0

    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => {
        probes += 1
        return HttpResponse.json(adminUser())
      }),
      http.get(`${BASE}/admin/users`, () =>
        HttpResponse.json({ ...page([patchBodies.length > 0 ? promoted : student]), last: true })),
      http.get(`${BASE}/admin/users/${OTHER_ID}`, () =>
        HttpResponse.json(patchBodies.length > 0 ? promoted : student)),
      http.patch(`${BASE}/admin/users/${OTHER_ID}`, async ({ request }) => {
        patchBodies.push(await request.json())
        return new Promise<Response>((resolve) => { resolvePatch = resolve })
      }),
    )

    const view = mountUsersPage()
    try {
      expect(await screen.findByText('Student One')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
      const drawer = await screen.findByRole('dialog')
      expect(await within(drawer).findByText('student1@example.test')).toBeInTheDocument()

      // Save button disabled until change
      expect(within(drawer).getByRole('button', { name: 'Review changes' })).toBeDisabled()

      // Change only LMS role
      selectAntOption('Edit LMS role', 'Tutor')
      expect(within(drawer).getByRole('button', { name: 'Review changes' })).toBeEnabled()

      // Trigger background window focus revalidation and ensure draft & drawer remain intact
      act(() => { window.dispatchEvent(new Event('focus')) })
      await waitFor(() => expect(probes).toBeGreaterThanOrEqual(2))
      expect(within(drawer).getByRole('button', { name: 'Review changes' })).toBeEnabled()

      // Open confirmation and double-click confirm while pending
      fireEvent.click(within(drawer).getByRole('button', { name: 'Review changes' }))
      const confirmBtn = await within(drawer).findByRole('button', { name: 'Confirm update' })
      fireEvent.click(confirmBtn)
      fireEvent.click(confirmBtn)

      await waitFor(() => expect(patchBodies).toHaveLength(1))
      // Partial PATCH: only lms_role sent, access_status omitted
      expect(patchBodies[0]).toEqual({ lms_role: 'TUTOR' })

      resolvePatch(HttpResponse.json(promoted))
      expect(await screen.findByText('Updated local LMS access for Student One.')).toBeInTheDocument()
    } finally { view.close() }
  })

  it('handles 409 last-admin protection error and preserves unsaved draft', async () => {
    const selfAdmin = adminUser()
    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(selfAdmin)),
      http.get(`${BASE}/admin/users`, () => HttpResponse.json({ ...page([selfAdmin]), last: true })),
      http.patch(`${BASE}/admin/users/${USER_ID}`, () =>
        HttpResponse.json({
          code: 'INVALID_ROLE_OR_STATUS_TRANSITION',
          message: 'Cannot demote or suspend the last active administrator',
          details: [],
        }, { status: 409 })),
    )

    const view = mountUsersPage()
    try {
      expect(await screen.findByText('Local administrator')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
      const drawer = await screen.findByRole('dialog')
      await within(drawer).findByText('admin@example.test')

      selectAntOption('Edit access status', 'Suspended')
      fireEvent.click(within(drawer).getByRole('button', { name: 'Review changes' }))
      expect(await within(drawer).findByText(/removing your own active administrator access/i)).toBeInTheDocument()
      fireEvent.click(within(drawer).getByRole('button', { name: 'Confirm update' }))

      expect(await within(drawer).findByText('Cannot demote or suspend the last active administrator.')).toBeInTheDocument()
      // Draft preserved: Review changes stays enabled because suspended is still selected
      expect(within(drawer).getByRole('button', { name: 'Review changes' })).toBeEnabled()
      expect(view.memoryRouter.state.location.pathname).toBe('/admin/users')
    } finally { view.close() }
  })

  it('immediately revokes admin UI and returns to authenticated overview on self-demotion without clearing Central Identity session', async () => {
    const selfAdmin = adminUser()
    const demotedSelf = adminUser({ lms_role: 'TUTOR' })
    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(selfAdmin)),
      http.get(`${BASE}/admin/users`, () => HttpResponse.json({ ...page([selfAdmin]), last: true })),
      http.patch(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(demotedSelf)),
    )

    const view = mountUsersPage()
    try {
      expect(await screen.findByText('Local administrator')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
      const drawer = await screen.findByRole('dialog')
      await within(drawer).findByText('admin@example.test')

      selectAntOption('Edit LMS role', 'Tutor')
      fireEvent.click(within(drawer).getByRole('button', { name: 'Review changes' }))
      fireEvent.click(within(drawer).getByRole('button', { name: 'Confirm update' }))

      await waitFor(() => expect(view.memoryRouter.state.location.pathname).toBe('/'))
      expect(await screen.findByText('Authenticated Overview')).toBeInTheDocument()
      // Central Identity session remains valid
      expect(tokenStorage.getSession()).not.toBeNull()
    } finally { view.close() }
  })

  it('ignores stale detail responses when switching selected users quickly and recovers from list error', async () => {
    const first = adminUser({ user_id: USER_ID, full_name: 'First Admin', email: 'first@example.test' })
    const second = adminUser({ user_id: OTHER_ID, full_name: 'Second User', email: 'second@example.test', lms_role: 'TUTOR' })
    let listCalls = 0
    let resolveFirstDetail!: (response: Response) => void
    let firstDetailRequests = 0

    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => {
        firstDetailRequests += 1
        // Request 1 is the AdminAccessProvider capability probe
        if (firstDetailRequests === 1) return HttpResponse.json(first)
        return new Promise<Response>((resolve) => { resolveFirstDetail = resolve })
      }),
      http.get(`${BASE}/admin/users/${OTHER_ID}`, () => HttpResponse.json(second)),
      http.get(`${BASE}/admin/users`, () => {
        listCalls += 1
        if (listCalls === 1) return HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'Temporary error' }, { status: 500 })
        return HttpResponse.json({ ...page([first, second]), last: true })
      }),
    )

    const view = mountUsersPage()
    try {
      expect(await screen.findByText('Could not load user access records')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      expect(await screen.findByText('First Admin')).toBeInTheDocument()
      const manageButtons = screen.getAllByRole('button', { name: 'Manage' })
      fireEvent.click(manageButtons[0]!)
      await waitFor(() => expect(resolveFirstDetail).toBeTypeOf('function'))
      fireEvent.click(manageButtons[1]!)

      const drawer = await screen.findByRole('dialog')
      expect(await within(drawer).findByText('second@example.test')).toBeInTheDocument()

      // Resolve slow detail for first user and verify second user stays displayed
      resolveFirstDetail(HttpResponse.json(first))
      await waitFor(() => {
        expect(within(drawer).getByText('second@example.test')).toBeInTheDocument()
        expect(within(drawer).queryByText('first@example.test')).not.toBeInTheDocument()
      })
    } finally { view.close() }
  })
})
