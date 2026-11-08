import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClassCatalogItem, ClassCatalogResponse, MembershipStatus } from '../types'

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
    <App>
      <MemoryRouter initialEntries={['/classes']}>
        <Routes>
          <Route path="/classes" element={<ClassCatalogPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  )
}

// A full accessible-name lookup over the rendered grid costs seconds per call in jsdom, so the
// card is located by its title text and the link assertion is scoped to that one card.
async function cardOf(title: string): Promise<HTMLElement> {
  await screen.findByText(title)
  const card = screen.getByText(title).closest('.ant-card')
  if (!card) throw new Error(`${title} is not rendered inside a card`)
  expect(within(card as HTMLElement).getByRole('link', { name: title })).toBeInTheDocument()
  return card as HTMLElement
}

async function confirmCardAction(card: HTMLElement, triggerName: string, okName: string) {
  fireEvent.click(within(card).getByRole('button', { name: triggerName }))
  fireEvent.click(await screen.findByRole('button', { name: okName }))
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

    expect(await screen.findByText('Course 1')).toBeInTheDocument()
    expect(screen.queryByText('Course 13')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.class-catalog__card')).toHaveLength(12)

    fireEvent.click(screen.getByTitle('2'))

    expect(await screen.findByText('Course 13')).toBeInTheDocument()
    expect(document.querySelectorAll('.class-catalog__card')).toHaveLength(1)
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

    const activeCard = await cardOf('Course 1')
    const pendingCard = await cardOf('Course 2')
    expect(within(activeCard).getByText('Enrolled')).toBeInTheDocument()
    expect(within(activeCard as HTMLElement).getByRole('button', { name: 'Leave class' })).toBeInTheDocument()
    expect(within(pendingCard as HTMLElement).getByText('Pending')).toBeInTheDocument()
    expect(within(pendingCard as HTMLElement).getByRole('button', { name: 'Withdraw request' })).toBeInTheDocument()
  })

  it('keeps catalog browsing available but disables membership actions when current memberships fail to load', async () => {
    api.getCurrentMemberships.mockRejectedValue(new Error('Membership service unavailable'))

    renderCatalog()

    const classCard = await cardOf('Course 1')
    expect(await screen.findByText('Membership status is unavailable')).toBeInTheDocument()

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
    api.getCurrentMemberships
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ class_id: 'class-2', status: 'PENDING' }])

    renderCatalog()

    const openCard = await cardOf('Course 1')
    const approvalCard = await cardOf('Course 2')

    expect(within(openCard).getByRole('button', { name: 'Class full' })).toBeDisabled()
    const requestButton = within(approvalCard).getByRole('button', { name: 'Request to Join' })
    expect(requestButton).toBeEnabled()
    fireEvent.click(requestButton)

    await waitFor(() => expect(api.joinClass).toHaveBeenCalledWith('class-2', 'APPROVAL_REQUIRED'))
    expect(await screen.findByText('Pending')).toBeInTheDocument()
  })

  it('shows a useful empty state when the API returns no classes', async () => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([], 1, 0))

    renderCatalog()

    expect(await screen.findByText('No classes match your search')).toBeInTheDocument()
    expect(document.querySelector('.ant-pagination')).toBeNull()
  })

  it('re-reads the catalog page so capacity after joining is the server value, not a local guess', async () => {
    const items = [makeClass(1, { active_member_count: 19 })]
    const memberships: { class_id: string; status: MembershipStatus }[] = []
    api.getClassCatalog.mockImplementation(() =>
      Promise.resolve(catalogResponse(items.map((item) => ({ ...item })))),
    )
    api.getCurrentMemberships.mockImplementation(() => Promise.resolve([...memberships]))
    api.joinClass.mockImplementation(() => {
      items[0].active_member_count = 20
      memberships.push({ class_id: 'class-1', status: 'ACTIVE' })
      return Promise.resolve({ status: 'ACTIVE' })
    })

    renderCatalog()

    const classCard = await cardOf('Course 1')
    expect(within(classCard).getByText('19/20 Seats')).toBeInTheDocument()

    fireEvent.click(within(classCard).getByRole('button', { name: 'Join Class' }))

    expect(await screen.findByText('20/20 Seats')).toBeInTheDocument()
    expect(screen.getByText('Enrolled')).toBeInTheDocument()
    expect(api.getClassCatalog).toHaveBeenCalledTimes(2)
    expect(api.getCurrentMemberships).toHaveBeenCalledTimes(2)
  })

  it('re-reads the catalog page after leaving a class', async () => {
    const items = [makeClass(1, { active_member_count: 20 })]
    const memberships: { class_id: string; status: MembershipStatus }[] = [
      { class_id: 'class-1', status: 'ACTIVE' },
    ]
    api.getClassCatalog.mockImplementation(() =>
      Promise.resolve(catalogResponse(items.map((item) => ({ ...item })))),
    )
    api.getCurrentMemberships.mockImplementation(() => Promise.resolve([...memberships]))
    api.leaveClass.mockImplementation(() => {
      items[0].active_member_count = 19
      memberships.length = 0
      return Promise.resolve(undefined)
    })

    renderCatalog()

    const classCard = await cardOf('Course 1')
    expect(within(classCard).getByText('20/20 Seats')).toBeInTheDocument()

    await confirmCardAction(classCard, 'Leave class', 'Leave')

    expect(await screen.findByText('19/20 Seats')).toBeInTheDocument()
    expect(screen.queryByText('Enrolled')).not.toBeInTheDocument()
    expect(api.getClassCatalog).toHaveBeenCalledTimes(2)
  })

  it('blocks overlapping submissions on one class without blocking another class', async () => {
    const resolvers: ((membership: { status: MembershipStatus }) => void)[] = []
    api.getClassCatalog.mockResolvedValue(catalogResponse([makeClass(1), makeClass(2)]))
    api.joinClass.mockImplementation(
      () => new Promise<{ status: MembershipStatus }>((resolve) => { resolvers.push(resolve) }),
    )

    renderCatalog()

    const firstCard = await cardOf('Course 1')
    const secondCard = await cardOf('Course 2')

    fireEvent.click(within(firstCard).getByRole('button', { name: 'Join Class' }))
    await waitFor(() => expect(resolvers).toHaveLength(1))

    // The card is busy, so a second submission cannot reach the API.
    fireEvent.click(within(firstCard).getByRole('button', { name: /Join Class/ }))
    expect(api.joinClass).toHaveBeenCalledTimes(1)

    // The guard is per class, so an unrelated card stays actionable.
    fireEvent.click(within(secondCard).getByRole('button', { name: 'Join Class' }))
    await waitFor(() => expect(api.joinClass).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolvers.forEach((resolve) => resolve({ status: 'ACTIVE' }))
    })
    // Both operations finished, so the guard is released and the same card is actionable again.
    await waitFor(() => {
      const refreshedCard = screen.getByText('Course 1').closest('.ant-card') as HTMLElement
      expect(within(refreshedCard).getByRole('button', { name: /Join Class/ })).toBeEnabled()
    })
  })

  it('blocks a second withdrawal on the same card while the first request is running', async () => {
    let release: (() => void) | undefined
    api.getClassCatalog.mockResolvedValue(catalogResponse([makeClass(1)]))
    api.getCurrentMemberships.mockResolvedValue([{ class_id: 'class-1', status: 'PENDING' }])
    api.withdrawJoinRequest.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve }),
    )

    renderCatalog()

    const classCard = await cardOf('Course 1')
    await confirmCardAction(classCard, 'Withdraw request', 'Withdraw')
    await waitFor(() => expect(api.withdrawJoinRequest).toHaveBeenCalledTimes(1))

    expect(within(classCard).getByRole('button', { name: /Withdraw request/ })).toBeDisabled()
    fireEvent.click(within(classCard).getByRole('button', { name: /Withdraw request/ }))
    expect(api.withdrawJoinRequest).toHaveBeenCalledTimes(1)

    release?.()
    await waitFor(() => expect(api.getClassCatalog).toHaveBeenCalledTimes(2))
  })

  it('recovers when the server reports fewer pages than the one being displayed', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => makeClass(index + 1))
    api.getClassCatalog.mockImplementation(({ page = 1 }: { page?: number }) => Promise.resolve(
      page === 1
        ? catalogResponse(firstPage, 1, 36)
        : page === 3
          ? { items: [], page: 3, size: 12, total_items: 13, total_pages: 2 }
          : catalogResponse([makeClass(13)], 2, 13),
    ))

    renderCatalog()

    await screen.findByText('Course 1')
    fireEvent.click(screen.getByTitle('3'))

    await waitFor(() => {
      expect(api.getClassCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      )
    })
    expect(await screen.findByText('Course 13')).toBeInTheDocument()
  })

  it('renders the class thumbnail when the catalog provides one', async () => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([
      makeClass(1, { thumbnail_url: 'https://cdn.test/cs101.png' }),
    ]))

    renderCatalog()

    const classCard = await cardOf('Course 1')
    expect(within(classCard).getByRole('img', { name: 'Course 1 cover' }))
      .toHaveAttribute('src', 'https://cdn.test/cs101.png')
  })

  it('keeps the artwork cover when a thumbnail is missing or fails to load', async () => {
    api.getClassCatalog.mockResolvedValue(catalogResponse([
      makeClass(1, { thumbnail_url: 'https://cdn.test/broken.png' }),
      makeClass(2, { thumbnail_url: ' ' }),
    ]))

    renderCatalog()

    const brokenCard = await cardOf('Course 1')
    const missingCard = await cardOf('Course 2')
    expect(missingCard.querySelector('img')).toBeNull()

    fireEvent.error(within(brokenCard).getByRole('img', { name: 'Course 1 cover' }))

    await waitFor(() => expect(brokenCard.querySelector('img')).toBeNull())
    expect(brokenCard.querySelector('.class-catalog__cover-lines')).not.toBeNull()
  })

})
