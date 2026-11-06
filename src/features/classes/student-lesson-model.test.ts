import { describe, expect, it } from 'vitest'

import type { ClassOutlineMaterial, ClassOutlineResponse } from './types'
import { getLessonNavigation, getMaterialDisplay } from './student-lesson-model'

const outline = {
  class_id: 'class-123',
  chapters: [
    {
      chapter_id: 'chapter-a',
      title: 'A',
      sequence_order: 0,
      status: 'PUBLISHED',
      lessons: [
        { lesson_id: 'lesson-1', title: 'One', sequence_order: 0, status: 'PUBLISHED' },
        { lesson_id: 'lesson-2', title: 'Two', sequence_order: 1, status: 'PUBLISHED' },
      ],
    },
    {
      chapter_id: 'chapter-b',
      title: 'B',
      sequence_order: 1,
      status: 'PUBLISHED',
      lessons: [{ lesson_id: 'lesson-3', title: 'Three', sequence_order: 0, status: 'PUBLISHED' }],
    },
  ],
} as unknown as ClassOutlineResponse

function material(fields: Partial<ClassOutlineMaterial>): ClassOutlineMaterial {
  return {
    material_id: 'material-1',
    title: 'Material',
    material_type: 'TEXT',
    file_url: null,
    content: null,
    sequence_order: 0,
    status: 'PUBLISHED',
    ...fields,
  }
}

describe('lesson navigation', () => {
  it('follows chapter then lesson order across chapters', () => {
    const navigation = getLessonNavigation(outline, 'lesson-2')

    expect(navigation.previous?.lesson_id).toBe('lesson-1')
    expect(navigation.current?.chapter_title).toBe('A')
    expect(navigation.next?.lesson_id).toBe('lesson-3')
  })

  it('leaves the outline boundaries empty', () => {
    expect(getLessonNavigation(outline, 'lesson-1').previous).toBeUndefined()
    expect(getLessonNavigation(outline, 'lesson-3').next).toBeUndefined()
  })

  it('reports nothing for a lesson the student cannot see', () => {
    expect(getLessonNavigation(outline, 'hidden-lesson').current).toBeUndefined()
    expect(getLessonNavigation(undefined, 'lesson-1').current).toBeUndefined()
  })
})

describe('material display', () => {
  it('renders rich text only when the server returned content', () => {
    expect(getMaterialDisplay(material({ material_type: 'TEXT', content: 'Notes' }))).toBe('text')
    expect(getMaterialDisplay(material({ material_type: 'TEXT', content: null }))).toBe('unavailable')
  })

  it('opens external links only over HTTPS', () => {
    expect(getMaterialDisplay(material({ material_type: 'URL', file_url: 'https://example.org' }))).toBe('link')
    expect(getMaterialDisplay(material({ material_type: 'URL', file_url: 'javascript:alert(1)' }))).toBe('unavailable')
    expect(getMaterialDisplay(material({ material_type: 'URL', file_url: 'http://example.org' }))).toBe('unavailable')
  })

  it('offers the authenticated download only when an asset exists', () => {
    expect(getMaterialDisplay(material({ material_type: 'DOCUMENT', file_url: '/api/v1/materials/files/a.pdf' }))).toBe('file')
    expect(getMaterialDisplay(material({ material_type: 'VIDEO', file_url: '/api/v1/materials/files/a.mp4' }))).toBe('file')
    expect(getMaterialDisplay(material({ material_type: 'DOCUMENT', file_url: null }))).toBe('unavailable')
  })
})
