import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/apiError'
import type { ClassCatalogItem } from '../../classes/types'
import type { TutorLesson, TutorMaterial, TutorOutline } from '../types'
import { MATERIAL_UPLOAD_LIMITS } from '../api/tutorClassApi'

const contentApi = vi.hoisted(() => ({
  createChapter: vi.fn(),
  createLesson: vi.fn(),
  createMaterial: vi.fn(),
  deleteChapter: vi.fn(),
  deleteLesson: vi.fn(),
  deleteMaterial: vi.fn(),
  getTutorOutline: vi.fn(),
  reorderChapters: vi.fn(),
  reorderLessons: vi.fn(),
  swapMaterialOrder: vi.fn(),
  updateChapter: vi.fn(),
  updateLesson: vi.fn(),
  updateMaterial: vi.fn(),
  uploadMaterial: vi.fn(),
}))

const classApi = vi.hoisted(() => ({ getClassDetails: vi.fn() }))

vi.mock('../api/tutorClassApi', async () => {
  const actual = await import('../api/tutorClassApi')
  return {
    ...contentApi,
    MATERIAL_UPLOAD_LIMITS: actual.MATERIAL_UPLOAD_LIMITS,
    materialExtensionAllowed: actual.materialExtensionAllowed,
  }
})
vi.mock('../../classes/api/classApi', () => classApi)
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Alex Tutor' } }, logout: vi.fn() }),
}))

import TutorContentManagementPage from './TutorContentManagementPage'

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
  enrollment_policy: 'OPEN',
  status: 'ACTIVE',
  tutor: { user_id: 'tutor-1', full_name: 'Alex Tutor' },
  active_member_count: 4,
  max_capacity: 20,
}

function material(fields: Partial<TutorMaterial>): TutorMaterial {
  return {
    material_id: 'material-1',
    lesson_id: 'lesson-1',
    title: 'Slides',
    material_type: 'TEXT',
    file_url: null,
    content: 'Notes',
    sequence_order: 0,
    status: 'PUBLISHED',
    ...fields,
  }
}

function outlineWith(lessons: TutorLesson[]): TutorOutline {
  return {
    class_id: 'class-123',
    chapters: [{
      chapter_id: 'chapter-1',
      class_id: 'class-123',
      title: 'Getting started',
      description: 'Orientation',
      sequence_order: 0,
      status: 'PUBLISHED',
      lessons,
    }],
  }
}

function lessonWith(materials: TutorMaterial[]): TutorLesson {
  return {
    lesson_id: 'lesson-1',
    chapter_id: 'chapter-1',
    title: 'Your first program',
    description: 'Setup',
    estimated_duration: 25,
    sequence_order: 0,
    status: 'PUBLISHED',
    materials,
  }
}

function renderPage() {
  return render(
    // The page reads its message surface from App.useApp(), so the holder has to exist.
    <App>
      <MemoryRouter initialEntries={['/tutor/classes/class-123/content']}>
        <Routes>
          <Route path="/tutor/classes/:classId/content" element={<TutorContentManagementPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  )
}

async function openMaterialModal(name: string | RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  classApi.getClassDetails.mockResolvedValue(classDetails)
  contentApi.getTutorOutline.mockResolvedValue(outlineWith([lessonWith([material({}), material({ material_id: 'material-2', title: 'Worksheet', sequence_order: 1 })])]))
  contentApi.createChapter.mockResolvedValue(undefined)
  contentApi.createLesson.mockResolvedValue(undefined)
  contentApi.createMaterial.mockResolvedValue(undefined)
  contentApi.updateChapter.mockResolvedValue(undefined)
  contentApi.updateLesson.mockResolvedValue(undefined)
  contentApi.updateMaterial.mockResolvedValue(undefined)
  contentApi.uploadMaterial.mockResolvedValue(undefined)
  contentApi.swapMaterialOrder.mockResolvedValue(undefined)
  contentApi.deleteChapter.mockResolvedValue(undefined)
  contentApi.deleteLesson.mockResolvedValue(undefined)
  contentApi.deleteMaterial.mockResolvedValue(undefined)
  contentApi.reorderChapters.mockResolvedValue(undefined)
  contentApi.reorderLessons.mockResolvedValue(undefined)
})

