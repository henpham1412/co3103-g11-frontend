import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lmsClient } from '@/api/lmsClient'
import AppProviders from '@/app/providers'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { adminUser, contentReport, moderationTarget, OTHER_ID, page, REPORT_ID, timestamp, USER_ID } from '@/test/fixtures/admin'
import { authSession } from '@/test/fixtures/auth'
import { server } from '@/test/server'
import AdminRoute from '../AdminRoute'
import AdminWorkspaceLayout from '../AdminWorkspaceLayout'
import AdminContentReportsPage from './AdminContentReportsPage'

const BASE = lmsClient.defaults.baseURL

function mountReportsPage() {
  tokenStorage.saveSession(authSession())
  const memoryRouter = createMemoryRouter([{
    element: <AdminRoute />,
    children: [{
      path: '/admin',
      element: <AdminWorkspaceLayout />,
      children: [{ path: 'content-reports', element: <AdminContentReportsPage /> }],
    }],
  }], { initialEntries: ['/admin/content-reports'] })
  const view = render(<AppProviders><RouterProvider router={memoryRouter} /></AppProviders>)
  return { memoryRouter, close: () => { view.unmount(); memoryRouter.dispose() } }
}

function selectAntOption(label: RegExp | string, optionLabel: string) {
  const combobox = screen.getByRole('combobox', { name: label })
  fireEvent.mouseDown(combobox)
  const options = screen.getAllByText(optionLabel)
  fireEvent.click(options[options.length - 1]!)
}

