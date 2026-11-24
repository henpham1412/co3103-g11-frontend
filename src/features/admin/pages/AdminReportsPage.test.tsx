import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { lmsClient } from '@/api/lmsClient'
import AppProviders from '@/app/providers'
import { tokenStorage } from '@/features/auth/services/tokenStorage'
import { adminUser, CLASS_ID, operationalData, USER_ID } from '@/test/fixtures/admin'
import { authSession } from '@/test/fixtures/auth'
import { server } from '@/test/server'
import AdminRoute from '../AdminRoute'
import AdminWorkspaceLayout from '../AdminWorkspaceLayout'
import AdminReportsPage from './AdminReportsPage'

const BASE = lmsClient.defaults.baseURL

function mountOperationalReportsPage() {
  tokenStorage.saveSession(authSession())
  const memoryRouter = createMemoryRouter([{
    element: <AdminRoute />,
    children: [{
      path: '/admin',
      element: <AdminWorkspaceLayout />,
      children: [{ path: 'reports', element: <AdminReportsPage /> }],
    }],
  }], { initialEntries: ['/admin/reports'] })
  const view = render(<AppProviders><RouterProvider router={memoryRouter} /></AppProviders>)
  return { memoryRouter, close: () => { view.unmount(); memoryRouter.dispose() } }
}

describe('AdminReportsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('loads all three reports for all classes by default and distinguishes valid zero from null assessment averages', async () => {
    const requestedUrls: string[] = []
    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/reports/:type`, ({ params, request }) => {
        requestedUrls.push(request.url)
        const type = String(params.type) as keyof typeof operationalData
        return HttpResponse.json({
          report_type: type,
          filters: {},
          ...(type === 'enrollment' ? { message: 'No enrollment memberships yet.' } : {}),
          data: operationalData[type],
        })
      }),
    )

    const view = mountOperationalReportsPage()
    try {
      expect(await screen.findByText('No enrollment memberships yet.')).toBeInTheDocument()
      expect(await screen.findByText('No graded scores')).toBeInTheDocument()
      // Zero average quiz/assessment scores render as 0.00 (not null/N/A)
      expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('0.00%')).toHaveLength(2)
      expect(requestedUrls.every(url => new URL(url).search === '')).toBe(true)
    } finally { view.close() }
  })

  it('validates Class UUID before requesting, applies class_id filter, resets to All classes, and retries single failed report', async () => {
    const seenClassIds: (string | null)[] = []
    let completionAttempts = 0

    server.use(
      http.get(`${BASE}/admin/users/${USER_ID}`, () => HttpResponse.json(adminUser())),
      http.get(`${BASE}/admin/reports/:type`, ({ params, request }) => {
        const type = String(params.type) as keyof typeof operationalData
        const classId = new URL(request.url).searchParams.get('class_id')
        seenClassIds.push(classId)

        if (type === 'completion' && classId === CLASS_ID && completionAttempts === 0) {
          completionAttempts += 1
          return HttpResponse.json({ code: 'CLASS_NOT_FOUND', message: 'Class not found' }, { status: 404 })
        }

        return HttpResponse.json({
          report_type: type,
          filters: classId ? { class_id: classId } : {},
          data: operationalData[type],
        })
      }),
    )

    const view = mountOperationalReportsPage()
    try {
      await screen.findByText('Eligible Lessons')
      const initialCalls = seenClassIds.length

      // Invalid UUID is rejected client-side without sending requests
      fireEvent.change(screen.getByLabelText('Class UUID (optional)'), { target: { value: 'not-a-uuid' } })
      fireEvent.click(screen.getByRole('button', { name: 'Apply filter' }))
      expect(await screen.findByText(/Enter a valid Class UUID/i)).toBeInTheDocument()
      expect(seenClassIds).toHaveLength(initialCalls)

      // Valid UUID applies class_id filter; completion returns 404 first then retries successfully
      fireEvent.change(screen.getByLabelText('Class UUID (optional)'), { target: { value: CLASS_ID } })
      fireEvent.click(screen.getByRole('button', { name: 'Apply filter' }))

      expect(await screen.findByText('No class was found matching that Class UUID.')).toBeInTheDocument()
      expect(screen.getByText(`Class ${CLASS_ID}`)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await waitFor(() => {
        expect(screen.queryByText('No class was found matching that Class UUID.')).not.toBeInTheDocument()
      })

      // Reset back to All classes
      fireEvent.click(screen.getByRole('button', { name: 'All classes' }))
      await waitFor(() => expect(seenClassIds.at(-1)).toBeNull())
    } finally { view.close() }
  })
})
