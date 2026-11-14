import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { membershipPage } from '@/test/fixtures/membershipWire'

import type { ClassCatalogItem, ClassOutlineResponse, MembershipStatus } from '../types'

const api = vi.hoisted(() => ({
  getClassDetails: vi.fn(),
  getClassOutline: vi.fn(),
  membershipRequest: vi.fn(),
  joinClass: vi.fn(),
  leaveClass: vi.fn(),
  withdrawJoinRequest: vi.fn(),
}))

vi.mock('@/api/lmsClient', () => ({ lmsClient: { get: api.membershipRequest } }))
vi.mock('../api/classApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/classApi')>()
  return { ...api, getCurrentMemberships: actual.getCurrentMemberships }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Test Student' } }, logout: vi.fn() }) }))

import ClassDetailPage from './ClassDetailPage'

const classDetails: ClassCatalogItem = {
  class_id: 'class-123',
  class_code: 'CS101',
  title: 'Programming Foundations',
  description: 'Learn programming fundamentals.',
  prerequisites_description: 'None',
  thumbnail_url: null,
  enrollment_policy: 'OPEN',
  status: 'ACTIVE',
  tutor: { user_id: 'tutor-1', full_name: 'Alex Tutor' },
  active_member_count: 9,
  max_capacity: 20,
}

const classOutline: ClassOutlineResponse = {
  class_id: 'class-123',
  chapters: [
    {
      chapter_id: 'chapter-1',
      title: 'Getting started',
      sequence_order: 0,
      status: 'PUBLISHED',
      lessons: [
        {
          lesson_id: 'lesson-1',
          title: 'Your first program',
          sequence_order: 0,
          estimated_duration: 25,
        },
      ],
    },
  ],
}

const outlineWithActivities: ClassOutlineResponse = {
  class_id: 'class-123',
  chapters: [
    {
      chapter_id: 'chapter-1',
      title: 'Getting started',
      sequence_order: 0,
      status: 'PUBLISHED',
      lessons: [
        {
          lesson_id: 'lesson-1',
          title: 'Your first program',
          sequence_order: 0,
          status: 'PUBLISHED',
          estimated_duration: 25,
          activities: [
            { activity_id: 'activity-1', title: 'Java basics check', activity_type: 'QUIZ', sequence_order: 0 },
            { activity_id: 'activity-2', title: 'Write a loop', activity_type: 'ASSIGNMENT', sequence_order: 1 },
          ],
        },
      ],
    },
  ],
}

function renderDetails() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/classes/class-123']}>
        <Routes>
          <Route path="/classes/:classId" element={<ClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  )
}

function forbidden(code: string) {
  const error = new AxiosError('Forbidden', 'BAD_RESPONSE')
  error.response = {
    status: 403,
    statusText: 'Forbidden',
    headers: {},
    config: { headers: {} },
    data: { code },
  } as unknown as AxiosResponse
  return error
}

