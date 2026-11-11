import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from 'antd'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
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
  return { items, page: 1, size: 20, total_items: items.length, total_pages: Math.ceil(items.length / 20) }
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
        <Link to="/tutor/classes/other-class">Switch class</Link>
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

function rosterSection(name: 'Class members' | 'Pending Requests') {
  return screen.getByRole('heading', { name: new RegExp(`^${name}`) }).closest('section')!
}

function pagedRoster(activeCount = 21, pendingCount = 21) {
  const active = Array.from({ length: activeCount }, (_, i) => ({
    ...activeMember, class_member_id: `active-${i + 1}`, student_id: `active-student-${i + 1}`,
  }))
  const pending = Array.from({ length: pendingCount }, (_, i) => ({
    ...pendingMember, class_member_id: `pending-${i + 1}`, student_id: `pending-student-${i + 1}`,
  }))
  tutorApi.getTutorClassMembers.mockImplementation(async (_id: string, query: { status: string; page: number; q?: string }) => {
    const members = query.status === 'ACTIVE' ? active : pending
    const filtered = query.q ? members.slice(0, 1) : members
    return {
      items: filtered.slice((query.page - 1) * 20, query.page * 20), page: query.page, size: 20,
      total_items: filtered.length, total_pages: Math.ceil(filtered.length / 20),
    }
  })
  return { active, pending }
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

    fireEvent.change(screen.getByPlaceholderText('Search by name or email'), { target: { value: 'student-11' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Search by name or email'), { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(tutorApi.getTutorClassMembers).toHaveBeenCalledWith(
      'class-123',
      expect.objectContaining({ q: 'student-11', sort: 'requested_at,desc' }),
      expect.anything(),
    ))

    fireEvent.mouseDown(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByText('Joined, oldest first'))

    await waitFor(() => expect(tutorApi.getTutorClassMembers).toHaveBeenCalledWith(
      'class-123',
      expect.objectContaining({ q: 'student-11', sort: 'joined_at,asc' }),
      expect.anything(),
    ))
  })

  it('searches both rosters from page one and clears the query without losing server ordering', async () => {
    pagedRoster()
    await renderRoster()
    fireEvent.click(within(rosterSection('Class members')).getByTitle('2'))
    await screen.findByText('active-student-21')
    fireEvent.click(within(rosterSection('Pending Requests')).getByTitle('2'))
    await screen.findByText('pending-student-21')

    const input = screen.getByPlaceholderText('Search by name or email')
    fireEvent.change(input, { target: { value: '  Olivia  ' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    expect(await screen.findByText('active-student-1')).toBeInTheDocument()
    expect(screen.getByText('pending-student-1')).toBeInTheDocument()
    expect(screen.queryByText('active-student-21')).not.toBeInTheDocument()
    for (const status of ['ACTIVE', 'PENDING']) {
      expect(tutorApi.getTutorClassMembers).toHaveBeenCalledWith('class-123', {
        status, page: 1, size: 20, sort: 'requested_at,desc', q: 'Olivia',
      }, expect.any(AbortSignal))
    }

    fireEvent.click(document.querySelector('.ant-input-clear-icon')!)
    expect(await screen.findByText('active-student-20')).toBeInTheDocument()
    expect(screen.getByText('pending-student-20')).toBeInTheDocument()
    for (const status of ['ACTIVE', 'PENDING']) {
      expect(tutorApi.getTutorClassMembers).toHaveBeenCalledWith('class-123', {
        status, page: 1, size: 20, sort: 'requested_at,desc', q: undefined,
      }, expect.any(AbortSignal))
    }
  })

  it.each(['reject', 'approve'] as const)('recovers pending page two after %s removes its final request', async (action) => {
    const { active, pending } = pagedRoster(0, 21)
    const operation = action === 'reject' ? tutorApi.rejectTutorMember : tutorApi.approveTutorMember
    operation.mockImplementation(() => {
      const member = pending.pop()!
      if (action === 'approve') active.push({ ...member, status: 'ACTIVE' })
      return Promise.resolve()
    })
    await renderRoster()
    fireEvent.click(within(rosterSection('Pending Requests')).getByTitle('2'))
    await screen.findByText('pending-student-21')
    const callsBefore = tutorApi.getTutorClassMembers.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: action === 'reject' ? 'Reject' : 'Approve' }))

    expect(await screen.findByText('pending-student-1')).toBeInTheDocument()
    const pendingSection = rosterSection('Pending Requests')
    expect(pendingSection.querySelector('.ant-pagination-item-active')).toHaveAttribute('title', '1')
    expect(within(pendingSection).getByText('pending-student-20')).toBeInTheDocument()
    expect(within(pendingSection).queryByText('No pending requests')).not.toBeInTheDocument()
    const calls = tutorApi.getTutorClassMembers.mock.calls.slice(callsBefore)
    expect(calls).toHaveLength(3)
    expect(calls.map((call) => [call[1].status, call[1].page])).toEqual([
      ['ACTIVE', 1], ['PENDING', 2], ['PENDING', 1],
    ])
    expect(operation).toHaveBeenCalledWith('class-123', 'pending-21')
    expect(await screen.findByText(action === 'reject' ? 'Join request rejected.' : 'Join request approved.')).toBeInTheDocument()
  })

  it('recovers active page two after remove while leaving pending page two unchanged', async () => {
    const { active } = pagedRoster()
    tutorApi.removeTutorMember.mockImplementation(() => { active.pop(); return Promise.resolve() })
    await renderRoster()
    fireEvent.click(within(rosterSection('Class members')).getByTitle('2'))
    await screen.findByText('active-student-21')
    fireEvent.click(within(rosterSection('Pending Requests')).getByTitle('2'))
    await screen.findByText('pending-student-21')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const callsBefore = tutorApi.getTutorClassMembers.mock.calls.length
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Member' }))

    expect(await screen.findByText('active-student-1')).toBeInTheDocument()
    expect(rosterSection('Class members').querySelector('.ant-pagination-item-active')).toHaveAttribute('title', '1')
    expect(rosterSection('Pending Requests').querySelector('.ant-pagination-item-active')).toHaveAttribute('title', '2')
    expect(screen.getByText('pending-student-21')).toBeInTheDocument()
    expect(tutorApi.getTutorClassMembers.mock.calls.slice(callsBefore).map((call) => [call[1].status, call[1].page])).toEqual([
      ['ACTIVE', 2], ['PENDING', 2], ['ACTIVE', 1],
    ])
  })

  it('shows genuine empty search results after resetting both rosters to page one', async () => {
    pagedRoster(0, 21)
    await renderRoster()
    fireEvent.click(within(rosterSection('Pending Requests')).getByTitle('2'))
    await screen.findByText('pending-student-21')
    tutorApi.getTutorClassMembers.mockImplementation(async (_id: string, query: { page: number }) => ({
      items: [], page: query.page, size: 20, total_items: 0, total_pages: 0,
    }))
    const input = screen.getByPlaceholderText('Search by name or email')
    fireEvent.change(input, { target: { value: 'nobody@example.com' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByText('No active members match your search')).toBeInTheDocument()
    expect(screen.getByText('No pending requests match your search')).toBeInTheDocument()
    expect(document.querySelector('.ant-pagination')).toBeNull()
    expect(tutorApi.getTutorClassMembers).toHaveBeenLastCalledWith('class-123', expect.objectContaining({ page: 1, q: 'nobody@example.com' }), expect.any(AbortSignal))
  })

  it('does not publish an out-of-range response when its recovery request fails', async () => {
    const { pending } = pagedRoster(0, 21)
    tutorApi.rejectTutorMember.mockImplementation(() => {
      pending.pop()
      tutorApi.getTutorClassMembers.mockImplementation(async (_id: string, query: { status: string; page: number }) => {
        if (query.status === 'ACTIVE') return memberPage([])
        if (query.page === 1) throw new Error('Recovery request failed')
        return { items: [], page: 2, size: 20, total_items: 20, total_pages: 1 }
      })
      return Promise.resolve()
    })
    await renderRoster()
    fireEvent.click(within(rosterSection('Pending Requests')).getByTitle('2'))
    await screen.findByText('pending-student-21')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByText('Could not load class details')).toBeInTheDocument()
    expect(screen.queryByText('No pending requests')).not.toBeInTheDocument()
  })

  it('rejects malformed pagination metadata without retrying indefinitely', async () => {
    tutorApi.getTutorClassMembers.mockResolvedValue({ items: [], page: 1, size: 20, total_items: 0 })
    renderPage()
    expect(await screen.findByText('Could not load class details')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('An unexpected error occurred. Please try again.')
    expect(tutorApi.getTutorClassMembers).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('No active members')).not.toBeInTheDocument()
  })

  it('ignores a late search response after navigation and a newer search on the same route component', async () => {
    const late: ((page: TutorMemberPage) => void)[] = []
    tutorApi.getTutorClassMembers.mockImplementation((id: string, query: { q?: string }) => {
      if (id === 'class-123' && query.q === 'old') return new Promise<TutorMemberPage>((resolve) => late.push(resolve))
      return Promise.resolve(memberPage([{ ...activeMember, student_id: query.q === 'new' ? 'new-result' : 'initial-result' }]))
    })
    classApi.getClassDetails.mockImplementation((id: string) => Promise.resolve({
      ...classDetails, class_id: id, title: id === 'other-class' ? 'Other class' : classDetails.title,
    }))
    await renderRoster()
    const input = screen.getByPlaceholderText('Search by name or email')
    fireEvent.change(input, { target: { value: 'old' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(late).toHaveLength(2))
    fireEvent.click(screen.getByRole('link', { name: 'Switch class' }))
    await screen.findByText('Other class')
    const nextInput = screen.getByPlaceholderText('Search by name or email')
    fireEvent.change(nextInput, { target: { value: 'new' } })
    fireEvent.keyDown(nextInput, { key: 'Enter', code: 'Enter' })
    await screen.findAllByText('new-result')
    await act(async () => { late.forEach((resolve) => resolve(memberPage([{ ...activeMember, student_id: 'stale-result' }]))) })
    expect(screen.getByText('Other class')).toBeInTheDocument()
    expect(screen.queryByText('stale-result')).not.toBeInTheDocument()
    expect(screen.getAllByText('new-result')).toHaveLength(2)
  })

  it('shows the agreed name and email fields when the roster includes them', async () => {
    rosterFor(
      [{ ...activeMember, full_name: 'Olivia Nguyen', email: 'olivia@example.com' }],
      [pendingMember],
    )

    await renderRoster()

    expect(await screen.findByText('Olivia Nguyen · olivia@example.com')).toBeInTheDocument()
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

  it('closes membership actions while the class is archived', async () => {
    classApi.getClassDetails.mockResolvedValue({ ...classDetails, status: 'ARCHIVED' })

    await renderRoster()

    expect(await screen.findByText('This class is archived')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('keeps a saved settings change when the thumbnail upload is refused', async () => {
    tutorApi.uploadClassThumbnail.mockRejectedValue(apiFailure(413, 'FILE_TOO_LARGE', 'too large'))
    renderPage()
    await screen.findByText('Programming Foundations')
    const detailCallsBefore = classApi.getClassDetails.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Edit Class Settings' }))
    const file = new File(['x'], 'cover.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText(/Class settings were saved/)).toBeInTheDocument()
    await waitFor(() => expect(classApi.getClassDetails.mock.calls.length).toBeGreaterThan(detailCallsBefore))
    expect(tutorApi.updateTutorClass).toHaveBeenCalled()
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