describe('FE-5 tutor content management', () => {
  it('lists the outline counts and keeps the honest save note before any write', async () => {
    renderPage()

    expect(await screen.findByText(/Getting started/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('No changes made in this session')).toBeInTheDocument()
    expect(screen.queryByText(/All changes saved/)).not.toBeInTheDocument()
  })

  it('creates a rich text material through the JSON material endpoint', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.change(within(dialog).getByLabelText('Material Title'), { target: { value: 'Lecture notes' } })
    fireEvent.change(within(dialog).getByLabelText('Content'), { target: { value: 'Read chapter 1.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Material' }))

    await waitFor(() => expect(contentApi.createMaterial).toHaveBeenCalledWith('lesson-1', expect.objectContaining({
      title: 'Lecture notes',
      material_type: 'TEXT',
      content: 'Read chapter 1.',
      status: 'PUBLISHED',
    })))
    expect(contentApi.createMaterial.mock.calls[0][1]).not.toHaveProperty('sequence_order')
  })

  it('uploads a document through the multipart endpoint with a metadata part', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Document' }))
    fireEvent.change(within(dialog).getByLabelText('Material Title'), { target: { value: 'Slide deck' } })
    const file = new File(['deck'], 'slides.pdf', { type: 'application/pdf' })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect(await within(dialog).findByText('slides.pdf')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Material' }))

    await waitFor(() => expect(contentApi.uploadMaterial).toHaveBeenCalledWith('lesson-1', expect.objectContaining({
      title: 'Slide deck',
      material_type: 'DOCUMENT',
    }), file))
  })

  it('refuses a document above the storage limit without calling the API', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Document' }))
    const oversized = new File(['x'], 'huge.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', { value: MATERIAL_UPLOAD_LIMITS.DOCUMENT.maxBytes + 1 })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [oversized] } })

    expect(await screen.findByText(/larger than 50 MB/)).toBeInTheDocument()
    expect(contentApi.uploadMaterial).not.toHaveBeenCalled()
    expect(within(dialog).queryByText('huge.pdf')).not.toBeInTheDocument()
  })

  it('orders materials with the two position patches the API allows', async () => {
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })

    fireEvent.click(screen.getByRole('button', { name: 'Move Slides down' }))

    await waitFor(() => expect(contentApi.swapMaterialOrder).toHaveBeenCalledWith(
      expect.objectContaining({ material_id: 'material-1', sequence_order: 0 }),
      expect.objectContaining({ material_id: 'material-2', sequence_order: 1 }),
    ))
  })

  it('sends only the visibility field when republishing a chapter', async () => {
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(contentApi.updateChapter).toHaveBeenCalledWith('chapter-1', { status: 'HIDDEN' }))
    expect(contentApi.updateChapter.mock.calls[0][1]).not.toHaveProperty('title')
  })

  it('keeps an unfilled material form from reaching the API', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Material' }))

    await waitFor(() => expect(within(dialog).getByLabelText('Material Title')).toHaveAttribute('aria-invalid', 'true'))
    expect(contentApi.createMaterial).not.toHaveBeenCalled()
  })

  it('explains a rejected upload and reloads the outline when the stored state moved on', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Video' }))
    fireEvent.change(within(dialog).getByLabelText('Material Title'), { target: { value: 'Walkthrough' } })
    const file = new File(['clip'], 'clip.webm', { type: 'video/webm' })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [file] } })
    contentApi.uploadMaterial.mockRejectedValue(apiFailure(415, 'UNSUPPORTED_MEDIA_TYPE'))
    const outlineCallsBefore = contentApi.getTutorOutline.mock.calls.length

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Material' }))

    expect(await screen.findByText('That file type is not supported for this material kind.')).toBeInTheDocument()
    expect(contentApi.getTutorOutline.mock.calls.length).toBe(outlineCallsBefore)
  })

  it('reloads the outline when a write finds the class state has moved on', async () => {
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })
    contentApi.updateChapter.mockRejectedValue(apiFailure(409, 'CLASS_ARCHIVED'))
    const outlineCallsBefore = contentApi.getTutorOutline.mock.calls.length

    fireEvent.click(screen.getAllByRole('switch')[0])

    expect(await screen.findByText('Archived classes no longer accept membership changes.')).toBeInTheDocument()
    await waitFor(() => expect(contentApi.getTutorOutline.mock.calls.length).toBeGreaterThan(outlineCallsBefore))
  })

  it('removes authoring controls when a visibility change is forbidden for this account', async () => {
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })
    contentApi.updateLesson.mockRejectedValue(apiFailure(403, 'FORBIDDEN'))

    fireEvent.click(screen.getAllByRole('switch')[1])

    expect(await screen.findByText('Class content is not available to your account')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Chapter/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('links a lesson quiz to the FE-6 activity route', async () => {
    const lesson = lessonWith([material({})])
    lesson.activities = [{ activity_id: 'activity-1', title: 'Java basics check', activity_type: 'QUIZ', sequence_order: 0, status: 'PUBLISHED' }]
    contentApi.getTutorOutline.mockResolvedValue(outlineWith([lesson]))

    renderPage()

    expect(await screen.findByRole('link', { name: 'Open quiz · Java basics check' }, { timeout: 5000 })).toHaveAttribute(
      'href',
      '/classes/class-123/lessons/lesson-1/activities/activity-1',
    )
  })

  it('keeps a published lesson marked unreachable while its chapter is hidden', async () => {
    const hiddenChapter = outlineWith([lessonWith([material({})])])
    hiddenChapter.chapters[0].status = 'HIDDEN'
    contentApi.getTutorOutline.mockResolvedValue(hiddenChapter)

    renderPage()

    expect(await screen.findByText(/Published, but hidden with its chapter/)).toBeInTheDocument()
  })

  it('warns when a lesson is published under a hidden chapter', async () => {
    const hiddenChapter = outlineWith([{ ...lessonWith([material({})]), status: 'HIDDEN' as const }])
    hiddenChapter.chapters[0].status = 'HIDDEN'
    contentApi.getTutorOutline.mockResolvedValue(hiddenChapter)

    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })
    fireEvent.click(screen.getAllByRole('switch')[1])

    expect(await screen.findByText(/while the chapter “Getting started” is hidden/)).toBeInTheDocument()
    expect(contentApi.updateLesson).toHaveBeenCalledWith('lesson-1', { status: 'PUBLISHED' })
  })

  it('shows no authoring action when the LMS refuses this class for the account', async () => {
    contentApi.getTutorOutline.mockRejectedValue(apiFailure(403, 'FORBIDDEN'))

    renderPage()

    expect(await screen.findByText('Class content is not available to your account')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Chapter/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Material/ })).not.toBeInTheDocument()
  })

  it('publishes an external video through the JSON endpoint instead of an upload', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Video' }))
    fireEvent.click(within(dialog).getByRole('radio', { name: 'External link' }))
    fireEvent.change(within(dialog).getByLabelText('Material Title'), { target: { value: 'Walkthrough' } })
    fireEvent.change(within(dialog).getByLabelText('Video link'), { target: { value: 'https://youtube.com/watch?v=abc' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Material' }))

    await waitFor(() => expect(contentApi.createMaterial).toHaveBeenCalledWith('lesson-1', {
      title: 'Walkthrough',
      material_type: 'VIDEO',
      status: 'PUBLISHED',
      file_url: 'https://youtube.com/watch?v=abc',
    }))
    expect(contentApi.uploadMaterial).not.toHaveBeenCalled()
  })

  it('rejects a video address the server would refuse', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Material/)

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Video' }))
    fireEvent.click(within(dialog).getByRole('radio', { name: 'External link' }))
    fireEvent.change(within(dialog).getByLabelText('Material Title'), { target: { value: 'Walkthrough' } })
    fireEvent.change(within(dialog).getByLabelText('Video link'), { target: { value: 'https://example.org/clip.avi' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Material' }))

    expect(await within(dialog).findByText(/YouTube or Vimeo link/)).toBeInTheDocument()
    expect(contentApi.createMaterial).not.toHaveBeenCalled()
    expect(contentApi.uploadMaterial).not.toHaveBeenCalled()
  })

  it('patches the link of an external video without sending a stored asset key', async () => {
    contentApi.getTutorOutline.mockResolvedValue(outlineWith([lessonWith([
      material({ material_type: 'VIDEO', title: 'Walkthrough', file_url: 'https://youtube.com/watch?v=abc', content: null }),
    ])]))
    renderPage()
    const dialog = await openMaterialModal(/Edit Walkthrough/)

    fireEvent.change(within(dialog).getByLabelText('Video link'), { target: { value: 'https://vimeo.com/123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(contentApi.updateMaterial).toHaveBeenCalledWith('material-1', {
      title: 'Walkthrough',
      status: 'PUBLISHED',
      file_url: 'https://vimeo.com/123',
    }))
  })

  it('keeps a stored asset out of the material PATCH', async () => {
    contentApi.getTutorOutline.mockResolvedValue(outlineWith([lessonWith([
      material({ material_type: 'DOCUMENT', title: 'Slides', file_url: '/api/v1/materials/files/slides.pdf', content: null }),
    ])]))
    renderPage()
    const dialog = await openMaterialModal(/Edit Slides/)

    expect(within(dialog).getByText(/no in-place asset swap/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Material Title'), { target: { value: 'Slides v2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(contentApi.updateMaterial).toHaveBeenCalledWith('material-1', {
      title: 'Slides v2',
      status: 'PUBLISHED',
    }))
  })

  it('keeps a chapter title inside the 150 characters the server accepts', async () => {
    renderPage()
    const dialog = await openMaterialModal(/Add Chapter/)

    expect(within(dialog).getByLabelText('Chapter Title')).toHaveAttribute('maxlength', '150')
  })

  it('says so when a lesson has no materials yet', async () => {
    contentApi.getTutorOutline.mockResolvedValue(outlineWith([lessonWith([])]))

    renderPage()

    expect(await screen.findByText('No materials in this lesson yet.')).toBeInTheDocument()
  })

  it('blocks a second content write while the first one is still running', async () => {
    let release: () => void = () => undefined
    contentApi.updateChapter.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })

    fireEvent.click(screen.getAllByRole('switch')[0])
    await waitFor(() => expect(contentApi.updateChapter).toHaveBeenCalledTimes(1))

    expect(screen.getAllByRole('switch')[1]).toBeDisabled()
    fireEvent.click(screen.getAllByRole('switch')[1])
    expect(contentApi.updateLesson).not.toHaveBeenCalled()

    release()
    await waitFor(() => expect(screen.getAllByRole('switch')[0]).not.toBeDisabled())
  })

  it('re-reads the outline when only one of the two position patches lands', async () => {
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })
    contentApi.swapMaterialOrder.mockRejectedValue(apiFailure(400, 'VALIDATION_ERROR'))
    const outlineCallsBefore = contentApi.getTutorOutline.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Move Slides down' }))

    expect(await screen.findByText('The server rejected some fields. Check the form and try again.')).toBeInTheDocument()
    await waitFor(() => expect(contentApi.getTutorOutline.mock.calls.length).toBeGreaterThan(outlineCallsBefore))
  })

  it('explains a delete the server refuses because learning records depend on it', async () => {
    contentApi.deleteMaterial.mockRejectedValue(apiFailure(409, 'CONTENT_HAS_DEPENDENT_LEARNING_DATA'))
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Slides' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    expect(await screen.findByText(/Learning records already depend on this content/)).toBeInTheDocument()
    expect(contentApi.deleteMaterial).toHaveBeenCalledWith('material-1')
  })

  it('reloads the outline when the material was already deleted elsewhere', async () => {
    renderPage()
    await screen.findByText(/Getting started/, {}, { timeout: 5000 })
    contentApi.updateMaterial.mockRejectedValue(apiFailure(404, 'MATERIAL_NOT_FOUND'))
    const outlineCallsBefore = contentApi.getTutorOutline.mock.calls.length

    fireEvent.click(screen.getAllByRole('switch')[2])

    expect(await screen.findByText('That material no longer exists. The outline has been reloaded.')).toBeInTheDocument()
    await waitFor(() => expect(contentApi.getTutorOutline.mock.calls.length).toBeGreaterThan(outlineCallsBefore))
  })
})
