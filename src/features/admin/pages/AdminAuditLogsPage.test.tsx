import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { lmsClient } from '@/api/lmsClient'
import AppProviders from '@/app/providers'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { adminUser, auditLog, LOG_ID, OTHER_ID, page, USER_ID } from '@/test/fixtures/admin'
import { authSession } from '@/test/fixtures/auth'
import { server } from '@/test/server'
import AdminRoute from '../AdminRoute'
import AdminWorkspaceLayout from '../AdminWorkspaceLayout'
import AdminAuditLogsPage from './AdminAuditLogsPage'

const BASE = lmsClient.defaults.baseURL

function mountAuditLogsPage() {
  tokenStorage.saveSession(authSession())
  const memoryRouter = createMemoryRouter([{
    element: <AdminRoute />,
    children: [{
      path: '/admin',
      element: <AdminWorkspaceLayout />,
      children: [{ path: 'audit-logs', element: <AdminAuditLogsPage /> }],
    }],
  }], { initialEntries: ['/admin/audit-logs'] })
  const view = render(<AppProviders><RouterProvider router={memoryRouter} /></AppProviders>)
  return { memoryRouter, close: () => { view.unmount(); memoryRouter.dispose() } }
}

function selectAntOption(label: RegExp | string, optionLabel: string) {
  const combobox = screen.getByRole('combobox', { name: label })
  fireEvent.mouseDown(combobox)
  const options = screen.getAllByText(optionLabel)
  fireEvent.click(options[options.length - 1]!)
}

describe('AdminAuditLogsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('validates actor UUID and date range, applies allowlisted filters, and stays strictly read-only', async () => {
    const seenUrls: string[] = []
    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/audit-logs`, ({ request }) => {
        seenUrls.push(request.url)
        return HttpResponse.json(page([auditLog()]))
      }),
    )

    const view = mountAuditLogsPage()
    try {
      expect(await screen.findByText('LMS_USER_ACCESS_UPDATED')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /delete|edit|create/i })).not.toBeInTheDocument()
      const initialCount = seenUrls.length

      // Invalid actor UUID blocked client-side
      fireEvent.change(screen.getByLabelText('Actor UUID'), { target: { value: 'bad-id' } })
      fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
      expect(await screen.findByText('Actor ID must be a valid UUID.')).toBeInTheDocument()
      expect(seenUrls).toHaveLength(initialCount)

      // Reversed date range blocked client-side
      fireEvent.change(screen.getByLabelText('Actor UUID'), { target: { value: USER_ID } })
      fireEvent.change(screen.getByLabelText('From (inclusive)'), { target: { value: '2026-11-24T12:00' } })
      fireEvent.change(screen.getByLabelText('To (inclusive)'), { target: { value: '2026-11-23T12:00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
      expect(await screen.findByText(/Start date\/time must be earlier/i)).toBeInTheDocument()
      expect(seenUrls).toHaveLength(initialCount)

      // Valid filters applied
      fireEvent.change(screen.getByLabelText('From (inclusive)'), { target: { value: '2026-11-22T00:00' } })
      fireEvent.change(screen.getByLabelText('To (inclusive)'), { target: { value: '2026-11-24T23:59' } })
      selectAntOption('Filter by audit action', 'REPORTED_CONTENT_REVIEWED')
      selectAntOption('Filter by entity type', 'ContentReport')
      fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))

      await waitFor(() => {
        const last = new URL(seenUrls.at(-1)!)
        expect(last.searchParams.get('actor_id')).toBe(USER_ID)
        expect(last.searchParams.get('action')).toBe('REPORTED_CONTENT_REVIEWED')
        expect(last.searchParams.get('entity_type')).toBe('ContentReport')
        expect(last.searchParams.get('from')).toMatch(/Z$/)
        expect(last.searchParams.get('to')).toMatch(/Z$/)
      })
    } finally { view.close() }
  })

  it('displays structured diff details and redacted/unavailable details while ignoring stale detail responses', async () => {
    const secondLogId = '50000000-0000-0000-0000-000000000002'
    const accessEntry = auditLog({ audit_log_id: LOG_ID })
    const redactedEntry = auditLog({
      audit_log_id: secondLogId,
      action: 'REPORTED_CONTENT_REVIEWED',
      entity_type: 'ContentReport',
      entity_id: OTHER_ID,
      details: { unavailable: true },
    })

    let resolveFirst!: (response: Response) => void
    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/audit-logs`, () => HttpResponse.json(page([accessEntry, redactedEntry]))),
      http.get(`${BASE}/admin/audit-logs/${LOG_ID}`, () => new Promise<Response>((resolve) => { resolveFirst = resolve })),
      http.get(`${BASE}/admin/audit-logs/${secondLogId}`, () => HttpResponse.json(redactedEntry)),
    )

    const view = mountAuditLogsPage()
    try {
      expect(await screen.findByText('Details unavailable (redacted)')).toBeInTheDocument()
      const viewButtons = screen.getAllByRole('button', { name: 'View' })

      // Click slow first entry, wait until request is in flight, then switch to redacted second entry
      fireEvent.click(viewButtons[0]!)
      await waitFor(() => expect(resolveFirst).toBeTypeOf('function'))
      fireEvent.click(viewButtons[1]!)

      const drawer = await screen.findByRole('dialog')
      expect(await within(drawer).findByText('Audit details unavailable')).toBeInTheDocument()

      // Resolve slow first entry; drawer must still show the second entry
      resolveFirst(HttpResponse.json(accessEntry))
      await waitFor(() => {
        expect(within(drawer).getByText(secondLogId)).toBeInTheDocument()
        expect(within(drawer).queryByText(LOG_ID)).not.toBeInTheDocument()
      })
    } finally { view.close() }
  })
})
