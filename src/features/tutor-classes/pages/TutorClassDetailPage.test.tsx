import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/apiError'
import type { ClassCatalogItem } from '../../classes/types'
import type { TutorMember, TutorMemberPage } from '../types'

const tutorApi = vi.hoisted(() => ({
  approveTutorMember: vi.fn(),
  getTutorClassMembers: vi.fn(),
  getTutorOutline: vi.fn(),
  rejectTutorMember: vi.fn(),
  removeTutorMember: vi.fn(),
  updateTutorClass: vi.fn(),
  uploadClassThumbnail: vi.fn(),
}))

const classApi = vi.hoisted(() => ({ getClassDetails: vi.fn() }))

vi.mock('../api/tutorClassApi', () => tutorApi)
vi.mock('../../classes/api/classApi', () => classApi)
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Alex Tutor' } }, logout: vi.fn() }),
}))

import TutorClassDetailPage from './TutorClassDetailPage'

function apiFailure(status: number, code: string, message = 'The server refused the request.') {
  return new ApiError({ status, error: 'Request Failed', message, code, timestamp: new Date().toISOString(), path: '/classes/class-123' })
}

const classDetails: ClassCatalogItem = {
  class_id: 'class-123',
  class_code: 'CS101',
  title: 'Programming Foundations',
  description: 'Learn programming fundamentals.',
  prerequisites_description: 'None',
  thumbnail_url: null,
  enrollment_policy: 'APPROVAL_REQUIRED',
  status: 'ACTIVE',
  tutor: { user_id: 'tutor-1', full_name: 'Alex Tutor' },
  active_member_count: 9,
  max_capacity: 20,
}

function memberPage(items: TutorMember[]): TutorMemberPage {
  return { items, page: 1, size: 20, total_items: items.length, total_pages: 1 }
}

const activeMember: TutorMember = {
  class_member_id: 'member-active-1',
  class_id: 'class-123',
  student_id: '20210999-olivia',
  status: 'ACTIVE',
  requested_at: null,
  joined_at: '2026-10-01T02:00:00Z',
}

const pendingMember: TutorMember = {
  class_member_id: 'member-pending-1',
  class_id: 'class-123',
  student_id: '19220111-maya',
  status: 'PENDING',
  requested_at: '2026-10-04T02:00:00Z',
  joined_at: null,
}

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/tutor/classes/class-123']}>
        <Routes>
          <Route path="/tutor/classes/:classId" element={<TutorClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  )
}

/** On the FE-5 branch the tutor lands on the syllabus tab, so roster checks open Members first. */
async function renderRoster() {
  const view = renderPage()
  fireEvent.click(await screen.findByRole('tab', { name: /^Member/ }))
  return view
}

/** The roster is fetched twice per load: ACTIVE then PENDING. */
function rosterFor(active: TutorMember[], pending: TutorMember[]) {
  classApi.getClassDetails.mockResolvedValue(classDetails)
  tutorApi.getTutorClassMembers.mockImplementation(async (_classId: string, query: { status?: string }) =>
    (query.status === 'ACTIVE' ? memberPage(active) : memberPage(pending)))
}

beforeEach(() => {
  rosterFor([activeMember], [pendingMember])
  tutorApi.approveTutorMember.mockResolvedValue(undefined)
  tutorApi.rejectTutorMember.mockResolvedValue(undefined)
  tutorApi.removeTutorMember.mockResolvedValue(undefined)
  tutorApi.updateTutorClass.mockResolvedValue(classDetails)
  tutorApi.uploadClassThumbnail.mockResolvedValue('http://localhost:8081/api/v1/classes/class-123/thumbnail')
  tutorApi.getTutorOutline.mockResolvedValue({ class_id: 'class-123', chapters: [] })
})

