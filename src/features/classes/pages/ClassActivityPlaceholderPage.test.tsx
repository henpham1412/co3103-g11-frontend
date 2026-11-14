import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Test Student' } }, logout: vi.fn() }) }))

import ClassActivityPlaceholderPage from './ClassActivityPlaceholderPage'

function renderActivityRoute() {
  return render(
    <MemoryRouter initialEntries={['/classes/class-123/lessons/lesson-1/activities/activity-1']}>
      <Routes>
        <Route path="/classes/:classId" element={<div>Class detail screen</div>} />
        <Route
          path="/classes/:classId/lessons/:lessonId/activities/:activityId"
          element={<ClassActivityPlaceholderPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FE-3 activity handoff', () => {
  it('names the FE-6 owner and keeps a route back to the class', async () => {
    renderActivityRoute()

    expect(await screen.findByText('The quiz and assignment screens are delivered by FE-6.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Back to class' }))

    expect(await screen.findByText('Class detail screen')).toBeInTheDocument()
  })
})
