import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/apiError'
import type { ClassCatalogItem } from '../../classes/types'
import type { TutorClass } from '../types'

const tutorApi = vi.hoisted(() => ({
  createTutorClass: vi.fn(),
  getTutorClassMembers: vi.fn(),
  getTutorClasses: vi.fn(),
  updateTutorClass: vi.fn(),
}))

const classApi = vi.hoisted(() => ({ getClassDetails: vi.fn() }))

vi.mock('../api/tutorClassApi', () => tutorApi)
vi.mock('../../classes/api/classApi', () => classApi)
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Alex Tutor' } }, logout: vi.fn() }),
}))

import TutorClassManagementPage from './TutorClassManagementPage'

const tutorClass: TutorClass = {
  class_id: 'class-123',
  tutor_id: 'tutor-1',
  class_code: 'CS101',
  title: 'Programming Foundations',
  description: 'Learn programming fundamentals.',
  prerequisites_description: 'None',
  max_capacity: 20,
  enrollment_policy: 'APPROVAL_REQUIRED',
  status: 'ACTIVE',
  thumbnail_url: null,
  created_at: '2026-09-30T02:00:00Z',
  updated_at: '2026-09-30T02:00:00Z',
}

const classDetails: ClassCatalogItem = {
  ...tutorClass,
  tutor: { user_id: 'tutor-1', full_name: 'Alex Tutor' },
  active_member_count: 9,
  max_capacity: 20,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tutor/classes']}>
      <Routes>
        <Route path="/tutor/classes" element={<TutorClassManagementPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  tutorApi.getTutorClasses.mockResolvedValue({
    items: [tutorClass], page: 1, size: 20, total_items: 1, total_pages: 1,
  })
  classApi.getClassDetails.mockResolvedValue(classDetails)
  tutorApi.createTutorClass.mockResolvedValue(tutorClass)
  tutorApi.updateTutorClass.mockResolvedValue(tutorClass)
  tutorApi.getTutorClassMembers.mockResolvedValue({
    items: [], page: 1, size: 1, total_items: 2, total_pages: 1,
  })
})

async function openCreateModal() {
  fireEvent.click(await screen.findByRole('button', { name: /Create Class/ }))
  return within(await screen.findByRole('dialog'))
}

describe('FE-4 tutor class management', () => {
  it('creates a class only after the form passes validation', async () => {
    renderPage()
    const modal = await openCreateModal()

    fireEvent.click(modal.getByRole('button', { name: 'Create Class' }))
    await waitFor(() => expect(modal.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true'))
    expect(tutorApi.createTutorClass).not.toHaveBeenCalled()

    fireEvent.change(modal.getByLabelText('Title'), { target: { value: 'Discrete Math' } })
    fireEvent.change(modal.getByLabelText('Class Code'), { target: { value: 'MA001' } })
    fireEvent.click(modal.getByRole('button', { name: 'Create Class' }))

    await waitFor(() => expect(tutorApi.createTutorClass).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Discrete Math',
      class_code: 'MA001',
      enrollment_policy: 'APPROVAL_REQUIRED',
    })))
  })

  it('trims the class code before applying the server pattern', async () => {
    renderPage()
    const modal = await openCreateModal()
    fireEvent.change(modal.getByLabelText('Title'), { target: { value: '  Discrete Math  ' } })
    fireEvent.change(modal.getByLabelText('Class Code'), { target: { value: '  MA001  ' } })
    fireEvent.click(modal.getByRole('button', { name: 'Create Class' }))

    await waitFor(() => expect(tutorApi.createTutorClass).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Discrete Math',
      class_code: 'MA001',
    })))
  })

  it('filters title and class code across every page the list endpoint returns', async () => {
    const later = { ...tutorClass, class_id: 'class-900', class_code: 'MA900', title: 'Later Algebra' }
    tutorApi.getTutorClasses
      .mockResolvedValueOnce({ items: [tutorClass], page: 1, size: 100, total_items: 2, total_pages: 2 })
      .mockResolvedValueOnce({ items: [later], page: 2, size: 100, total_items: 2, total_pages: 2 })

    renderPage()
    const table = (await screen.findByText('Later Algebra')).closest('table')
    expect(table).not.toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Search title or class code'), { target: { value: 'MA900' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(within(table as HTMLElement).getByText('Later Algebra')).toBeInTheDocument()
    expect(within(table as HTMLElement).queryByText('Programming Foundations')).not.toBeInTheDocument()
    expect(tutorApi.getTutorClasses).toHaveBeenCalledWith(
      { page: 1, size: 100, sort: 'created_at,desc' },
      expect.anything(),
    )
    expect(tutorApi.getTutorClasses).toHaveBeenCalledWith(
      { page: 2, size: 100, sort: 'created_at,desc' },
      expect.anything(),
    )
  })

  it('rejects a class code the server already assigned to another class', async () => {
    tutorApi.createTutorClass.mockRejectedValue(new ApiError({
      status: 409, error: 'Conflict', message: 'class code already exists',
      code: 'CLASS_CODE_ALREADY_EXISTS', timestamp: new Date().toISOString(), path: '/classes',
    }))

    renderPage()
    const modal = await openCreateModal()
    fireEvent.change(modal.getByLabelText('Title'), { target: { value: 'Discrete Math' } })
    fireEvent.change(modal.getByLabelText('Class Code'), { target: { value: 'CS101' } })
    fireEvent.click(modal.getByRole('button', { name: 'Create Class' }))

    expect(await screen.findByText('That class code is already taken by another class.')).toBeInTheDocument()
  })

  it('archives the selected class through the class PATCH endpoint', async () => {
    renderPage()
    await screen.findByText('Programming Foundations')
    fireEvent.click(await screen.findByRole('button', { name: 'Archive class' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(tutorApi.updateTutorClass).toHaveBeenCalledWith('class-123', { status: 'ARCHIVED' }))
  })

  it('shows no class list and no create action when the tutor endpoint refuses this account', async () => {
    tutorApi.getTutorClasses.mockRejectedValue(new ApiError({
      status: 403, error: 'Forbidden', message: 'not a tutor',
      code: 'FORBIDDEN', timestamp: new Date().toISOString(), path: '/tutor/classes',
    }))

    renderPage()

    expect(await screen.findByText('Tutor class management is not available to your account')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Class/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Programming Foundations')).not.toBeInTheDocument()
  })
})
