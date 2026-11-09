import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/apiError'
import type { ClassCatalogItem, ClassOutlineLesson, ClassOutlineMaterial, ClassOutlineResponse } from '../types'

const api = vi.hoisted(() => ({
  getClassDetails: vi.fn(),
  getClassOutline: vi.fn(),
  getStudentLesson: vi.fn(),
  getStudentLessonMaterials: vi.fn(),
  downloadStudentMaterial: vi.fn(),
}))

vi.mock('../api/classApi', () => api)
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Test Student' } }, logout: vi.fn() }),
}))

import StudentLessonPage from './StudentLessonPage'

function apiFailure(status: number, code: string) {
  return new ApiError({
    status,
    error: 'Request Failed',
    message: 'The server refused the request.',
    code,
    timestamp: new Date().toISOString(),
    path: '/lessons/lesson-2',
  })
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

const outline: ClassOutlineResponse = {
  class_id: 'class-123',
  chapters: [
    {
      chapter_id: 'chapter-1',
      title: 'Getting started',
      sequence_order: 0,
      status: 'PUBLISHED',
      lessons: [
        { lesson_id: 'lesson-1', title: 'Setup', sequence_order: 0, status: 'PUBLISHED' },
        { lesson_id: 'lesson-2', title: 'Your first program', sequence_order: 1, status: 'PUBLISHED', estimated_duration: 25 },
      ],
    },
    {
      chapter_id: 'chapter-2',
      title: 'Next',
      sequence_order: 1,
      status: 'PUBLISHED',
      lessons: [{ lesson_id: 'lesson-3', title: 'Variables', sequence_order: 0, status: 'PUBLISHED' }],
    },
  ],
}

const lesson: ClassOutlineLesson = {
  lesson_id: 'lesson-2',
  title: 'Your first program',
  description: 'Write a greeting.',
  sequence_order: 1,
  status: 'PUBLISHED',
  estimated_duration: 25,
}

const textMaterial: ClassOutlineMaterial = {
  material_id: 'material-1',
  title: 'Lecture notes',
  material_type: 'TEXT',
  file_url: null,
  content: 'Read chapter 1.',
  sequence_order: 0,
  status: 'PUBLISHED',
}

function renderLesson(lessonId = 'lesson-2') {
  return render(
    // The material card reads its message surface from App.useApp().
    <App>
      <MemoryRouter initialEntries={[`/classes/class-123/lessons/${lessonId}`]}>
        <Routes>
          <Route path="/classes/:classId/lessons/:lessonId" element={<StudentLessonPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  )
}

beforeEach(() => {
  api.getClassDetails.mockResolvedValue(classDetails)
  api.getClassOutline.mockResolvedValue(outline)
  api.getStudentLesson.mockResolvedValue(lesson)
  api.getStudentLessonMaterials.mockResolvedValue([textMaterial])
  api.downloadStudentMaterial.mockResolvedValue({ blob: new Blob(['notes']), filename: 'notes.pdf' })
  // URL stays constructible: the material model parses addresses with `new URL(...)`, and an
  // object spread would turn every external link into "unavailable" without failing loudly.
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:notes')
    static revokeObjectURL = vi.fn()
  })
})

describe('FE-5 student lesson', () => {
  it('shows the published lesson, its materials, and the neighbouring lessons', async () => {
    renderLesson()

    expect(await screen.findByRole('heading', { name: 'Your first program' })).toBeInTheDocument()
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument()
    expect(screen.getByText('Read chapter 1.')).toBeInTheDocument()
    expect(screen.getByText('Opening a lesson does not mark it complete.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/classes/class-123/lessons/lesson-1')
    expect(screen.getByRole('link', { name: /Next lesson/ })).toHaveAttribute('href', '/classes/class-123/lessons/lesson-3')
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
  })

  it('explains a forbidden lesson without offering its content', async () => {
    api.getStudentLesson.mockRejectedValue(apiFailure(403, 'FORBIDDEN'))

    renderLesson()

    expect(await screen.findByText('You do not have access to this lesson')).toBeInTheDocument()
    expect(screen.queryByText('Your first program')).not.toBeInTheDocument()
  })

  it('explains a missing lesson separately from a permission failure', async () => {
    api.getClassOutline.mockRejectedValue(apiFailure(404, 'NOT_FOUND'))

    renderLesson()

    expect(await screen.findByText('Lesson is unavailable')).toBeInTheDocument()
  })

  it('keeps a lesson that the published outline omitted', async () => {
    api.getClassOutline.mockResolvedValue({ ...outline, chapters: [] })

    renderLesson()

    expect(await screen.findByText('This lesson is not in the published outline')).toBeInTheDocument()
    expect(screen.queryByText('Read chapter 1.')).not.toBeInTheDocument()
  })

  it('opens a published quiz on the FE-6 activity route', async () => {
    api.getClassOutline.mockResolvedValue({
      ...outline,
      chapters: outline.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((item) => item.lesson_id === 'lesson-2' ? {
          ...item,
          activities: [
            { activity_id: 'activity-1', title: 'Java basics check', activity_type: 'QUIZ' as const, sequence_order: 0, status: 'PUBLISHED' as const },
            { activity_id: 'activity-hidden', title: 'Hidden quiz', activity_type: 'QUIZ' as const, sequence_order: 1, status: 'HIDDEN' as const },
          ],
        } : item),
      })),
    })

    renderLesson()

    expect(await screen.findByRole('link', { name: 'Take quiz · Java basics check' })).toHaveAttribute(
      'href',
      '/classes/class-123/lessons/lesson-2/activities/activity-1',
    )
    expect(screen.queryByRole('link', { name: /Hidden quiz/ })).not.toBeInTheDocument()
  })

  it('downloads a stored file through the LMS material endpoint', async () => {
    api.getStudentLessonMaterials.mockResolvedValue([{
      ...textMaterial,
      title: 'Slides',
      material_type: 'DOCUMENT',
      content: null,
      file_url: '/materials/files/slides.pdf',
    }])

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderLesson()
    fireEvent.click(await screen.findByRole('button', { name: 'Download material' }))

    await waitFor(() => expect(api.downloadStudentMaterial).toHaveBeenCalledWith('/materials/files/slides.pdf'))
  })

  it('opens an external video address instead of downloading it through the LMS', async () => {
    api.getStudentLessonMaterials.mockResolvedValue([{
      ...textMaterial,
      title: 'Walkthrough',
      material_type: 'VIDEO',
      content: null,
      file_url: 'https://youtube.com/watch?v=abc',
    }])

    renderLesson()

    const link = await screen.findByRole('link', { name: 'Open external resource' })
    expect(link).toHaveAttribute('href', 'https://youtube.com/watch?v=abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('button', { name: 'Download material' })).not.toBeInTheDocument()
    expect(api.downloadStudentMaterial).not.toHaveBeenCalled()
  })

  it('reports a download the server refuses without leaving the button spinning', async () => {
    api.getStudentLessonMaterials.mockResolvedValue([{
      ...textMaterial,
      title: 'Slides',
      material_type: 'DOCUMENT',
      content: null,
      file_url: '/api/v1/materials/files/slides.pdf',
    }])
    api.downloadStudentMaterial.mockRejectedValue(apiFailure(404, 'FILE_NOT_FOUND'))

    renderLesson()
    const button = await screen.findByRole('button', { name: 'Download material' })
    fireEvent.click(button)

    expect(await screen.findByText('The server refused the request.')).toBeInTheDocument()
    await waitFor(() => expect(button).not.toHaveClass('ant-btn-loading'))
  })
})