describe('FE-3 class detail', () => {
  beforeEach(() => {
    api.getClassDetails.mockResolvedValue(classDetails)
    api.getClassOutline.mockResolvedValue(classOutline)
    api.membershipRequest.mockResolvedValue({ data: membershipPage([
      { class_id: 'class-123', membership_status: 'ACTIVE' },
    ]) })
    api.joinClass.mockResolvedValue({ status: 'ACTIVE' })
    api.leaveClass.mockResolvedValue(undefined)
    api.withdrawJoinRequest.mockResolvedValue(undefined)
  })

  it('combines class details, current membership and published outline from their API calls', async () => {
    renderDetails()

    expect(await screen.findByRole('heading', { name: 'Programming Foundations' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Chapter 1.*Getting started/ }))
    expect(await screen.findByText('Your first program')).toBeInTheDocument()
    expect(screen.getByText('Enrolled')).toBeInTheDocument()
    expect(api.getClassDetails).toHaveBeenCalledWith('class-123', expect.any(AbortSignal))
    expect(api.getClassOutline).toHaveBeenCalledWith('class-123', expect.any(AbortSignal))
    expect(api.membershipRequest).toHaveBeenCalledWith('/me/classes', { params: { page: 1, size: 20 }, signal: expect.any(AbortSignal) })
  })

  it('links an active member to the class discussion board', async () => {
    renderDetails()

    const link = await screen.findByRole('link', { name: /Class discussions/ })
    expect(link).toHaveAttribute('href', '/classes/class-123/discussions')
  })

  it('keeps the discussion entry point away from a pending membership', async () => {
    api.membershipRequest.mockResolvedValue({ data: membershipPage([
      { class_id: 'class-123', membership_status: 'PENDING' },
    ]) })

    renderDetails()

    expect(await screen.findByText('Request pending')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Class discussions/ })).not.toBeInTheDocument()
  })

  it('links each lesson activity to the FE-6 activity route', async () => {
    api.getClassOutline.mockResolvedValue(outlineWithActivities)

    renderDetails()

    fireEvent.click(await screen.findByRole('button', { name: /Chapter 1.*Getting started/ }))
    expect(await screen.findByRole('link', { name: 'Java basics check' })).toHaveAttribute(
      'href',
      '/classes/class-123/lessons/lesson-1/activities/activity-1',
    )
    expect(screen.getByRole('link', { name: 'Write a loop' })).toHaveAttribute(
      'href',
      '/classes/class-123/lessons/lesson-1/activities/activity-2',
    )
    expect(screen.getAllByText('Quiz')).toHaveLength(1)
    expect(screen.getAllByText('Assignment')).toHaveLength(1)
  })

  it.each(['ACTIVE', 'PENDING'])('loads a %s membership beyond page one through the real membership mapper', async (status) => {
    api.membershipRequest
      .mockResolvedValueOnce({ data: membershipPage(Array.from({ length: 20 }, (_, i) => ({ class_id: `other-${i}`, membership_status: 'ACTIVE' })), 1, 21) })
      .mockResolvedValueOnce({ data: membershipPage([{ class_id: 'class-123', membership_status: status }], 2, 21) })
    renderDetails()
    expect(await screen.findByRole('button', { name: status === 'ACTIVE' ? 'Leave class' : 'Withdraw request' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Join Class' })).not.toBeInTheDocument()
  })

  it('disables join rather than assuming NONE when membership JSON is malformed', async () => {
    api.membershipRequest.mockResolvedValue({ data: [{ class_id: 'class-123', status: 'ACTIVE' }] })
    renderDetails()
    expect(await screen.findByText('Membership status is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Class' })).toBeDisabled()
  })

  it('refreshes a changed enrollment policy after 409 and can submit using the new policy', async () => {
    api.membershipRequest.mockResolvedValue({ data: membershipPage([]) })
    api.getClassDetails.mockResolvedValueOnce(classDetails)
      .mockResolvedValue({ ...classDetails, enrollment_policy: 'APPROVAL_REQUIRED', active_member_count: 7 })
    api.joinClass.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { code: 'ENROLLMENT_POLICY_CHANGED', message: 'Enrollment policy changed.' } } })
      .mockImplementationOnce(() => {
        api.membershipRequest.mockResolvedValue({ data: membershipPage([{ class_id: 'class-123', membership_status: 'PENDING' }]) })
        return Promise.resolve({ status: 'PENDING' })
      })
    renderDetails()
    fireEvent.click(await screen.findByRole('button', { name: 'Join Class' }))

    expect(await screen.findByText('Enrollment policy changed.')).toBeInTheDocument()
    const request = await screen.findByRole('button', { name: 'Request to Join' })
    expect(screen.getByText('7/20 Seats')).toBeInTheDocument()
    expect(api.membershipRequest).toHaveBeenCalledTimes(2)
    fireEvent.click(request)
    expect(await screen.findByRole('button', { name: 'Withdraw request' })).toBeInTheDocument()
    expect(api.joinClass).toHaveBeenLastCalledWith('class-123', 'APPROVAL_REQUIRED')
  })

  it.each([
    ['ACTIVE', null],
    ['PENDING', null],
    ['PENDING', 'ACTIVE'],
  ] as const)('refreshes membership and details after a stale %s ends with 409 (now %s)', async (previous, current) => {
    api.membershipRequest.mockResolvedValueOnce({ data: membershipPage([{ class_id: 'class-123', membership_status: previous }]) })
      .mockResolvedValue({ data: membershipPage(current ? [{ class_id: 'class-123', membership_status: current }] : []) })
    api.getClassDetails.mockResolvedValueOnce(classDetails)
      .mockResolvedValue({ ...classDetails, active_member_count: 7 })
    const operation = previous === 'ACTIVE' ? api.leaveClass : api.withdrawJoinRequest
    operation.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { code: 'INVALID_MEMBERSHIP_STATE', message: 'Membership changed elsewhere.' } } })
    renderDetails()
    fireEvent.click(await screen.findByRole('button', { name: previous === 'ACTIVE' ? 'Leave class' : 'Withdraw request' }))
    fireEvent.click(await screen.findByRole('button', { name: previous === 'ACTIVE' ? 'Leave' : 'Withdraw' }))

    expect(await screen.findByText('Membership changed elsewhere.')).toBeInTheDocument()
    expect(await screen.findByText('7/20 Seats')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: current ? 'Leave class' : 'Join Class' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).not.toBeInTheDocument()
    expect(api.membershipRequest).toHaveBeenCalledTimes(2)
    expect(api.getClassDetails).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(api.getClassOutline).toHaveBeenCalledTimes(2))
  })

  it('keeps membership controls disabled if the conflict refetch fails', async () => {
    api.membershipRequest.mockResolvedValueOnce({ data: membershipPage([{ class_id: 'class-123', membership_status: 'ACTIVE' }]) })
      .mockRejectedValue(new Error('Membership refetch unavailable'))
    api.leaveClass.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { code: 'INVALID_MEMBERSHIP_STATE', message: 'Membership changed elsewhere.' } } })
    renderDetails()
    fireEvent.click(await screen.findByRole('button', { name: 'Leave class' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(await screen.findByText('Membership changed elsewhere.')).toBeInTheDocument()
    expect(await screen.findByText('Membership status is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Class' })).toBeDisabled()
    expect(screen.queryByText('Enrolled')).not.toBeInTheDocument()
  })

  it('holds lesson activities behind the membership gate for a pending request', async () => {
    api.getClassOutline.mockRejectedValue(forbidden('MEMBERSHIP_REQUIRED'))
    api.membershipRequest.mockResolvedValue({ data: membershipPage([{ class_id: 'class-123', membership_status: 'PENDING' }]) })

    renderDetails()

    expect(await screen.findByText('The syllabus is available to active class members.')).toBeInTheDocument()
    expect(screen.queryByText('Java basics check')).not.toBeInTheDocument()
  })

  it('renders a clear empty-syllabus state for an empty outline', async () => {
    api.getClassOutline.mockResolvedValue({ class_id: 'class-123', chapters: [] })

    renderDetails()

    expect(await screen.findByText('No published syllabus is available yet.')).toBeInTheDocument()
  })

  it('keeps the join action available when the syllabus request fails for another reason', async () => {
    api.getClassOutline.mockRejectedValue(new Error('Syllabus service unavailable'))
    api.membershipRequest.mockResolvedValue({ data: membershipPage([]) })

    renderDetails()

    fireEvent.click(await screen.findByRole('button', { name: 'Join Class' }))
    await waitFor(() => expect(api.joinClass).toHaveBeenCalledWith('class-123', 'OPEN'))
  })

  it('offers the withdrawal action for a pending request without waiting for the syllabus', async () => {
    api.getClassOutline.mockRejectedValue(forbidden('MEMBERSHIP_REQUIRED'))
    api.membershipRequest.mockResolvedValue({ data: membershipPage([{ class_id: 'class-123', membership_status: 'PENDING' }]) })

    renderDetails()

    expect(await screen.findByText('Request pending')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))

    await waitFor(() => expect(api.withdrawJoinRequest).toHaveBeenCalledWith('class-123'))
    expect(screen.queryByRole('button', { name: 'Join Class' })).not.toBeInTheDocument()
  })

  it('re-reads class details after joining so the seat count is the server value', async () => {
    const details = { ...classDetails, active_member_count: 19 }
    const memberships: { class_id: string; membership_status: MembershipStatus }[] = []
    api.getClassDetails.mockImplementation(() => Promise.resolve({ ...details }))
    api.getClassOutline.mockRejectedValue(forbidden('MEMBERSHIP_REQUIRED'))
    api.membershipRequest.mockImplementation(() => Promise.resolve({ data: membershipPage(memberships) }))
    api.joinClass.mockImplementation(() => {
      details.active_member_count = 20
      memberships.push({ class_id: 'class-123', membership_status: 'ACTIVE' })
      return Promise.resolve({ status: 'ACTIVE' })
    })

    renderDetails()

    expect(await screen.findByText('19/20 Seats')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Join Class' }))

    expect(await screen.findByText('20/20 Seats')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Leave class' })).toBeInTheDocument()
    expect(api.getClassDetails).toHaveBeenCalledTimes(2)
  })

})
