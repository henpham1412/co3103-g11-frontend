import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, deleteRequest } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  deleteRequest: vi.fn(),
}))

vi.mock('../../../api/lmsClient', () => ({
  lmsClient: { get, post, delete: deleteRequest },
}))

import {
  getClassCatalog,
  getClassDetails,
  getClassOutline,
  getCurrentMemberships,
  joinClass,
  leaveClass,
  withdrawJoinRequest,
} from './classApi'

describe('class API client', () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: {} })
    post.mockResolvedValue({ data: { status: 'PENDING' } })
    deleteRequest.mockResolvedValue({})
  })

  it('requests the catalog with the server-side query and cancellation signal', async () => {
    const signal = new AbortController().signal
    const query = {
      q: 'programming',
      enrollment_policy: 'OPEN' as const,
      page: 2,
      size: 12,
      sort: 'created_at,desc',
    }

    await getClassCatalog(query, signal)

    expect(get).toHaveBeenCalledWith('/classes', { params: query, signal })
  })

  it('uses the documented current-user membership endpoint', async () => {
    const signal = new AbortController().signal

    await getCurrentMemberships(signal)

    expect(get).toHaveBeenCalledWith('/me/classes', { signal })
  })

  it('separates class details from the learning outline', async () => {
    await getClassDetails('class-123')
    await getClassOutline('class-123')

    expect(get).toHaveBeenNthCalledWith(1, '/classes/class-123', { signal: undefined })
    expect(get).toHaveBeenNthCalledWith(2, '/classes/class-123/outline', { signal: undefined })
  })

  it('uses separate join and approval-request endpoints', async () => {
    await joinClass('open-class', 'OPEN')
    await joinClass('approval-class', 'APPROVAL_REQUIRED')

    expect(post).toHaveBeenNthCalledWith(1, '/classes/open-class/membership')
    expect(post).toHaveBeenNthCalledWith(2, '/classes/approval-class/join-requests')
  })

  it('uses the corresponding leave and pending-request withdrawal endpoints', async () => {
    await leaveClass('class-123')
    await withdrawJoinRequest('class-456')

    expect(deleteRequest).toHaveBeenNthCalledWith(1, '/classes/class-123/membership')
    expect(deleteRequest).toHaveBeenNthCalledWith(2, '/classes/class-456/membership-request')
  })
})