describe('FE-4 tutor class detail', () => {
  it('shows both membership states and decides pending requests through the API', async () => {
    const { container } = await renderRoster()

    expect(await screen.findByText('Programming Foundations')).toBeInTheDocument()
    expect(container.textContent).toContain('20210999')
    expect(screen.getByText('Pending Requests')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(tutorApi.approveTutorMember).toHaveBeenCalledWith('class-123', 'member-pending-1'))

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(tutorApi.rejectTutorMember).toHaveBeenCalledWith('class-123', 'member-pending-1'))
  })

  it('confirms before removing an active member and keeps learning records in the message', async () => {
    await renderRoster()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Learning records are retained')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Member' }))
    await waitFor(() => expect(tutorApi.removeTutorMember).toHaveBeenCalledWith('class-123', 'member-active-1'))
  })

  it('sends the applied roster search and ordering to the members API', async () => {
    await renderRoster()

    fireEvent.change(screen.getByPlaceholderText('Search by student identifier'), { target: { value: 'student-11' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Search by student identifier'), { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(tutorApi.getTutorClassMembers).toHaveBeenCalledWith(
      'class-123',
      expect.objectContaining({ q: 'student-11', sort: 'requested_at,desc' }),
      expect.anything(),
    ))

    fireEvent.mouseDown(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByText('Joined, oldest first'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))

    await waitFor(() => expect(tutorApi.getTutorClassMembers).toHaveBeenCalledWith(
      'class-123',
      expect.objectContaining({ q: 'student-11', sort: 'joined_at,asc' }),
      expect.anything(),
    ))
  })
  it('hides every management action when the LMS refuses the class for this account', async () => {
    classApi.getClassDetails.mockRejectedValue(apiFailure(403, 'FORBIDDEN'))

    renderPage()

    expect(await screen.findByText('This class is not available in your tutor workspace')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Class Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^Member/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Manage content/ })).not.toBeInTheDocument()
  })

  it('blocks approving a request while the class has no free seat', async () => {
    rosterFor([activeMember], [pendingMember])
    classApi.getClassDetails.mockResolvedValue({ ...classDetails, active_member_count: 20, max_capacity: 20 })

    await renderRoster()

    expect(await screen.findByText('This class is full')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('explains a stale membership and reloads the roster instead of leaving it on screen', async () => {
    await renderRoster()
    const rosterCallsBefore = tutorApi.getTutorClassMembers.mock.calls.length
    tutorApi.approveTutorMember.mockRejectedValue(apiFailure(409, 'INVALID_MEMBERSHIP_STATE'))

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('That request was already handled, so it cannot be approved or rejected again.')).toBeInTheDocument()
    await waitFor(() => expect(tutorApi.getTutorClassMembers.mock.calls.length).toBeGreaterThan(rosterCallsBefore))
  })

  it('keeps an invalid settings form from reaching the API', async () => {
    renderPage()
    await screen.findByText('Programming Foundations')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Class Settings' }))
    const title = await screen.findByLabelText('Title')
    fireEvent.change(title, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
    expect(tutorApi.updateTutorClass).not.toHaveBeenCalled()
  })

  it('surfaces the capacity rule the server enforces and reloads the class', async () => {
    renderPage()
    await screen.findByText('Programming Foundations')
    const rosterCallsBefore = tutorApi.getTutorClassMembers.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Edit Class Settings' }))
    fireEvent.change(await screen.findByLabelText('Maximum Capacity'), { target: { value: '2' } })
    tutorApi.updateTutorClass.mockRejectedValue(apiFailure(409, 'CAPACITY_BELOW_ACTIVE_MEMBERS'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Capacity cannot be lower than the number of active students.')).toBeInTheDocument()
    await waitFor(() => expect(tutorApi.getTutorClassMembers.mock.calls.length).toBeGreaterThan(rosterCallsBefore))
  })

  it('uploads the chosen thumbnail through the multipart endpoint after saving settings', async () => {
    renderPage()
    await screen.findByText('Programming Foundations')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Class Settings' }))
    const file = new File(['x'], 'cover.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect(await screen.findByText('cover.png')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(tutorApi.updateTutorClass).toHaveBeenCalled())
    await waitFor(() => expect(tutorApi.uploadClassThumbnail).toHaveBeenCalledWith('class-123', file))
  })

  it('refuses a thumbnail the storage contract cannot accept', async () => {
    renderPage()
    await screen.findByText('Programming Foundations')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Class Settings' }))
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] } })

    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument()
    expect(tutorApi.uploadClassThumbnail).not.toHaveBeenCalled()
  })
})
