import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, deleteRequest, defaults } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  deleteRequest: vi.fn(),
  defaults: { baseURL: 'http://localhost:8081/api/v1' },
}))

vi.mock('../../../api/lmsClient', () => ({
  lmsClient: { get, post, delete: deleteRequest, defaults },
}))

import {
  downloadStudentMaterial,
  getClassCatalog,
  getClassDetails,
  getClassOutline,
  getCurrentMemberships,
  getStudentLesson,
  getStudentLessonMaterials,
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

  it('reads a single lesson and its materials from the learning content endpoints', async () => {
    const signal = new AbortController().signal

    await getStudentLesson('lesson-7', signal)
    await getStudentLessonMaterials('lesson-7', signal)

    expect(get).toHaveBeenNthCalledWith(1, '/lessons/lesson-7', { signal })
    expect(get).toHaveBeenNthCalledWith(2, '/lessons/lesson-7/materials', { signal })
  })

  it('downloads a stored material through the authenticated LMS client', async () => {
    const signal = new AbortController().signal
    const blob = new Blob(['pdf'])
    get.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="lesson.pdf"' },
    })

    const result = await downloadStudentMaterial(
      '/api/v1/materials/files/123e4567-e89b-12d3-a456-426614174000.pdf',
      signal,
    )

    expect(get).toHaveBeenCalledWith('/materials/files/123e4567-e89b-12d3-a456-426614174000.pdf', {
      responseType: 'blob',
      signal,
    })
    expect(result).toEqual({ blob, filename: 'lesson.pdf' })
  })

  it('decodes an RFC 5987 filename from the download response', async () => {
    get.mockResolvedValueOnce({
      data: new Blob(['slides']),
      headers: { 'content-disposition': "attachment; filename*=UTF-8''b%C3%A0i%20gi%E1%BA%A3ng.pdf" },
    })

    const result = await downloadStudentMaterial('/materials/files/1.pdf')

    expect(result.filename).toBe('bài giảng.pdf')
  })

  it('refuses a file URL that points outside the API origin or the download endpoint', async () => {
    await expect(downloadStudentMaterial('https://files.example.com/materials/files/1.pdf'))
      .rejects.toThrow('outside the LMS API origin')
    await expect(downloadStudentMaterial('/materials/1/content'))
      .rejects.toThrow('outside the LMS material download endpoint')

    expect(get).not.toHaveBeenCalled()
  })
})
