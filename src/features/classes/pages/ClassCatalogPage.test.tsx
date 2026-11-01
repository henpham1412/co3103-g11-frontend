import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClassCatalogItem, ClassCatalogResponse } from '../types'

const api = vi.hoisted(() => ({
  getClassCatalog: vi.fn(),
  getCurrentMemberships: vi.fn(),
  joinClass: vi.fn(),
  leaveClass: vi.fn(),
  withdrawJoinRequest: vi.fn(),
}))

vi.mock('../api/classApi', () => api)
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Test Student' } }, logout: vi.fn() }) }))

import ClassCatalogPage from './ClassCatalogPage'

function makeClass(index: number, overrides: Partial<ClassCatalogItem> = {}): ClassCatalogItem {
  return {
    class_id: `class-${index}`,
    class_code: `CS${index}`,
    title: `Course ${index}`,
    description: `Description ${index}`,
    prerequisites_description: null,
    thumbnail_url: null,
    enrollment_policy: 'OPEN',
    status: 'ACTIVE',
    tutor: { user_id: `tutor-${index}`, full_name: `Tutor ${index}` },
    active_member_count: 1,
    max_capacity: 20,
    ...overrides,
  }
}

function catalogResponse(items: ClassCatalogItem[], page = 1, total = items.length): ClassCatalogResponse {
  return {
    items,
    page,
    size: 12,
    total_items: total,
    total_pages: Math.ceil(total / 12),
  }
}

function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/classes']}>
      <Routes>
        <Route path="/classes" element={<ClassCatalogPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FE-3 class catalog', () => {
  beforeEach(() => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([makeClass(1)]))
    api.getCurrentMemberships.mockResolvedValue([])
    api.joinClass.mockResolvedValue({ status: 'ACTIVE' })
    api.leaveClass.mockResolvedValue(undefined)
    api.withdrawJoinRequest.mockResolvedValue(undefined)
  })

  it('loads catalog data from the API and displays the class', async () => {
    renderCatalog()

    expect(await screen.findByRole('link', { name: 'Course 1' })).toBeInTheDocument()
    expect(api.getClassCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, size: 12, sort: 'created_at,desc' }),
      expect.any(AbortSignal),
    )
  })

  it('submits trimmed search text and resets the server page to one', async () => {
    renderCatalog()

    const search = await screen.findByPlaceholderText('Search by class name, code or tutor')
    fireEvent.change(search, { target: { value: '  data systems  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(api.getClassCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'data systems', page: 1 }),
        expect.any(AbortSignal),
      )
    })
  })

  it('filters the catalog by the documented enrollment policy', async () => {
    renderCatalog()

    const selects = await screen.findAllByRole('combobox')
    fireEvent.mouseDown(selects[0])
    fireEvent.click(await screen.findByText('Approval required'))

    await waitFor(() => {
      expect(api.getClassCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ enrollment_policy: 'APPROVAL_REQUIRED', page: 1 }),
        expect.any(AbortSignal),
      )
    })
  })

  it('uses server pagination instead of rendering all catalog items on one page', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => makeClass(index + 1))
    const secondPage = [makeClass(13)]
    api.getClassCatalog.mockImplementation(({ page = 1 }: { page?: number }) =>
      Promise.resolve(page === 2
        ? catalogResponse(secondPage, 2, 13)
        : catalogResponse(firstPage, 1, 13)),
    )

    renderCatalog()
    expect(await screen.findByRole('link', { name: 'Course 1' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Course 13' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('2'))

    expect(await screen.findByRole('link', { name: 'Course 13' })).toBeInTheDocument()
    expect(api.getClassCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, size: 12 }),
      expect.any(AbortSignal),
    )
  })

  it('shows the actual active and pending membership states', async () => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([makeClass(1), makeClass(2)]))
    api.getCurrentMemberships.mockResolvedValue([
      { class_id: 'class-1', status: 'ACTIVE' },
      { class_id: 'class-2', status: 'PENDING' },
    ])

    renderCatalog()

    const activeCard = (await screen.findByRole('link', { name: 'Course 1' })).closest('.ant-card')
    const pendingCard = (await screen.findByRole('link', { name: 'Course 2' })).closest('.ant-card')
    expect(activeCard).not.toBeNull()
    expect(pendingCard).not.toBeNull()
    expect(within(activeCard as HTMLElement).getByText('Enrolled')).toBeInTheDocument()
    expect(within(activeCard as HTMLElement).getByRole('button', { name: 'Leave class' })).toBeInTheDocument()
    expect(within(pendingCard as HTMLElement).getByText('Pending')).toBeInTheDocument()
    expect(within(pendingCard as HTMLElement).getByRole('button', { name: 'Withdraw request' })).toBeInTheDocument()
  })

  it('keeps catalog browsing available but disables membership actions when current memberships fail to load', async () => {
    api.getCurrentMemberships.mockRejectedValue(new Error('Membership service unavailable'))

    renderCatalog()

    expect(await screen.findByRole('link', { name: 'Course 1' })).toBeInTheDocument()
    expect(await screen.findByText('Membership status is unavailable')).toBeInTheDocument()

    const classCard = screen.getByRole('link', { name: 'Course 1' }).closest('.ant-card') as HTMLElement
    const joinButton = within(classCard).getByRole('button', { name: 'Membership unavailable' })
    expect(joinButton).toBeDisabled()

    fireEvent.click(joinButton)
    expect(api.joinClass).not.toHaveBeenCalled()
  })

  it('allows approval requests at full capacity but disables a full open class', async () => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([
      makeClass(1, { enrollment_policy: 'OPEN', active_member_count: 20, max_capacity: 20 }),
      makeClass(2, { enrollment_policy: 'APPROVAL_REQUIRED', active_member_count: 20, max_capacity: 20 }),
    ]))
    api.joinClass.mockResolvedValue({ status: 'PENDING' })

    renderCatalog()

    const openClassLink = await screen.findByRole('link', { name: 'Course 1' })
    const approvalClassLink = await screen.findByRole('link', { name: 'Course 2' })
    const openCard = openClassLink.closest('.ant-card') as HTMLElement
    const approvalCard = approvalClassLink.closest('.ant-card') as HTMLElement

    expect(within(openCard).getByRole('button', { name: 'Class full' })).toBeDisabled()
    const requestButton = within(approvalCard).getByRole('button', { name: 'Request to Join' })
    expect(requestButton).toBeEnabled()
    fireEvent.click(requestButton)

    await waitFor(() => expect(api.joinClass).toHaveBeenCalledWith('class-2', 'APPROVAL_REQUIRED'))
    expect(await within(approvalCard).findByText('Pending')).toBeInTheDocument()
  })

  it('shows a useful empty state when the API returns no classes', async () => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([], 1, 0))

    renderCatalog()

    expect(await screen.findByText('No classes match your search')).toBeInTheDocument()
  })

})
