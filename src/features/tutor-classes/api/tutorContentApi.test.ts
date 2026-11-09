import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post, patch } = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('../../../api/lmsClient', () => ({
  lmsClient: { post, patch, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { swapMaterialOrder, uploadMaterial } from './tutorClassApi'
import type { TutorMaterial } from '../types'

function stored(fields: Partial<TutorMaterial>): TutorMaterial {
  return {
    material_id: 'material-1',
    lesson_id: 'lesson-1',
    title: 'Slides',
    material_type: 'DOCUMENT',
    file_url: '/materials/files/slides.pdf',
    content: null,
    sequence_order: 0,
    status: 'PUBLISHED',
    ...fields,
  }
}

beforeEach(() => {
  post.mockResolvedValue({ data: {} })
  patch.mockResolvedValue({ data: {} })
})

describe('material writes', () => {
  it('swaps two material positions with the patch fields the API accepts', async () => {
    await swapMaterialOrder(stored({ sequence_order: 0 }), stored({ material_id: 'material-2', title: 'Worksheet', sequence_order: 1 }))

    expect(patch).toHaveBeenCalledWith('/materials/material-1', { sequence_order: 1 })
    expect(patch).toHaveBeenCalledWith('/materials/material-2', { sequence_order: 0 })
  })

  it('sends a document as multipart metadata plus the file bytes', async () => {
    const file = new File(['deck'], 'slides.pdf', { type: 'application/pdf' })

    await uploadMaterial('lesson-1', { title: 'Slide deck', material_type: 'DOCUMENT', status: 'PUBLISHED' }, file)

    const body = post.mock.calls[0][1] as FormData
    expect(post).toHaveBeenCalledWith('/lessons/lesson-1/materials', expect.any(FormData))
    const metadata = body.get('metadata')
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(metadata as Blob)
    })
    expect(JSON.parse(raw)).toEqual({
      title: 'Slide deck',
      material_type: 'DOCUMENT',
      status: 'PUBLISHED',
      file_url: null,
      content: null,
    })
    expect(body.get('file')).toBe(file)
  })
})