describe('AdminContentReportsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('filters, paginates, renders target content safely as text, and downloads reported material via report-scoped endpoint', async () => {
    const seenUrls: string[] = []
    let downloadedEndpoint = ''
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-report')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const materialReport = contentReport({
      content_type: 'MATERIAL',
      reason: 'INAPPROPRIATE',
      description: '<script>alert(1)</script> flagged notes',
      status: 'PENDING',
    })
    const detailReport = {
      ...materialReport,
      target: moderationTarget({
        title: 'Lecture PDF',
        content: '<b>Raw markup should stay text</b>',
        material_type: 'DOCUMENT',
        visibility: 'PUBLISHED',
        file_url: 'https://untrusted.example/steal-bearer.pdf',
        file_available: true,
      }),
    }

    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/content-reports`, ({ request }) => {
        seenUrls.push(request.url)
        return HttpResponse.json(page([materialReport]))
      }),
      http.get(`${BASE}/admin/content-reports/${REPORT_ID}`, () => HttpResponse.json(detailReport)),
      http.get(`${BASE}/admin/content-reports/${REPORT_ID}/target/file`, ({ request }) => {
        downloadedEndpoint = new URL(request.url).pathname
        return new HttpResponse(new Blob(['pdf-bytes'], { type: 'application/pdf' }), {
          headers: { 'content-disposition': 'attachment; filename="evidence.pdf"' },
        })
      }),
    )

    const view = mountReportsPage()
    try {
      expect(await screen.findByText(REPORT_ID)).toBeInTheDocument()

      selectAntOption('Filter by report status', 'Pending')
      await waitFor(() => expect(seenUrls.at(-1)).toContain('status=PENDING'))

      selectAntOption('Filter by content type', 'Material')
      await waitFor(() => expect(seenUrls.at(-1)).toContain('content_type=MATERIAL'))

      fireEvent.click(screen.getByRole('button', { name: 'Review' }))
      const drawer = await screen.findByRole('dialog')
      expect(await within(drawer).findByText('Lecture PDF')).toBeInTheDocument()
      expect(within(drawer).getByText('<script>alert(1)</script> flagged notes')).toBeInTheDocument()
      expect(within(drawer).getByText('<b>Raw markup should stay text</b>')).toBeInTheDocument()

      fireEvent.click(within(drawer).getByRole('button', { name: /Download reported file/i }))
      await waitFor(() => expect(downloadedEndpoint).toBe(`/api/v1/admin/content-reports/${REPORT_ID}/target/file`))
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    } finally { view.close() }
  })

  it('enforces valid status transitions, confirms review, prevents duplicates, and refetches canonical detail with target', async () => {
    let status: 'PENDING' | 'REVIEWED' | 'RESOLVED' = 'PENDING'
    const patchPayloads: unknown[] = []
    let detailFetches = 0
    let resolvePatch!: (value: Response) => void

    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/content-reports`, () =>
        HttpResponse.json(page([contentReport({ status })]))),
      http.get(`${BASE}/admin/content-reports/${REPORT_ID}`, () => {
        detailFetches += 1
        return HttpResponse.json(contentReport({
          status,
          reviewed_by: status === 'PENDING' ? null : USER_ID,
          reviewed_at: status === 'PENDING' ? null : timestamp,
          target: moderationTarget({ content: 'Preserved target body' }),
        }))
      }),
      http.patch(`${BASE}/admin/content-reports/${REPORT_ID}`, async ({ request }) => {
        const body = await request.json() as { status: 'REVIEWED' | 'RESOLVED' }
        patchPayloads.push(body)
        return new Promise<Response>((resolve) => { resolvePatch = resolve })
      }),
    )

    const view = mountReportsPage()
    try {
      expect(await screen.findByText(REPORT_ID)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Review' }))
      const drawer = await screen.findByRole('dialog')
      expect(await within(drawer).findByText('Preserved target body')).toBeInTheDocument()

      // PENDING allows Mark Reviewed, Resolve, Dismiss
      expect(within(drawer).getByRole('button', { name: 'Mark Reviewed' })).toBeInTheDocument()
      expect(within(drawer).getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
      expect(within(drawer).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()

      fireEvent.click(within(drawer).getByRole('button', { name: 'Mark Reviewed' }))
      const confirmBtn = await within(drawer).findByRole('button', { name: 'Confirm REVIEWED' })
      fireEvent.click(confirmBtn)
      fireEvent.click(confirmBtn)

      await waitFor(() => expect(patchPayloads).toEqual([{ status: 'REVIEWED' }]))

      status = 'REVIEWED'
      // Backend PATCH response omits target
      resolvePatch(HttpResponse.json(contentReport({ status: 'REVIEWED', reviewed_by: USER_ID, reviewed_at: timestamp })))

      expect(await screen.findByText('Report marked as REVIEWED.')).toBeInTheDocument()
      // Canonical detail refetched so target remains visible and REVIEWED no longer shows Mark Reviewed
      await waitFor(() => expect(detailFetches).toBeGreaterThanOrEqual(2))
      expect(await within(drawer).findByText('Preserved target body')).toBeInTheDocument()
      expect(within(drawer).queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument()
      expect(within(drawer).getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    } finally { view.close() }
  })

  it('handles 409 REPORT_ALREADY_UPDATED by showing conflict error and reloading terminal state with unavailable target', async () => {
    let currentStatus: 'PENDING' | 'RESOLVED' = 'PENDING'
    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/content-reports`, () =>
        HttpResponse.json(page([contentReport({ status: currentStatus, target_available: false })]))),
      http.get(`${BASE}/admin/content-reports/${REPORT_ID}`, () =>
        HttpResponse.json(contentReport({
          status: currentStatus,
          target_available: false,
          reviewed_by: currentStatus === 'RESOLVED' ? OTHER_ID : null,
          reviewed_at: currentStatus === 'RESOLVED' ? timestamp : null,
        }))),
      http.patch(`${BASE}/admin/content-reports/${REPORT_ID}`, () => {
        currentStatus = 'RESOLVED'
        return HttpResponse.json({ code: 'REPORT_ALREADY_UPDATED', message: 'Report already finalized' }, { status: 409 })
      }),
    )

    const view = mountReportsPage()
    try {
      expect(await screen.findByText(REPORT_ID)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Review' }))
      const drawer = await screen.findByRole('dialog')
      expect(await within(drawer).findByText('Target content unavailable')).toBeInTheDocument()

      fireEvent.click(within(drawer).getByRole('button', { name: 'Dismiss' }))
      fireEvent.click(await within(drawer).findByRole('button', { name: 'Confirm DISMISSED' }))

      expect(await within(drawer).findByText('This content report was already updated. Reloading the latest state.')).toBeInTheDocument()
      expect(await within(drawer).findByText('Report is RESOLVED')).toBeInTheDocument()
      expect(within(drawer).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    } finally { view.close() }
  })
})
