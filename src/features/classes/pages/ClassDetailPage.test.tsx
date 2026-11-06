import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClassCatalogItem, ClassOutlineResponse, MembershipStatus } from '../types'

const api = vi.hoisted(() => ({
  getClassDetails: vi.fn(),
  getClassOutline: vi.fn(),
  getCurrentMemberships: vi.fn(),
  joinClass: vi.fn(),
  leaveClass: vi.fn(),
  withdrawJoinRequest: vi.fn(),
}))

vi.mock('../api/classApi', () => api)
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

function renderDetails() {
  return render(
    <MemoryRouter initialEntries={['/classes/class-123']}>
      <Routes>
        <Route path="/classes/:classId" element={<ClassDetailPage />} />
      </Routes>
    </MemoryRouter>,
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
    api.getCurrentMemberships.mockResolvedValue([
      { class_id: 'class-123', status: 'ACTIVE' },
    ])
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
    expect(api.getCurrentMemberships).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('renders a clear empty-syllabus state for an empty outline', async () => {
    api.getClassOutline.mockResolvedValue({ class_id: 'class-123', chapters: [] })

    renderDetails()

    expect(await screen.findByText('No published syllabus is available yet.')).toBeInTheDocument()
  })

  it('keeps the join action available when the syllabus request fails for another reason', async () => {
    api.getClassOutline.mockRejectedValue(new Error('Syllabus service unavailable'))
    api.getCurrentMemberships.mockResolvedValue([])

    renderDetails()

    fireEvent.click(await screen.findByRole('button', { name: 'Join Class' }))
    await waitFor(() => expect(api.joinClass).toHaveBeenCalledWith('class-123', 'OPEN'))
  })

  it('offers the withdrawal action for a pending request without waiting for the syllabus', async () => {
    api.getClassOutline.mockRejectedValue(forbidden('MEMBERSHIP_REQUIRED'))
    api.getCurrentMemberships.mockResolvedValue([{ class_id: 'class-123', status: 'PENDING' }])

    renderDetails()

    expect(await screen.findByText('Request pending')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))

    await waitFor(() => expect(api.withdrawJoinRequest).toHaveBeenCalledWith('class-123'))
    expect(screen.queryByRole('button', { name: 'Join Class' })).not.toBeInTheDocument()
  })

  it('re-reads class details after joining so the seat count is the server value', async () => {
    const details = { ...classDetails, active_member_count: 19 }
    const memberships: { class_id: string; status: MembershipStatus }[] = []
    api.getClassDetails.mockImplementation(() => Promise.resolve({ ...details }))
    api.getClassOutline.mockRejectedValue(forbidden('MEMBERSHIP_REQUIRED'))
    api.getCurrentMemberships.mockImplementation(() => Promise.resolve([...memberships]))
    api.joinClass.mockImplementation(() => {
      details.active_member_count = 20
      memberships.push({ class_id: 'class-123', status: 'ACTIVE' })
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
